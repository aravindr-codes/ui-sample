import { readFile } from 'node:fs/promises';
import { devApi, expect, expectAccessible, openApp, serveConfig, test } from './fixtures';

const KENYA = 'Kenya Cash Transfers';

test.describe('golden paths', () => {
  test('dashboard → program grid with URL state → detail → verify → pay → approve', async ({ page }) => {
    await openApp(page);
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
    await expect(page.getByRole('region', { name: KENYA })).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: new RegExp(KENYA) })
      .click();
    await expect(page.getByRole('heading', { name: 'Beneficiaries', level: 1 })).toBeVisible();
    await expect(page.getByText('1–25 of 170')).toBeVisible();

    // Server-side paging and filters live in the URL.
    await page.getByRole('combobox', { name: 'Status' }).click();
    await page.getByRole('option', { name: 'Pending' }).click();
    await expect(page).toHaveURL(/status=pending/);
    await expect(page.getByText(/1–25 of 39/)).toBeVisible();
    await page.getByRole('button', { name: 'Go to next page' }).click();
    await expect(page).toHaveURL(/page=1/);
    await expect(page.getByText(/26–39 of 39/)).toBeVisible();

    // Reloading keeps the grid state (shareable URL).
    await page.reload();
    await expect(page.getByText(/26–39 of 39/)).toBeVisible();

    const firstName = page.getByRole('grid').getByRole('link').first();
    const name = (await firstName.textContent()) ?? '';
    await firstName.click();
    await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New disbursement' })).toBeDisabled();

    await page.getByRole('button', { name: 'Verify' }).click();
    await expect(page.getByText(`${name} is now verified.`)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Suspend' })).toBeVisible();

    await page.getByRole('button', { name: 'New disbursement' }).click();
    const dialog = page.getByRole('dialog', { name: 'New disbursement' });
    await dialog.getByRole('textbox', { name: 'Amount' }).fill('abc');
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(dialog.getByText('Enter a valid amount')).toBeVisible();
    await dialog.getByRole('textbox', { name: 'Amount' }).fill('1,250.50');
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('Disbursement of KES 1,250.50 created.')).toBeVisible();

    const history = page.getByRole('grid', { name: /Disbursements —/ });
    await expect(history.getByRole('row')).toHaveCount(2);
    await history
      .getByRole('menuitem', { name: /Approve disbursement/ })
      .or(history.getByRole('button', { name: /Approve disbursement/ }))
      .click();
    await expect(page.getByText('Disbursement approved.')).toBeVisible();
    await expect(history.getByRole('gridcell', { name: 'Approved', exact: true })).toBeVisible();
  });

  test('create a beneficiary with client- and server-side validation', async ({ page }) => {
    await openApp(page, '/beneficiaries/new');
    await page.getByRole('button', { name: 'Create beneficiary' }).click();
    await expect(page.getByText('Name is required')).toBeVisible();
    await expect(page.getByText('Use a 2-letter ISO country code')).toBeVisible();

    await page.getByRole('textbox', { name: 'Display name' }).fill('Amina Ochieng');
    await page.getByRole('textbox', { name: 'Country' }).fill('ke');
    await expect(page.getByRole('textbox', { name: 'Country' })).toHaveValue('KE');
    await page.getByRole('button', { name: 'Create beneficiary' }).click();

    await expect(page.getByRole('heading', { name: 'Amina Ochieng', level: 1 })).toBeVisible();
    await expect(page.getByText('Amina Ochieng was registered and is pending verification.')).toBeVisible();
    await expect(page).toHaveURL(/\/beneficiaries\/[0-9a-f-]{36}$/);
  });

  test('unknown records render the not-found page', async ({ page }) => {
    await openApp(page, '/beneficiaries/6f1c1c2e-8a4b-4c1d-9e2f-3a4b5c6d7e8f');
    await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible();
    await page.goto('/programs/not-a-uuid/beneficiaries');
    await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible();
  });
});

test.describe('adapters', () => {
  test('the same bundle runs on the in-memory adapter by config alone', async ({ page }) => {
    const apiRequests: string[] = [];
    page.on('request', (r) => {
      if (new URL(r.url()).pathname.startsWith('/api/')) apiRequests.push(r.url());
    });
    await openApp(page, '/', { apiMode: 'memory' });
    await expect(page.getByRole('region', { name: KENYA })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Live updates: Live' })).toBeVisible();
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'New beneficiary' }).click();
    await page.getByRole('textbox', { name: 'Display name' }).fill('Memory Mode');
    await page.getByRole('textbox', { name: 'Country' }).fill('KE');
    await page.getByRole('button', { name: 'Create beneficiary' }).click();
    await expect(page.getByRole('heading', { name: 'Memory Mode', level: 1 })).toBeVisible();
    expect(apiRequests).toEqual([]);
  });
});

test.describe('exports', () => {
  test('exports every matching row to CSV and PDF', async ({ page }) => {
    await openApp(page, '/disbursements?status=pending');
    await expect(page.getByText('570 results')).toBeVisible();

    await page.getByRole('button', { name: 'Export' }).click();
    const csvDownload = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: /CSV/ }).click();
    const csv = await csvDownload;
    expect(csv.suggestedFilename()).toMatch(/^disbursements-\d{4}-\d{2}-\d{2}\.csv$/);
    const raw = await readFile(await csv.path());
    expect([...raw.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM so Excel detects the encoding
    const lines = raw.subarray(3).toString('utf8').trim().split('\r\n');
    expect(lines[0]).toBe('ID,Beneficiary,Program,Amount,Currency,Status,Created,Approved');
    expect(lines).toHaveLength(571);
    expect(lines.slice(1).every((l) => l.includes(',pending,'))).toBe(true);
    await expect(page.getByText('Exported 570 rows to CSV.')).toBeVisible();

    await page.getByRole('button', { name: 'Export' }).click();
    const pdfDownload = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: /PDF/ }).click();
    const pdf = await pdfDownload;
    expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
    const bytes = await readFile(await pdf.path());
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(10_000);
  });
});

