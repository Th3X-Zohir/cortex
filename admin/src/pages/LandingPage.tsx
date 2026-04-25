import { useState } from 'react'
import {
  Activity, ArrowRight, BookOpen, ChevronRight, Code2, Cpu,
  ExternalLink, Globe, KeyRound, Layers, Lock, Shield, Sparkles,
  Terminal, Users, Zap,
} from 'lucide-react'

const PROVIDERS = [
  { name: 'ChatGPT', color: '#10a37f', letter: 'G' },
  { name: 'Claude',  color: '#d97706', letter: 'C' },
  { name: 'Gemini',  color: '#4285f4', letter: 'G' },
  { name: 'Grok',    color: '#e11d48', letter: 'X' },
]

const CODE_TABS = ['cURL', 'Python', 'TypeScript'] as const
type CodeTab = typeof CODE_TABS[number]

const CODE: Record<CodeTab, string> = {
  cURL: `curl https://your-server/v1/chat/completions \\
  -H "Authorization: Bearer cx-your-api-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'`,
  Python: `from openai import OpenAI

client = OpenAI(
    api_key="cx-your-api-key",
    base_url="https://your-server/v1"
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello!"}]
)

print(response.choices[0].message.content)`,
  TypeScript: `import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: 'cx-your-api-key',
  baseURL: 'https://your-server/v1',
})

const response = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello!' }],
})

console.log(response.choices[0].message.content)`,
}

const FEATURES = [
  {
    icon: Layers,
    title: 'OpenAI-Compatible',
    desc: 'Drop-in replacement for the OpenAI API. Zero code changes required — just swap the base URL.',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/20',
  },
  {
    icon: Cpu,
    title: 'Multi-Provider',
    desc: 'Route requests to ChatGPT, Claude, Gemini, and Grok from a single unified endpoint.',
    color: 'text-violet-400',
    bg: 'bg-violet-500/10 border-violet-500/20',
  },
  {
    icon: Zap,
    title: 'Auto Fallback',
    desc: 'Automatically reroutes to backup providers when a model is rate-limited or unavailable.',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/20',
  },
  {
    icon: Activity,
    title: 'Real-time Streaming',
    desc: 'Full Server-Sent Events streaming support. Token-by-token output, zero buffering.',
    color: 'text-teal-400',
    bg: 'bg-teal-500/10 border-teal-500/20',
  },
  {
    icon: KeyRound,
    title: 'API Key Management',
    desc: 'Issue, rotate, and revoke keys with per-key daily quotas and rate limits.',
    color: 'text-rose-400',
    bg: 'bg-rose-500/10 border-rose-500/20',
  },
  {
    icon: Shield,
    title: 'Usage & Audit Logs',
    desc: 'Full request-level logging with token counts, latency, payloads, and admin audit trail.',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/20',
  },
  {
    icon: Users,
    title: 'User Portal',
    desc: 'Self-serve registration, key request flow, usage dashboard, and personal playground.',
    color: 'text-sky-400',
    bg: 'bg-sky-500/10 border-sky-500/20',
  },
  {
    icon: Lock,
    title: 'Self-Hosted & Private',
    desc: 'Run on your own infrastructure. All traffic stays inside your network. No third-party telemetry.',
    color: 'text-slate-400',
    bg: 'bg-slate-500/10 border-slate-500/20',
  },
]

const STEPS = [
  {
    n: '01',
    title: 'Deploy',
    desc: 'Run the Cortex server on any Node 20+ machine or Docker container. One command to start.',
    code: 'node dist/cli.js start --port=31338',
    color: 'from-blue-500 to-violet-500',
  },
  {
    n: '02',
    title: 'Connect',
    desc: 'Log in to AI providers through the admin panel. Cortex manages browser sessions so you never share credentials.',
    code: 'node dist/cli.js login claude',
    color: 'from-violet-500 to-teal-500',
  },
  {
    n: '03',
    title: 'Use',
    desc: 'Call the API with any OpenAI-compatible SDK, tool, or client. It just works.',
    code: 'curl /v1/chat/completions -d \'{"model":"gpt-4o"...}\'',
    color: 'from-teal-500 to-emerald-500',
  },
]

