import type { Page } from '@ifcui/api-contract';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import PictureAsPdfOutlined from '@mui/icons-material/PictureAsPdfOutlined';
import TableViewOutlined from '@mui/icons-material/TableViewOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { DataGrid, type GridColDef, type GridValidRowModel } from '@mui/x-data-grid';
import { useRouterState } from '@tanstack/react-router';
import { type ReactNode, useId, useState } from 'react';
import { describeError } from '../api/errors';
import { PAGE_SIZES, useGridUrlState } from '../queries/search';
import {
  downloadBlob,
  EXPORT_MAX_ROWS,
  type ExportColumn,
  exportFileName,
  fetchAllPages,
  toCsv,
  toPdf,
} from './export';
import { formatCount, formatDateTime } from './format';
import { useNotify } from './Notifier';
import { SearchField } from './SearchField';

/** A grid column plus how it is exported. `export: false` leaves it out of CSV/PDF (e.g. action columns). */
export type DataTableColumn<R extends GridValidRowModel> = GridColDef<R> & {
  export?:
    | false
    | {
        csv?: (row: R) => string | number | null | undefined;
        pdf?: (row: R) => string;
        header?: string;
      };
};

export interface DataTableState {
  page: number;
  pageSize: number;
  sort?: string | undefined;
  q?: string | undefined;
}

export interface DataTableProps<R extends GridValidRowModel & { id: string }, S extends DataTableState> {
  /** Accessible name of the grid and title of exported files. */
  title: string;
  columns: DataTableColumn<R>[];
  data: Page<R>;
  /** URL-backed paging/sort/search state and its updater. */
  state: S;
  onStateChange: (patch: Partial<S>) => void;
  /** Shows a debounced search box bound to `state.q` when set. */
  searchLabel?: string;
  /** Extra filter controls rendered in the toolbar. */
  filters?: ReactNode;
  /** Fetches one page with the *current* filters and sort; used to export every matching row. */
  fetchPage: (page: number, pageSize: number) => Promise<Page<R>>;
  /** Human-readable description of the active filters, printed in exported files. */
  exportDescription?: string[];
  /** Grid viewport height; rows scroll (virtualized) inside it. */
  height?: number | string;
  emptyMessage?: string;
}

function rawValue<R extends GridValidRowModel>(row: R, field: string): string | number | null {
  const v = (row as Record<string, unknown>)[field];
  return typeof v === 'string' || typeof v === 'number' ? v : null;
}

function toExportColumns<R extends GridValidRowModel>(columns: DataTableColumn<R>[]): ExportColumn<R>[] {
  return columns
    .filter((c) => c.type !== 'actions' && c.export !== false)
    .map((c) => {
      const spec = c.export || {};
      const csv = spec.csv ?? ((row: R) => rawValue(row, c.field));
      return {
        header: spec.header ?? c.headerName ?? c.field,
        csv,
        pdf: spec.pdf ?? ((row: R) => String(csv(row) ?? '')),
        align: c.type === 'number' ? 'right' : 'left',
      };
    });
}

/**
 * The one grid used across the app: server-side paging/sorting bound to the URL, debounced search,
 * filter slot, fixed-height virtualized scrolling, and CSV/PDF export of *all* matching rows.
 */
export function DataTable<R extends GridValidRowModel & { id: string }, S extends DataTableState>({
  title,
  columns,
  data,
  state,
  onStateChange,
  searchLabel,
  filters,
  fetchPage,
  exportDescription = [],
  height = 560,
  emptyMessage = 'No matching records',
}: DataTableProps<R, S>) {
  const grid = useGridUrlState(state, onStateChange);
  const loading = useRouterState({ select: (s) => s.status === 'pending' });
  const notify = useNotify();
  const menuId = useId();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null);

  const runExport = async (format: 'csv' | 'pdf') => {
    setMenuAnchor(null);
    setExporting(format);
    try {
      const { rows, total, truncated } = await fetchAllPages(fetchPage);
      const exportColumns = toExportColumns(columns);
      const sortColumn = grid.sortModel[0];
      const sortLabel = sortColumn
        ? `Sorted by ${columns.find((c) => c.field === sortColumn.field)?.headerName ?? sortColumn.field} (${sortColumn.sort === 'asc' ? 'ascending' : 'descending'})`
        : null;
      if (format === 'csv') {
        downloadBlob(
          new Blob([toCsv(exportColumns, rows)], { type: 'text/csv;charset=utf-8' }),
          exportFileName(title, 'csv'),
        );
      } else {
        const subtitle = [
          ...exportDescription,
          ...(state.q ? [`Search: "${state.q}"`] : []),
          ...(sortLabel ? [sortLabel] : []),
          `${formatCount(rows.length)} of ${formatCount(total)} rows · Generated ${formatDateTime(new Date().toISOString())}`,
        ];
        downloadBlob(await toPdf({ title, subtitle, columns: exportColumns, rows }), exportFileName(title, 'pdf'));
      }
      notify(
        truncated
          ? `Exported the first ${formatCount(EXPORT_MAX_ROWS)} of ${formatCount(total)} rows. Narrow the filters to export the rest.`
          : `Exported ${formatCount(rows.length)} rows to ${format.toUpperCase()}.`,
        truncated ? 'warning' : 'success',
      );
    } catch (error) {
      const { title: errorTitle, message } = describeError(error);
      notify(`Export failed. ${errorTitle}: ${message}`, 'error');
    } finally {
      setExporting(null);
    }
  };

  return (
    <Card sx={{ overflow: 'hidden' }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1.5}
        sx={{ p: { xs: 2, md: 2.5 }, alignItems: { md: 'center' }, borderBottom: 1, borderColor: 'divider' }}
      >
        {searchLabel ? (
          <SearchField
            label={searchLabel}
            value={state.q}
            onChange={(q) => onStateChange({ q, page: 0 } as Partial<S>)}
          />
        ) : null}
        {filters}
        <Box sx={{ flexGrow: 1 }} />
        <Typography variant="body2" color="text.secondary" aria-live="polite" sx={{ whiteSpace: 'nowrap' }}>
          {formatCount(data.total)} {data.total === 1 ? 'result' : 'results'}
        </Typography>
        <Button
          variant="outlined"
          startIcon={<FileDownloadOutlined />}
          loading={exporting !== null}
          loadingPosition="start"
          disabled={data.total === 0}
          aria-controls={menuAnchor ? menuId : undefined}
          aria-haspopup="menu"
          aria-expanded={menuAnchor ? 'true' : undefined}
          onClick={(e) => setMenuAnchor(e.currentTarget)}
        >
          {exporting ? `Exporting ${exporting.toUpperCase()}…` : 'Export'}
        </Button>
        <Menu
          id={menuId}
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={() => setMenuAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          <MenuItem onClick={() => void runExport('pdf')}>
            <ListItemIcon>
              <PictureAsPdfOutlined fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="PDF" secondary="Formatted report" />
          </MenuItem>
          <MenuItem onClick={() => void runExport('csv')}>
            <ListItemIcon>
              <TableViewOutlined fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="CSV" secondary="For Excel and analysis" />
          </MenuItem>
        </Menu>
      </Stack>
      <Box sx={{ height, minHeight: 320 }}>
        <DataGrid
          aria-label={title}
          rows={data.items}
          columns={columns}
          rowCount={data.total}
          loading={loading}
          paginationMode="server"
          sortingMode="server"
          filterMode="server"
          pageSizeOptions={[...PAGE_SIZES]}
          localeText={{ noRowsLabel: emptyMessage }}
          {...grid}
        />
      </Box>
    </Card>
  );
}
