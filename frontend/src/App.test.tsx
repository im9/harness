import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders the application title', () => {
    render(<App />)
    // Spec: the root component must identify the app as "harness" via an h1
    // so that smoke tests can confirm the React tree mounted and rendered.
    expect(
      screen.getByRole('heading', { level: 1, name: /harness/i }),
    ).toBeInTheDocument()
  })
})