export function LandingPage() {
  const [codeTab, setCodeTab] = useState<CodeTab>('Python')
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-[#020617] text-white antialiased">
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-blue-600/10 blur-[120px]" />
        <div className="absolute top-1/3 -left-40 h-[500px] w-[500px] rounded-full bg-violet-600/8 blur-[100px]" />
        <div className="absolute top-1/2 -right-40 h-[500px] w-[500px] rounded-full bg-teal-600/8 blur-[100px]" />
      </div>

      {/* ── Nav ── */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#020617]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <a href="/" className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="Cortex" className="h-7 w-auto" />
            <span className="text-base font-bold tracking-tight text-white">Cortex</span>
          </a>

          <nav className="hidden items-center gap-6 md:flex">
            {[
              ['Features', '#features'],
              ['How it works', '#how'],
              ['API Docs', '/docs'],
            ].map(([label, href]) => (
              <a key={label} href={href} className="text-sm text-slate-400 transition hover:text-white">{label}</a>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <a href="/admin/" className="text-sm font-semibold text-slate-300 hover:text-white transition">
              Sign in
            </a>
            <a
              href="/admin/"
              className="flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-900 transition hover:bg-slate-100"
            >
              Get API Access <ArrowRight size={13} />
            </a>
          </div>

          <button
            className="rounded-lg border border-white/10 p-2 md:hidden"
            onClick={() => setMenuOpen(o => !o)}
          >
            <div className={`mb-1 h-0.5 w-5 bg-white transition-transform ${menuOpen ? 'translate-y-1.5 rotate-45' : ''}`} />
            <div className={`mb-1 h-0.5 w-5 bg-white transition-opacity ${menuOpen ? 'opacity-0' : ''}`} />
            <div className={`h-0.5 w-5 bg-white transition-transform ${menuOpen ? '-translate-y-1.5 -rotate-45' : ''}`} />
          </button>
        </div>
        {menuOpen && (
          <div className="border-t border-white/5 px-6 py-4 space-y-3 md:hidden">
            {[['Features', '#features'], ['How it works', '#how'], ['API Docs', '/docs'], ['Sign in', '/admin/']].map(([l, h]) => (
              <a key={l} href={h} className="block text-sm text-slate-300 hover:text-white">{l}</a>
            ))}
            <a href="/admin/" className="block rounded-xl bg-white px-4 py-2 text-center text-sm font-bold text-slate-900">Get API Access</a>
          </div>
        )}
      </header>

      {/* ── Hero ── */}
      <section className="relative mx-auto max-w-7xl px-6 pb-24 pt-24 text-center">
        {/* Badge */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold text-slate-300 backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-teal-400" />
          OpenAI-Compatible · Self-Hosted · Multi-Provider
        </div>

        {/* Headline */}
        <h1 className="mx-auto max-w-4xl text-5xl font-extrabold leading-tight tracking-tight sm:text-6xl lg:text-7xl">
          <span className="bg-gradient-to-br from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
            One API.{' '}
          </span>
          <span className="bg-gradient-to-r from-blue-400 via-violet-400 to-teal-400 bg-clip-text text-transparent">
            Every AI.
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-400">
          Cortex is a self-hosted proxy that unifies ChatGPT, Claude, Gemini, and Grok behind a single
          OpenAI-compatible endpoint — with admin controls, API key management, and real-time streaming.
        </p>

        {/* CTAs */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <a
            href="/admin/"
            className="group flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-blue-500/25 transition hover:shadow-blue-500/40 hover:brightness-110"
          >
            Get API Access
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
          </a>
          <a
            href="/docs"
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-200 backdrop-blur transition hover:bg-white/10 hover:text-white"
          >
            <BookOpen size={15} /> View Docs
          </a>
        </div>

        {/* Provider badges */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Works with</span>
          {PROVIDERS.map(p => (
            <span
              key={p.name}
              className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 backdrop-blur"
            >
              <span
                className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-black text-white"
                style={{ background: p.color }}
              >
                {p.letter}
              </span>
              {p.name}
            </span>
          ))}
          <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-400 backdrop-blur">
            <Globe size={11} /> + API providers
          </span>
        </div>

        {/* Hero code card */}
        <div className="mx-auto mt-16 max-w-2xl">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/3 shadow-2xl shadow-black/40 backdrop-blur">
            <div className="flex items-center gap-2 border-b border-white/8 px-4 py-3">
              <div className="flex gap-1.5">
                <div className="h-3 w-3 rounded-full bg-red-500/60" />
                <div className="h-3 w-3 rounded-full bg-amber-500/60" />
                <div className="h-3 w-3 rounded-full bg-green-500/60" />
              </div>
              <span className="ml-2 text-xs font-medium text-slate-500">terminal</span>
            </div>
            <pre className="overflow-x-auto p-5 text-left text-xs leading-6">
              <span className="text-slate-500">$ </span>
              <span className="text-teal-400">curl</span>
              <span className="text-slate-300"> https://your-server/v1/chat/completions \</span>{'\n'}
              <span className="text-slate-500">  </span>
              <span className="text-amber-300">-H</span>
              <span className="text-slate-300"> "Authorization: Bearer cx-..." \</span>{'\n'}
              <span className="text-slate-500">  </span>
              <span className="text-amber-300">-d</span>
              <span className="text-blue-300"> '&#123;"model":"gpt-4o","messages":[...]&#125;'</span>{'\n\n'}
              <span className="text-slate-500"># Response</span>{'\n'}
              <span className="text-slate-300">&#123;</span>{'\n'}
              <span className="text-slate-300">  </span>
              <span className="text-violet-300">"choices"</span>
              <span className="text-slate-300">: [&#123; </span>
              <span className="text-violet-300">"message"</span>
              <span className="text-slate-300">: &#123; </span>
              <span className="text-violet-300">"content"</span>
              <span className="text-slate-300">: </span>
              <span className="text-emerald-300">"Hello! How can I help?"</span>
              <span className="text-slate-300"> &#125; &#125;]</span>{'\n'}
              <span className="text-slate-300">&#125;</span>
            </pre>
          </div>
        </div>
      </section>

      {/* ── Stats strip ── */}
      <div className="border-y border-white/5 bg-white/[0.02]">
        <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-white/5 px-6 md:grid-cols-4">
          {[
            ['4+', 'AI Providers'],
            ['100%', 'OpenAI-Compatible'],
            ['Real-time', 'SSE Streaming'],
            ['Zero', 'External Telemetry'],
          ].map(([val, label]) => (
            <div key={label} className="px-6 py-8 text-center">
              <p className="text-3xl font-extrabold tracking-tight text-white">{val}</p>
              <p className="mt-1 text-sm text-slate-500">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Features ── */}
      <section id="features" className="mx-auto max-w-7xl px-6 py-24">
        <div className="mb-14 text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-400">
            <Sparkles size={11} /> Features
          </div>
          <h2 className="text-4xl font-extrabold tracking-tight text-white">
            Everything you need to run AI at scale
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-400">
            Production-grade infrastructure for teams who need reliable, observable, and cost-controlled access to large language models.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(f => (
            <div
              key={f.title}
              className={`group rounded-2xl border p-5 transition hover:scale-[1.02] ${f.bg}`}
            >
              <div className={`mb-4 inline-flex rounded-xl border p-2.5 ${f.bg}`}>
                <f.icon size={18} className={f.color} />
              </div>
              <h3 className="mb-2 text-sm font-bold text-white">{f.title}</h3>
              <p className="text-xs leading-5 text-slate-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how" className="border-y border-white/5 bg-white/[0.015]">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <div className="mb-14 text-center">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-400">
              <Code2 size={11} /> How it works
            </div>
            <h2 className="text-4xl font-extrabold tracking-tight text-white">
              Up and running in minutes
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <div key={step.n} className="relative">
                {i < STEPS.length - 1 && (
                  <div className="absolute right-0 top-8 hidden h-px w-1/2 bg-gradient-to-r from-white/10 to-transparent md:block" />
                )}
                <div className="rounded-2xl border border-white/8 bg-white/3 p-6">
                  <div className={`mb-4 inline-flex items-center justify-center rounded-xl bg-gradient-to-br ${step.color} p-0.5`}>
                    <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#020617]">
                      <span className="text-sm font-black text-white">{step.n}</span>
                    </div>
                  </div>
                  <h3 className="mb-2 text-base font-bold text-white">{step.title}</h3>
                  <p className="mb-4 text-sm leading-relaxed text-slate-400">{step.desc}</p>
                  <div className="rounded-lg border border-white/8 bg-[#020617] px-3 py-2">
                    <code className="text-xs text-teal-300">{step.code}</code>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Code showcase ── */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-400">
              <Terminal size={11} /> Integration
            </div>
            <h2 className="text-4xl font-extrabold leading-tight tracking-tight text-white">
              Works with every OpenAI SDK and tool
            </h2>
            <p className="mt-4 text-slate-400 leading-relaxed">
              Because Cortex speaks the OpenAI API protocol exactly, it works with LangChain, LlamaIndex,
              Cursor, Continue, Copilot, and any other tool that accepts a custom base URL.
            </p>
            <ul className="mt-6 space-y-2.5">
              {[
                'Drop-in base URL replacement',
                'Streaming with SSE / async generators',
                'System prompts, temperature, max_tokens',
                'Multi-turn conversation support',
              ].map(item => (
                <li key={item} className="flex items-center gap-2.5 text-sm text-slate-300">
                  <ChevronRight size={14} className="text-teal-400" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0d1117] shadow-2xl shadow-black/50">
            {/* Tab bar */}
            <div className="flex items-center gap-1 border-b border-white/8 px-4 py-3">
              <div className="flex gap-1.5 mr-4">
                <div className="h-3 w-3 rounded-full bg-red-500/50" />
                <div className="h-3 w-3 rounded-full bg-amber-500/50" />
                <div className="h-3 w-3 rounded-full bg-green-500/50" />
              </div>
              {CODE_TABS.map(tab => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setCodeTab(tab)}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                    codeTab === tab
                      ? 'bg-white/10 text-white'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <pre className="overflow-x-auto p-5 text-xs leading-6 text-slate-300">{CODE[codeTab]}</pre>
          </div>
        </div>
      </section>

      {/* ── Architecture ── */}
      <section className="border-y border-white/5 bg-white/[0.015]">
        <div className="mx-auto max-w-5xl px-6 py-20 text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-400">
            <Layers size={11} /> Architecture
          </div>
          <h2 className="mb-12 text-3xl font-extrabold tracking-tight text-white">
            A transparent layer between your code and the AI
          </h2>

          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            {/* Client */}
            <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 px-6 py-4 text-center">
              <Code2 size={22} className="mx-auto mb-2 text-blue-400" />
              <p className="text-sm font-bold text-white">Your App</p>
              <p className="text-xs text-slate-400">OpenAI SDK / cURL / anything</p>
            </div>

            <div className="flex flex-col items-center gap-1 text-slate-600 sm:flex-row">
              <div className="h-px w-8 bg-gradient-to-r from-blue-500/40 to-violet-500/40 sm:h-px sm:w-12" />
              <ArrowRight size={14} className="text-slate-500" />
            </div>

            {/* Cortex */}
            <div className="rounded-2xl border border-violet-500/40 bg-gradient-to-b from-violet-500/20 to-violet-500/5 px-8 py-5 text-center shadow-lg shadow-violet-500/10">
              <img src="/logo.svg" alt="Cortex" className="mx-auto mb-2 h-7 w-auto" />
              <p className="text-sm font-black text-white">Cortex</p>
              <p className="mt-0.5 text-[10px] text-violet-300">Auth · Routing · Logging · Limits</p>
            </div>

            <div className="flex flex-col items-center gap-1 text-slate-600 sm:flex-row">
              <div className="h-px w-8 bg-gradient-to-r from-violet-500/40 to-teal-500/40 sm:h-px sm:w-12" />
              <ArrowRight size={14} className="text-slate-500" />
            </div>

            {/* Providers */}
            <div className="grid grid-cols-2 gap-2">
              {PROVIDERS.map(p => (
                <div
                  key={p.name}
                  className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/5 px-3 py-2"
                  style={{ borderColor: p.color + '30' }}
                >
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-black text-white"
                    style={{ background: p.color }}
                  >
                    {p.letter}
                  </span>
                  <span className="text-xs font-semibold text-slate-300">{p.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── User portal spotlight ── */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <div className="overflow-hidden rounded-3xl border border-white/8 bg-gradient-to-br from-teal-900/30 via-slate-900/30 to-blue-900/30">
          <div className="grid items-center gap-8 p-8 lg:grid-cols-2 lg:p-14">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-semibold text-teal-400">
                <Users size={11} /> User Portal
              </div>
              <h2 className="text-3xl font-extrabold tracking-tight text-white">
                Built-in self-service for your users
              </h2>
              <p className="mt-4 text-slate-400 leading-relaxed">
                Users register, request API keys, track their own usage, and test the API directly —
                all without admin involvement.
              </p>
              <ul className="mt-6 space-y-2">
                {[
                  'Self-serve registration & login',
                  'API key request flow with admin approval',
                  'Personal usage dashboard & logs',
                  'In-browser playground with streaming',
                ].map(item => (
                  <li key={item} className="flex items-center gap-2.5 text-sm text-slate-300">
                    <div className="h-1.5 w-1.5 rounded-full bg-teal-400" />
                    {item}
                  </li>
                ))}
              </ul>
              <a
                href="/admin/"
                className="mt-8 inline-flex items-center gap-2 rounded-xl bg-teal-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-teal-500/20 transition hover:bg-teal-400"
              >
                Access User Portal <ExternalLink size={13} />
              </a>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: Activity, label: 'Usage Dashboard', sub: 'Requests, tokens, daily limits' },
                { icon: KeyRound, label: 'My API Keys', sub: 'View and copy approved keys' },
                { icon: Terminal, label: 'Playground', sub: 'Test with any model live' },
                { icon: BookOpen, label: 'API Docs', sub: 'Reference with live examples' },
              ].map(card => (
                <div
                  key={card.label}
                  className="rounded-2xl border border-white/8 bg-white/5 p-4 backdrop-blur"
                >
                  <card.icon size={18} className="mb-3 text-teal-400" />
                  <p className="text-xs font-bold text-white">{card.label}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{card.sub}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="relative overflow-hidden border-t border-white/5">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-0 h-[400px] w-[800px] -translate-x-1/2 rounded-full bg-blue-600/10 blur-[100px]" />
        </div>
        <div className="relative mx-auto max-w-3xl px-6 py-28 text-center">
          <h2 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            Start using Cortex today
          </h2>
          <p className="mx-auto mt-5 max-w-lg text-lg text-slate-400">
            Self-hosted, zero lock-in, full control. Deploy in minutes and route to every major AI provider through one API.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <a
              href="/admin/"
              className="group flex items-center gap-2 rounded-xl bg-white px-7 py-3.5 text-sm font-bold text-slate-900 shadow-lg transition hover:bg-slate-100"
            >
              Admin Panel <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
            </a>
            <a
              href="/docs"
              className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-7 py-3.5 text-sm font-semibold text-slate-200 backdrop-blur transition hover:bg-white/10"
            >
              <BookOpen size={14} /> Read the Docs
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 px-6 py-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="Cortex" className="h-6 w-auto opacity-60" />
            <span className="text-sm font-semibold text-slate-500">Cortex</span>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            {[['Docs', '/docs'], ['Admin', '/admin/'], ['User Portal', '/admin/']].map(([l, h]) => (
              <a key={l} href={h} className="text-xs text-slate-600 transition hover:text-slate-400">{l}</a>
            ))}
          </div>
          <p className="text-xs text-slate-700">Self-hosted. Open. Yours.</p>
        </div>
      </footer>
    </div>
  )
}
