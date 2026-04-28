// English message dictionary (ADR 009 Phase A — Localization).
// Treated as the source of truth for the key set: every key is
// declared here first, then `messages-ja.ts` is typed `typeof en` so
// a missing JA translation surfaces at build time.
//
// Keys are hierarchical (`namespace.subgroup.fragment`) so consumers
// can read intent at the call site without spelunking the dictionary.
// Group new keys by surface (route or widget); within a group, order
// by reading flow on the screen.
//
// Translation policy (ADR 009):
// - Translate UI chrome, descriptions, errors, validation, aria.
// - Keep verbatim: product name, state markers (ENTER/HOLD/EXIT/
//   RETREAT), timeframe abbreviations, market codes (PT/ET/JST/...),
//   IANA zone names, theme tokens (light/dark), DB-stored content.
// - Domain terms use katakana in JA (Watchlist→ウォッチリスト etc.);
//   `target`/`retreat` (lowercase, descriptive) translate.

export const en = {
  // ---------- Login ----------
  'login.cardTitle': 'harness',
  'login.cardDescription': 'Sign in to your account',
  'login.formAriaLabel': 'sign in',
  'login.username.label': 'Username',
  'login.password.label': 'Password',
  'login.totp.label': 'Authenticator code',
  'login.totp.description':
    '{length}-digit code from your authenticator app (not the setup secret).',
  'login.submit': 'Sign in',
  'login.error.invalidCredentials': 'Invalid credentials',
  'login.error.network': 'Sign-in failed: network error',
  'login.error.http': 'Sign-in failed (HTTP {status}): {detail}',
  'login.validation.username': 'Enter your username',
  'login.validation.password': 'Enter your password',
  'login.validation.totp.length':
    'Enter the {length}-digit code from your authenticator app',
  'login.validation.totp.digits': 'Code must be digits only',

  // ---------- ProtectedRoute ----------
  'protectedRoute.loadingSession': 'Checking session',

  // ---------- NotFound ----------
  'notFound.title': 'Page not found',
  'notFound.description': "The route you followed isn't wired up.",
  'notFound.backToDashboard': 'Back to dashboard',

  // ---------- ErrorBoundary ----------
  'errorBoundary.title': 'Something went wrong',
  'errorBoundary.description':
    'The app hit an unexpected error. Retrying may resolve it; if not, reload the page.',
  'errorBoundary.retry': 'Try again',

  // ---------- AppShell ----------
  'appShell.navAriaLabel': 'Primary',
  'appShell.nav.dashboard': 'Dashboard',
  'appShell.nav.settings': 'Settings',
  'appShell.nav.help': 'Help',
  'appShell.signOut': 'Sign out',
  'appShell.signedInAs': 'Signed in as {username}',

  // ---------- ThemeToggle ----------
  // {theme} stays verbatim — token values 'light' / 'dark' don't
  // translate (ADR 009 policy).
  'themeToggle.aria': 'Switch to {theme} theme',

  // ---------- Settings ----------
  'settings.title': 'Settings',
  'settings.subtitle': 'Operator preferences. Phase A: Localization.',
  'settings.localization.title': 'Localization',
  'settings.localization.description':
    'Reading frame for chart axis labels and exact-time rows in the news feed, plus UI language.',
  'settings.localization.formAriaLabel': 'localization',
  'settings.localization.timezone.label': 'Display timezone',
  'settings.localization.timezone.description':
    'Defaults to Asia/Tokyo — harness is built for JP-market reading. Change this to a different IANA zone if your primary trading frame is elsewhere.',
  'settings.localization.timezone.validation': 'Choose a display timezone',
  'settings.localization.language.label': 'UI language',
  'settings.localization.language.description':
    'Switches UI chrome (nav, form labels, headings, descriptions). Domain abbreviations and ticker symbols stay verbatim.',
  'settings.localization.language.option.ja': 'Japanese (日本語)',
  'settings.localization.language.option.en': 'English',
  'settings.save': 'Save',
  'settings.saved': 'Saved.',
  'settings.error.http': 'Save failed (HTTP {status}).',
  'settings.error.network': 'Save failed: network error.',

  // ---------- Dashboard route ----------
  'dashboard.loading': 'Loading dashboard',
  'dashboard.error.fetch': 'Failed to load dashboard: {message}',
  'dashboard.error.fetch.unknown': 'unknown error',
  'dashboard.error.stream': 'Stream error: {message} — showing last known snapshot',

  // ---------- PrimaryInstrumentPanel ----------
  'primary.aria': 'Primary instrument: {name}',

  // ---------- Watchlist ----------
  'watchlist.title': 'Watchlist',
  'watchlist.aria': 'Watchlist',
  'watchlist.swap.aria': 'Swap primary to {symbol} {name}',
  'watchlist.empty': 'No secondary instruments tracked',

  // ---------- NewsFeed ----------
  'news.title': 'News',
  'news.aria': 'News',
  'news.empty': 'No headlines',
  'news.detail.aria': 'News detail',
  'news.detail.back': 'Back to news',
  'news.detail.readFull': 'Read full article',

  // ---------- MarketsStrip ----------
  'markets.aria': 'Markets overview',

  // ---------- PriceChart ----------
  'chart.aria': '{name} price chart',
  'chart.noData': 'No price data',
  'chart.setupRange.aria': 'setup range · {name}',
  'chart.setupRangeMidline.aria': 'setup range midline · {label}',
  'chart.macroBand.aria': 'macro event window · {name}',
  'chart.target.title': 'target · {label}',
  'chart.retreat.title': 'retreat · {label}',

  // ---------- RuleGauge ----------
  'rule.lossCap.label': 'Loss cap',
  'rule.lossCap.usage': '{used} of {cap}',
  'rule.lossCap.aria': 'Daily loss cap usage',
  'rule.capReached': 'Cap reached — ENTER signals suppressed',
  'rule.cooldown': 'Cooldown active',
  'rule.cooldown.until': ' until {time}',

  // ---------- StateBanner ----------
  // UP / DOWN / RANGE (uppercase trend-state markers, ADR 007) stay
  // verbatim per ADR 009 policy. Only the lowercase descriptors
  // (`target`, `retreat`) translate.
  'state.target': 'target',
  'state.retreat': 'retreat',

  // ---------- Help routes (ADR 010) ----------
  'help.title': 'Help',
  'help.subtitle': 'Reference for chart, securities, and analysis terminology.',
  'help.search.aria': 'Search help entries',
  'help.search.placeholder': 'Search…',
  'help.tag.filterAria': 'Filter by tag',
  'help.entry.tags': 'Tags',
  'help.empty.noMatches': 'No entries match the current filters.',
  'help.empty.noEntries':
    'No help entries yet.\nSeed via `harness help-import config/help-entries.yaml`.',
  'help.detail.aria': 'Help entry detail',
  'help.detail.back': 'Back to help',
  'help.detail.loading': 'Loading entry…',
  'help.detail.notFound': 'Help entry not found.',
  'help.detail.error': 'Failed to load entry: {message}',

  // ---------- AiChatFloat ----------
  'chat.title': 'AI chat',
  'chat.open.aria': 'Open AI chat',
  'chat.close.aria': 'Close AI chat',
  'chat.transcript.aria': 'Transcript',
  'chat.empty':
    'Ask about the primary instrument, watchlist state, or the current setup. Session-only — nothing is persisted.',
  'chat.message.label': 'Message',
  'chat.message.placeholder': 'Ask…',
  'chat.send': 'Send',
  'chat.send.aria': 'Send message',

  // ---------- TimeframeSelector ----------
  // Timeframe values themselves (10s / 1m / 5m / 15m / 1H / 1D / 1W)
  // stay verbatim per ADR 009 policy — they're universal trading
  // abbreviations.
  'timeframe.aria': 'Timeframe',
} as const

// Exposed so messages-ja.ts can type its keys against the EN source
// of truth (missing or extra keys → build error) while keeping its
// values as plain strings. Without the split, the `as const` value
// types would widen to literal types and force the JA dict to match
// each English literal exactly.
export type MessageKey = keyof typeof en
