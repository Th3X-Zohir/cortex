import { useEffect, useRef, useState } from 'react'
import {
  Activity, ArrowRight, BookOpen, ChevronRight,
  KeyRound, Layers, Shield, Sparkles, Terminal, Users, Zap,
} from 'lucide-react'

/* ─────────────────────────────────────────────
   Keyframe animations injected once
───────────────────────────────────────────── */
const STYLES = `
@keyframes drift {
  0%,100% { transform: translate(0,0) scale(1); }
  33%      { transform: translate(30px,-40px) scale(1.05); }
  66%      { transform: translate(-20px,20px) scale(0.97); }
}
@keyframes drift2 {
  0%,100% { transform: translate(0,0) scale(1); }
  40%      { transform: translate(-50px,30px) scale(1.08); }
  70%      { transform: translate(40px,-20px) scale(0.94); }
}
@keyframes drift3 {
  0%,100% { transform: translate(0,0) scale(1); }
  50%      { transform: translate(20px,50px) scale(1.06); }
}
@keyframes marquee {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); }
}
@keyframes fadeUp {
  from { opacity:0; transform:translateY(24px); }
  to   { opacity:1; transform:translateY(0); }
}
@keyframes pulseRing {
  0%   { transform:scale(1);   opacity:.6; }
  100% { transform:scale(1.8); opacity:0; }
}
@keyframes shimmer {
  0%   { background-position: -200% center; }
  100% { background-position:  200% center; }
}
@keyframes beam {
  0%,100% { opacity:0; transform:scaleX(0) translateX(-100%); }
  50%      { opacity:1; transform:scaleX(1) translateX(0); }
}
@keyframes float {
  0%,100% { transform:translateY(0px); }
  50%      { transform:translateY(-10px); }
}
@keyframes glow-pulse {
  0%,100% { opacity:.4; }
  50%      { opacity:.8; }
}
.animate-drift  { animation: drift  18s ease-in-out infinite; }
.animate-drift2 { animation: drift2 22s ease-in-out infinite; }
.animate-drift3 { animation: drift3 15s ease-in-out infinite; }
.animate-marquee { animation: marquee 28s linear infinite; }
.animate-fadeUp  { animation: fadeUp .7s ease both; }
.animate-float   { animation: float 4s ease-in-out infinite; }
.animate-glow    { animation: glow-pulse 3s ease-in-out infinite; }
.shimmer-text {
  background: linear-gradient(90deg,#fff 0%,#a5b4fc 30%,#67e8f9 50%,#a5b4fc 70%,#fff 100%);
  background-size: 200% auto;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: shimmer 6s linear infinite;
}
.card-glow:hover { box-shadow: 0 0 40px -8px var(--glow); }
.noise::after {
  content:'';position:absolute;inset:0;
  background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");
  pointer-events:none;border-radius:inherit;
}
`

/* ─────────────────────────────────────────────
   Data
───────────────────────────────────────────── */
const PROVIDERS = [
  { name: 'ChatGPT',  color: '#10a37f', ring: '#10a37f40', text: 'The world\'s most-used AI, fully automated.' },
  { name: 'Claude',   color: '#d97706', ring: '#d9770640', text: 'Anthropic\'s flagship model, seamlessly proxied.' },
  { name: 'Gemini',   color: '#4285f4', ring: '#4285f440', text: 'Google\'s multimodal powerhouse, one key away.' },
  { name: 'Grok',     color: '#e11d48', ring: '#e11d4840', text: 'xAI\'s real-time model, wired in and ready.' },
]

const MARQUEE_ITEMS = [
  '⚡ Real-time streaming', '🔑 API key management', '📊 Token tracking',
  '🛡️ Rate limiting', '🔄 Auto-fallback routing', '📋 Audit logs',
  '👥 User portal', '🌐 OpenAI-compatible', '🔒 Self-hosted & private',
  '📈 Usage dashboards', '🧪 Live playground', '⚙️ Admin controls',
]

