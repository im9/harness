import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEY, applyTheme } from '@/lib/theme'
import ThemeToggle from './ThemeToggle'

function stubMatchMedia(prefersLight = false) {
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
  document.documentElement.classList.remove('dark')
  stubMatchMedia()
})

afterEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('dark')
})

describe('ThemeToggle', () => {
  it('labels itself with the inverse action so AT users hear what happens on press', () => {
    applyTheme('dark')

    render(<ThemeToggle />)

    // The accessible name describes the *result* of the press (the new
    // theme), not the current state. This matches how shadcn/sonner toggle
    // patterns behave and gives screen-reader users useful previews.
    expect(
      screen.getByRole('button', { name: /switch to light theme/i }),
    ).toBeInTheDocument()
  })

  it('toggles the dark class on <html> on each press', async () => {
    const user = userEvent.setup()
    applyTheme('dark')

    render(<ThemeToggle />)

    expect(document.documentElement).toHaveClass('dark')
    await user.click(screen.getByRole('button'))
    expect(document.documentElement).not.toHaveClass('dark')
    await user.click(screen.getByRole('button'))
    expect(document.documentElement).toHaveClass('dark')
  })

  it('persists the chosen theme to localStorage', async () => {
    const user = userEvent.setup()
    applyTheme('dark')

    render(<ThemeToggle />)

    await user.click(screen.getByRole('button'))
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light')

    await user.click(screen.getByRole('button'))
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark')
  })
})
