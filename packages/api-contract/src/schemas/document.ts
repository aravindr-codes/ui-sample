import { z } from 'zod';
import { BeneficiaryId } from './beneficiary';
import { Timestamp } from './common';

export const DocumentId = z.uuid().brand<'DocumentId'>();
export type DocumentId = z.infer<typeof DocumentId>;

export const DocumentKind = z.enum(['identity', 'consent', 'bank', 'other']);
export type DocumentKind = z.infer<typeof DocumentKind>;

/** Accepted upload types. Anything else is rejected with a validation error. */
export const DOCUMENT_CONTENT_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'text/plain', 'text/csv'] as const;
export const DocumentContentType = z.enum(DOCUMENT_CONTENT_TYPES);
export type DocumentContentType = z.infer<typeof DocumentContentType>;

/** 10 MiB per file. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export const DocumentFileName = z
  .string()
  .trim()
  .min(1, 'File name is required')
  .max(255, 'File name is too long')
  .refine((n) => !/[\\/\0]/.test(n), 'File name must not contain path separators');

export const BeneficiaryDocument = z.object({
  id: DocumentId,
  beneficiaryId: BeneficiaryId,
  kind: DocumentKind,
  fileName: DocumentFileName,
  contentType: DocumentContentType,
  sizeBytes: z.number().int().min(1).max(MAX_DOCUMENT_BYTES),
  /** Hex SHA-256 of the stored bytes, for integrity checks after download. */
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  uploadedAt: Timestamp,
  uploadedBy: z.string().min(1),
});
export type BeneficiaryDocument = z.infer<typeof BeneficiaryDocument>;

/** Multipart form fields accompanying the `file` part of an upload. */
export const DocumentUploadFields = z.object({ kind: DocumentKind });

/** Validates a file before upload; the server applies the same rules. Returns an error message or undefined. */
export function validateDocumentFile(file: { name: string; type: string; size: number }): string | undefined {
  if (!DocumentFileName.safeParse(file.name).success) return 'The file name is not allowed.';
  if (!DocumentContentType.safeParse(file.type).success) return 'Only PDF, PNG, JPEG, TXT and CSV files are accepted.';
  if (file.size <= 0) return 'The file is empty.';
  if (file.size > MAX_DOCUMENT_BYTES) return `Files must be ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB or smaller.`;
  return undefined;
}
