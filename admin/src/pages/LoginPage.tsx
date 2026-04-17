import * as React from "react"
import { Shield, Eye, EyeOff, Loader2 } from "lucide-react"
import { useAuth } from "~/hooks/useAuth"
import type { Admin } from "~/types"

interface LoginPageProps {
  initialAdmin?: Admin | null
}

export function LoginPage({ }: LoginPageProps) {
  const [username, setUsername] = React.useState("admin")
  const [password, setPassword] = React.useState("admin")
  const [showPassword, setShowPassword] = React.useState(false)
  const [remember, setRemember] = React.useState(false)
  const [error, setError] = React.useState("")
  const { login, loading } = useAuth(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    try {
      await login(username, password, remember)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed. Please check your credentials.")
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-background-secondary">
        {/* Animated gradient mesh background */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-accent/20" />
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[128px] animate-float" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/10 rounded-full blur-[100px] animate-float" style={{ animationDelay: "1s" }} />
          <div className="absolute top-1/2 right-1/3 w-64 h-64 bg-secondary/10 rounded-full blur-[80px] animate-float" style={{ animationDelay: "2s" }} />
        </div>

        {/* Grid pattern overlay */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: "linear-gradient(hsl(var(--primary)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary)) 1px, transparent 1px)",
            backgroundSize: "60px 60px"
          }} />
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-center p-12 xl:p-20">
          <div className="animate-fade-in">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-16 h-16 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center glow-primary">
                <Shield size={32} className="text-primary" />
              </div>
            </div>
            <h1 className="text-4xl xl:text-5xl font-bold tracking-tight mb-4">
              <span className="gradient-text">Cortex</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-md leading-relaxed">
              Unified AI gateway. Manage API access, monitor usage, and configure AI providers from one intelligent dashboard.
            </p>
          </div>

          <div className="mt-12 space-y-4 animate-fade-in stagger-2">
            {[
              "Multi-provider AI routing",
              "Real-time request monitoring",
              "Granular access control",
            ].map((feature, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5l2 2 4-4" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <span className="text-sm text-foreground/80">{feature}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Decorative corner elements */}
        <div className="absolute bottom-8 left-8 w-24 h-24 border border-primary/10 rounded-2xl rotate-12" />
        <div className="absolute top-8 right-8 w-16 h-16 border border-accent/10 rounded-xl -rotate-12" />
      </div>

      {/* Right panel - Login form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 bg-background">
        <div className="w-full max-w-md animate-fade-in">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
              <Shield size={24} className="text-primary" />
            </div>
            <h1 className="text-2xl font-bold gradient-text">Cortex</h1>
          </div>

          <div className="glass-card p-8 lg:p-10">
            <div className="mb-8">
              <h2 className="text-2xl font-bold tracking-tight mb-2">Welcome back</h2>
              <p className="text-sm text-muted-foreground">Sign in to access the admin dashboard</p>
            </div>

            {error && (
              <div className="mb-6 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="label" htmlFor="username">Username</label>
                <input
                  id="username"
                  type="text"
                  className="input"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  required
                  autoComplete="username"
                />
              </div>

              <div>
                <label className="label" htmlFor="password">Password</label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    className="input pr-10"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={e => setRemember(e.target.checked)}
                    className="w-4 h-4 rounded border-border bg-background-secondary text-primary focus:ring-primary/20"
                  />
                  <span className="text-sm">Keep me signed in</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full h-11 flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign in"
                )}
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6">
            Default credentials: admin / admin
          </p>
        </div>
      </div>
    </div>
  )
}