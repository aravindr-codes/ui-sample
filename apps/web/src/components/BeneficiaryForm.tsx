import { zodResolver } from '@hookform/resolvers/zod';
import { NewBeneficiary, type Program } from '@ifcui/api-contract';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import type { z } from 'zod';
import { describeError, fieldErrors } from '../api/errors';

type FormInput = z.input<typeof NewBeneficiary>;
type FormOutput = z.output<typeof NewBeneficiary>;

export interface BeneficiaryFormProps {
  programs: Program[];
  defaultProgramId?: string | undefined;
  onSubmit: (values: FormOutput) => Promise<void>;
  onCancel?: () => void;
}

/** Create form validated with the contract schema, so client validation equals server validation. */
export function BeneficiaryForm({ programs, defaultProgramId, onSubmit, onCancel }: BeneficiaryFormProps) {
  const active = programs.filter((p) => p.status === 'active');
  const initialProgram = active.find((p) => p.id === defaultProgramId)?.id ?? active[0]?.id ?? '';
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(NewBeneficiary),
    defaultValues: { programId: initialProgram, displayName: '', country: '' },
    mode: 'onTouched',
  });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await onSubmit(values);
    } catch (error) {
      const perField = fieldErrors(error);
      const known = (['programId', 'displayName', 'country'] as const).filter((f) => perField[f]);
      for (const f of known) setError(f, { type: 'server', message: perField[f] ?? '' });
      if (known.length === 0) {
        const { title, message } = describeError(error);
        setFormError(`${title}: ${message}`);
      }
    }
  });

  return (
    <Stack
      component="form"
      noValidate
      spacing={3}
      onSubmit={submit}
      aria-label="New beneficiary"
      sx={{ maxWidth: 560 }}
    >
      {formError ? (
        <Alert severity="error" role="alert">
          {formError}
        </Alert>
      ) : null}
      <Controller
        name="programId"
        control={control}
        render={({ field }) => (
          <TextField
            {...field}
            select
            required
            label="Program"
            error={Boolean(errors.programId)}
            helperText={errors.programId?.message ?? 'Only active programs accept new beneficiaries'}
          >
            {active.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.name} ({p.code})
              </MenuItem>
            ))}
          </TextField>
        )}
      />
      <Controller
        name="displayName"
        control={control}
        render={({ field }) => (
          <TextField
            {...field}
            required
            label="Display name"
            autoComplete="off"
            error={Boolean(errors.displayName)}
            helperText={errors.displayName?.message ?? ' '}
          />
        )}
      />
      <Controller
        name="country"
        control={control}
        render={({ field }) => (
          <TextField
            {...field}
            onChange={(e) => field.onChange(e.target.value.toUpperCase())}
            required
            label="Country"
            placeholder="KE"
            error={Boolean(errors.country)}
            helperText={errors.country?.message ?? 'ISO 3166-1 alpha-2, e.g. KE'}
            slotProps={{ htmlInput: { maxLength: 2, autoCapitalize: 'characters' } }}
          />
        )}
      />
      <Stack direction="row" spacing={2}>
        <Button type="submit" variant="contained" loading={isSubmitting} disabled={active.length === 0}>
          Create beneficiary
        </Button>
        {onCancel ? (
          <Button onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        ) : null}
      </Stack>
    </Stack>
  );
}
