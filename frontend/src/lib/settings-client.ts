// Settings boundary (ADR 009 Phase A — Localization slice).
//
// Wraps `GET /api/settings` and `PUT /api/settings` through `apiFetch`
// so the auth-cookie + transparent-refresh dance applies. The schema
// only carries `localization.displayTimezone` today; later panels grow
// it in place.

import { apiFetch } from '@/api'

export type Language = 'ja' | 'en'

export interface LocalizationConfig {
  displayTimezone: string
  language: Language
}

export interface SettingsDocument {
  localization: LocalizationConfig
}

export class SettingsRequestError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'SettingsRequestError'
    this.status = status
  }
}

export async function getSettings(): Promise<SettingsDocument> {
  const res = await apiFetch('/api/settings')
  if (!res.ok) {
    throw new SettingsRequestError(res.status, `GET /api/settings failed (${res.status})`)
  }
  return (await res.json()) as SettingsDocument
}

export async function putSettings(body: SettingsDocument): Promise<SettingsDocument> {
  const res = await apiFetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new SettingsRequestError(res.status, `PUT /api/settings failed (${res.status})`)
  }
  return (await res.json()) as SettingsDocument
}
