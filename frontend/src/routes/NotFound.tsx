import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n'

export default function NotFound() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        {t('notFound.title')}
      </h1>
      <p className="text-muted-foreground max-w-sm">
        {t('notFound.description')}
      </p>
      <Button asChild>
        <Link to="/">{t('notFound.backToDashboard')}</Link>
      </Button>
    </div>
  )
}
