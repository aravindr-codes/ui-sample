import type { Program } from '@ifcui/api-contract';
import DarkModeOutlined from '@mui/icons-material/DarkModeOutlined';
import DashboardOutlined from '@mui/icons-material/DashboardOutlined';
import LightModeOutlined from '@mui/icons-material/LightModeOutlined';
import MenuIcon from '@mui/icons-material/Menu';
import PaymentsOutlined from '@mui/icons-material/PaymentsOutlined';
import PeopleOutlined from '@mui/icons-material/PeopleOutlined';
import PersonAddAlt from '@mui/icons-material/PersonAddAlt';
import SettingsBrightness from '@mui/icons-material/SettingsBrightness';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import { alpha, useColorScheme } from '@mui/material/styles';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useRouterState } from '@tanstack/react-router';
import { type ReactNode, useEffect, useState } from 'react';
import { tokens } from '../theme/theme';
import { ActivityButton, LiveStatus } from './LiveEvents';
import { ListItemLink } from './links';

const DRAWER_WIDTH = 272;

function ColorModeToggle() {
  const { mode, setMode } = useColorScheme();
  const next = mode === 'light' ? 'dark' : mode === 'dark' ? 'system' : 'light';
  const label = `Color mode: ${mode ?? 'system'} (switch to ${next})`;
  return (
    <Tooltip title={label}>
      <IconButton aria-label={label} onClick={() => setMode(next)}>
        {mode === 'light' ? <LightModeOutlined /> : mode === 'dark' ? <DarkModeOutlined /> : <SettingsBrightness />}
      </IconButton>
    </Tooltip>
  );
}

function Brand() {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2.5, py: 2.5 }}>
      <Box
        aria-hidden
        sx={{
          width: 36,
          height: 36,
          borderRadius: '12px',
          display: 'grid',
          placeItems: 'center',
          fontWeight: 800,
          fontSize: 14,
          color: '#fff',
          background: `linear-gradient(135deg, ${tokens.brandBlue}, ${tokens.blue50})`,
          boxShadow: `0 6px 16px -6px ${alpha(tokens.brandBlue, 0.8)}`,
        }}
      >
        DC
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, lineHeight: 1.2, color: '#fff' }}>Disbursement Console</Typography>
        <Typography variant="caption" sx={{ color: alpha('#fff', 0.6) }}>
          Programs & payments
        </Typography>
      </Box>
    </Box>
  );
}

/** Navigation on the navy sidebar; colors are local to this dark surface in both color modes. */
const navSx = {
  px: 1.5,
  '& .MuiListItemButton-root': {
    borderRadius: '10px',
    mb: 0.5,
    color: alpha('#fff', 0.78),
    transition: 'background-color 120ms, color 120ms',
    '& .MuiListItemIcon-root': { color: 'inherit', minWidth: 40 },
    '& .MuiListItemText-secondary': { color: alpha('#fff', 0.5), fontSize: '0.75rem' },
    '&:hover': { bgcolor: alpha('#fff', 0.08), color: '#fff' },
    '&.Mui-selected, &.Mui-selected:hover': {
      bgcolor: alpha('#fff', 0.12),
      color: '#fff',
      '& .MuiListItemIcon-root': { color: tokens.blue30 },
      '& .MuiListItemText-primary': { fontWeight: 700 },
    },
    '&.Mui-focusVisible': { outline: `2px solid ${tokens.focusOnDark}`, bgcolor: alpha('#fff', 0.08) },
  },
  '& .MuiListSubheader-root': { color: alpha('#fff', 0.5), px: 1.5 },
} as const;

