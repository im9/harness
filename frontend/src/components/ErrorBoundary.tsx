import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/components/ui/card'

type Props = { children: ReactNode }
type State = { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Phase 1 has no remote reporter (ADR 002 defers monitoring); logging
    // to the browser console keeps the trace accessible for local dev and
    // single-operator postmortems without shipping extra infrastructure.
    console.error('Unhandled render error', error, info)
  }

  private reset = () => {
    this.setState({ error: null })
  }

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="flex min-h-dvh items-center justify-center px-4"
        >
          <Card className="w-full max-w-md">
            <CardHeader>
              <h1 className="font-heading text-base leading-snug font-medium">
                Something went wrong
              </h1>
              <CardDescription>
                The app hit an unexpected error. Retrying may resolve it; if
                not, reload the page.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={this.reset}>Try again</Button>
            </CardContent>
          </Card>
        </div>
      )
    }
    return this.props.children
  }
}
