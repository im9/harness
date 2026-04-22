import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { LoginError, useAuth } from '../auth-context'

const TOTP_LENGTH = 6

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    // Client-side validation with custom messages rather than HTML5 `required`
    // / `pattern`, which render locale-specific browser popovers (e.g. the
    // Japanese "指定されている形式で入力してください") and obscure the actual
    // problem. These checks surface our own text via the alert region below.
    if (!username.trim() || !password || totpCode.length !== TOTP_LENGTH) {
      setError(
        `Enter username, password, and the ${TOTP_LENGTH}-digit code from your authenticator app.`,
      )
      return
    }

    setSubmitting(true)
    try {
      await login(username, password, totpCode)
      navigate('/', { replace: true })
    } catch (e) {
      if (e instanceof LoginError && e.status === 401) {
        setError('Invalid credentials')
      } else if (e instanceof LoginError) {
        setError(`Sign-in failed (HTTP ${e.status}): ${e.message}`)
      } else {
        setError('Sign-in failed: network error')
      }
      setSubmitting(false)
    }
  }

  return (
    <main>
      <h1>harness</h1>
      <form onSubmit={handleSubmit} aria-label="sign in" noValidate>
        <p>
          <label>
            Username
            <br />
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
        </p>
        <p>
          <label>
            Password
            <br />
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        </p>
        <p>
          <label>
            Authenticator code
            <br />
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={TOTP_LENGTH}
              size={TOTP_LENGTH}
              placeholder="123456"
              value={totpCode}
              // Strip non-digits on input so pasted codes with spaces/dashes
              // (common from password managers) become plain digits; also
              // prevents accidental paste of the setup secret.
              onChange={(e) =>
                setTotpCode(e.target.value.replace(/\D/g, '').slice(0, TOTP_LENGTH))
              }
              aria-describedby="totp-help"
            />
          </label>
          <br />
          <small id="totp-help">
            {TOTP_LENGTH}-digit code from your authenticator app (not the setup secret).
          </small>
        </p>
        <button type="submit" disabled={submitting}>
          Sign in
        </button>
        {error && <p role="alert">{error}</p>}
      </form>
    </main>
  )
}
