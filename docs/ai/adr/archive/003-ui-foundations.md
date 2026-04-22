# ADR 003: UI Foundations

## Status: Implemented

## Context

ADR 001 (archived) established the technology stack and verified a minimal
login→dashboard path. The current frontend is deliberately bare — raw HTML
elements, no design system, no shared components, no theme. This was
acceptable for the "does the auth path work" gate, but is unsuitable as a
baseline for the MVP scope in ADR 004 (day-trade decision cockpit).

The upcoming work requires, among other things:

- Data-dense realtime screens where engine state must be legible at a glance
  (recommendation state, target/retreat levels, rule-overlay status).
- Chart-centric layout with live price data, overlaid annotations, and
  multi-pane composition (price + volume).
- Visually unmistakable state transitions (steady → elevated → critical)
  that don't rely on subtle CSS to communicate urgency.
- Mobile access (ADR 001 requirements: "desktop and mobile browsers"),
  implying responsive layouts from day one, not a retrofit.

Without a shared foundation, every feature would re-invent buttons, inputs,
layouts, spacing, and accessibility primitives — accumulating inconsistency
that is painful to undo later. This ADR fixes the foundation so ADR 004 and
later ADRs can focus on behavior, not plumbing.

## Decision

### Component library: shadcn/ui

Radix UI primitives wrapped with Tailwind CSS, copy-paste into
`frontend/src/components/ui/`. Not an npm dependency — components live in
the repository and are owned/customized by us.

- **Why shadcn over Mantine**: (a) customization ceiling is higher — the
  cockpit accumulates asset-class-specific UI quirks that benefit from
  in-repo ownership of primitives; (b) 2026 default with the richest
  community; (c) tree-shaking is minimal because only used components land
  in the bundle.
- **Why not Ant Design / MUI**: Ant's density comes with a dated aesthetic
  and opinionated CSS cascade; MUI's Material language does not fit a
  dark-themed trading cockpit.

### Styling: Tailwind CSS v4

Tailwind is a hard dependency of shadcn/ui. v4 is the current stable line
(CSS-first config, no JS `tailwind.config.js`).

### Form handling: react-hook-form + zod

- `react-hook-form` for the render / state machinery (replaces the current
  ad-hoc `useState` per field in `routes/Login.tsx`).
- `zod` for schema-declared validation with TypeScript inference.
- shadcn/ui's `Form` component is the official bridge between the two and
  handles aria-invalid wiring, error messaging, and submission state.

### Icons: lucide-react

shadcn/ui's default icon set. No second icon library.

### Toast / inline notifications: sonner

shadcn/ui's recommended toast. Used for transient server errors, rule
trigger announcements, logout success, etc. Not used for critical trading
alerts (those demand in-view escalation and push notifications — ADR 004).

### Layout: AppShell pattern

```
┌──────────────────────────────────────────────┐
│ Header  (brand | session state | user menu)  │
├──────────────────────────────────────────────┤
│                                              │
│              Route content                   │
│       (max-width constrained, centered       │
│        on desktop; full-width on mobile)     │
│                                              │
└──────────────────────────────────────────────┘
```

One level only for MVP — no persistent sidebar. Top-level navigation lives
in the header on desktop and collapses to a sheet drawer on mobile
(shadcn's `Sheet`). The concrete set of routes is defined by ADR 004+,
not by this foundation ADR.

### Theme: dark mode default, class-based toggle

Tailwind's `darkMode: 'class'`. Default is dark (reduced glare during long
sessions). Toggle lives in the user menu. Persisted to `localStorage`,
respected with `prefers-color-scheme` as initial fallback.

### Loading states

- Route-level: React Router's route loader pattern (or Suspense boundaries
  per route); no full-page global spinner.
- Component-level: shadcn's `Skeleton` for data-dense views; the bare
  `return null` in `ProtectedRoute.tsx` is replaced by a centered skeleton
  while the `/api/me` probe is in flight.

