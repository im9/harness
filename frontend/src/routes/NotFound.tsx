import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-muted-foreground max-w-sm">
        The route you followed isn&apos;t wired up.
      </p>
      <Button asChild>
        <Link to="/">Back to cockpit</Link>
      </Button>
    </div>
  )
}