function Navigation({ programs }: { programs: Program[] }) {
  return (
    <Box component="nav" aria-label="Main" sx={{ flexGrow: 1, overflowY: 'auto' }}>
      <List sx={navSx} subheader={<ListSubheader>Workspace</ListSubheader>}>
        <ListItem disablePadding>
          <ListItemLink to="/" activeOptions={{ exact: true }} activeProps={{ selected: true }}>
            <ListItemIcon>
              <DashboardOutlined />
            </ListItemIcon>
            <ListItemText primary="Dashboard" />
          </ListItemLink>
        </ListItem>
        <ListItem disablePadding>
          <ListItemLink to="/disbursements" activeProps={{ selected: true }}>
            <ListItemIcon>
              <PaymentsOutlined />
            </ListItemIcon>
            <ListItemText primary="Disbursements" />
          </ListItemLink>
        </ListItem>
        <ListItem disablePadding>
          <ListItemLink to="/beneficiaries/new" search={{}} activeProps={{ selected: true }}>
            <ListItemIcon>
              <PersonAddAlt />
            </ListItemIcon>
            <ListItemText primary="New beneficiary" />
          </ListItemLink>
        </ListItem>
      </List>
      <List sx={navSx} subheader={<ListSubheader>Programs</ListSubheader>}>
        {programs.map((p) => (
          <ListItem key={p.id} disablePadding>
            <ListItemLink
              to="/programs/$programId/beneficiaries"
              params={{ programId: p.id }}
              search={{}}
              activeProps={{ selected: true }}
            >
              <ListItemIcon>
                <PeopleOutlined />
              </ListItemIcon>
              <ListItemText primary={p.name} secondary={p.code} />
            </ListItemLink>
          </ListItem>
        ))}
      </List>
    </Box>
  );
}

function Sidebar({ programs }: { programs: Program[] }) {
  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        color: '#fff',
        background: `linear-gradient(180deg, ${tokens.blue90} 0%, ${tokens.blue120} 100%)`,
      }}
    >
      <Brand />
      <Navigation programs={programs} />
      <Typography variant="caption" sx={{ px: 3, py: 2, color: alpha('#fff', 0.4) }}>
        Local sample · mock API
      </Typography>
    </Box>
  );
}

export function AppShell({ programs, children }: { programs: Program[]; children: ReactNode }) {
  const isDesktop = useMediaQuery((theme) => theme.breakpoints.up('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const loading = useRouterState({ select: (s) => s.status === 'pending' });
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Close the mobile drawer on navigation.
  useEffect(() => {
    if (pathname) setMobileOpen(false);
  }, [pathname]);

  const paperSx = { width: DRAWER_WIDTH, border: 'none', bgcolor: tokens.blue120 };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <Box
        component="a"
        href="#main"
        sx={{
          position: 'absolute',
          left: -9999,
          zIndex: (t) => t.zIndex.tooltip,
          '&:focus': { left: 16, top: 16, p: 1, bgcolor: 'background.paper', color: 'text.primary' },
        }}
      >
        Skip to content
      </Box>
      {isDesktop ? (
        <Drawer variant="permanent" sx={{ width: DRAWER_WIDTH, flexShrink: 0, '& .MuiDrawer-paper': paperSx }}>
          <Sidebar programs={programs} />
        </Drawer>
      ) : (
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          sx={{ '& .MuiDrawer-paper': paperSx }}
        >
          <Sidebar programs={programs} />
        </Drawer>
      )}
      <Box sx={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <AppBar
          position="sticky"
          sx={(t) => ({
            top: 0,
            backdropFilter: 'saturate(180%) blur(12px)',
            bgcolor: alpha(tokens.neutral05, 0.8),
            borderBottom: `1px solid ${tokens.neutral10}`,
            color: 'text.primary',
            ...t.applyStyles('dark', {
              bgcolor: alpha(tokens.blue120, 0.8),
              borderColor: (t.vars ?? t).palette.divider,
            }),
          })}
        >
          <Toolbar sx={{ gap: 1 }}>
            {isDesktop ? null : (
              <>
                <IconButton edge="start" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
                  <MenuIcon />
                </IconButton>
                <Typography component="p" sx={{ fontWeight: 700 }}>
                  Disbursement Console
                </Typography>
              </>
            )}
            <Box sx={{ flexGrow: 1 }} />
            <LiveStatus />
            <ActivityButton />
            <ColorModeToggle />
          </Toolbar>
          <Box sx={{ height: 2 }}>{loading ? <LinearProgress aria-label="Loading" sx={{ height: 2 }} /> : null}</Box>
        </AppBar>
        <Box component="main" id="main" tabIndex={-1} sx={{ flexGrow: 1, outline: 'none' }}>
          <Container maxWidth="xl" sx={{ py: { xs: 3, md: 4 }, px: { xs: 2, md: 4 } }}>
            {children}
          </Container>
        </Box>
      </Box>
    </Box>
  );
}
