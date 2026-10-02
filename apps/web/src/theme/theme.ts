import { alpha, createTheme } from '@mui/material/styles';
import type {} from '@mui/x-data-grid/themeAugmentation';

/**
 * Brand tokens, modeled on the World Bank Group web design system (worldbank.org):
 * blue scale, neutral scale, Open Sans, pill buttons, orange keyboard-focus ring.
 * These are the only raw color values in the app; components style through the theme.
 */
export const tokens = {
  blue05: '#f6fcff',
  blue10: '#e9f7fd',
  blue20: '#cde7f9',
  blue30: '#a3daff',
  blue40: '#169af3',
  blue50: '#0071bc', // base
  blue60: '#00538a',
  blue70: '#004370',
  blue80: '#053657',
  blue90: '#012740',
  blue100: '#002035',
  blue120: '#001c2d',
  brandBlue: '#009fda',
  neutral05: '#f5f7f9',
  neutral10: '#e7edf3',
  neutral15: '#dae3eb',
  neutral30: '#bdccdb',
  neutral40: '#8a9db1',
  neutral50: '#586e84',
  neutral60: '#4b5e71',
  neutral90: '#181f25',
  green60: '#2d7655',
  green30: '#59c090',
  orange: '#da570e',
  orangeLight: '#f17f6a',
  red: '#b12911',
  redLight: '#f5a799',
  focusOnLight: '#b6490c',
  focusOnDark: '#f5926c',
} as const;