const BENTO = [
  {
    size: 'lg',
    icon: Layers,
    title: 'One endpoint.\nEvery model.',
    body: 'A single base URL replaces every provider SDK you maintain. Switch models by changing a string, not your architecture.',
    accent: '#6366f1',
    glow: '#6366f130',
    gradient: 'from-indigo-950/60 to-slate-950/80',
  },
  {
    size: 'sm',
    icon: Zap,
    title: 'Sub-second\nfallback',
    body: 'Provider down? Cortex detects it and reroutes automatically before your user notices.',
    accent: '#f59e0b',
    glow: '#f59e0b25',
    gradient: 'from-amber-950/60 to-slate-950/80',
  },
  {
    size: 'sm',
    icon: Activity,
    title: 'Streaming\nfirst',
    body: 'Token-by-token SSE streaming with back-pressure handling and live abort support.',
    accent: '#14b8a6',
    glow: '#14b8a625',
    gradient: 'from-teal-950/60 to-slate-950/80',
  },
  {
    size: 'sm',
    icon: KeyRound,
    title: 'Granular\naccess control',
    body: 'Per-key daily quotas, rate limits, and instant revocation. No more shared credentials.',
    accent: '#ec4899',
    glow: '#ec489925',
    gradient: 'from-pink-950/60 to-slate-950/80',
  },
  {
    size: 'sm',
    icon: Shield,
    title: 'Full audit\ntrail',
    body: 'Every request logged with payload, tokens, latency, IP, and admin actions.',
    accent: '#22c55e',
    glow: '#22c55e25',
    gradient: 'from-emerald-950/60 to-slate-950/80',
  },
  {
    size: 'wide',
    icon: Users,
    title: 'Self-serve user portal',
    body: 'Users register, request API keys, monitor usage, browse docs, and run live playground tests — entirely on their own.',
    accent: '#38bdf8',
    glow: '#38bdf830',
    gradient: 'from-sky-950/60 to-slate-950/80',
  },
]

