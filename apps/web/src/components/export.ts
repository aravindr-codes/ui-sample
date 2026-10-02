import type { Page } from '@ifcui/api-contract';

/** A column as it appears in exported files. */
export interface ExportColumn<R> {
  header: string;
  /** Machine-friendly value for CSV (numbers stay numeric). */
  csv: (row: R) => string | number | null | undefined;
  /** Human-readable text for PDF. */
  pdf: (row: R) => string;
  align?: 'left' | 'right' | 'center';
}

export interface FetchAllResult<R> {
  rows: R[];
  total: number;
  /** True when `total` exceeded `maxRows` and only the first `maxRows` rows were fetched. */
  truncated: boolean;
}

/** Hard ceiling for a single export so a browser tab never tries to build a gigantic file. */
export const EXPORT_MAX_ROWS = 10_000;
const EXPORT_PAGE_SIZE = 200; // API maximum

/** Pages through a list endpoint with the current filters/sort and collects every row (up to `maxRows`). */
export async function fetchAllPages<R>(
  fetchPage: (page: number, pageSize: number) => Promise<Page<R>>,
  { maxRows = EXPORT_MAX_ROWS, pageSize = EXPORT_PAGE_SIZE }: { maxRows?: number; pageSize?: number } = {},
): Promise<FetchAllResult<R>> {
  const first = await fetchPage(0, pageSize);
  const rows = [...first.items];
  const total = first.total;
  const target = Math.min(total, maxRows);
  for (let page = 1; rows.length < target; page += 1) {
    const next = await fetchPage(page, pageSize);
    if (next.items.length === 0) break; // data shrank while exporting
    rows.push(...next.items);
  }
  return { rows: rows.slice(0, target), total, truncated: total > maxRows };
}

/**
 * RFC 4180 cell encoding. Strings that a spreadsheet would evaluate as a formula
 * (leading = + - @ tab CR) are prefixed with an apostrophe (CSV injection guard).
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let text = value;
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Builds a CSV document (CRLF line endings, UTF-8 BOM so Excel detects the encoding). */
export function toCsv<R>(columns: ExportColumn<R>[], rows: R[]): string {
  const lines = [columns.map((c) => csvCell(c.header)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => csvCell(c.csv(row))).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  // Revoking immediately cancels the download in Safari/Firefox; keep the URL alive until the browser has read it.
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 60_000);
}

export function exportFileName(title: string, extension: 'csv' | 'pdf', now = new Date()): string {
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-');
  return `${slug || 'export'}-${now.toISOString().slice(0, 10)}.${extension}`;
}

export interface PdfOptions<R> {
  title: string;
  subtitle: string[];
  columns: ExportColumn<R>[];
  rows: R[];
}

// Brand colors for the PDF (mirrors theme tokens; jsPDF needs RGB tuples).
const NAVY: [number, number, number] = [1, 39, 64];
const BLUE: [number, number, number] = [0, 113, 188];
const ZEBRA: [number, number, number] = [245, 247, 249];
const MUTED: [number, number, number] = [75, 94, 113];

/** Renders a paginated, branded A4 landscape PDF. jsPDF is loaded on demand to keep it out of the main bundle. */
export async function toPdf<R>({ title, subtitle, columns, rows }: PdfOptions<R>): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4', compress: true });
  const totalPagesToken = '{total_pages}';
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;

  doc.setProperties({ title, creator: 'Disbursement Console' });
  doc.setFillColor(...BLUE);
  doc.rect(0, 0, pageWidth, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...NAVY);
  doc.text(title, margin, 44);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  subtitle.forEach((line, i) => {
    doc.text(line, margin, 62 + i * 13);
  });

  autoTable(doc, {
    startY: 62 + subtitle.length * 13 + 8,
    margin: { left: margin, right: margin, bottom: 40 },
    head: [columns.map((c) => c.header)],
    body: rows.map((row) => columns.map((c) => c.pdf(row))),
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 5, textColor: [24, 31, 37], overflow: 'linebreak' },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: ZEBRA },
    columnStyles: Object.fromEntries(columns.map((c, i) => [i, { halign: c.align ?? 'left' }])),
    didDrawPage: () => {
      const page = doc.getCurrentPageInfo().pageNumber;
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text('Disbursement Console', margin, pageHeight - 20);
      doc.text(`Page ${page} of ${totalPagesToken}`, pageWidth - margin, pageHeight - 20, { align: 'right' });
    },
  });

  doc.putTotalPages(totalPagesToken);
  return doc.output('blob');
}
