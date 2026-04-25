# ADR 010: Help UI — Learning Surface

## Status: Proposed

## Context

harness' primary purpose is to curb impulsive trading through
rule-based decision support (CLAUDE.md, ADR 001). The operator
working with the dashboard (ADR 005) encounters a steady stream of
domain language — chart terminology ("VWAP", "gap fill", "volume
node"), securities-market concepts ("bid/ask", "order book depth",
"after-hours"), setup / analysis patterns ("opening-range break",
"trend-day continuation", "mean-revert extension"). Without a
referenceable learning surface, the operator either memorizes
everything or interrupts their session to look things up elsewhere.

This ADR proposes an in-app **Help UI** that serves as the
operator's personal learning reference: a searchable / browsable
surface for definitions, explanations, and worked examples of the
domain language harness uses.

Deliberately framed as *proposed, design-open* — the shape of the
content model, the delivery surface, and the integration points are
not yet settled and should be refined through small experiments
before committing to a structure.

## Open questions (to resolve before implementation)

1. **Content model.** Glossary (term → short definition) vs
   long-form articles vs mixed? A single flexible "entry" type with
   optional body / examples / diagrams is probably the right shape,
   but needs exploring.
2. **Content sourcing.** Hand-authored by the operator over time?
   Imported from a public glossary seed? A mix (seed + operator
   notes on top)?
3. **Delivery surface.** A dedicated `/help` route? A right-side
   drawer that slides over the dashboard? Inline tooltips on
   specific terms? A hybrid (drawer + click-through to full page)?
4. **Integration with the dashboard.** Should the state banner's
   setup name (ADR 005) link to its help entry? Should chart
   indicator labels ("VWAP") open the corresponding glossary entry
   on click? Or is the Help UI purely standalone and the operator
   navigates there by intent?
5. **Search / browse / both.** Full-text search over entry bodies,
   tag-based browse (chart / securities / analysis), or both? The
   operator scale (one user, dozens-to-hundreds of entries) makes
   client-side search plausible for Phase 1.
6. **Persistence.** Operator-authored entries need to survive
   restarts (unlike most Phase 1 state, ADR 004 persistence rule).
   Likely a new SQLite table edited through Settings (ADR 009) or
   a dedicated "Help" editor surface.
7. **Privacy boundary.** Help content is operator's study material
   and might include references to specific setups they use or
   specific market observations — same privacy rule as other
   operator-specific config: lives in the DB, does not get
   committed to the public tree.

## Initial scope hypothesis

A reasonable first slice (to de-risk, not a commitment):

- **Content model**: a single `HelpEntry` type — `id`, `title`,
  `tags: string[]` (e.g. `['chart', 'indicator']`), `body: string`
  (markdown), optional `aliases: string[]` for search.
- **Surface**: a right-side drawer that slides over the dashboard
  without disrupting the primary panel. Keyboard shortcut (e.g. `?`
  or `/`) opens it. Drawer has a search box at top + tag filters
  on the left + entry list → detail view when selected.
- **Integration**: zero cross-links from the dashboard in the first
  slice. Browse + search is the entry point; cross-links (state
  banner → setup help, chart → indicator help) are a follow-on once
  the content has enough mass to be worth linking to.
- **Persistence**: new SQLite table; editing surface deferred
  (seed manually via a CLI import, similar to ADR 009's config
  YAML pattern, until the editing UX is designed).

None of the above is load-bearing — the point is to force the
design questions above into concrete answers by shipping a thin
slice, not to commit to this shape.

## Phase 1 Decision

After a first-pass spike (drawer + `?` shortcut + single-language
body) was reviewed, the open questions resolve as follows. The
ADR remains `Proposed` overall — Phase 1 ships browse + search +
seed; the in-app editor and dashboard cross-links stay open for a
follow-on ADR.

**Q1 (content model).** Single `HelpEntry` row, **bilingual fields**:
`id` (auto), `slug` (UNIQUE — stable seed key + URL handle),
`title_en`, `title_ja`, `tags: list[str]` (TEXT JSON, neutral keys
shared across languages — see Q5), `body_en`, `body_ja` (markdown
both), `aliases_en: list[str] | None`, `aliases_ja: list[str] | None`
(TEXT JSON), `created_at`, `updated_at`. The frontend selects the
field pair matching `useTranslation()`'s active language; chrome and
content are localized through the same switch.

**Q3 (delivery surface).** **Dedicated route, not a drawer.** Two
routes under `ProtectedRoute`:
- `/help` — list with search box + tag pills + entry list
- `/help/:slug` — detail with rendered markdown + back link to `/help`

The route surface gives shareable URLs (Phase 2 chart-label →
`/help/vwap` cross-links land as plain `<Link>`s) and avoids the
drawer's coexistence-with-chat z-stacking concerns. **Discoverable
affordance:** a "Help / ヘルプ" link in the AppShell header nav
alongside Dashboard / Settings — first-class operator surface, not
a hidden keyboard shortcut. **No `?` keybind Phase 1**: power-user
shortcuts come back in a separate ADR if needed; conventional web
discoverability comes first.

