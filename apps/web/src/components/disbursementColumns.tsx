import type { Disbursement } from '@ifcui/api-contract';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import { GridActionsCellItem } from '@mui/x-data-grid';
import type { useApproveDisbursement } from '../queries/mutations';
import type { DataTableColumn } from './DataTable';
import { currencyDigits, formatDateTime, formatMoney, shortId } from './format';
import { RouterLink } from './links';
import { StatusChip, statusLabel } from './StatusChip';

/** Columns shared by the disbursements page and the beneficiary history table. */
export function disbursementColumns({
  programCodes,
  canApprove,
  approve,
  showBeneficiary,
}: {
  programCodes?: Map<string, string>;
  canApprove: boolean;
  approve: ReturnType<typeof useApproveDisbursement>;
  showBeneficiary: boolean;
}): DataTableColumn<Disbursement>[] {
  return [
    {
      field: 'id',
      headerName: 'ID',
      width: 110,
      sortable: false,
      valueFormatter: (value: string) => shortId(value),
      export: { pdf: (row) => shortId(row.id) },
    },
    ...(showBeneficiary
      ? [
          {
            field: 'beneficiaryId',
            headerName: 'Beneficiary',
            width: 140,
            sortable: false,
            renderCell: ({ row }) => (
              <RouterLink
                to="/beneficiaries/$beneficiaryId"
                params={{ beneficiaryId: row.beneficiaryId }}
                search={{}}
                underline="hover"
                aria-label={`Beneficiary ${shortId(row.beneficiaryId)}`}
                sx={{ fontWeight: 600, fontFamily: 'monospace' }}
              >
                {shortId(row.beneficiaryId)}
              </RouterLink>
            ),
            export: { pdf: (row) => shortId(row.beneficiaryId) },
          } satisfies DataTableColumn<Disbursement>,
        ]
      : []),
    ...(programCodes
      ? [
          {
            field: 'programId',
            headerName: 'Program',
            width: 120,
            sortable: false,
            valueGetter: (value: string) => programCodes.get(value) ?? shortId(value),
            export: { csv: (row) => programCodes.get(row.programId) ?? row.programId },
          } satisfies DataTableColumn<Disbursement>,
        ]
      : []),
    {
      field: 'amountMinor',
      headerName: 'Amount',
      type: 'number',
      flex: 1,
      minWidth: 150,
      valueFormatter: (value: number, row) => formatMoney(value, row.currency),
      export: {
        header: 'Amount',
        csv: (row) => row.amountMinor / 10 ** currencyDigits(row.currency),
        pdf: (row) => formatMoney(row.amountMinor, row.currency),
      },
    },
    { field: 'currency', headerName: 'Currency', width: 100, sortable: false },
    {
      field: 'status',
      headerName: 'Status',
      width: 140,
      renderCell: ({ row }) => <StatusChip status={row.status} />,
      export: { pdf: (row) => statusLabel(row.status) },
    },
    {
      field: 'createdAt',
      headerName: 'Created',
      flex: 1,
      minWidth: 180,
      valueFormatter: (value: string) => formatDateTime(value),
      export: { pdf: (row) => formatDateTime(row.createdAt) },
    },
    {
      field: 'approvedAt',
      headerName: 'Approved',
      flex: 1,
      minWidth: 180,
      valueFormatter: (value: string | null) => formatDateTime(value),
      export: { pdf: (row) => formatDateTime(row.approvedAt) },
    },
    ...(canApprove
      ? [
          {
            field: 'actions',
            type: 'actions',
            headerName: 'Actions',
            width: 90,
            getActions: ({ row }) =>
              row.status === 'pending'
                ? [
                    <GridActionsCellItem
                      key="approve"
                      icon={<CheckCircleOutlined color="success" />}
                      label={`Approve disbursement ${shortId(row.id)}`}
                      disabled={approve.isPending && approve.variables === row.id}
                      onClick={() => approve.mutate(row.id)}
                    />,
                  ]
                : [],
          } satisfies DataTableColumn<Disbursement>,
        ]
      : []),
  ];
}
