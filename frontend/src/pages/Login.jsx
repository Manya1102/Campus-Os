import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

// Demo accounts created by database/schema.sql. Shown only while developing (npm run dev),
// never in a production build.
const DEMO_ACCOUNTS = [
  { label: 'Student (Computer Science)', email: 'alex.morgan@university.edu' },
  { label: 'Faculty', email: 'faculty@university.edu' },
  { label: 'Student (Electronics)', email: 'riya.patel@university.edu' },
]

function Login() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')

    try {
      await login(email, password)
      // On success the app switches to the logged-in view, so there is nothing more to do here.
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <span aria-hidden="true">🎓</span> Campus OS
        </div>
        <h1>Log in</h1>
        <p className="auth-subtitle">Welcome back. Enter your details to continue.</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="form-field">
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              required
            />
          </label>

          <label className="form-field">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="primary-button" disabled={busy}>
            {busy ? 'Logging in...' : 'Log in'}
          </button>
        </form>

        <p className="auth-switch">
          New here? <Link to="/signup">Create an account</Link>
        </p>

        {import.meta.env.DEV && (
          <div className="auth-hint">
            <strong>Development only:</strong> demo accounts (password <code>Campus@123</code>)
            <div className="demo-buttons">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  type="button"
                  key={account.email}
                  className="demo-button"
                  onClick={() => {
                    setEmail(account.email)
                    setPassword('Campus@123')
                  }}
                >
                  {account.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Login
