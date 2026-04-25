import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/components/ui/card'
import { useTranslation } from '@/lib/i18n'

type Props = { children: ReactNode }
type State = { error: Error | null }

// Error fallback split into a function component so it can use the
// `useTranslation` hook. The class-based ErrorBoundary itself can't
// call hooks, but its render output can — and the surrounding
// SettingsContext (when mounted) reaches the fallback through React's
// usual context propagation. When the boundary catches before
// SettingsProvider has mounted (e.g. error in AuthProvider), the hook
// falls back to the default language (ADR 009 policy).
function ErrorFallback({ onReset }: { onReset: () => void }) {
  const { t } = useTranslation()
  return (
    <div
      role="alert"
      className="flex min-h-dvh items-center justify-center px-4"
    >
      <Card className="w-full max-w-md">
        <CardHeader>
          <h1 className="font-heading text-base leading-snug font-medium">
            {t('errorBoundary.title')}
          </h1>
          <CardDescription>{t('errorBoundary.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={onReset}>{t('errorBoundary.retry')}</Button>
        </CardContent>
      </Card>
    </div>
  )
}

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
      return <ErrorFallback onReset={this.reset} />
    }
    return this.props.children
  }
}