**Q4 (dashboard integration).** Zero cross-links Phase 1 — same as
the drawer-era decision. The route surface makes future cross-links
trivial (`<Link to={`/help/${slug}`} />`), so deferring is cheap.

**Q5 (search / browse).** Both, client-side, **in the active language**.
The list page fetches the full corpus once via `GET /api/help`, then
filters in-memory: title substring matches against `title_{lang}`,
alias substring matches against `aliases_{lang}`. Tags filter exact-
match against the neutral tag key. Server-side `?tag=` and `?q=`
parameters exist on the API for future paging but the page does not
use them in Phase 1. **Tag display labels** are translated through
the i18n dictionary (`help.tag.{key}` → "Chart" / "チャート"); unknown
tag keys fall back to the raw key so adding a new tag never hard-
breaks the UI.

**Q6 (persistence).** New `help_entries` SQLite table. Schema auto-
creates via `Base.metadata.create_all` (no Alembic). Editing through
a CLI subcommand `harness help-import <yaml>` only — in-app editor
deferred. Idempotent upsert by slug.

**Q2 (sourcing) and Q7 (privacy).** Resolved by a YAML split:
`config/help-entries.example.yaml` ships in the public tree with
generic terminology only (descriptive phrasing per ADR 001 advisory
rule); `config/help-entries.yaml` is gitignored for the operator's
personal study notes.

### Deferred-but-documented tradeoffs

Phase 1 choices that are deliberate, not oversights. Documented so
future readers don't relitigate them as bugs:

- **Tags as TEXT JSON with neutral keys + i18n display labels.** The
  alternative (`tags_en` / `tags_ja` per row) duplicates the tag
  identity across languages — a renamed translation would require
  schema-level dedup logic. Neutral keys keep tag identity stable;
  `help.tag.{key}` in the i18n dict carries the localized label.
  New tags require a dict entry; absence falls back to the raw key
  visibly so the gap surfaces at review.
- **No `?` keyboard shortcut.** Adding a discoverability button (the
  AppShell link) without also pinning a shortcut is the conventional
  web pattern (Settings, Dashboard nav links don't have shortcuts
  either). A power-user shortcut sheet (`Cmd+K` palette etc.) is a
  separate concern that lives in its own ADR.
- **Single-user auth scope.** All `/api/help` routes gate on
  `Depends(current_user)` like the rest of the API; no per-row
  `user_id`. Single-operator deployment per ADR 001.

## Considerations

**Not a broker feature.** Help content describes general market
concepts and the operator's own analysis language, not
investment-advisory content (ADR 001 permanent constraint). Output
phrasing should be descriptive ("VWAP is a volume-weighted price
reference …") rather than prescriptive ("buy when price reclaims
VWAP"), matching the broader compliance framing from ADR 004.

**No operator-specific literals in tracked code.** If a seed
glossary ships with the repo, it covers generic terminology only.
Operator's personal notes on specific setups / market views stay
in the DB, never the public tree.

**Help UI is distinct from AI chat.** The AI chat (ADR 006) is a
conversational surface that answers free-form questions against the
current dashboard context. The Help UI is a structured reference
the operator curates over time. They overlap at the edges
(an AI chat reply might cite a help entry in Phase 2) but shouldn't
merge — one is transient conversation, the other is durable
knowledge.

## Future extensions (deliberately empty for now)

This ADR is Proposed with open questions; concrete future-work
bullets come after the initial slice answers the design questions
above. Candidate directions to explore later:

- AI chat citing help entries as sources for its replies (Phase 2).
- Operator in-app editor for help entries (vs. CLI import).
- Cross-links from dashboard surfaces (state banner setup name,
  chart indicator labels, news impact tiers) into the relevant
  help entry.
- Tag taxonomy standardization across operators (if harness ever
  goes multi-user).

## Implementation

- [x] Resolve the open questions above through a first-slice spike.
- [x] Draft a follow-on ADR amendment (or a focused sibling ADR)
      pinning the chosen content model + surface once the spike
      settles. (Done: `## Phase 1 Decision` section above.)
- [x] Implement the chosen slice (table, API, route, search /
      browse, AppShell discoverability link, bilingual content).
- [x] CLI seed import for initial content bootstrap (parallel to
      ADR 009's config YAML import pattern).
- [ ] Follow-on ADR (or amendment) for in-app editor surface.
- [ ] Follow-on ADR for dashboard cross-links into help entries.

## Related ADRs

- [ADR 004](archive/004-mvp-scope.md) — Phase 1 MVP scope (this ADR
  proposes a surface outside ADR 004's original Phase 1 scope — it
  sits alongside the dashboard + settings + chat triad as a fourth
  operator-facing surface).
- [ADR 005](archive/005-dashboard-layout.md) — Dashboard layout
  (future cross-links from dashboard elements into help entries).
- [ADR 006](archive/006-ai-chat-widget.md) — AI chat widget
  (distinct surface; may cite help entries in Phase 2).
- [ADR 009](009-settings-ui.md) — Settings UI (if help editing
  piggybacks on the schema-driven form pattern).