test.describe('documents', () => {
  test('uploads, rejects, downloads and deletes documents', async ({ page }) => {
    await openApp(page, '/programs');
    await page.goto('/');
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: new RegExp(KENYA) })
      .click();
    await page.getByRole('grid').getByRole('link').first().click();
    await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible();

    await page.getByRole('combobox', { name: 'Document type' }).click();
    await page.getByRole('option', { name: 'Consent form' }).click();
    await page.getByLabel('Choose files to upload').setInputFiles([
      { name: 'consent-März.csv', mimeType: 'text/csv', buffer: Buffer.from('id,consent\n1,yes\n') },
      { name: 'tool.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ') },
    ]);
    await expect(page.getByText('tool.exe: Only PDF, PNG, JPEG, TXT and CSV files are accepted.')).toBeVisible();
    await expect(page.getByText('1 on file')).toBeVisible();
    const list = page.getByRole('list', { name: 'Documents' });
    await expect(list.getByText('consent-März.csv')).toBeVisible();
    await expect(list.getByText(/Consent form · 17 B/)).toBeVisible();

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download consent-März.csv' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('consent-März.csv');
    expect(await readFile(await file.path(), 'utf8')).toBe('id,consent\n1,yes\n');

    await page.getByRole('button', { name: 'Delete consent-März.csv' }).click();
    await page.getByRole('dialog', { name: 'Delete document?' }).getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('No documents yet')).toBeVisible();
  });
});

test.describe('live events', () => {
  test('shows activity from other operators and refreshes data', async ({ page }) => {
    await openApp(page);
    await expect(page.getByRole('status', { name: 'Live updates: Live' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Live activity, 0 new' })).toBeVisible();

    await devApi(page, 'simulation', { tick: true });
    await devApi(page, 'simulation', { tick: true });
    await expect(page.getByRole('button', { name: /Live activity, [12] new/ })).toBeVisible();

    await page.getByRole('button', { name: /Live activity/ }).click();
    const feed = page.getByRole('list', { name: 'Activity feed' });
    await expect(feed.getByRole('link').first()).toContainText('(simulated)');
    await page.getByRole('button', { name: 'Close activity' }).click();
    await expect(page.getByRole('button', { name: 'Live activity, 0 new' })).toBeVisible();
  });
});

test.describe('resilience', () => {
  test('shows a retryable error when the API is unavailable, then recovers', async ({ page }) => {
    await openApp(page);
    await devApi(page, 'chaos', { failureRate: 1 });
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Disbursements' }).click();
    await expect(page.getByText('Service unavailable')).toBeVisible();
    await devApi(page, 'chaos', { failureRate: 0 });
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByRole('heading', { name: 'Disbursements', level: 1 })).toBeVisible();
    await expect(page.getByText('2,000 results')).toBeVisible();
  });

  test('rolls back an optimistic status change when the server fails', async ({ page }) => {
    await openApp(page);
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: new RegExp(KENYA) })
      .click();
    await page.getByRole('combobox', { name: 'Status' }).click();
    await page.getByRole('option', { name: 'Pending' }).click();
    await page.getByRole('grid').getByRole('link').first().click();
    await expect(page.getByRole('button', { name: 'Verify' })).toBeVisible();

    await devApi(page, 'chaos', { failureRate: 1, latencyMs: [600, 600] });
    await page.getByRole('button', { name: 'Verify' }).click();
    // Optimistic: flips immediately…
    await expect(page.getByRole('button', { name: 'Verify' })).toBeHidden();
    // …then rolls back with an explanation.
    await expect(page.getByText(/Service unavailable: .* The change was undone\./)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Verify' })).toBeVisible();
  });

  test('shows a clear startup error for an invalid runtime config', async ({ page }) => {
    await page.route('**/config.json', (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify({ apiMode: 'soap' }) }),
    );
    await page.goto('/');
    await expect(page.getByRole('alert')).toContainText('Runtime configuration is invalid');
    await expect(page.getByRole('alert')).toContainText('apiMode');
  });

  test('hides approval when the feature flag is off', async ({ page }) => {
    await openApp(page, '/disbursements?status=pending', { disbursementApproval: false });
    await expect(page.getByText('570 results')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Actions' })).toHaveCount(0);
  });
});

test.describe('look and accessibility', () => {
  test('switches to dark mode', async ({ page }) => {
    await serveConfig(page);
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
    const toggle = page.getByRole('button', { name: /Color mode/ });
    // system → light → dark
    while (!(await toggle.getAttribute('aria-label'))?.startsWith('Color mode: dark')) await toggle.click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe('rgb(0, 28, 45)');
  });

  for (const [name, path] of [
    ['dashboard', '/'],
    ['disbursements grid', '/disbursements'],
    ['new beneficiary form', '/beneficiaries/new'],
  ] as const) {
    test(`has no serious accessibility violations: ${name}`, async ({ page }) => {
      await openApp(page, path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectAccessible(page);
    });
  }

  test('has no serious accessibility violations: beneficiary detail', async ({ page }) => {
    await openApp(page);
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: new RegExp(KENYA) })
      .click();
    await page.getByRole('grid').getByRole('link').first().click();
    await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible();
    await expectAccessible(page);
  });
});
