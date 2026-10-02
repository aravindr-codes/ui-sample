import {
  type Beneficiary,
  type BeneficiaryDocument,
  DOCUMENT_CONTENT_TYPES,
  DocumentKind,
  MAX_DOCUMENT_BYTES,
  validateDocumentFile,
} from '@ifcui/api-contract';
import CloseIcon from '@mui/icons-material/Close';
import CloudUploadOutlined from '@mui/icons-material/CloudUploadOutlined';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import ImageOutlined from '@mui/icons-material/ImageOutlined';
import PictureAsPdfOutlined from '@mui/icons-material/PictureAsPdfOutlined';
import TableViewOutlined from '@mui/icons-material/TableViewOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import { alpha } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useSuspenseQuery } from '@tanstack/react-query';
import { type DragEvent, useId, useRef, useState } from 'react';
import { useApi } from '../api/ApiProvider';
import { describeError } from '../api/errors';
import { documentQueries } from '../queries';
import { useDeleteDocument, useUploadDocument } from '../queries/mutations';
import { tokens } from '../theme/theme';
import { downloadBlob } from './export';
import { formatDateTime } from './format';
import { useNotify } from './Notifier';

const KIND_LABELS: Record<DocumentKind, string> = {
  identity: 'Identity document',
  consent: 'Consent form',
  bank: 'Bank details',
  other: 'Other',
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function FileIcon({ contentType }: { contentType: string }) {
  if (contentType === 'application/pdf') return <PictureAsPdfOutlined />;
  if (contentType.startsWith('image/')) return <ImageOutlined />;
  if (contentType === 'text/csv') return <TableViewOutlined />;
  return <DescriptionOutlined />;
}

interface UploadItem {
  key: string;
  file: File;
  progress: number;
  error?: string;
  controller: AbortController;
}

export function DocumentsPanel({ beneficiary }: { beneficiary: Beneficiary }) {
  const api = useApi();
  const notify = useNotify();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: documents } = useSuspenseQuery(documentQueries.list(api, beneficiary.id));
  const upload = useUploadDocument(beneficiary.id);
  const remove = useDeleteDocument(beneficiary.id);
  const [kind, setKind] = useState<DocumentKind>('identity');
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BeneficiaryDocument | null>(null);

  const patch = (key: string, change: Partial<UploadItem>) =>
    setUploads((items) => items.map((u) => (u.key === key ? { ...u, ...change } : u)));

  const startUploads = (files: File[]) => {
    for (const file of files) {
      const key = `${file.name}-${file.size}-${Date.now()}-${Math.random()}`;
      const controller = new AbortController();
      const invalid = validateDocumentFile(file);
      setUploads((items) => [...items, { key, file, progress: 0, controller, ...(invalid ? { error: invalid } : {}) }]);
      if (invalid) continue;
      // mutateAsync per file: per-call mutate() callbacks only fire for the most recent call.
      void upload
        .mutateAsync({ file, kind, signal: controller.signal, onProgress: (progress) => patch(key, { progress }) })
        .then((doc) => {
          setUploads((items) => items.filter((u) => u.key !== key));
          notify(`${doc.fileName} uploaded.`, 'success');
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) {
            setUploads((items) => items.filter((u) => u.key !== key));
            return;
          }
          patch(key, { error: describeError(error).message });
        });
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    startUploads([...e.dataTransfer.files]);
  };

  const download = async (doc: BeneficiaryDocument) => {
    setDownloading(doc.id);
    try {
      const file = await api.documents.download(doc.id);
      downloadBlob(file.data, file.fileName);
    } catch (error) {
      const { title, message } = describeError(error);
      notify(`Download failed. ${title}: ${message}`, 'error');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <Card sx={{ p: { xs: 2, md: 3 } }} component="section" aria-labelledby={`${inputId}-title`}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' }, mb: 2 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography id={`${inputId}-title`} variant="h2">
            Documents
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {documents.length === 0 ? 'No documents yet' : `${documents.length} on file`}
          </Typography>
        </Box>
        <TextField
          select
          size="small"
          label="Document type"
          value={kind}
          onChange={(e) => setKind(DocumentKind.parse(e.target.value))}
          sx={{ minWidth: 200 }}
        >
          {DocumentKind.options.map((k) => (
            <MenuItem key={k} value={k}>
              {KIND_LABELS[k]}
            </MenuItem>
          ))}
        </TextField>
        <Button variant="contained" startIcon={<CloudUploadOutlined />} onClick={() => inputRef.current?.click()}>
          Upload files
        </Button>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          multiple
          hidden
          accept={DOCUMENT_CONTENT_TYPES.join(',')}
          aria-label="Choose files to upload"
          onChange={(e) => {
            startUploads([...(e.target.files ?? [])]);
            e.target.value = '';
          }}
        />
      </Stack>

      <Box
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        data-testid="document-dropzone"
        sx={(t) => ({
          border: '2px dashed',
          borderColor: dragging ? 'primary.main' : 'divider',
          bgcolor: dragging ? alpha(tokens.blue50, 0.06) : 'transparent',
          borderRadius: '14px',
          p: 3,
          textAlign: 'center',
          transition: 'border-color 120ms, background-color 120ms',
          ...t.applyStyles('dark', { bgcolor: dragging ? alpha(tokens.blue40, 0.1) : 'transparent' }),
        })}
      >
        <CloudUploadOutlined color={dragging ? 'primary' : 'disabled'} sx={{ fontSize: 32 }} />
        <Typography sx={{ fontWeight: 600 }}>Drag files here to upload as “{KIND_LABELS[kind]}”</Typography>
        <Typography variant="body2" color="text.secondary">
          PDF, PNG, JPEG, TXT or CSV · up to {MAX_DOCUMENT_BYTES / 1024 / 1024} MB each
        </Typography>
      </Box>

      {uploads.length > 0 ? (
        <Stack spacing={1} sx={{ mt: 2 }} aria-live="polite">
          {uploads.map((u) =>
            u.error ? (
              <Alert
                key={u.key}
                severity="error"
                action={
                  <IconButton
                    size="small"
                    aria-label={`Dismiss ${u.file.name}`}
                    onClick={() => setUploads((items) => items.filter((i) => i.key !== u.key))}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                }
              >
                <strong>{u.file.name}</strong>: {u.error}
              </Alert>
            ) : (
              <Stack key={u.key} direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                    Uploading {u.file.name} · {formatBytes(u.file.size)}
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={Math.round(u.progress * 100)}
                    aria-label={`Upload progress for ${u.file.name}`}
                    sx={{ mt: 0.5, height: 6 }}
                  />
                </Box>
                <Button size="small" onClick={() => u.controller.abort()}>
                  Cancel
                </Button>
              </Stack>
            ),
          )}
        </Stack>
      ) : null}

      {documents.length > 0 ? (
        <List aria-label="Documents" sx={{ mt: 1 }}>
          {documents.map((doc) => (
            <ListItem
              key={doc.id}
              divider
              secondaryAction={
                <Stack direction="row" spacing={0.5}>
                  <Tooltip title="Download">
                    <span>
                      <IconButton
                        aria-label={`Download ${doc.fileName}`}
                        onClick={() => void download(doc)}
                        disabled={downloading === doc.id}
                      >
                        {downloading === doc.id ? <CircularProgress size={20} /> : <FileDownloadOutlined />}
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton aria-label={`Delete ${doc.fileName}`} onClick={() => setConfirmDelete(doc)}>
                      <DeleteOutlined />
                    </IconButton>
                  </Tooltip>
                </Stack>
              }
              sx={{ pr: 14 }}
            >
              <ListItemIcon sx={{ color: 'primary.main' }}>
                <FileIcon contentType={doc.contentType} />
              </ListItemIcon>
              <ListItemText
                primary={doc.fileName}
                secondary={`${KIND_LABELS[doc.kind]} · ${formatBytes(doc.sizeBytes)} · ${formatDateTime(doc.uploadedAt)} · ${doc.uploadedBy}`}
                slotProps={{ primary: { sx: { fontWeight: 600, wordBreak: 'break-all' } } }}
              />
            </ListItem>
          ))}
        </List>
      ) : null}

      <Dialog open={Boolean(confirmDelete)} onClose={() => setConfirmDelete(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete document?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {confirmDelete?.fileName} will be permanently removed from {beneficiary.displayName}’s file.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            loading={remove.isPending}
            onClick={() => {
              if (!confirmDelete) return;
              remove.mutate(confirmDelete, { onSettled: () => setConfirmDelete(null) });
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
