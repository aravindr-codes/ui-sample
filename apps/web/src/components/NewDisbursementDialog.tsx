import { zodResolver } from '@hookform/resolvers/zod';
import type { Beneficiary, Program } from '@ifcui/api-contract';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { describeError } from '../api/errors';
import { useCreateDisbursement } from '../queries/mutations';
import { formatMoney, parseMoneyToMinor } from './format';
import { useNotify } from './Notifier';

export interface NewDisbursementDialogProps {
  open: boolean;
  onClose: () => void;
  beneficiary: Beneficiary;
  program: Program;
}

export function NewDisbursementDialog({ open, onClose, beneficiary, program }: NewDisbursementDialogProps) {
  const create = useCreateDisbursement();
  const notify = useNotify();
  const [formError, setFormError] = useState<string | null>(null);

  const schema = z.object({
    amount: z
      .string()
      .min(1, 'Amount is required')
      .refine((v) => parseMoneyToMinor(v, program.currency) !== undefined, 'Enter a valid amount')
      .refine((v) => (parseMoneyToMinor(v, program.currency) ?? 0) > 0, 'Amount must be greater than zero'),
  });

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { amount: '' } });

  const close = () => {
    reset();
    setFormError(null);
    onClose();
  };

  const submit = handleSubmit(async ({ amount }) => {
    setFormError(null);
    const amountMinor = parseMoneyToMinor(amount, program.currency);
    if (amountMinor === undefined) return;
    try {
      const created = await create.mutateAsync({ beneficiaryId: beneficiary.id, amountMinor });
      notify(`Disbursement of ${formatMoney(created.amountMinor, created.currency)} created.`, 'success');
      close();
    } catch (error) {
      const { title, message } = describeError(error);
      setFormError(`${title}: ${message}`);
    }
  });

  return (
    <Dialog open={open} onClose={isSubmitting ? undefined : close} fullWidth maxWidth="xs">
      <form onSubmit={submit} noValidate aria-label="New disbursement">
        <DialogTitle>New disbursement</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Pay {beneficiary.displayName} from {program.name}. The disbursement is created as pending and must be
            approved.
          </DialogContentText>
          {formError ? (
            <Alert severity="error" role="alert" sx={{ mb: 2 }}>
              {formError}
            </Alert>
          ) : null}
          <Controller
            name="amount"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                autoFocus
                fullWidth
                required
                label="Amount"
                inputMode="decimal"
                error={Boolean(errors.amount)}
                helperText={errors.amount?.message ?? ' '}
                slotProps={{
                  input: { startAdornment: <InputAdornment position="start">{program.currency}</InputAdornment> },
                }}
              />
            )}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={close} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" loading={isSubmitting}>
            Create
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
