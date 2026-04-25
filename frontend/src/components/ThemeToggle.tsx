import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n'
import { useTheme } from '@/lib/theme'

export default function ThemeToggle() {
  const [theme, setTheme] = useTheme()
  const { t } = useTranslation()
  // Theme tokens 'light' / 'dark' stay verbatim per ADR 009 policy
  // — only the surrounding chrome is translated.
  const next: 'light' | 'dark' = theme === 'dark' ? 'light' : 'dark'

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={t('themeToggle.aria', { theme: next })}
      onClick={() => setTheme(next)}
    >
      {theme === 'dark' ? <Sun /> : <Moon />}
    </Button>
  )
}
