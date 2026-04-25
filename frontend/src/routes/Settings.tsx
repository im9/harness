// Settings route — Phase A carries the Localization panel (display
// timezone + UI language) as the first slice (ADR 009). Subsequent
// panels (Sessions / Rule / Setup library / Macro / providers /
// Notifications) plug into this same route as they land alongside
// the ADRs that own their backing config.

import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { useTranslation, type Language } from '@/lib/i18n'
import { useSettings } from '@/lib/settings-context'
import { SettingsRequestError } from '@/lib/settings-client'
import { cn } from '@/lib/utils'

// Curated short list. The backend accepts any IANA zone the runtime's
// zoneinfo database recognises, so an operator who needs a less-common
// zone can hand-edit the DB; the UI exposes the markets harness is
// most likely to read against. Keep ordered by UTC offset — operators
// scanning the list usually navigate by "what time is it where".
// Labels (market codes in parentheses, IANA names) stay verbatim per
// ADR 009 policy regardless of UI language.
const TIMEZONE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (PT)' },
  { value: 'America/New_York', label: 'America/New_York (ET)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/London', label: 'Europe/London (GMT/BST)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST)' },
]

const localizationSchema = z.object({
  displayTimezone: z.string().min(1),
  language: z.enum(['ja', 'en']),
})

type LocalizationFormValues = z.infer<typeof localizationSchema>

export default function Settings() {
  const { settings, save } = useSettings()
  const { t } = useTranslation()
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>(
    'idle',
  )
  const [errorDetail, setErrorDetail] = useState<string>('')

  const form = useForm<LocalizationFormValues>({
    resolver: zodResolver(localizationSchema),
    // Defaults match the backend `_defaults()` so the field is never
    // empty during the first paint before the settings GET resolves.
    // The `reset()` below adopts the persisted value as soon as it
    // lands.
    defaultValues: { displayTimezone: 'Asia/Tokyo', language: 'ja' },
  })

  useEffect(() => {
    if (settings) {
      form.reset({
        displayTimezone: settings.localization.displayTimezone,
        language: settings.localization.language,
      })
    }
  }, [settings, form])

  const onSubmit = async (values: LocalizationFormValues) => {
    setSaveStatus('idle')
    setErrorDetail('')
    try {
      await save({
        localization: {
          displayTimezone: values.displayTimezone,
          language: values.language as Language,
        },
      })
      setSaveStatus('saved')
    } catch (e) {
      setSaveStatus('error')
      if (e instanceof SettingsRequestError) {
        setErrorDetail(t('settings.error.http', { status: e.status }))
      } else {
        setErrorDetail(t('settings.error.network'))
      }
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 py-2">
      <header>
        <h1 className="text-foreground text-lg font-semibold tracking-tight">
          {t('settings.title')}
        </h1>
        <p className="text-muted-foreground text-sm">{t('settings.subtitle')}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.localization.title')}</CardTitle>
          <CardDescription>
            {t('settings.localization.description')}
          </CardDescription>
        </CardHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            aria-label={t('settings.localization.formAriaLabel')}
          >
            <CardContent className="flex flex-col gap-4">
              <FormField
                control={form.control}
                name="displayTimezone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('settings.localization.timezone.label')}
                    </FormLabel>
                    <FormControl>
                      <select
                        {...field}
                        className={cn(
                          'border-input bg-transparent text-foreground h-8 w-full rounded-lg border px-2.5 py-1 text-sm transition-colors outline-none',
                          'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3',
                        )}
                      >
                        {TIMEZONE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </FormControl>
                    <FormDescription>
                      {t('settings.localization.timezone.description')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="language"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('settings.localization.language.label')}
                    </FormLabel>
                    <FormControl>
                      <select
                        {...field}
                        className={cn(
                          'border-input bg-transparent text-foreground h-8 w-full rounded-lg border px-2.5 py-1 text-sm transition-colors outline-none',
                          'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3',
                        )}
                      >
                        <option value="ja">
                          {t('settings.localization.language.option.ja')}
                        </option>
                        <option value="en">
                          {t('settings.localization.language.option.en')}
                        </option>
                      </select>
                    </FormControl>
                    <FormDescription>
                      {t('settings.localization.language.description')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {saveStatus === 'saved' && (
                <p
                  role="status"
                  className="text-sm text-emerald-600 dark:text-emerald-400"
                >
                  {t('settings.saved')}
                </p>
              )}
              {saveStatus === 'error' && errorDetail && (
                <p role="alert" className="text-destructive text-sm">
                  {errorDetail}
                </p>
              )}

              <div>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {t('settings.save')}
                </Button>
              </div>
            </CardContent>
          </form>
        </Form>
      </Card>
    </div>
  )
}
