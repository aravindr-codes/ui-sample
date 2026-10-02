/**
 * REST route table shared by HttpApiClient (via `buildPath`) and MSW / Function Apps (via the `:param` patterns).
 * Paths are relative to the API base URL.
 */
export const routes = {
  programs: '/programs',
  program: '/programs/:programId',
  programStats: '/programs/:programId/stats',
  programBeneficiaries: '/programs/:programId/beneficiaries',
  beneficiaries: '/beneficiaries',
  beneficiary: '/beneficiaries/:beneficiaryId',
  beneficiaryStatus: '/beneficiaries/:beneficiaryId/status',
  disbursements: '/disbursements',
  disbursement: '/disbursements/:disbursementId',
  disbursementApprove: '/disbursements/:disbursementId/approve',
  beneficiaryDocuments: '/beneficiaries/:beneficiaryId/documents',
  document: '/documents/:documentId',
  documentContent: '/documents/:documentId/content',
  events: '/events',
  devReset: '/__dev/reset',
} as const;

export type RouteName = keyof typeof routes;

type ParamNames<P extends string> = P extends `${string}:${infer Name}/${infer Rest}`
  ? Name | ParamNames<`/${Rest}`>
  : P extends `${string}:${infer Name}`
    ? Name
    : never;

export type RouteParams<R extends RouteName> = { [K in ParamNames<(typeof routes)[R]>]: string };

type ParamArgs<R extends RouteName> = [ParamNames<(typeof routes)[R]>] extends [never] ? [] : [params: RouteParams<R>];

/** Builds a concrete path, URI-encoding every parameter. */
export function buildPath<R extends RouteName>(name: R, ...args: ParamArgs<R>): string {
  const params = (args[0] ?? {}) as Record<string, string>;
  return routes[name].replace(/:([A-Za-z]+)/g, (_, key: string) => {
    const value = params[key];
    if (value === undefined) throw new Error(`Missing route param "${key}" for ${name}`);
    return encodeURIComponent(value);
  });
}

/** Serializes a query object into a search string (leading `?` included, empty string if nothing to send). */
export function toSearch(query: object | undefined): string {
  if (!query) return '';
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    sp.set(key, String(value));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/** Converts URLSearchParams into a plain object suitable for Zod parsing on the server side. */
export function fromSearch(sp: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of sp) out[key] = value;
  return out;
}

/** Builds an RFC 6266 `Content-Disposition: attachment` value that survives non-ASCII file names. */
export function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/** Extracts the file name from a `Content-Disposition` header (prefers the RFC 5987 `filename*` form). */
export function parseContentDisposition(header: string | null): string | undefined {
  if (!header) return undefined;
  const star = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      // fall through to the plain form
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
  return plain?.[1]?.trim();
}
