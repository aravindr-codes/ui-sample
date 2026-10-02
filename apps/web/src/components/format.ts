const fractionDigitsCache = new Map<string, number>();

/** ISO 4217 minor-unit digits for a currency (e.g. 2 for KES, 0 for JPY). */
export function currencyDigits(currency: string): number {
  let digits = fractionDigitsCache.get(currency);
  if (digits === undefined) {
    digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
    fractionDigitsCache.set(currency, digits);
  }
  return digits;
}

export function formatMoney(amountMinor: number, currency: string): string {
  const digits = currencyDigits(currency);
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amountMinor / 10 ** digits);
}

/** Parses a user-entered major-unit amount ("1,250.50") into integer minor units; undefined when invalid. */
export function parseMoneyToMinor(input: string, currency: string): number | undefined {
  const digits = currencyDigits(currency);
  const normalized = input.trim().replace(/[\s,]/g, '');
  const pattern = digits > 0 ? new RegExp(`^\\d+(\\.\\d{1,${digits}})?$`) : /^\d+$/;
  if (!pattern.test(normalized)) return undefined;
  const [whole = '0', fraction = ''] = normalized.split('.');
  const minor = Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, '0') || '0');
  return Number.isSafeInteger(minor) ? minor : undefined;
}

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const dateOnly = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

export function formatDateTime(iso: string | null): string {
  return iso ? dateTime.format(new Date(iso)) : '—';
}

export function formatDate(iso: string | null): string {
  return iso ? dateOnly.format(new Date(iso)) : '—';
}

export function formatCount(n: number): string {
  return new Intl.NumberFormat().format(n);
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}
