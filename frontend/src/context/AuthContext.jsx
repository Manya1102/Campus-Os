import { useCallback, useEffect, useMemo, useState } from 'react'
import { AuthContext } from '../hooks/useAuth'
import { AUTH_EXPIRED_EVENT, api, clearToken, getToken, setToken } from '../services/api'

// Wraps the whole app. Remembers who is logged in and offers login / signup / logout.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // If a token is saved, we first ask the server who it belongs to, so show "loading" until then.
  const [loading, setLoading] = useState(Boolean(getToken()))

  // Restore the session after a page refresh
  useEffect(() => {
    if (!getToken()) return undefined

    let cancelled = false
    api
      .me()
      .then((me) => {
        if (!cancelled) setUser(me)
      })
      .catch(() => {
        // An expired token is cleared by api.js. Other errors (server offline) just show the login page.
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  // api.js announces when the server rejects the token, so we can sign out from anywhere
  useEffect(() => {
    const handleExpired = () => setUser(null)
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpired)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpired)
  }, [])

  const login = useCallback(async (email, password) => {
    const result = await api.login(email, password)
    setToken(result.token)
    setUser(result.user)
  }, [])

  const signup = useCallback(async (details) => {
    const result = await api.signup(details)
    if (result.token) {
      setToken(result.token)
      setUser(result.user)
    }
    return result
  }, [])

  const logout = useCallback(() => {
    clearToken()
    setUser(null)
  }, [])

  // Lets the Profile page refresh the name shown in the sidebar after an edit
  const updateUser = useCallback((changes) => {
    setUser((current) => (current ? { ...current, ...changes } : current))
  }, [])

  const value = useMemo(
    () => ({ user, loading, login, signup, logout, updateUser }),
    [user, loading, login, signup, logout, updateUser]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
