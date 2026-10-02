import Button, { type ButtonProps } from '@mui/material/Button';
import MuiLink, { type LinkProps as MuiLinkProps } from '@mui/material/Link';
import ListItemButton, { type ListItemButtonProps } from '@mui/material/ListItemButton';
import { createLink } from '@tanstack/react-router';
import type { Ref } from 'react';

/** MUI components wired to TanStack Router so navigation stays type-safe and client-side. */
export const RouterLink = createLink((props: MuiLinkProps<'a'> & { ref?: Ref<HTMLAnchorElement> }) => (
  <MuiLink {...props} component="a" />
));

export const ButtonLink = createLink((props: ButtonProps<'a'> & { ref?: Ref<HTMLAnchorElement> }) => (
  <Button {...props} component="a" />
));

export const ListItemLink = createLink((props: ListItemButtonProps<'a'> & { ref?: Ref<HTMLAnchorElement> }) => (
  <ListItemButton {...props} component="a" />
));
