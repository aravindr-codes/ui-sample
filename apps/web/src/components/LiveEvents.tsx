import type { Beneficiary, BeneficiaryId, ConnectionState, Disbursement, DomainEvent } from '@ifcui/api-contract';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import NotificationsOutlined from '@mui/icons-material/NotificationsOutlined';
import PaymentsOutlined from '@mui/icons-material/PaymentsOutlined';
import PersonAddAlt from '@mui/icons-material/PersonAddAlt';
import VerifiedUserOutlined from '@mui/icons-material/VerifiedUserOutlined';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import { keyframes } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { useApi } from '../api/ApiProvider';
import { queryKeys } from '../queries';
import { formatMoney } from './format';
import { ListItemLink } from './links';

const MAX_FEED = 100;

interface LiveEventsValue {
  state: ConnectionState;
  events: DomainEvent[];
  unread: number;
  markAllRead: () => void;
}

const LiveEventsContext = createContext<LiveEventsValue | null>(null);

/** Keeps TanStack Query caches in step with server-side changes pushed over SSE. */
export function applyEventToCache(queryClient: QueryClient, event: DomainEvent): void {
  const refreshStats = () => queryClient.invalidateQueries({ queryKey: queryKeys.programs.statsAll });
  switch (event.type) {
    case 'beneficiary.created':
    case 'beneficiary.status_changed':
      queryClient.setQueryData<Beneficiary>(queryKeys.beneficiaries.detail(event.beneficiary.id), event.beneficiary);
      void queryClient.invalidateQueries({ queryKey: ['beneficiaries', 'list'] });
      void refreshStats();
      return;
    case 'disbursement.created':
    case 'disbursement.approved':
      queryClient.setQueryData<Disbursement>(queryKeys.disbursements.detail(event.disbursement.id), event.disbursement);
      void queryClient.invalidateQueries({ queryKey: ['disbursements', 'list'] });
      void refreshStats();
      return;
    case 'document.uploaded':
      void queryClient.invalidateQueries({ queryKey: queryKeys.documents.list(event.document.beneficiaryId) });
      return;
    case 'document.deleted':
      void queryClient.invalidateQueries({ queryKey: queryKeys.documents.list(event.beneficiaryId) });
      return;
  }
}

export function LiveEventsProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [state, setState] = useState<ConnectionState>('connecting');
  const [events, setEvents] = useState<DomainEvent[]>([]);
  const [readUpTo, setReadUpTo] = useState<string | undefined>(undefined);

  useEffect(
    () =>
      api.events.subscribe({
        onStateChange: setState,
        onEvent: (event) => {
          applyEventToCache(queryClient, event);
          setEvents((current) =>
            current.some((e) => e.id === event.id) ? current : [event, ...current].slice(0, MAX_FEED),
          );
        },
      }),
    [api, queryClient],
  );

  const value = useMemo<LiveEventsValue>(() => {
    const unread = readUpTo === undefined ? events.length : events.findIndex((e) => e.id === readUpTo);
    return {
      state,
      events,
      unread: unread === -1 ? events.length : unread,
      markAllRead: () => setReadUpTo(events[0]?.id),
    };
  }, [state, events, readUpTo]);

  return <LiveEventsContext.Provider value={value}>{children}</LiveEventsContext.Provider>;
}

export function useLiveEvents(): LiveEventsValue {
  const value = useContext(LiveEventsContext);
  if (!value) throw new Error('useLiveEvents() must be used inside <LiveEventsProvider>');
  return value;
}

