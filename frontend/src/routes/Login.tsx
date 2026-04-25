import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { LoginError, useAuth } from '@/auth-context'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/lib/i18n'

const TOTP_LENGTH = 6

// The login form is rendered before the SettingsProvider mounts (it
// gates auth), so the form's copy lives on whichever language the
// `useTranslation` hook resolves to via fallback (ADR 009 default ja).
// Once the operator authenticates and the Settings document loads,
// post-login routes pick up the operator's chosen language.
export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [serverError, setServerError] = useState('')
  const { t } = useTranslation()

  const loginSchema = z.object({
    username: z.string().trim().min(1, t('login.validation.username')),
    password: z.string().min(1, t('login.validation.password')),
    totpCode: z
      .string()
      .length(TOTP_LENGTH, t('login.validation.totp.length', { length: TOTP_LENGTH }))
      .regex(/^\d+$/, t('login.validation.totp.digits')),
  })

  type LoginFormValues = z.infer<typeof loginSchema>

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '', totpCode: '' },
  })

  const onSubmit = async (values: LoginFormValues) => {
    setServerError('')
    try {
      await login(values.username, values.password, values.totpCode)
      navigate('/', { replace: true })
    } catch (e) {
      if (e instanceof LoginError && e.status === 401) {
        setServerError(t('login.error.invalidCredentials'))
      } else if (e instanceof LoginError) {
        setServerError(t('login.error.http', { status: e.status, detail: e.message }))
      } else {
        setServerError(t('login.error.network'))
      }
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t('login.cardTitle')}</CardTitle>
          <CardDescription>{t('login.cardDescription')}</CardDescription>
        </CardHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            aria-label={t('login.formAriaLabel')}
            noValidate
          >
            <CardContent className="flex flex-col gap-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('login.username.label')}</FormLabel>
                    <FormControl>
                      <Input autoComplete="username" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('login.password.label')}</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="current-password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="totpCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('login.totp.label')}</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={TOTP_LENGTH}
                        placeholder="123456"
                        {...field}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value
                              .replace(/\D/g, '')
                              .slice(0, TOTP_LENGTH),
                          )
                        }
                      />
                    </FormControl>
                    <FormDescription>
                      {t('login.totp.description', { length: TOTP_LENGTH })}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {serverError && (
                <p role="alert" className="text-destructive text-sm">
                  {serverError}
                </p>
              )}
            </CardContent>
            <CardFooter>
              <Button
                type="submit"
                disabled={form.formState.isSubmitting}
                className="w-full"
              >
                {t('login.submit')}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </main>
  )
}
