/**
 * Server-Sent Events wire format (WHATWG HTML §9.2), shared by producers (MSW, Function Apps)
 * and the fetch-based client so both sides agree on framing.
 */
export interface SseMessage {
  id?: string;
  event?: string;
  data: string;
  retry?: number;
}

export function formatSse({ id, event, data, retry }: SseMessage): string {
  let out = '';
  if (id !== undefined) out += `id: ${id}\n`;
  if (event !== undefined) out += `event: ${event}\n`;
  if (retry !== undefined) out += `retry: ${retry}\n`;
  for (const line of data.split(/\r?\n/)) out += `data: ${line}\n`;
  return `${out}\n`;
}

export function formatSseComment(comment: string): string {
  return `: ${comment}\n\n`;
}

/** Incremental parser: feed decoded text chunks, get complete messages (comments and empty dispatches skipped). */
export class SseParser {
  /** Latest server-advertised reconnection delay (`retry:` field), applied as soon as it is parsed. */
  reconnectMs: number | undefined;
  private buffer = '';
  private data: string[] = [];
  private id: string | undefined;
  private event: string | undefined;
  private retry: number | undefined;

  push(chunk: string): SseMessage[] {
    this.buffer += chunk;
    const messages: SseMessage[] = [];
    for (;;) {
      const match = /\r\n|\r|\n/.exec(this.buffer);
      if (!match) break;
      // A lone trailing CR may be the first half of CRLF split across chunks.
      if (match[0] === '\r' && match.index === this.buffer.length - 1) break;
      const line = this.buffer.slice(0, match.index);
      this.buffer = this.buffer.slice(match.index + match[0].length);
      const message = this.line(line);
      if (message) messages.push(message);
    }
    return messages;
  }

  private line(line: string): SseMessage | undefined {
    if (line === '') {
      if (this.data.length === 0) {
        this.event = undefined;
        return undefined;
      }
      const message: SseMessage = { data: this.data.join('\n') };
      if (this.id !== undefined) message.id = this.id;
      if (this.event !== undefined) message.event = this.event;
      if (this.retry !== undefined) message.retry = this.retry;
      this.data = [];
      this.event = undefined;
      this.retry = undefined;
      return message;
    }
    if (line.startsWith(':')) return undefined;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') this.data.push(value);
    else if (field === 'id' && !value.includes('\0')) this.id = value;
    else if (field === 'event') this.event = value;
    else if (field === 'retry' && /^\d+$/.test(value)) {
      this.retry = Number(value);
      this.reconnectMs = this.retry;
    }
    return undefined;
  }
}
