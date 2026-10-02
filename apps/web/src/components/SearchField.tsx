import SearchIcon from '@mui/icons-material/Search';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import { useEffect, useRef, useState } from 'react';

/** Debounced search box: keeps local text while typing and commits it after `delayMs`. */
export function SearchField({
  value,
  onChange,
  label,
  delayMs = 300,
}: {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  label: string;
  delayMs?: number;
}) {
  const [text, setText] = useState(value ?? '');
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const committed = useRef(value ?? '');

  // Follow external changes (back/forward navigation).
  useEffect(() => {
    committed.current = value ?? '';
    setText(value ?? '');
  }, [value]);

  useEffect(() => {
    if (text.trim() === committed.current) return;
    const handle = setTimeout(() => {
      committed.current = text.trim();
      onChangeRef.current(text.trim() || undefined);
    }, delayMs);
    return () => clearTimeout(handle);
  }, [text, delayMs]);

  return (
    <TextField
      size="small"
      label={label}
      type="search"
      value={text}
      onChange={(e) => setText(e.target.value)}
      sx={{ minWidth: { xs: '100%', sm: 280 } }}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
        },
      }}
    />
  );
}