const fontFamily = '"Open Sans Variable", "Open Sans", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'class' },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: tokens.blue50, dark: tokens.blue70, light: tokens.blue40, contrastText: '#fff' },
        secondary: { main: tokens.blue90, light: tokens.blue70, dark: tokens.blue120, contrastText: '#fff' },
        info: { main: tokens.blue50 },
        success: { main: tokens.green60 },
        warning: { main: tokens.orange },
        error: { main: tokens.red },
        text: { primary: tokens.neutral90, secondary: tokens.neutral60 },
        background: { default: tokens.neutral05, paper: '#ffffff' },
        divider: tokens.neutral15,
        action: { selected: tokens.blue10, hover: alpha(tokens.blue50, 0.06) },
      },
    },
    dark: {
      palette: {
        primary: { main: tokens.blue40, dark: tokens.blue50, light: tokens.blue30, contrastText: tokens.blue120 },
        secondary: { main: tokens.blue30, contrastText: tokens.blue120 },
        info: { main: tokens.blue40 },
        success: { main: tokens.green30 },
        warning: { main: tokens.orangeLight },
        error: { main: tokens.redLight },
        text: { primary: 'rgba(255, 255, 255, 0.9)', secondary: 'rgba(255, 255, 255, 0.7)' },
        background: { default: tokens.blue120, paper: tokens.blue100 },
        divider: 'rgba(255, 255, 255, 0.16)',
        action: { selected: alpha(tokens.blue40, 0.16), hover: alpha(tokens.blue40, 0.08) },
      },
    },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily,
    h1: { fontSize: '2rem', fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.02em' },
    h2: { fontSize: '1.25rem', fontWeight: 700, lineHeight: 1.3, letterSpacing: '-0.01em' },
    h3: { fontSize: '1.0625rem', fontWeight: 700, lineHeight: 1.35 },
    h4: { fontWeight: 700, letterSpacing: '-0.02em' },
    h6: { fontWeight: 700 },
    subtitle1: { fontWeight: 600 },
    subtitle2: { fontWeight: 700 },
    button: { fontWeight: 700, textTransform: 'none', letterSpacing: 0 },
    overline: { fontWeight: 700, fontSize: '0.6875rem', letterSpacing: '0.1em', lineHeight: 1.6 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: (theme) => ({
        // Orange keyboard-focus ring (distinct from the blue brand, visible on light and dark).
        ':focus-visible': { outline: `2px solid ${tokens.focusOnLight}`, outlineOffset: 2 },
        ...theme.applyStyles('dark', { ':focus-visible': { outline: `2px solid ${tokens.focusOnDark}` } }),
        body: { WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' },
        '@media (prefers-reduced-motion: reduce)': {
          '*, *::before, *::after': { transitionDuration: '0.01ms !important', animationDuration: '0.01ms !important' },
        },
      }),
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: 999,
          paddingInline: 20,
          transition: 'background-color 150ms, box-shadow 150ms, transform 150ms',
          variants: [
            {
              props: { variant: 'contained', color: 'primary' },
              style: { '&:hover': { boxShadow: `0 6px 16px -6px ${alpha(tokens.blue50, 0.6)}` } },
            },
          ],
        },
        sizeSmall: { paddingInline: 14 },
      },
    },
    MuiAppBar: { defaultProps: { elevation: 0, color: 'transparent' } },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: ({ theme }) => ({ backgroundImage: 'none', ...theme.applyStyles('dark', { backgroundImage: 'none' }) }),
        rounded: { borderRadius: 16 },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: 16,
          border: `1px solid ${tokens.neutral10}`,
          boxShadow: `0 1px 2px ${alpha(tokens.blue90, 0.04)}, 0 8px 24px -12px ${alpha(tokens.blue90, 0.12)}`,
          ...theme.applyStyles('dark', { borderColor: theme.vars.palette.divider, boxShadow: 'none' }),
        }),
      },
    },
    MuiChip: { styleOverrides: { root: { fontWeight: 700, borderRadius: 999 } } },
    MuiListSubheader: {
      styleOverrides: {
        root: ({ theme }) => ({
          ...theme.typography.overline,
          color: theme.vars.palette.text.secondary,
          backgroundColor: 'transparent',
          lineHeight: '36px',
        }),
      },
    },
    MuiTypography: {
      styleOverrides: {
        // Headings in brand navy on light backgrounds, as on worldbank.org.
        root: ({ theme }) => ({
          '&.MuiTypography-h1, &.MuiTypography-h2, &.MuiTypography-h3': {
            color: tokens.blue90,
            ...theme.applyStyles('dark', { color: theme.vars.palette.text.primary }),
          },
        }),
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: 10,
          backgroundColor: theme.vars.palette.background.paper,
          '&:not(.Mui-focused):not(.Mui-error):hover .MuiOutlinedInput-notchedOutline': {
            borderColor: tokens.neutral40,
          },
        }),
        notchedOutline: ({ theme }) => ({
          borderColor: tokens.neutral15,
          ...theme.applyStyles('dark', { borderColor: theme.vars.palette.divider }),
        }),
      },
    },
    MuiDialog: { styleOverrides: { paper: { borderRadius: 20 } } },
    MuiAlert: { styleOverrides: { root: { borderRadius: 12 } } },
    MuiTooltip: { styleOverrides: { tooltip: { borderRadius: 8, fontWeight: 600 } } },
    MuiLinearProgress: { styleOverrides: { root: { borderRadius: 999 } } },
    MuiBreadcrumbs: { styleOverrides: { root: ({ theme }) => ({ fontSize: theme.typography.body2.fontSize }) } },
    MuiDataGrid: {
      defaultProps: {
        disableRowSelectionOnClick: true,
        disableColumnFilter: true,
        rowHeight: 56,
        columnHeaderHeight: 48,
      },
      styleOverrides: {
        root: ({ theme }) => ({
          border: 'none',
          '--DataGrid-rowBorderColor': tokens.neutral10,
          '--DataGrid-containerBackground': 'transparent',
          ...theme.applyStyles('dark', { '--DataGrid-rowBorderColor': theme.vars.palette.divider }),
        }),
        columnHeader: ({ theme }) => ({ ...theme.typography.overline, color: theme.vars.palette.text.secondary }),
        columnHeaderTitle: { fontWeight: 700 },
        columnSeparator: { display: 'none' },
        row: ({ theme }) => ({
          transition: 'background-color 120ms',
          '&:hover': { backgroundColor: alpha(tokens.blue50, 0.04) },
          ...theme.applyStyles('dark', { '&:hover': { backgroundColor: alpha(tokens.blue40, 0.08) } }),
        }),
        cell: { display: 'flex', alignItems: 'center' },
        footerContainer: { borderTop: 'none' },
      },
    },
  },
});
