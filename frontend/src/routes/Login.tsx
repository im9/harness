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

const TOTP_LENGTH = 6

const loginSchema = z.object({
  username: z.string().trim().min(1, 'Enter your username'),
  password: z.string().min(1, 'Enter your password'),
  totpCode: z
    .string()
    .length(
      TOTP_LENGTH,
      `Enter the ${TOTP_LENGTH}-digit code from your authenticator app`,
    )
    .regex(/^\d+$/, 'Code must be digits only'),
})

type LoginFormValues = z.infer<typeof loginSchema>

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [serverError, setServerError] = useState('')

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
        setServerError('Invalid credentials')
      } else if (e instanceof LoginError) {
        setServerError(`Sign-in failed (HTTP ${e.status}): ${e.message}`)
      } else {
        setServerError('Sign-in failed: network error')
      }
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>harness</CardTitle>
          <CardDescription>Sign in to your account</CardDescription>
        </CardHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            aria-label="sign in"
            noValidate
          >
            <CardContent className="flex flex-col gap-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
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
                    <FormLabel>Password</FormLabel>
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
                    <FormLabel>Authenticator code</FormLabel>
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
                      {TOTP_LENGTH}-digit code from your authenticator app (not
                      the setup secret).
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
                Sign in
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </main>
  )
}
