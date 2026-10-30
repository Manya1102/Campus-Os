import { createContext, useContext } from 'react'

// Holds "who is logged in" so any page can read it.
export const AuthContext = createContext(null)

// Usage inside a page:  const { user, logout } = useAuth()
export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}