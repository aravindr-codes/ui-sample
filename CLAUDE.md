# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`README.md` is the human onboarding guide (API table, config, conventions). `PLAN.md` is the original design, with milestones and decisions. This file covers what an agent needs in order to work safely.

## Commands (repo root, pnpm 10, Node ≥ 22)

| Command | Does |
|---|---|
| `pnpm dev` | Vite on :5173 with the MSW mock API |
| `pnpm build` | `tsc` for all packages, then `vite build` → `apps/web/dist` |
| `pnpm test` | Vitest in both packages |
| `pnpm e2e` | Playwright against a fresh build + `vite preview` on :4173 |
| `pnpm check` | Biome check + `tsc` everywhere |
| `pnpm format` | Biome auto-fix |
| `pnpm package` | Clean source zip of `HEAD` via `git archive` (commit first) |

Running a subset:

- `pnpm --filter web exec vitest run tests/contract.test.ts -t "documents"`
- `pnpm --filter @ifcui/api-contract exec vitest run tests/sse.test.ts`
- `pnpm --filter web exec playwright test -g "<title>"`

**Definition of done:** `pnpm check && pnpm test && pnpm build && pnpm e2e`. The lefthook pre-commit hook runs Biome and `tsc`, and it blocks commits on failure. Fix the cause rather than bypassing the hook.

## Architecture in one breath

`packages/api-contract` is framework-free: Zod schemas, `ApiClient` interfaces, `ApiError`, the `routes.ts` table and the SSE codec. `apps/web` UI code reaches the API only through `useApi()` → `ApiClient`. `createApiClient(cfg)` (async) picks the adapter from the runtime `config.json`:

- `memory` → `InMemoryApiClient` → `Store`
- `msw` → `HttpApiClient` → MSW handlers → `Store`
- `http` → the real API

Mock code is dynamically imported, so it is never in the main chunk. The Store (`src/api/mock/store.ts`):

- validates all input
- parses entities on write
- pages, sorts and filters server-side
- emits `DomainEvent`s with a replay buffer
- holds uploaded documents

`simulator.ts` drives fake operator activity through the Store.

## Invariants: don't break these

- Adapters throw **only** `ApiError`. The HTTP adapter validates every response with the contract schema.
- HTTP paths come from `routes.ts` (`buildPath` in the client, patterns in MSW). Never hand-write a path.
- `api-contract` must stay free of React and the DOM (Node types only), ESM, and side-effect-free. Function Apps will import it and bundle it with tsdown.
- A new `ApiClient` capability means updating the store, the MSW handlers, **both** adapters, and the shared contract suite in `apps/web/tests/contract.test.ts`, which runs per adapter.
- Runtime config comes only from `config.json` (`RuntimeConfig` schema). `import.meta.env` is for build metadata only.
- UI styling is **MUI only** (no Tailwind). Raw colors and brand tokens live only in `src/theme/theme.ts`. Use theme tokens via `sx`/`styled`.
- Every paged table uses `components/DataTable.tsx`, which provides URL-bound paging and sort, search, virtualized scroll, and CSV/PDF export of all matching rows. Declare export behavior per column with `export: { csv, pdf } | false`.
- Route loaders call `ensureQueryData(factory)`, and components call `useSuspenseQuery(sameFactory)`. Factories live in `src/queries/index.ts`, and grid search schemas in `src/queries/search.ts`.
- Changes that affect live data must emit a `DomainEvent` in the store and be handled in `applyEventToCache` (`components/LiveEvents.tsx`).

## Gotchas found the hard way

- **TypeScript 7 native `tsc`:** `import 'typescript'` exposes only the version, so don't add tools that need the TS compiler API.
- **MSW 3:** the start option is `onUnhandledFrame` (not `onUnhandledRequest`). `public/mockServiceWorker.js` comes from `msw init` and is committed.
- **`@mui/icons-material` 9:** only `*Outlined` names exist (e.g. `PeopleOutlined`, not `PeopleOutline`).
- **`sx` numeric radii are multiplied by `shape.borderRadius` (10).** Use `'16px'` strings in `sx`.
- **DataGrid** can re-emit unchanged sort and pagination models. `useGridUrlState` ignores no-op changes, and without that guard the page resets to 0.
- **TanStack Query:** per-call `mutate(vars, { onSuccess })` fires only for the latest call. Use `mutateAsync` per item for parallel work (e.g. multi-file upload).
- **Route files** should export only `Route`, because shared code breaks auto code-splitting. Put shared code in `components/`.
- **Object URLs** for downloads must not be revoked immediately (Safari/Firefox cancel the download).
- **Playwright/automation browsers** intercept file choosers and downloads. Test uploads and exports manually in a normal browser.
- **macOS sed** has no `\b`. Use perl for word-boundary replacements.