### 404 and error boundaries

- `NotFound` component for unmatched routes — not the current silent no-op.
- `ErrorBoundary` at the root of the router for unhandled render errors —
  shows a "something went wrong" card with a retry button, not a white
  screen.

### Charting: lightweight-charts

TradingView's open-source charting library (Apache-2.0). The decision lives
here, in the foundation ADR, so later feature ADRs depend on a known
primitive rather than re-debating it.

- Native OHLC/candlestick series with tick-level update API designed for
  realtime streams.
- Built-in support for **price lines** with labels (target, retreat),
  bar-anchored **markers** (state transitions, setup triggers), and
  **multi-pane** layout (price + volume).
- Dark theme out of the box; permissive license; active upstream.

Rejected alternatives: `apexcharts` (heavier, weaker trading primitives),
embedded TradingView widget (requires paid tier for most annotations;
black-box DOM). `recharts` is unsuitable for the primary trading surface
(no OHLC idioms, re-render model struggles with tick streams) but is
used indirectly via Tremor Raw for secondary summary surfaces (below).

### Summary / KPI widgets: Tremor Raw (copy-paste, via Recharts)

Complement — not replace — lightweight-charts. The trading chart is
tick-driven and multi-pane; the cockpit also has status-strip metrics,
rule-overlay gauges, and session summaries that are plainer and benefit
from dashboard-grade widgets. Tremor Raw is the foundation choice for
these:

- `CategoryBar` — rule-overlay gauge (used loss vs cap, segmented by
  risk tier with a marker dot).
- `Tracker` — session history block row (win / loss / scratch colors).
- `AreaChart` — intraday P&L curve, equity-by-session trend.
- `BarChart` — setup-by-setup hit rate, R-multiple distribution.

These widgets are copy-paste primitives (vendored into
`src/components/ui/`), built on Recharts + Tailwind v4, and match the
shadcn `data-slot` + `cn` convention. No npm dep on `@tremor/react` —
see Considerations.

### Tabular data: TanStack Table (when needed)

Not wired in at this ADR — mentioned so the choice is pinned when the
first data-dense table lands. Headless, works with any CSS system, plays
well with shadcn. Chosen now so later feature ADRs inherit the decision.

### Linting: eslint-plugin-jsx-a11y

Added to `frontend/eslint.config.js`. Catches missing labels, misuse of
aria-\*, non-interactive elements with click handlers, etc. — the kind of
issues that are invisible until someone uses a screen reader or the keyboard.

## Implementation

Ordered so each step is verifiable in isolation. Each step ends with
`pnpm test:run && pnpm lint && pnpm build` green.

- [x] Install Tailwind v4 + PostCSS; configure `src/index.css` tokens
- [x] Run `npx shadcn@latest init`; commit generated `components.json`,
      `lib/utils.ts`, and initial `globals.css`
- [x] Add `components/ui/` to the repo (start empty; components added on
      first use) — init brought `button.tsx`; kept for S4 Login rebuild
- [x] Install `react-hook-form`, `zod`, `@hookform/resolvers`
- [x] Install `lucide-react` (via nova preset), `sonner`
- [x] Add `eslint-plugin-jsx-a11y`; flip strict rules on
- [x] Build `AppShell` component; wrap `<Routes>` in it
- [x] Rebuild `routes/Login.tsx` using shadcn `Form` + `Input` + `Button` +
      react-hook-form + zod; expect same tests still pass (behavior
      unchanged, only presentation)
- [x] Replace `ProtectedRoute`'s `return null` with a centered `Skeleton`
- [x] Add `NotFound` route and `ErrorBoundary` at the router root
- [x] Add dark-mode toggle in the header; wire `localStorage` + initial
      `prefers-color-scheme`
- [x] Update `App.test.tsx` selectors to work with shadcn's DOM structure
      (assertions target aria roles, not markup details — should survive)
- [x] Smoke test on mobile viewport (Chrome devtools responsive mode) —
      Login form and empty Dashboard render without horizontal scroll
