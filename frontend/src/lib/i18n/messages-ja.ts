// Japanese message dictionary (ADR 009 Phase A — Localization).
// Typed `typeof en` so a missing or extra key is a build-time error;
// keep this file in lockstep with `messages-en.ts`.
//
// Translation policy reminders (ADR 009):
// - Product name `harness`, state markers (ENTER/HOLD/EXIT/RETREAT),
//   timeframe abbreviations, market codes (PT/ET/JST/...), IANA zone
//   names, theme tokens (light/dark) all stay verbatim — do not
//   translate them even when they appear inside an interpolation.
// - Domain terms use katakana: Watchlist→ウォッチリスト,
//   News→ニュース, Markets→マーケット, setup range→セットアップレンジ,
//   macro event window→マクロイベントウィンドウ.
// - Lowercase descriptors `target`/`retreat` translate to 目標/撤退
//   (distinct from the uppercase RETREAT state marker which stays).

import type { MessageKey } from './messages-en'

export const ja: Record<MessageKey, string> = {
  // ---------- Login ----------
  'login.cardTitle': 'harness',
  'login.cardDescription': 'アカウントにサインイン',
  'login.formAriaLabel': 'サインイン',
  'login.username.label': 'ユーザー名',
  'login.password.label': 'パスワード',
  'login.totp.label': '認証コード',
  'login.totp.description':
    '認証アプリの{length}桁コード（セットアップシークレットではありません）。',
  'login.submit': 'サインイン',
  'login.error.invalidCredentials': '認証情報が正しくありません',
  'login.error.network': 'サインインに失敗しました: ネットワークエラー',
  'login.error.http': 'サインインに失敗しました (HTTP {status}): {detail}',
  'login.validation.username': 'ユーザー名を入力してください',
  'login.validation.password': 'パスワードを入力してください',
  'login.validation.totp.length':
    '認証アプリの{length}桁コードを入力してください',
  'login.validation.totp.digits': 'コードは数字のみで入力してください',

  // ---------- ProtectedRoute ----------
  'protectedRoute.loadingSession': 'セッションを確認中',

  // ---------- NotFound ----------
  'notFound.title': 'ページが見つかりません',
  'notFound.description': 'そのルートは設定されていません。',
  'notFound.backToDashboard': 'ダッシュボードへ戻る',

  // ---------- ErrorBoundary ----------
  'errorBoundary.title': '問題が発生しました',
  'errorBoundary.description':
    '予期しないエラーが発生しました。再試行で解決することがあります。解決しない場合はページをリロードしてください。',
  'errorBoundary.retry': '再試行',

  // ---------- AppShell ----------
  'appShell.navAriaLabel': 'メインナビゲーション',
  'appShell.nav.dashboard': 'ダッシュボード',
  'appShell.nav.settings': '設定',
  'appShell.signOut': 'サインアウト',
  'appShell.signedInAs': '{username} としてサインイン中',

  // ---------- ThemeToggle ----------
  // {theme} は 'light' / 'dark' が入る — トークン値はそのまま埋め込む。
  'themeToggle.aria': 'テーマを {theme} に切替',

  // ---------- Settings ----------
  'settings.title': '設定',
  'settings.subtitle': 'オペレーター設定。Phase A: ローカライゼーション。',
  'settings.localization.title': 'ローカライゼーション',
  'settings.localization.description':
    'チャートの軸ラベルおよびニュースフィードの正確な時刻表示用のタイムゾーン、UI 言語の設定。',
  'settings.localization.formAriaLabel': 'ローカライゼーション',
  'settings.localization.timezone.label': '表示タイムゾーン',
  'settings.localization.timezone.description':
    '初期値は Asia/Tokyo — harness は JP マーケットでの読み込みを想定しています。主要なトレーディングフレームが他地域の場合は IANA タイムゾーンを変更してください。',
  'settings.localization.timezone.validation': '表示タイムゾーンを選択してください',
  'settings.localization.language.label': 'UI 言語',
  'settings.localization.language.description':
    'UI クローム（ナビ、フォームラベル、見出し、説明文）の言語を切り替えます。ドメイン略語およびティッカーシンボルは英語のまま保持されます。',
  'settings.localization.language.option.ja': '日本語 (Japanese)',
  'settings.localization.language.option.en': '英語 (English)',
  'settings.save': '保存',
  'settings.saved': '保存しました。',
  'settings.error.http': '保存に失敗しました (HTTP {status})。',
  'settings.error.network': '保存に失敗しました: ネットワークエラー。',

  // ---------- Dashboard route ----------
  'dashboard.loading': 'ダッシュボードを読み込み中',
  'dashboard.error.fetch': 'ダッシュボードの読み込みに失敗しました: {message}',
  'dashboard.error.fetch.unknown': '不明なエラー',
  'dashboard.error.stream': 'ストリームエラー: {message} — 直前のスナップショットを表示中',

  // ---------- PrimaryInstrumentPanel ----------
  'primary.aria': 'メイン銘柄: {name}',

  // ---------- Watchlist ----------
  'watchlist.title': 'ウォッチリスト',
  'watchlist.aria': 'ウォッチリスト',
  'watchlist.swap.aria': 'メインを {symbol} {name} に切替',
  'watchlist.empty': '監視中の補助銘柄はありません',

  // ---------- NewsFeed ----------
  'news.title': 'ニュース',
  'news.aria': 'ニュース',
  'news.empty': 'ヘッドラインなし',
  'news.detail.aria': 'ニュース詳細',
  'news.detail.back': 'ニュース一覧へ戻る',
  'news.detail.readFull': '記事全文を読む',

  // ---------- MarketsStrip ----------
  'markets.aria': 'マーケット概況',

  // ---------- PriceChart ----------
  'chart.aria': '{name} 価格チャート',
  'chart.noData': '価格データなし',
  'chart.setupRange.aria': 'セットアップレンジ · {name}',
  'chart.setupRangeMidline.aria': 'セットアップレンジ中央値 · {label}',
  'chart.macroBand.aria': 'マクロイベントウィンドウ · {name}',
  'chart.target.title': '目標 · {label}',
  'chart.retreat.title': '撤退 · {label}',

  // ---------- RuleGauge ----------
  'rule.lossCap.label': '損失上限',
  'rule.lossCap.usage': '{used} / {cap}',
  'rule.lossCap.aria': '日次損失上限の使用率',
  'rule.capReached': '上限到達 — ENTER シグナル抑制中',
  'rule.cooldown': 'クールダウン中',
  'rule.cooldown.until': ' (〜 {time})',

  // ---------- StateBanner ----------
  // ENTER / HOLD / EXIT / RETREAT (大文字のステートマーカー) はそのまま。
  // 小文字の補助語のみ翻訳。
  'state.target': '目標',
  'state.retreat': '撤退',

  // ---------- AiChatFloat ----------
  'chat.title': 'AI チャット',
  'chat.open.aria': 'AI チャットを開く',
  'chat.close.aria': 'AI チャットを閉じる',
  'chat.transcript.aria': 'トランスクリプト',
  'chat.empty':
    'メイン銘柄、ウォッチリストの状態、現在のセットアップについて質問できます。セッション限定 — 何も保存されません。',
  'chat.message.label': 'メッセージ',
  'chat.message.placeholder': '質問を入力…',
  'chat.send': '送信',
  'chat.send.aria': 'メッセージを送信',

  // ---------- TimeframeSelector ----------
  'timeframe.aria': 'タイムフレーム',
}
