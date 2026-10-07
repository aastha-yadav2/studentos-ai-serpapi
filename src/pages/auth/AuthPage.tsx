import { useState, useEffect, type FormEvent } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { GraduationCap } from "lucide-react"
import { useAuth } from "@/auth/auth-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

type Mode = "login" | "signup" | "forgot"

export function AuthPage() {
  const { signIn, signInWithGoogle, signUp, resetPassword, configurationError } = useAuth()
  const [mode, setMode] = useState<Mode>("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const destination = (location.state as { from?: string } | null)?.from ?? "/app"

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search)
    const rawHash = location.hash.startsWith("#") ? location.hash.substring(1) : location.hash
    const hashParams = new URLSearchParams(rawHash)

    const errorDesc = searchParams.get("error_description") || hashParams.get("error_description")
    const err = searchParams.get("error") || hashParams.get("error")

    if (errorDesc || err) {
      const timer = window.setTimeout(() => {
        if (errorDesc) {
          const decoded = decodeURIComponent(errorDesc.replace(/\+/g, " "))
          if (decoded.toLowerCase().includes("unsupported provider") || decoded.toLowerCase().includes("provider is not enabled")) {
            setError("Google Sign-In is not enabled in your Supabase project. Please enable the Google provider in Supabase Dashboard → Authentication → Providers.")
          } else {
            setError(decoded)
          }
        } else if (err) {
          setError(`Authentication failed: ${err}`)
        }
      }, 0)
      return () => window.clearTimeout(timer)
    }
  }, [location.search, location.hash])

  function switchMode(nextMode: Mode) {
    setMode(nextMode)
    setError(null)
    setMessage(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setMessage(null)
    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords do not match.")
      return
    }
    setSubmitting(true)
    if (mode === "login") {
      const result = await signIn({ email, password })
      if (result.error) {
        if (result.error.toLowerCase().includes("email not confirmed")) {
          setError("Your email address has not been confirmed yet. Please check your inbox for the confirmation link.")
        } else {
          setError(result.error)
        }
      } else {
        navigate(destination, { replace: true })
      }
    } else if (mode === "signup") {
      const result = await signUp({ email, password })
      if (result.error) {
        setError(result.error)
      } else if (result.needsEmailConfirmation) {
        setMessage("Account created! Please check your email inbox to confirm your account before signing in.")
      } else {
        navigate("/onboarding", { replace: true })
      }
    } else if (mode === "forgot") {
      const result = await resetPassword(email)
      if (result.error) {
        setError(result.error)
      } else {
        setMessage("Password reset instructions have been sent to your email address.")
      }
    }
    setSubmitting(false)
  }

  async function handleGoogle() {
    setError(null)
    setMessage(null)
    setSubmitting(true)
    const result = await signInWithGoogle()
    if (result.error) {
      setError(result.error)
      setSubmitting(false)
    }
  }

  const isLogin = mode === "login"
  const isForgot = mode === "forgot"

  return (
    <main className="flex min-h-screen items-center justify-center bg-background bg-grid p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-glow"><GraduationCap /></div>
          <CardTitle>{isForgot ? "Reset your password" : isLogin ? "Welcome back" : "Create your account"}</CardTitle>
          <CardDescription>
            {isForgot
              ? "Enter your email to receive a password reset link."
              : isLogin
                ? "Sign in to continue to StudentOS AI."
                : "Start building your personalized student command center."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {configurationError && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{configurationError}</p>}
          {error && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
          {message && <p role="status" className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm text-foreground">{message}</p>}
          <form className="space-y-3" onSubmit={handleSubmit}>
            <label className="block space-y-1.5 text-sm font-medium">Email<Input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            {!isForgot && (
              <label className="block space-y-1.5 text-sm font-medium">
                <div className="flex items-center justify-between">
                  <span>Password</span>
                  {isLogin && (
                    <button type="button" className="text-xs text-primary hover:underline" onClick={() => switchMode("forgot")}>
                      Forgot password?
                    </button>
                  )}
                </div>
                <Input type="password" autoComplete={isLogin ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} required />
              </label>
            )}
            {mode === "signup" && (
              <label className="block space-y-1.5 text-sm font-medium">Confirm password<Input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={6} required /></label>
            )}
            <Button className="w-full" type="submit" disabled={submitting || Boolean(configurationError)}>
              {submitting ? "Please wait…" : isForgot ? "Send reset link" : isLogin ? "Sign in" : "Create account"}
            </Button>
          </form>
          {!isForgot && (
            <>
              <div className="flex items-center gap-3 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">or</div>
              <Button className="w-full" variant="secondary" type="button" onClick={handleGoogle} disabled={submitting || Boolean(configurationError)}>Continue with Google</Button>
            </>
          )}
          <p className="text-center text-sm text-muted-foreground">
            {isForgot ? (
              <button type="button" className="font-medium text-primary hover:underline" onClick={() => switchMode("login")}>Back to sign in</button>
            ) : isLogin ? (
              <>New to StudentOS AI? <button type="button" className="font-medium text-primary hover:underline" onClick={() => switchMode("signup")}>Create an account</button></>
            ) : (
              <>Already have an account? <button type="button" className="font-medium text-primary hover:underline" onClick={() => switchMode("login")}>Sign in</button></>
            )}
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