- [x] Tremor spike: prototype KPI widgets on Dashboard to evaluate fit
      for the ADR 004 cockpit summary surface and Tailwind v4
      compatibility. **Outcome: Tremor Raw promoted to foundation** —
      see "Summary / KPI widgets" in Decision and the spike log in
      Considerations.

## Considerations

### The copy-paste model

shadcn/ui components are generated into our repo, not pinned to a version.
This means:

- **Upside**: any component can be edited in place, no upstream library
  blocking us.
- **Downside**: security/bug fixes in upstream do not reach us automatically.
  We mitigate by periodically running `npx shadcn@latest diff` against the
  components we use, not by refusing to modify them.

### Tests that asserted on raw markup may break

`App.test.tsx` currently matches on `role="alert"`, form aria-label, and
generic labels — these are stable under shadcn's DOM. `useAuth` tests
observe state via data-testid, also stable. We expect no test rewrites, only
the token/markup swap inside components.

### Bundle size

Baseline build is 235 KB gzipped (current Login + router). shadcn primitives
are tree-shakable per-component. Estimate after Login rebuild and AppShell:
~380–450 KB. Not a concern for a single-user tool on a local network, but
worth noting so later feature additions are evaluated.

### Tremor spike log (why Tremor Raw, not `@tremor/react`)

The initial attempt installed the `@tremor/react` npm package (v3.18.7).
It builds, but its internal styles reference Tailwind v3 theme tokens
(`bg-tremor-background`, `border-tremor-border`, etc.) that do not exist
in our Tailwind v4 CSS-first config. Result: components render
structurally but without any Tremor-specific styling — cards had only
borders, `CategoryBar` showed axis labels but no colored segments, and
`Tracker` cells had zero height. Patching v4 to satisfy v3 conventions
(reintroducing `tailwind.config.js`-style tokens) was technically
possible but non-idiomatic and brittle against upstream.

Tremor Raw is the v4-native successor — copy-paste primitives using
Tailwind utility classes directly and CSS variables compatible with our
shadcn token system. Four widgets landed in `src/components/ui/` for
Phase 1 use: `CategoryBar`, `Tracker`, `AreaChart`, `BarChart`. Local
simplifications on each: `cx` → `cn`, Tremor's Legend scroll slider and
`@remixicon` icons dropped (not needed), `onValueChange` / active-bar
interactivity dropped (can be reintroduced if required).

`recharts` is the runtime dependency added (the underlying chart engine
Tremor Raw's charts wrap). +380 KB to the bundle, accepted because the
cockpit summary surface is load-bearing and not deferrable. `recharts`
stays out of the primary trading chart (OHLC + indicator overlays + tick
streams) which remains on lightweight-charts.

### Mantine left on the table as a fallback

If shadcn ceremony proves to slow MVP velocity, Mantine is the fallback.
It would be a superseding ADR, not a patch to this one — the DOM conventions
differ enough that half-migration would be worse than either pure choice.

### What this ADR deliberately does not decide

- Storybook: not installed. For a single-user tool without designers, the
  overhead outweighs the benefit. Revisit if the component library grows past
  ~30 bespoke components.
- Internationalization / i18n: out of scope; the tool is single-user and
  English (CLAUDE.md).
- Concrete route tree, screen composition, and chart annotation language:
  these are feature-ADR concerns (ADR 004+), not foundation concerns.

## Future Extensions

- **Additional Tremor Raw widgets** (DonutChart, LineChart, SparkChart,
  ProgressCircle, BarList) — copy-paste in when a specific cockpit or
  review surface needs them. The base (chart-utils, Recharts) is
  already wired.
- **Storybook** only if the custom-component count justifies it.
- **Mobile PWA manifest** + install prompt once the tool is deployed and
  routinely accessed from a phone.
- **Keyboard shortcuts** — natural fit once `cmdk` (bundled with shadcn)
  is wired for a command palette.
