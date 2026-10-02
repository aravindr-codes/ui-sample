import Alert, { type AlertColor } from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';

interface Notice {
  id: number;
  message: string;
  severity: AlertColor;
}

type Notify = (message: string, severity?: AlertColor) => void;

const NotifierContext = createContext<Notify | null>(null);

/** App-wide toast queue: one visible notice at a time, the rest wait their turn. */
export function NotifierProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Notice[]>([]);
  const [open, setOpen] = useState(true);
  const current = queue[0];

  const notify = useCallback<Notify>((message, severity = 'info') => {
    setQueue((q) => [...q, { id: Date.now() + Math.random(), message, severity }]);
    setOpen(true);
  }, []);

  const value = useMemo(() => notify, [notify]);

  return (
    <NotifierContext.Provider value={value}>
      {children}
      <Snackbar
        key={current?.id}
        open={Boolean(current) && open}
        autoHideDuration={current?.severity === 'error' ? 8000 : 4000}
        onClose={(_, reason) => {
          if (reason !== 'clickaway') setOpen(false);
        }}
        slotProps={{
          transition: {
            onExited: () => {
              setQueue((q) => q.slice(1));
              setOpen(true);
            },
          },
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {current ? (
          <Alert severity={current.severity} variant="filled" onClose={() => setOpen(false)} sx={{ width: '100%' }}>
            {current.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </NotifierContext.Provider>
  );
}

export function useNotify(): Notify {
  const notify = useContext(NotifierContext);
  if (!notify) throw new Error('useNotify() must be used inside <NotifierProvider>');
  return notify;
}
