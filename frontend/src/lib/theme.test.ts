import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEY, resolveInitialTheme } from './theme'

function mockMatchMedia(prefersLight: boolean) {
  // jsdom ships without matchMedia, so each test that cares about
  // prefers-color-scheme installs a stub. The stub reports `prefersLight`
  // for queries mentioning "light" and the inverse for any other query, so
  // both `(prefers-color-scheme: light)` and `(prefers-color-scheme: dark)`
  // branches see a coherent answer.
  window.matchMedia = ((query: string) => ({
    matches: query.includes('light') ? prefersLight : !prefersLight,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
})

describe('resolveInitialTheme', () => {
  it('defaults to dark when nothing is stored and the OS does not prefer light (ADR 003)', () => {
    mockMatchMedia(false)

    expect(resolveInitialTheme()).toBe('dark')
  })

  it('picks light when nothing is stored but the OS prefers light', () => {
    mockMatchMedia(true)

    expect(resolveInitialTheme()).toBe('light')
  })

  it('honours localStorage over the media query when both are set', () => {
    // Storage wins regardless of OS preference — an explicit user choice
    // should survive even if they roll into a light-preferring system.
    mockMatchMedia(true)
    localStorage.setItem(STORAGE_KEY, 'dark')
    expect(resolveInitialTheme()).toBe('dark')

    mockMatchMedia(false)
    localStorage.setItem(STORAGE_KEY, 'light')
    expect(resolveInitialTheme()).toBe('light')
  })

  it('ignores garbage values in localStorage and falls back to the media query', () => {
    mockMatchMedia(true)
    localStorage.setItem(STORAGE_KEY, 'sepia')

    // A typo or tampered entry must not lock the app into an unknown state;
    // the resolver should degrade to the media-query branch as if storage
    // were unset.
    expect(resolveInitialTheme()).toBe('light')
  })
})
