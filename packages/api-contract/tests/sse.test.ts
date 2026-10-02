import { describe, expect, it } from 'vitest';
import {
  contentDisposition,
  formatSse,
  formatSseComment,
  MAX_DOCUMENT_BYTES,
  parseContentDisposition,
  SseParser,
  validateDocumentFile,
} from '../src';

describe('SSE codec', () => {
  it('round-trips messages including multi-line data', () => {
    const wire = formatSse({ id: '7', event: 'domain', data: 'line1\nline2' }) + formatSse({ data: '{"a":1}' });
    expect(new SseParser().push(wire)).toEqual([
      { id: '7', event: 'domain', data: 'line1\nline2' },
      { id: '7', data: '{"a":1}' },
    ]);
  });

  it('handles arbitrary chunk boundaries and CRLF', () => {
    const wire = 'id: 1\r\ndata: hello\r\n\r\n: ping\r\n\r\nid: 2\r\ndata: world\r\n\r\n';
    const parser = new SseParser();
    const out = [...wire].flatMap((ch) => parser.push(ch));
    expect(out).toEqual([
      { id: '1', data: 'hello' },
      { id: '2', data: 'world' },
    ]);
  });

  it('skips comments and parses retry', () => {
    const parser = new SseParser();
    expect(parser.push(formatSseComment('connected'))).toEqual([]);
    expect(parser.push('retry: 4000\n\n')).toEqual([]);
    expect(parser.reconnectMs).toBe(4000);
    expect(parser.push('retry: 2500\ndata: x\n\n')).toEqual([{ data: 'x', retry: 2500 }]);
    expect(parser.reconnectMs).toBe(2500);
  });
});

describe('content disposition', () => {
  it('round-trips unicode file names', () => {
    const header = contentDisposition('Überweisung "März".pdf');
    expect(header).toContain('filename="_berweisung _M_rz_.pdf"');
    expect(parseContentDisposition(header)).toBe('Überweisung "März".pdf');
    expect(parseContentDisposition('attachment; filename="plain.csv"')).toBe('plain.csv');
    expect(parseContentDisposition(null)).toBeUndefined();
  });
});

describe('document validation', () => {
  it('accepts allowed files and rejects the rest', () => {
    expect(validateDocumentFile({ name: 'id.pdf', type: 'application/pdf', size: 1000 })).toBeUndefined();
    expect(validateDocumentFile({ name: 'x.exe', type: 'application/x-msdownload', size: 10 })).toMatch(/Only PDF/);
    expect(validateDocumentFile({ name: 'big.png', type: 'image/png', size: MAX_DOCUMENT_BYTES + 1 })).toMatch(/10 MB/);
    expect(validateDocumentFile({ name: 'empty.txt', type: 'text/plain', size: 0 })).toMatch(/empty/);
    expect(validateDocumentFile({ name: '../etc/passwd', type: 'text/plain', size: 5 })).toMatch(/not allowed/);
  });
});
