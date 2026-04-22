import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ErrorBoundary from './ErrorBoundary'

function Bomb(): never {
  throw new Error('boom')
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ErrorBoundary', () => {
  it('passes children through when no error is thrown', () => {
    render(
      <ErrorBoundary>
        <p>safe child</p>
      </ErrorBoundary>,
    )

    expect(screen.getByText('safe child')).toBeInTheDocument()
  })

  it('renders the fallback UI when a child throws', () => {
    // React logs the uncaught error to console.error; silence it so the test
    // output stays focused on the assertions.
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    )

    // role="alert" is the accessible contract for the fallback card; matching
    // on it (rather than a specific class or heading) lets the visual design
    // evolve without breaking the test.
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /something went wrong/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('clears the error when the retry button is pressed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const user = userEvent.setup()
    let shouldThrow = true

    function Recoverable() {
      if (shouldThrow) throw new Error('first time fails')
      return <p>recovered child</p>
    }

    render(
      <ErrorBoundary>
        <Recoverable />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('alert')).toBeInTheDocument()

    // Flip the throwing condition *before* the retry click so the re-render
    // that the retry triggers finds a healthy subtree.
    shouldThrow = false
    await user.click(screen.getByRole('button', { name: /try again/i }))

    expect(screen.getByText('recovered child')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
