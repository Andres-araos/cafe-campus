import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'

const AuthContext = createContext(null)

const AUTH_ERRORS = {
  'Invalid login credentials': 'Correo o contraseña incorrectos.',
  'Email not confirmed': 'Confirma tu correo antes de iniciar sesión. Revisa tu bandeja de entrada.',
  'User already registered': 'Ya existe una cuenta con ese correo.',
}

function authMessage(error) {
  if (!error) return null
  if (AUTH_ERRORS[error.message]) return AUTH_ERRORS[error.message]
  if (/password/i.test(error.message)) return 'La contraseña debe tener al menos 8 caracteres.'
  if (/rate limit/i.test(error.message)) return 'Demasiados intentos. Espera un momento y vuelve a intentar.'
  return error.message
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (!newSession) {
        setProfile(null)
        setLoading(false)
      }
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const userId = session?.user?.id

  const loadProfile = useCallback(async () => {
    if (!userId) return
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
    setProfile(error ? null : data)
    setLoading(false)
  }, [userId])

  useEffect(() => {
    if (userId) {
      setLoading(true)
      loadProfile()
    }
  }, [userId, loadProfile])

  const value = useMemo(
    () => ({
      session,
      profile,
      role: profile?.role ?? null,
      loading,
      reloadProfile: loadProfile,
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        return authMessage(error)
      },
      async signUp({ email, password, fullName, dataConsent }) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: fullName.trim(), data_consent: dataConsent } },
        })
        if (error) return { error: authMessage(error) }
        return { needsConfirmation: !data.session }
      },
      async signOut() {
        await supabase.auth.signOut()
      },
    }),
    [session, profile, loading, loadProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
