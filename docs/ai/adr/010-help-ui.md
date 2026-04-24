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

- [ ] Resolve the open questions above through a first-slice spike.
- [ ] Draft a follow-on ADR amendment (or a focused sibling ADR)
      pinning the chosen content model + surface once the spike
      settles.
- [ ] Implement the chosen slice (table, API, route / drawer,
      search / browse).
- [ ] CLI seed import for initial content bootstrap (parallel to
      ADR 009's config YAML import pattern).

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
