// i18n facade — translation hook + interpolation helper.
//
// Phase A keeps the runtime tiny: two static dictionaries
// (`messages-en.ts` / `messages-ja.ts`), a hook that picks the
// active language from settings context, and a `t(key, vars?)`
// returning a string. No pluralization rules, no nested format
// strings, no async loading — adding any of that costs more than
// the slice gains.
//
// Interpolation: `{name}` placeholders are substituted from the
// supplied vars map. Unknown placeholders are left intact (visible
// in the rendered string) so a missing var surfaces at review
// time rather than silently emptying out.
//
// `tTag` (ADR 010): help-entry tags are stored as language-neutral
// keys (`chart`, `indicator`, …) and translated to display labels
// here rather than being duplicated as bilingual columns. Unknown
// tag keys fall back to the raw key so adding a new tag is never
// hard-broken — the UI surfaces the gap visibly.

import { useCallback, useContext } from 'react'
import { en, type MessageKey } from './messages-en'
import { ja } from './messages-ja'
import { SettingsContext } from '@/lib/settings-context'

export type Language = 'ja' | 'en'
export type { MessageKey }

const dictionaries: Record<Language, Record<MessageKey, string>> = {
  en,
  ja,
}

const TAG_LABELS: Record<Language, Record<string, string>> = {
  en: {
    chart: 'Chart',
    indicator: 'Indicator',
    securities: 'Securities',
    microstructure: 'Microstructure',
    setup: 'Setup',
    intraday: 'Intraday',
    structure: 'Structure',
  },
  ja: {
    chart: 'チャート',
    indicator: 'インジケーター',
    securities: '証券',
    microstructure: 'マーケットマイクロストラクチャ',
    setup: 'セットアップ',
    intraday: '日中',
    structure: '構造',
  },
}

// Fallback language when no SettingsProvider is mounted (test renders
// without a wrapper, or a component rendered above the provider tree
// like ErrorBoundary's error UI). Set to 'en' rather than the backend
// default ('ja') so existing component tests that assert English copy
// keep passing without a per-test wrapper. In production the provider
// is always mounted with a `ja`-seeded default document, so this
// fallback only affects pre-provider renders (~200ms boot window for
// `protectedRoute.loadingSession`).
export const DEFAULT_LANGUAGE: Language = 'en'

export type InterpolationVars = Record<string, string | number>

export function interpolate(template: string, vars?: InterpolationVars): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = vars[key]
    return value === undefined ? match : String(value)
  })
}

// Resolves `key` against the operator's selected dictionary, falling
// back to the default when no SettingsProvider is mounted (Storybook,
// component tests that render bare). Falling back rather than throwing
// keeps the existing dashboard test files passing without a provider
// wrap; the production tree always mounts SettingsProvider.
export function useTranslation() {
  const ctx = useContext(SettingsContext)
  const language: Language =
    ctx?.settings?.localization.language ?? DEFAULT_LANGUAGE
  const dict = dictionaries[language]

  const t = useCallback(
    (key: MessageKey, vars?: InterpolationVars): string => {
      return interpolate(dict[key], vars)
    },
    [dict],
  )

  const tTag = useCallback(
    (tag: string): string => TAG_LABELS[language][tag] ?? tag,
    [language],
  )

  return { t, language, tTag }
}
