# ADR 003: UI Foundations

## Status: Proposed

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

Rejected alternatives: `recharts` (general-purpose, lacks OHLC idioms),
`apexcharts` (heavier, weaker trading primitives), embedded TradingView
widget (requires paid tier for most annotations; black-box DOM).

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

- [ ] Install Tailwind v4 + PostCSS; configure `src/index.css` tokens
- [ ] Run `npx shadcn@latest init`; commit generated `components.json`,
      `lib/utils.ts`, and initial `globals.css`
- [ ] Add `components/ui/` to the repo (start empty; components added on
      first use)
- [ ] Install `react-hook-form`, `zod`, `@hookform/resolvers`
- [ ] Install `lucide-react`, `sonner`
- [ ] Add `eslint-plugin-jsx-a11y`; flip strict rules on
- [ ] Build `AppShell` component; wrap `<Routes>` in it
- [ ] Rebuild `routes/Login.tsx` using shadcn `Form` + `Input` + `Button` +
      react-hook-form + zod; expect same tests still pass (behavior
      unchanged, only presentation)
- [ ] Replace `ProtectedRoute`'s `return null` with a centered `Skeleton`
- [ ] Add `NotFound` route and `ErrorBoundary` at the router root
- [ ] Add dark-mode toggle in the header; wire `localStorage` + initial
      `prefers-color-scheme`
- [ ] Update `App.test.tsx` selectors to work with shadcn's DOM structure
      (assertions target aria roles, not markup details — should survive)
- [ ] Smoke test on mobile viewport (Chrome devtools responsive mode) —
      Login form and empty Dashboard render without horizontal scroll

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

- **Tremor** for KPI cards and dashboard gauges if the cockpit gains
  non-chart data-dense summaries. Tremor is Tailwind-based and composes
  with shadcn.
- **Storybook** only if the custom-component count justifies it.
- **Mobile PWA manifest** + install prompt once the tool is deployed and
  routinely accessed from a phone.
- **Keyboard shortcuts** — natural fit once `cmdk` (bundled with shadcn)
  is wired for a command palette.