/* ─────────────────────────────────────────────
   Counter animation hook
───────────────────────────────────────────── */
function useCounter(target: number, duration = 1800) {
  const [val, setVal] = useState(0)
  const ref = useRef(false)
  useEffect(() => {
    if (ref.current) return
    ref.current = true
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1)
      setVal(Math.round(p * target))
      if (p < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [target, duration])
  return val
}

/* ─────────────────────────────────────────────
   Component
───────────────────────────────────────────── */
export function LandingPage() {
  const [activeProvider, setActiveProvider] = useState(0)
  const req  = useCounter(12480)
  const tok  = useCounter(8300000)
  const keys = useCounter(247)

  // cycle provider spotlight
  useEffect(() => {
    const id = setInterval(() => setActiveProvider(p => (p + 1) % PROVIDERS.length), 3000)
    return () => clearInterval(id)
  }, [])

  return (
    <>
      <style>{STYLES}</style>
      <div className="min-h-screen overflow-x-hidden bg-[#030712] text-white antialiased">

        {/* ══ NAV ══════════════════════════════════════════ */}
        <nav className="fixed inset-x-0 top-0 z-50">
          <div className="mx-4 mt-4 flex items-center justify-between rounded-2xl border border-white/8 bg-[#030712]/70 px-5 py-3 shadow-xl shadow-black/40 backdrop-blur-2xl">
            <a href="/" className="flex items-center gap-2.5">
              <img src="/logo.svg" alt="Cortex" className="h-7 w-auto" />
              <span className="text-sm font-black tracking-tight">Cortex</span>
            </a>
            <div className="hidden items-center gap-1 md:flex">
              {[['Features', '#features'], ['Providers', '#providers'], ['Docs', '/docs']].map(([l, h]) => (
                <a key={l} href={h} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-400 transition hover:bg-white/6 hover:text-white">{l}</a>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <a href="/admin/" className="hidden rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-400 transition hover:text-white md:block">Sign in</a>
              <a href="/admin/" className="flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-xs font-black text-[#030712] transition hover:bg-slate-200">
                Get access <ArrowRight size={11} />
              </a>
            </div>
          </div>
        </nav>

        {/* ══ HERO ═════════════════════════════════════════ */}
        <section className="relative flex min-h-screen items-center justify-center overflow-hidden pt-20">

          {/* Gradient orbs */}
          <div className="animate-drift  pointer-events-none absolute left-[-10%] top-[-5%]  h-[700px] w-[700px] rounded-full bg-indigo-600/15 blur-[120px]" />
          <div className="animate-drift2 pointer-events-none absolute right-[-15%] top-[10%]  h-[600px] w-[600px] rounded-full bg-violet-600/12 blur-[100px]" />
          <div className="animate-drift3 pointer-events-none absolute bottom-[-10%] left-[20%] h-[500px] w-[700px] rounded-full bg-teal-600/10  blur-[110px]" />

          {/* Dot grid */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.07]"
            style={{ backgroundImage: 'radial-gradient(circle, #ffffff 1px, transparent 1px)', backgroundSize: '32px 32px' }}
          />

          <div className="relative z-10 mx-auto max-w-6xl px-6 text-center">

            {/* Badge */}
            <div className="animate-fadeUp mb-8 inline-flex items-center gap-2.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-5 py-2 text-xs font-bold text-indigo-300 backdrop-blur">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-400" />
              </span>
              Self-hosted · OpenAI-Compatible · Multi-Provider
            </div>

            {/* Headline */}
            <h1
              className="animate-fadeUp mx-auto max-w-5xl text-[clamp(2.8rem,8vw,5.5rem)] font-black leading-[1.05] tracking-[-0.03em]"
              style={{ animationDelay: '.1s' }}
            >
              <span className="shimmer-text">Route every AI.</span>
              <br />
              <span className="bg-gradient-to-b from-white to-slate-400 bg-clip-text text-transparent">
                Own every request.
              </span>
            </h1>

            <p
              className="animate-fadeUp mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-slate-400"
              style={{ animationDelay: '.2s' }}
            >
              Cortex is a self-hosted intelligence layer that unifies ChatGPT, Claude, Gemini, and Grok
              behind a single OpenAI-compatible API — with admin controls, usage analytics, and a full user portal.
            </p>

            {/* CTAs */}
            <div
              className="animate-fadeUp mt-10 flex flex-wrap items-center justify-center gap-4"
              style={{ animationDelay: '.3s' }}
            >
              <a
                href="/admin/"
                className="group relative flex items-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-600 bg-[length:200%] px-8 py-3.5 text-sm font-black text-white shadow-2xl shadow-indigo-500/30 transition-all hover:bg-right hover:shadow-indigo-500/50"
              >
                Get API Access
                <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
              </a>
              <a
                href="/docs"
                className="flex items-center gap-2 rounded-2xl border border-white/12 bg-white/5 px-8 py-3.5 text-sm font-bold text-slate-200 backdrop-blur transition hover:bg-white/10 hover:text-white"
              >
                <BookOpen size={14} /> View Docs
              </a>
            </div>

            {/* Live counters */}
            <div
              className="animate-fadeUp mx-auto mt-14 flex max-w-xl flex-wrap items-center justify-center gap-px overflow-hidden rounded-2xl border border-white/8"
              style={{ animationDelay: '.4s' }}
            >
              {[
                { val: req.toLocaleString(), label: 'Requests proxied' },
                { val: (tok / 1_000_000).toFixed(1) + 'M', label: 'Tokens routed' },
                { val: keys.toLocaleString(), label: 'API keys issued' },
              ].map((s, i) => (
                <div key={i} className="flex-1 bg-white/[0.03] px-6 py-4 text-center backdrop-blur">
                  <p className="text-xl font-black tabular-nums text-white">{s.val}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Scroll cue */}
            <div className="animate-float mt-12 flex justify-center">
              <div className="flex h-8 w-5 items-start justify-center rounded-full border border-white/20 p-1">
                <div className="h-1.5 w-1 animate-bounce rounded-full bg-white/40" />
              </div>
            </div>
          </div>
        </section>

        {/* ══ MARQUEE ══════════════════════════════════════ */}
        <div className="relative border-y border-white/5 bg-white/[0.018] py-4 overflow-hidden">
          <div className="flex animate-marquee whitespace-nowrap">
            {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
              <span key={i} className="mx-8 text-xs font-semibold text-slate-500">{item}</span>
            ))}
          </div>
        </div>

        {/* ══ BENTO FEATURES ═══════════════════════════════ */}
        <section id="features" className="mx-auto max-w-7xl px-6 py-28">
          <div className="mb-16 text-center">
            <p className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-indigo-400">Platform</p>
            <h2 className="text-4xl font-black tracking-tight sm:text-5xl">
              Built for teams who can't afford downtime
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-slate-400">
              Every piece is designed to give you reliable, observable, cost-controlled access to large language models.
            </p>
          </div>

          {/* Bento grid */}
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {BENTO.map((card, i) => (
              <div
                key={i}
                className={`noise card-glow group relative overflow-hidden rounded-3xl border border-white/8 bg-gradient-to-br p-7 transition-all duration-500 ${card.gradient} ${card.size === 'wide' ? 'lg:col-span-2' : ''}`}
                style={{ '--glow': card.glow } as React.CSSProperties}
              >
                {/* Background glow */}
                <div
                  className="animate-glow pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full blur-3xl"
                  style={{ background: card.accent + '20' }}
                />

                <div
                  className="mb-5 inline-flex items-center justify-center rounded-2xl p-3"
                  style={{ background: card.accent + '20', border: `1px solid ${card.accent}30` }}
                >
                  <card.icon size={20} style={{ color: card.accent }} />
                </div>

                <h3 className="mb-2 whitespace-pre-line text-lg font-black leading-tight text-white">{card.title}</h3>
                <p className="text-sm leading-relaxed text-slate-400">{card.body}</p>

                {/* Hover beam */}
                <div
                  className="pointer-events-none absolute bottom-0 left-0 h-0.5 w-full opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                  style={{ background: `linear-gradient(90deg, transparent, ${card.accent}, transparent)` }}
                />
              </div>
            ))}
          </div>
        </section>

        {/* ══ PROVIDER SHOWCASE ════════════════════════════ */}
        <section id="providers" className="border-y border-white/5 bg-[#050d1a]">
          <div className="mx-auto max-w-7xl px-6 py-28">
            <div className="mb-16 text-center">
              <p className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-teal-400">Providers</p>
              <h2 className="text-4xl font-black tracking-tight sm:text-5xl">
                Every frontier model. One key.
              </h2>
              <p className="mx-auto mt-4 max-w-lg text-slate-400">
                Cortex manages browser sessions to web AI interfaces so you get API access
                without sacrificing reliability or control.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {PROVIDERS.map((p, i) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => setActiveProvider(i)}
                  className="noise group relative overflow-hidden rounded-3xl border p-6 text-left transition-all duration-500"
                  style={{
                    borderColor: activeProvider === i ? p.color + '60' : 'rgba(255,255,255,0.08)',
                    background: activeProvider === i
                      ? `linear-gradient(135deg, ${p.color}18, transparent)`
                      : 'rgba(255,255,255,0.02)',
                    boxShadow: activeProvider === i ? `0 0 40px -10px ${p.color}50` : 'none',
                  }}
                >
                  {/* Pulse ring */}
                  {activeProvider === i && (
                    <span
                      className="absolute right-4 top-4 h-2.5 w-2.5 rounded-full"
                      style={{ background: p.color }}
                    >
                      <span
                        className="absolute inset-0 animate-ping rounded-full opacity-75"
                        style={{ background: p.color }}
                      />
                    </span>
                  )}

                  <div
                    className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl text-lg font-black text-white shadow-lg"
                    style={{ background: p.color, boxShadow: `0 8px 24px ${p.color}50` }}
                  >
                    {p.name[0]}
                  </div>

                  <h3 className="mb-2 text-base font-black text-white">{p.name}</h3>
                  <p className="text-xs leading-5 text-slate-500">{p.text}</p>

                  <div
                    className="mt-4 flex items-center gap-1.5 text-xs font-semibold transition-colors"
                    style={{ color: activeProvider === i ? p.color : '#64748b' }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: activeProvider === i ? p.color : '#475569' }} />
                    {activeProvider === i ? 'Active' : 'Available'}
                  </div>
                </button>
              ))}
            </div>

            {/* Architecture flow */}
            <div className="mt-16 flex flex-col items-center gap-4 rounded-3xl border border-white/6 bg-white/[0.018] px-8 py-10 sm:flex-row sm:justify-center">
              <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/10 px-5 py-3 text-center">
                <p className="text-xs text-slate-500">Your application</p>
                <p className="mt-1 text-sm font-black text-white">POST /v1/chat/completions</p>
              </div>

              <div className="flex flex-col items-center gap-1">
                <div className="hidden h-0.5 w-16 bg-gradient-to-r from-indigo-500/50 to-violet-500/50 sm:block" />
                <ChevronRight size={16} className="hidden text-slate-600 sm:block" />
                <div className="h-8 w-0.5 bg-gradient-to-b from-indigo-500/50 to-violet-500/50 sm:hidden" />
              </div>

              <div className="relative rounded-2xl border border-violet-500/40 bg-gradient-to-b from-violet-500/20 to-violet-500/5 px-7 py-4 text-center shadow-xl shadow-violet-500/10">
                <div className="pointer-events-none absolute -inset-px rounded-2xl" style={{ background: 'linear-gradient(135deg, #7c3aed20, transparent, #7c3aed20)' }} />
                <img src="/logo.svg" alt="Cortex" className="mx-auto mb-1.5 h-6 w-auto" />
                <p className="text-sm font-black text-white">Cortex</p>
                <p className="text-[10px] text-violet-400">Auth · Route · Log · Limit</p>
              </div>

              <div className="flex flex-col items-center gap-1">
                <div className="hidden h-0.5 w-16 bg-gradient-to-r from-violet-500/50 to-teal-500/50 sm:block" />
                <ChevronRight size={16} className="hidden text-slate-600 sm:block" />
                <div className="h-8 w-0.5 bg-gradient-to-b from-violet-500/50 to-teal-500/50 sm:hidden" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                {PROVIDERS.map(p => (
                  <div
                    key={p.name}
                    className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold"
                    style={{ background: p.color + '18', border: `1px solid ${p.color}30`, color: p.color }}
                  >
                    <span className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-black text-white" style={{ background: p.color }}>
                      {p.name[0]}
                    </span>
                    {p.name}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ══ ADMIN + USER PORTAL ══════════════════════════ */}
        <section className="mx-auto max-w-7xl px-6 py-28">
          <div className="grid gap-6 lg:grid-cols-2">

            {/* Admin card */}
            <div className="noise relative overflow-hidden rounded-3xl border border-blue-500/20 bg-gradient-to-br from-blue-950/50 to-slate-950/80 p-8">
              <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />
              <div className="relative">
                <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/15 px-4 py-1.5 text-xs font-black text-blue-300">
                  <Sparkles size={11} /> Admin Panel
                </div>
                <h3 className="mb-3 text-2xl font-black text-white">Full operational control</h3>
                <p className="mb-6 text-sm leading-relaxed text-slate-400">
                  Manage providers, issue API keys, set quotas, review logs, monitor usage, and control every aspect of the platform from a single dashboard.
                </p>
                <ul className="mb-8 space-y-2.5">
                  {['Provider session management', 'API key issuance & revocation', 'Per-key rate limits & quotas', 'Real-time request & audit logs', 'Usage analytics & KPIs'].map(item => (
                    <li key={item} className="flex items-center gap-2.5 text-sm text-slate-300">
                      <ChevronRight size={13} className="shrink-0 text-blue-400" />{item}
                    </li>
                  ))}
                </ul>
                <a
                  href="/admin/"
                  className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-black text-white shadow-lg shadow-blue-500/25 transition hover:bg-blue-500"
                >
                  Open Admin Panel <ArrowRight size={13} />
                </a>
              </div>
            </div>

            {/* User portal card */}
            <div className="noise relative overflow-hidden rounded-3xl border border-teal-500/20 bg-gradient-to-br from-teal-950/50 to-slate-950/80 p-8">
              <div className="pointer-events-none absolute -bottom-16 -right-16 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl" />
              <div className="relative">
                <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-teal-500/30 bg-teal-500/15 px-4 py-1.5 text-xs font-black text-teal-300">
                  <Users size={11} /> User Portal
                </div>
                <h3 className="mb-3 text-2xl font-black text-white">Self-service for your users</h3>
                <p className="mb-6 text-sm leading-relaxed text-slate-400">
                  Users register, request API keys, track their own token usage, browse the API docs, and run live playground tests — all without involving an admin.
                </p>
                <div className="mb-8 grid grid-cols-2 gap-3">
                  {[
                    { icon: KeyRound, label: 'API key requests', sub: 'Request & track status' },
                    { icon: Activity, label: 'Usage dashboard', sub: 'Requests & token stats' },
                    { icon: Terminal, label: 'Live playground', sub: 'Test any model live' },
                    { icon: BookOpen, label: 'API reference', sub: 'Full docs with examples' },
                  ].map(card => (
                    <div key={card.label} className="rounded-2xl border border-white/8 bg-white/4 p-3.5">
                      <card.icon size={16} className="mb-2 text-teal-400" />
                      <p className="text-xs font-bold text-white">{card.label}</p>
                      <p className="text-[11px] text-slate-500">{card.sub}</p>
                    </div>
                  ))}
                </div>
                <a
                  href="/admin/"
                  className="inline-flex items-center gap-2 rounded-2xl bg-teal-600 px-5 py-2.5 text-sm font-black text-white shadow-lg shadow-teal-500/25 transition hover:bg-teal-500"
                >
                  Access User Portal <ArrowRight size={13} />
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ══ PRIVATE & OWNED ══════════════════════════════ */}
        <section className="border-y border-white/5 bg-[#050d1a]">
          <div className="mx-auto max-w-5xl px-6 py-24 text-center">
            <div className="mb-5 inline-flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-2 text-xs font-black text-emerald-400">
              <Shield size={12} /> Privacy-first
            </div>
            <h2 className="text-4xl font-black tracking-tight sm:text-5xl">
              Your infrastructure.<br />
              <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
                Your data. Always.
              </span>
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-lg text-slate-400">
              Cortex runs entirely on your hardware. No external telemetry, no third-party data collection,
              no vendor lock-in. Every request stays inside your network.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-4">
              {[
                ['Zero', 'external telemetry'],
                ['100%', 'on-prem capable'],
                ['Your keys', 'never leave your server'],
                ['MIT', 'open source friendly'],
              ].map(([val, label]) => (
                <div key={label} className="rounded-2xl border border-white/8 bg-white/3 px-6 py-4 text-center backdrop-blur">
                  <p className="text-xl font-black text-white">{val}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══ CTA ══════════════════════════════════════════ */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-0 bg-gradient-to-b from-[#030712] via-indigo-950/40 to-[#030712]" />
            <div className="absolute left-1/2 top-1/2 h-[600px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-600/15 blur-[120px]" />
          </div>
          <div className="relative mx-auto max-w-3xl px-6 py-36 text-center">
            <p className="mb-4 text-xs font-black uppercase tracking-[0.2em] text-indigo-400">Get started</p>
            <h2 className="text-5xl font-black leading-tight tracking-tight text-white sm:text-6xl">
              Own your AI stack.<br />
              <span className="shimmer-text">Starting now.</span>
            </h2>
            <p className="mx-auto mt-6 max-w-lg text-lg text-slate-400">
              Deploy Cortex, connect your providers, and start routing requests in minutes.
              No managed service. No usage-based pricing surprises. No lock-in.
            </p>
            <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
              <a
                href="/admin/"
                className="group relative flex items-center gap-2.5 overflow-hidden rounded-2xl bg-white px-8 py-4 text-sm font-black text-[#030712] shadow-2xl shadow-white/10 transition hover:shadow-white/20"
              >
                <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-indigo-100/40 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                Open Admin Panel <ArrowRight size={14} />
              </a>
              <a
                href="/docs"
                className="flex items-center gap-2 rounded-2xl border border-white/12 bg-white/5 px-8 py-4 text-sm font-bold text-slate-200 backdrop-blur transition hover:bg-white/10"
              >
                <BookOpen size={14} /> Read the Docs
              </a>
            </div>
          </div>
        </section>

        {/* ══ FOOTER ═══════════════════════════════════════ */}
        <footer className="border-t border-white/5 px-6 py-10">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
              <img src="/logo.svg" alt="Cortex" className="h-6 w-auto opacity-50" />
              <span className="text-sm font-black text-slate-600">Cortex</span>
            </div>
            <div className="flex flex-wrap items-center gap-6">
              {[['Docs', '/docs'], ['Admin', '/admin/'], ['User Portal', '/admin/']].map(([l, h]) => (
                <a key={l} href={h} className="text-xs text-slate-700 transition hover:text-slate-400">{l}</a>
              ))}
            </div>
            <p className="text-xs text-slate-800">Self-hosted. Open. Yours.</p>
          </div>
        </footer>
      </div>
    </>
  )
}