export function describeEvent(event: DomainEvent): { text: string; beneficiaryId: BeneficiaryId; icon: ReactNode } {
  switch (event.type) {
    case 'beneficiary.created':
      return {
        text: `${event.actor} registered ${event.beneficiary.displayName}`,
        beneficiaryId: event.beneficiary.id,
        icon: <PersonAddAlt fontSize="small" />,
      };
    case 'beneficiary.status_changed':
      return {
        text: `${event.actor} changed ${event.beneficiary.displayName} from ${event.previousStatus} to ${event.beneficiary.status}`,
        beneficiaryId: event.beneficiary.id,
        icon: <VerifiedUserOutlined fontSize="small" />,
      };
    case 'disbursement.created':
      return {
        text: `${event.actor} created ${formatMoney(event.disbursement.amountMinor, event.disbursement.currency)} for ${event.beneficiaryName}`,
        beneficiaryId: event.disbursement.beneficiaryId,
        icon: <PaymentsOutlined fontSize="small" />,
      };
    case 'disbursement.approved':
      return {
        text: `${event.actor} approved ${formatMoney(event.disbursement.amountMinor, event.disbursement.currency)} for ${event.beneficiaryName}`,
        beneficiaryId: event.disbursement.beneficiaryId,
        icon: <CheckCircleOutlined fontSize="small" />,
      };
    case 'document.uploaded':
      return {
        text: `${event.actor} uploaded ${event.document.fileName} for ${event.beneficiaryName}`,
        beneficiaryId: event.document.beneficiaryId,
        icon: <DescriptionOutlined fontSize="small" />,
      };
    case 'document.deleted':
      return {
        text: `${event.actor} deleted ${event.fileName}`,
        beneficiaryId: event.beneficiaryId,
        icon: <DeleteOutlined fontSize="small" />,
      };
  }
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
export function timeAgo(iso: string, now: number): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  if (Math.abs(seconds) < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return relative.format(minutes, 'minute');
  return relative.format(Math.round(minutes / 60), 'hour');
}

const pulse = keyframes`
  0% { box-shadow: 0 0 0 0 rgba(45, 118, 85, 0.5); }
  70% { box-shadow: 0 0 0 6px rgba(45, 118, 85, 0); }
  100% { box-shadow: 0 0 0 0 rgba(45, 118, 85, 0); }
`;

const STATE_LABEL: Record<ConnectionState, string> = {
  connecting: 'Connecting',
  open: 'Live',
  reconnecting: 'Reconnecting',
  closed: 'Offline',
};

export function LiveStatus() {
  const { state } = useLiveEvents();
  const color = state === 'open' ? 'success.main' : state === 'closed' ? 'text.disabled' : 'warning.main';
  return (
    <Tooltip title={state === 'open' ? 'Receiving live updates' : 'Live updates are not connected'}>
      <Stack
        direction="row"
        spacing={1}
        role="status"
        aria-label={`Live updates: ${STATE_LABEL[state]}`}
        sx={{ alignItems: 'center', px: 1.25, py: 0.5, borderRadius: 999, bgcolor: 'action.hover' }}
      >
        <Box
          aria-hidden
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: color,
            animation: state === 'open' ? `${pulse} 2s infinite` : 'none',
          }}
        />
        <Typography variant="caption" sx={{ fontWeight: 700 }}>
          {STATE_LABEL[state]}
        </Typography>
      </Stack>
    </Tooltip>
  );
}

export function ActivityButton() {
  const { events, unread, markAllRead } = useLiveEvents();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [open]);

  const close = () => {
    setOpen(false);
    markAllRead();
  };

  return (
    <>
      <Tooltip title="Live activity">
        <IconButton aria-label={`Live activity, ${unread} new`} onClick={() => setOpen(true)}>
          <Badge badgeContent={unread} color="error" max={99}>
            <NotificationsOutlined />
          </Badge>
        </IconButton>
      </Tooltip>
      <Drawer
        anchor="right"
        open={open}
        onClose={close}
        slotProps={{ paper: { sx: { width: { xs: '100%', sm: 400 } } } }}
      >
        <Stack direction="row" sx={{ alignItems: 'center', px: 2.5, py: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h3" component="h2">
              Live activity
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Changes by everyone, as they happen
            </Typography>
          </Box>
          <LiveStatus />
          <IconButton aria-label="Close activity" onClick={close} sx={{ ml: 1 }}>
            <CloseIcon />
          </IconButton>
        </Stack>
        {events.length === 0 ? (
          <Typography color="text.secondary" sx={{ p: 3 }}>
            No activity yet. Changes made by you or other operators appear here instantly.
          </Typography>
        ) : (
          <List sx={{ py: 0 }} aria-label="Activity feed">
            {events.map((event, index) => {
              const { text, beneficiaryId, icon } = describeEvent(event);
              return (
                <ListItem key={event.id} disablePadding>
                  <ListItemLink
                    to="/beneficiaries/$beneficiaryId"
                    params={{ beneficiaryId }}
                    search={{}}
                    onClick={close}
                    sx={{
                      alignItems: 'flex-start',
                      borderBottom: 1,
                      borderColor: 'divider',
                      bgcolor: index < unread ? 'action.selected' : undefined,
                    }}
                  >
                    <ListItemAvatar sx={{ minWidth: 44, mt: 0.5 }}>
                      <Box
                        sx={{
                          width: 32,
                          height: 32,
                          borderRadius: '10px',
                          display: 'grid',
                          placeItems: 'center',
                          color: 'primary.main',
                          bgcolor: 'action.hover',
                        }}
                      >
                        {icon}
                      </Box>
                    </ListItemAvatar>
                    <ListItemText
                      primary={text}
                      secondary={timeAgo(event.occurredAt, now)}
                      slotProps={{ primary: { variant: 'body2', sx: { fontWeight: index < unread ? 700 : 500 } } }}
                    />
                  </ListItemLink>
                </ListItem>
              );
            })}
          </List>
        )}
      </Drawer>
    </>
  );
}
