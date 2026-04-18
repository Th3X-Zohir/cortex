import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  Check,
  ChevronDown,
  Clock3,
  Cpu,
  ExternalLink,
  Loader2,
  Maximize2,
  Minimize2,
  Monitor,
  Radio,
  RefreshCcw,
  RotateCw,
  Search,
  Send,
  TerminalSquare,
} from 'lucide-react'
import { api } from '@/lib/api'
import { formatDate, formatNumber } from '@/lib/utils'
import type { ModelCatalog, PlaygroundResponse } from '@/types'
import { Alert, EmptyState, Field, Page } from '@/components/shared/AppPrimitives'

export function PlaygroundPage() {
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null)
  const [model, setModel] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('You are a precise assistant for operational testing.')
  const [prompt, setPrompt] = useState('')
  const [mode, setMode] = useState<'standard' | 'stream'>('standard')
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(800)
  const [newConversation, setNewConversation] = useState(true)
  const [vncSize, setVncSize] = useState<'standard' | 'large'>('large')
  const [vncFrameKey, setVncFrameKey] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)
  const [activeSurface, setActiveSurface] = useState<'response' | 'vnc' | 'json' | 'history'>('response')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [responseText, setResponseText] = useState('')
  const [usage, setUsage] = useState<PlaygroundResponse['usage'] | null>(null)
  const [rawRequest, setRawRequest] = useState('')
  const [rawResponse, setRawResponse] = useState('')
  const [elapsedMs, setElapsedMs] = useState<number | null>(null)
  const [abortController, setAbortController] = useState<AbortController | null>(null)
  const [result, setResult] = useState<PlaygroundResponse | null>(null)
  const [history, setHistory] = useState<Array<{ id: string; at: string; model: string; provider: string; mode: string; latency: number; tokens: number; status: string }>>([])

  async function load() {
    setLoading(true)
    try {
      const next = await api.providers.models()
      setCatalog(next)
      setModel(current => current || next.models[0]?.id || '')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const selectedModel = catalog?.models.find(item => item.id === model)
  const selectedProvider = catalog?.providers.find(provider => provider.name === selectedModel?.provider)
  const vncUrl = catalog?.vnc.url

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setResult(null)
    setResponseText('')
    setUsage(null)
    setRawResponse('')
    setElapsedMs(null)

    const trimmedPrompt = prompt.trim()
    if (!model) {
      setError('Select a model before sending a request.')
      return
    }
    if (!trimmedPrompt) {
      setError('Enter a user prompt before sending a request.')
      return
    }

    setSubmitting(true)
    const startedAt = performance.now()
    try {
      const messages = [
        ...(systemPrompt.trim() ? [{ role: 'system' as const, content: systemPrompt.trim() }] : []),
        { role: 'user' as const, content: trimmedPrompt },
      ]
      const payload = {
        model,
        messages,
        stream: mode === 'stream',
        temperature,
        max_tokens: maxTokens,
        newConversation,
      }
      setRawRequest(JSON.stringify(payload, null, 2))

      if (mode === 'stream') {
        const controller = new AbortController()
        setAbortController(controller)
        let streamed = ''
        let finalPayload: Partial<PlaygroundResponse> & { usage?: PlaygroundResponse['usage'] } = {}

        await api.playground.stream(payload, {
          signal: controller.signal,
          onChunk: chunk => {
            streamed += chunk
            setResponseText(streamed)
          },
          onDone: payload => {
            finalPayload = payload
            if (payload.usage) setUsage(payload.usage)
          },
          onError: message => setError(message),
        })

        const elapsed = Math.round(performance.now() - startedAt)
        const finalUsage = finalPayload.usage ?? {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        }
        const responsePayload = {
          ...finalPayload,
          model,
          provider: selectedModel?.provider ?? 'unknown',
          choices: [{ index: 0, message: { role: 'assistant', content: streamed }, finish_reason: 'stop' }],
          usage: finalUsage,
        }
        setElapsedMs(elapsed)
        setUsage(finalUsage)
        setRawResponse(JSON.stringify(responsePayload, null, 2))
        setHistory(items => [{
          id: `${Date.now()}`,
          at: new Date().toISOString(),
          model,
          provider: selectedModel?.provider ?? 'unknown',
          mode: 'stream',
          latency: elapsed,
          tokens: finalUsage.total_tokens,
          status: streamed ? 'ok' : 'empty',
        }, ...items].slice(0, 8))
      } else {
        const next = await api.playground.chat(payload)
        const elapsed = Math.round(performance.now() - startedAt)
        setResult(next)
        setResponseText(next.choices[0]?.message.content ?? '')
        setUsage(next.usage)
        setElapsedMs(elapsed)
        setRawResponse(JSON.stringify(next, null, 2))
        setHistory(items => [{
          id: next.id,
          at: new Date().toISOString(),
          model: next.model,
          provider: next.provider,
          mode: 'standard',
          latency: elapsed,
          tokens: next.usage.total_tokens,
          status: 'ok',
        }, ...items].slice(0, 8))
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') setError('Streaming request stopped.')
      else setError(err instanceof Error ? err.message : 'Playground request failed')
    } finally {
      setSubmitting(false)
      setAbortController(null)
    }
  }

  async function providerAction(operation: 'login' | 'logout') {
    if (!selectedModel) return
    setError(null)
    try {
      if (operation === 'login') await api.providers.login(selectedModel.provider)
      else await api.providers.logout(selectedModel.provider)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Provider action failed')
    }
  }

  const workspace = (
    <>
      {error && <Alert tone="bad">{error}</Alert>}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-white/10 bg-white/[0.03] p-1">
          <button type="button" className={mode === 'standard' ? 'btn-primary min-h-9 px-4 py-2 text-xs' : 'btn-ghost min-h-9 px-4 py-2 text-xs'} onClick={() => setMode('standard')} disabled={submitting}>Non-streaming</button>
          <button type="button" className={mode === 'stream' ? 'btn-primary min-h-9 px-4 py-2 text-xs' : 'btn-ghost min-h-9 px-4 py-2 text-xs'} onClick={() => setMode('stream')} disabled={submitting}><Radio size={14} /> Streaming</button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost" onClick={load} disabled={loading}><RefreshCcw className={loading ? 'animate-spin' : ''} size={16} /> Refresh</button>
          <button type="button" className="btn-ghost" onClick={() => setFullscreen(!fullscreen)}>{fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}{fullscreen ? 'Exit fullscreen' : 'Fullscreen'}</button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[400px_minmax(0,1fr)]">
        <section className="rounded-xl border border-white/10 bg-white/[0.025] p-5 backdrop-blur-xl">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Request</h2>
              <p className="mt-1 text-sm text-white/45">Model, prompt, and run controls.</p>
            </div>
            <span className={selectedProvider?.sessionValid ? 'status-primary' : 'status-warning'}>
              {selectedProvider?.sessionValid ? 'Connected' : selectedProvider?.hasProfile ? 'Profile found' : 'Offline'}
            </span>
          </div>

          <form className="space-y-4" onSubmit={submit}>
            <Field label="Model">
              <ModelPicker
                models={catalog?.models ?? []}
                providers={catalog?.providers ?? []}
                value={model}
                onChange={setModel}
                disabled={loading || submitting}
              />
            </Field>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
                <p className="label text-white/45">Provider</p>
                <p className="mt-1 truncate text-lg font-semibold text-white">{selectedModel?.provider ?? 'None'}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
                <p className="label text-white/45">Limit</p>
                <p className="mt-1 text-lg font-semibold text-white">Unlimited</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Temperature">
                <input className="input" type="number" min="0" max="2" step="0.1" value={temperature} onChange={event => setTemperature(Number(event.target.value))} />
              </Field>
              <Field label="Max tokens">
                <input className="input" type="number" min="1" max="32000" value={maxTokens} onChange={event => setMaxTokens(Number(event.target.value))} />
              </Field>
            </div>
            <Field label="System prompt">
              <textarea className="input min-h-20 resize-y" value={systemPrompt} onChange={event => setSystemPrompt(event.target.value)} />
            </Field>
            <Field label="User prompt">
              <textarea className="input min-h-36 resize-y" value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="Write the request to test..." />
            </Field>
            <label className="flex items-center gap-2 text-sm text-white/60">
              <input type="checkbox" checked={newConversation} onChange={event => setNewConversation(event.target.checked)} className="accent-primary" />
              Start a fresh provider conversation
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <button className="btn-primary w-full" type="submit" disabled={submitting || loading || !model}>
                {submitting ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                {mode === 'stream' ? 'Start stream' : 'Send request'}
              </button>
              <button className="btn-ghost w-full" type="button" disabled={!submitting || !abortController} onClick={() => abortController?.abort()}>
                Stop stream
              </button>
            </div>
          </form>

          <div className="mt-5 border-t border-white/5 pt-4">
            <p className="label text-white/45">Provider controls</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="btn-ghost" onClick={() => providerAction('login')} disabled={!selectedModel || selectedModel.provider.endsWith('-api')}>Login</button>
              <button type="button" className="btn-ghost" onClick={() => providerAction('logout')} disabled={!selectedModel}>Logout</button>
              {vncUrl && <a className="btn-ghost" href={vncUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Open VNC</a>}
            </div>
          </div>
        </section>

        <section className="min-w-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.025] backdrop-blur-xl">
          <div className="border-b border-white/5 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {activeSurface === 'response' ? 'Response' : activeSurface === 'vnc' ? 'Live VNC' : activeSurface === 'json' ? 'JSON' : 'Run history'}
                </h2>
                <p className="mt-1 text-sm text-white/45">
                  {activeSurface === 'response' ? 'Streaming output and request metrics.' : activeSurface === 'vnc' ? 'Provider browser control without crowding the page.' : activeSurface === 'json' ? 'Exact request and response envelopes.' : 'Recent requests from this session.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  ['response', 'Response', TerminalSquare],
                  ['vnc', 'VNC', Monitor],
                  ['json', 'JSON', Cpu],
                  ['history', 'History', Activity],
                ].map(([value, label, Icon]) => (
                  <button
                    key={value as string}
                    type="button"
                    className={activeSurface === value ? 'btn-primary min-h-9 px-3 py-2 text-xs' : 'btn-ghost min-h-9 px-3 py-2 text-xs'}
                    onClick={() => setActiveSurface(value as typeof activeSurface)}
                  >
                    <Icon size={14} /> {label as string}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {activeSurface === 'response' && (
            <div className="space-y-5 p-5">
              <div className="grid gap-3 md:grid-cols-4">
                {[
                  { label: 'Mode', value: mode === 'stream' ? 'Stream' : 'Standard', helper: submitting ? 'Running' : 'Ready', icon: mode === 'stream' ? Radio : TerminalSquare },
                  { label: 'Latency', value: elapsedMs === null ? '-' : `${formatNumber(elapsedMs)} ms`, helper: 'Last request', icon: Clock3 },
                  { label: 'Input', value: formatNumber(usage?.prompt_tokens ?? 0), helper: 'tokens', icon: TerminalSquare },
                  { label: 'Output', value: formatNumber(usage?.completion_tokens ?? 0), helper: `${formatNumber(usage?.total_tokens ?? 0)} total`, icon: Cpu },
                ].map(stat => (
                  <div key={stat.label} className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
                    <div className="flex items-center gap-2 text-primary">
                      <stat.icon size={15} />
                      <p className="label text-white/45">{stat.label}</p>
                    </div>
                    <p className="mt-2 text-2xl font-semibold text-white">{stat.value}</p>
                    <p className="mt-1 text-xs text-white/40">{stat.helper}</p>
                  </div>
                ))}
              </div>
              {responseText || submitting ? (
                <div className={`${fullscreen ? 'min-h-[58vh]' : 'min-h-[460px]'} rounded-xl border border-white/5 bg-[#0b0b0b] p-5`}>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-white/80">{responseText}{submitting && <span className="ml-1 inline-block h-4 w-2 animate-pulse bg-primary align-middle" />}</p>
                </div>
              ) : (
                <div className={`${fullscreen ? 'min-h-[58vh]' : 'min-h-[460px]'} rounded-xl border border-white/5 bg-[#0b0b0b]`}>
                  <EmptyState icon={TerminalSquare} message="Send a request to see the provider response." />
                </div>
              )}
            </div>
          )}

          {activeSurface === 'vnc' && (
            <div className="space-y-4 p-5">
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className={vncSize === 'standard' ? 'btn-primary min-h-8 px-3 py-1.5 text-xs' : 'btn-ghost min-h-8 px-3 py-1.5 text-xs'} onClick={() => setVncSize('standard')}>Standard</button>
                <button type="button" className={vncSize === 'large' ? 'btn-primary min-h-8 px-3 py-1.5 text-xs' : 'btn-ghost min-h-8 px-3 py-1.5 text-xs'} onClick={() => setVncSize('large')}>Large</button>
                <button type="button" className="btn-ghost min-h-8 px-3 py-1.5 text-xs" onClick={() => setVncFrameKey(key => key + 1)} disabled={!vncUrl}><RotateCw size={13} />Reload</button>
              </div>
              {vncUrl ? (
                <iframe
                  key={vncFrameKey}
                  title="Playground VNC"
                  src={vncUrl}
                  className={`${fullscreen ? 'h-[calc(100vh-245px)] min-h-[620px]' : vncSize === 'large' ? 'h-[min(76vh,820px)] min-h-[640px]' : 'h-[560px]'} w-full rounded-xl border border-white/5 bg-[#080808]`}
                  allow="clipboard-read; clipboard-write"
                />
              ) : (
                <div className="min-h-[460px] rounded-xl border border-white/5 bg-[#0b0b0b]">
                  <EmptyState icon={Monitor} message="VNC endpoint is unavailable." />
                </div>
              )}
            </div>
          )}

          {activeSurface === 'json' && (
            <div className="grid gap-5 p-5 xl:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-semibold text-white">Request JSON</p>
                <pre className="max-h-[620px] min-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-white/5 bg-[#0b0b0b] p-4 text-xs text-white/70">{rawRequest || 'No request sent yet.'}</pre>
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold text-white">Response JSON</p>
                <pre className="max-h-[620px] min-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-white/5 bg-[#0b0b0b] p-4 text-xs text-white/70">{rawResponse || (result ? JSON.stringify(result, null, 2) : 'No response yet.')}</pre>
              </div>
            </div>
          )}

          {activeSurface === 'history' && (
            <div className="space-y-3 p-5">
              {history.map(item => (
                <div key={item.id} className="rounded-lg border border-white/10 bg-white/[0.025] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="break-all font-mono text-xs text-primary/70">{item.model}</p>
                    <span className="status-primary">{item.status}</span>
                  </div>
                  <p className="mt-2 text-xs text-white/45">{item.provider} · {item.mode} · {formatNumber(item.latency)} ms · {formatNumber(item.tokens)} tokens · {formatDate(item.at)}</p>
                </div>
              ))}
              {history.length === 0 && <EmptyState icon={Activity} message="No playground runs yet." />}
            </div>
          )}
        </section>
      </div>
    </>
  )

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 overflow-auto bg-[#080808] p-4 md:p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">API Playground</h1>
            <p className="mt-1 text-sm text-white/60">Fullscreen cockpit for master API requests, provider control, streaming output, and live VNC.</p>
          </div>
        </div>
        {workspace}
      </div>
    )
  }

  return (
    <Page title="API Playground" description="Super-admin master API testing with streaming, non-streaming, live VNC, request JSON, response JSON, and full audit logging.">
      {workspace}
    </Page>
  )
}

function ModelPicker({
  models,
  providers,
  value,
  onChange,
  disabled,
}: {
  models: ModelCatalog['models']
  providers: ModelCatalog['providers']
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const selected = models.find(item => item.id === value)
  const providerStatus = useMemo(() => new Map(providers.map(provider => [provider.name, provider])), [providers])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return models
    return models.filter(item =>
      item.displayName.toLowerCase().includes(q) ||
      item.id.toLowerCase().includes(q) ||
      item.provider.toLowerCase().includes(q) ||
      item.owned_by.toLowerCase().includes(q),
    )
  }, [models, query])

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function pick(id: string) {
    onChange(id)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        className="input group flex min-h-[76px] w-full items-center justify-between gap-3 border-primary/20 bg-white/[0.035] text-left transition hover:border-primary/50 hover:bg-white/[0.055] disabled:cursor-not-allowed disabled:opacity-60"
        onClick={() => !disabled && setOpen(item => !item)}
        disabled={disabled}
      >
        {selected ? (
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-white">{selected.displayName}</span>
            <span className="mt-1 block break-all font-mono text-xs text-primary/70">{selected.id}</span>
            <span className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-md border border-white/10 px-2 py-0.5 text-white/60">{selected.provider}</span>
              <span className="rounded-md border border-white/10 px-2 py-0.5 text-white/60">{selected.owned_by}</span>
              {providerStatus.get(selected.provider)?.sessionValid && <span className="status-primary">Connected</span>}
            </span>
          </span>
        ) : (
          <span className="text-white/50">Select a model</span>
        )}
        <ChevronDown size={18} className={`shrink-0 text-white/50 transition-transform group-hover:text-primary ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div ref={panelRef} className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-primary/20 bg-[#101010] shadow-2xl shadow-black/60">
          <div className="border-b border-white/10 p-3">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                className="input min-h-10 pl-9"
                autoFocus
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search model, provider, owner..."
              />
            </div>
          </div>
          <div className="max-h-[380px] overflow-auto p-2">
            {filtered.map(item => {
              const status = providerStatus.get(item.provider)
              const active = item.id === value
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`w-full rounded-lg px-3 py-3 text-left transition hover:bg-white/[0.07] ${active ? 'bg-primary/10 ring-1 ring-primary/25' : ''}`}
                  onClick={() => pick(item.id)}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-white">{item.displayName}</span>
                      <span className="mt-1 block break-all font-mono text-xs text-primary/60">{item.id}</span>
                      <span className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-md border border-white/10 px-2 py-0.5 text-white/60">{item.provider}</span>
                        <span className="rounded-md border border-white/10 px-2 py-0.5 text-white/60">{item.owned_by}</span>
                        <span className={status?.sessionValid ? 'status-primary' : 'status-warning'}>
                          {status?.sessionValid ? 'Connected' : status?.hasProfile ? 'Profile found' : 'Disconnected'}
                        </span>
                      </span>
                    </span>
                    {active && <Check size={16} className="mt-0.5 shrink-0 text-primary" />}
                  </span>
                </button>
              )
            })}
            {filtered.length === 0 && (
              <div className="px-3 py-8 text-center text-sm text-white/50">No models match your search.</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
