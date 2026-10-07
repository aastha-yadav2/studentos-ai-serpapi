import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import type { Session, User } from "@supabase/supabase-js"
import { supabase, supabaseConfigError } from "@/lib/supabase"

type Credentials = { email: string; password: string }
type AuthContextValue = {
  session: Session | null
  user: User | null
  loading: boolean
  configurationError: string | null
  signIn: (credentials: Credentials) => Promise<{ error: string | null }>
  signUp: (credentials: Credentials) => Promise<{ error: string | null; needsEmailConfirmation: boolean }>
  signInWithGoogle: () => Promise<{ error: string | null }>
  resetPassword: (email: string) => Promise<{ error: string | null }>
  signOut: () => Promise<{ error: string | null }>
}
const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))

  useEffect(() => {
    const client = supabase
    if (!client) return
    let mounted = true
    const hydrateUser = async (candidate: Session | null) => {
      if (!candidate) { if (mounted) { setSession(null); setLoading(false) }; return }
      const { data, error } = await client.auth.getUser()
      if (mounted) { setSession(error || !data.user ? null : { ...candidate, user: data.user }); setLoading(false) }
    }
    void client.auth.getSession().then(({ data }) => hydrateUser(data.session))
    const { data: subscription } = client.auth.onAuthStateChange((_event, nextSession) => { window.setTimeout(() => { void hydrateUser(nextSession) }, 0) })
    return () => { mounted = false; subscription.subscription.unsubscribe() }
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    session, user: session?.user ?? null, loading, configurationError: supabaseConfigError,
    async signIn(credentials) { if (!supabase) return { error: supabaseConfigError }; const { error } = await supabase.auth.signInWithPassword(credentials); return { error: error?.message ?? null } },
    async signUp({ email, password }) { if (!supabase) return { error: supabaseConfigError, needsEmailConfirmation: false }; const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth` } }); return { error: error?.message ?? null, needsEmailConfirmation: !data.session && !error } },
    async signInWithGoogle() {
      if (!supabase) return { error: supabaseConfigError }
      const origin = typeof window !== "undefined" ? window.location.origin : "https://studentos-ai-phi.vercel.app"
      const redirectTo = `${origin}/auth`
      const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } })
      if (error) {
        const msg = error.message || ""
        if (
          msg.toLowerCase().includes("unsupported provider") ||
          msg.toLowerCase().includes("provider is not enabled") ||
          msg.toLowerCase().includes("validation_failed") ||
          error.status === 400
        ) {
          return {
            error: "Google Sign-In is not enabled in your Supabase project. Please enable the Google provider in Supabase Dashboard → Authentication → Providers.",
          }
        }
        return { error: msg }
      }
      return { error: null }
    },
    async resetPassword(email) { if (!supabase) return { error: supabaseConfigError }; const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth` }); return { error: error?.message ?? null } },
    async signOut() { if (!supabase) return { error: supabaseConfigError }; const { error } = await supabase.auth.signOut(); return { error: error?.message ?? null } },
  }), [loading, session])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// Context hook intentionally shares this module with its provider.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() { const context = useContext(AuthContext); if (!context) throw new Error("useAuth must be used within AuthProvider"); return context }
