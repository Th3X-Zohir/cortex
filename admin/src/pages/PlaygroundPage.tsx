import { useEffect, useMemo, useState } from 'react'
import {
  ExternalLink,
  Loader2,
  Play,
  RefreshCw,
  Send,
  Square,
  TerminalSquare,
} from 'lucide-react'
import { api } from '@/lib/api'
import { formatDate, formatNumber } from '@/lib/utils'
import type { ModelCatalog, PlaygroundResponse } from '@/types'
import {
  BusyPanel,
  Chip,
  EmptyPanel,
  ErrorBanner,
  PageShell,
  Surface,
  SurfaceHeader,
} from '@/components/dashboard/UiKit'

type HistoryItem = {
  id: string
  at: string
  model: string
  provider: string
  mode: 'stream' | 'standard'
  latencyMs: number
  totalTokens: number
  status: 'ok' | 'error'
}

export function PlaygroundPage() {
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null)
  const [loadingCatalog, setLoadingCatalog] = useState(true)
  const [model, setModel] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('You are a precise assistant for operational testing.')
  const [prompt, setPrompt] = useState('')
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(1000)
  const [stream, setStream] = useState(false)
  const [newConversation, setNewConversation] = useState(true)
  const [running, setRunning] = useState(false)
  const [responseText, setResponseText] = useState('')
  const [rawRequest, setRawRequest] = useState('')
  const [rawResponse, setRawResponse] = useState('')
  const [usage, setUsage] = useState<PlaygroundResponse['usage'] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [activeTab, setActiveTab] = useState<'response' | 'json' | 'history' | 'vnc'>('response')
  const [abortController, setAbortController] = useState<AbortController | null>(null)

  async function loadCatalog() {
    setLoadingCatalog(true)
    setError(null)
    try {
      const next = await api.providers.models()
      setCatalog(next)
      // Default to a ChatGPT model; only fall back if none are registered.
      const chatgptDefault = next.models.find(m => m.provider === 'chatgpt')?.id
      setModel(current => current || chatgptDefault || next.models[0]?.id || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load models')
    } finally {
      setLoadingCatalog(false)
    }
  }

  useEffect(() => {
    void loadCatalog()
  }, [])

  const selectedModel = useMemo(() => catalog?.models.find(item => item.id === model), [catalog?.models, model])
  const selectedProvider = useMemo(
    () => catalog?.providers.find(item => item.name === selectedModel?.provider),
    [catalog?.providers, selectedModel?.provider],
  )

  async function runRequest(event: React.FormEvent) {
    event.preventDefault()
    if (!model) {
      setError('Select a model before sending a request.')
      return
    }
    if (!prompt.trim()) {
      setError('Enter a prompt before sending a request.')
      return
    }

    setError(null)
    setRunning(true)
    setResponseText('')
    setRawResponse('')
    setUsage(null)

    const messages = [
      ...(systemPrompt.trim() ? [{ role: 'system' as const, content: systemPrompt.trim() }] : []),
      { role: 'user' as const, content: prompt.trim() },
    ]

    const payload = {
      model,
      messages,
      stream,
      temperature,
      max_tokens: maxTokens,
      newConversation,
    }

    setRawRequest(JSON.stringify(payload, null, 2))

    const started = performance.now()

    try {
      if (stream) {
        const controller = new AbortController()
        setAbortController(controller)
        let finalText = ''
        let finalUsage: PlaygroundResponse['usage'] = {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        }

        await api.playground.stream(payload, {
          signal: controller.signal,
          onChunk: chunk => {
            finalText += chunk
            setResponseText(finalText)
          },
          onDone: donePayload => {
            if (donePayload.usage) {
              finalUsage = donePayload.usage
              setUsage(donePayload.usage)
            }
          },
          onError: message => {
            setError(message)
          },
        })

        const elapsed = Math.round(performance.now() - started)
        const responseShape = {
          id: `stream-${Date.now()}`,
          object: 'chat.completion',
          model,
          provider: selectedModel?.provider ?? 'unknown',
          choices: [{ index: 0, message: { role: 'assistant', content: finalText }, finish_reason: 'stop' }],
          usage: finalUsage,
        }

        setRawResponse(JSON.stringify(responseShape, null, 2))
        pushHistory({
          id: responseShape.id,
          at: new Date().toISOString(),
          model,
          provider: selectedModel?.provider ?? 'unknown',
          mode: 'stream',
          latencyMs: elapsed,
          totalTokens: finalUsage.total_tokens,
          status: finalText ? 'ok' : 'error',
        })
      } else {
        const response = await api.playground.chat(payload)
        const elapsed = Math.round(performance.now() - started)
        const assistant = response.choices[0]?.message.content ?? ''
        setResponseText(assistant)
        setUsage(response.usage)
        setRawResponse(JSON.stringify(response, null, 2))

        pushHistory({
          id: response.id,
          at: new Date().toISOString(),
          model: response.model,
          provider: response.provider,
          mode: 'standard',
          latencyMs: elapsed,
          totalTokens: response.usage.total_tokens,
          status: 'ok',
        })
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setError('Streaming request stopped.')
      } else {
        setError(err instanceof Error ? err.message : 'Playground request failed')
      }
      pushHistory({
        id: `error-${Date.now()}`,
        at: new Date().toISOString(),
        model,
        provider: selectedModel?.provider ?? 'unknown',
        mode: stream ? 'stream' : 'standard',
        latencyMs: Math.round(performance.now() - started),
        totalTokens: 0,
        status: 'error',
      })
    } finally {
      setRunning(false)
      setAbortController(null)
    }
  }

  function pushHistory(item: HistoryItem) {
    setHistory(current => [item, ...current].slice(0, 12))
  }

  async function providerAction(action: 'login' | 'logout') {
    if (!selectedModel) return
    setError(null)

    try {
      if (action === 'login') await api.providers.login(selectedModel.provider)
      else await api.providers.logout(selectedModel.provider)
      await loadCatalog()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Provider action failed')
    }
  }

  return (
    <PageShell
      title="API Playground"
      description="Send real chat requests, validate streaming behavior, inspect payloads, and control provider sessions."
      action={
        <>
          <button type="button" className="ui-btn-secondary" onClick={() => void loadCatalog()} disabled={loadingCatalog}>
            <RefreshCw size={14} className={loadingCatalog ? 'animate-spin' : ''} /> Refresh models
          </button>
          {catalog?.vnc.url ? (
            <a className="ui-btn-secondary" href={catalog.vnc.url} target="_blank" rel="noreferrer">
              <ExternalLink size={14} /> Open VNC
            </a>
          ) : null}
        </>
      }
    >
      {error ? <ErrorBanner text={error} /> : null}

      <section className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
        <Surface>
          <SurfaceHeader title="Request Builder" description="Compose a model request with stream and generation settings." />

          {loadingCatalog ? (
            <BusyPanel text="Loading model catalog..." />
          ) : (
            <form className="space-y-4" onSubmit={runRequest}>
              <div>
                <label className="ui-label">Model</label>
                <select className="ui-input" value={model} onChange={event => setModel(event.target.value)}>
                  {(() => {
                    const models = catalog?.models ?? []
                    // ChatGPT first, then everything else in original order.
                    const order = (p: string) => p === 'chatgpt' ? 0 : 1
                    return [...models]
                      .sort((a, b) => order(a.provider) - order(b.provider))
                      .map(item => (
                        <option key={item.id} value={item.id}>{item.displayName} ({item.id})</option>
                      ))
                  })()}
                </select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="ui-label">Temperature</label>
                  <input
                    className="ui-input"
                    type="number"
                    min={0}
                    max={2}
                    step={0.1}
                    value={temperature}
                    onChange={event => setTemperature(Number(event.target.value))}
                  />
                </div>
                <div>
                  <label className="ui-label">Max tokens</label>
                  <input
                    className="ui-input"
                    type="number"
                    min={1}
                    max={32000}
                    value={maxTokens}
                    onChange={event => setMaxTokens(Number(event.target.value))}
                  />
                </div>
              </div>

              <div>
                <label className="ui-label">System prompt</label>
                <textarea className="ui-textarea" value={systemPrompt} onChange={event => setSystemPrompt(event.target.value)} />
              </div>

              <div>
                <label className="ui-label">User prompt</label>
                <textarea
                  className="ui-textarea min-h-40"
                  value={prompt}
                  placeholder="Type the prompt to test here..."
                  onChange={event => setPrompt(event.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={stream} onChange={event => setStream(event.target.checked)} className="h-4 w-4" />
                  Enable stream mode
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={newConversation}
                    onChange={event => setNewConversation(event.target.checked)}
                    className="h-4 w-4"
                  />
                  Start new provider conversation
                </label>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <button type="submit" className="ui-btn-primary w-full" disabled={running}>
                  {running ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Send request
                </button>
                <button
                  type="button"
                  className="ui-btn-secondary w-full"
                  disabled={!running || !abortController}
                  onClick={() => abortController?.abort()}
                >
                  <Square size={14} /> Stop stream
                </button>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Provider Session</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Chip tone={selectedProvider?.sessionValid ? 'good' : selectedProvider?.hasProfile ? 'warn' : 'bad'}>
                    {selectedProvider?.sessionValid ? 'Connected' : selectedProvider?.hasProfile ? 'Profile ready' : 'Disconnected'}
                  </Chip>
                  <button type="button" className="ui-btn-secondary min-h-8 px-3 text-xs" onClick={() => void providerAction('login')}>
                    <Play size={12} /> Login
                  </button>
                  <button type="button" className="ui-btn-secondary min-h-8 px-3 text-xs" onClick={() => void providerAction('logout')}>
                    <Square size={12} /> Logout
                  </button>
                </div>
              </div>
            </form>
          )}
        </Surface>

        <Surface>
          <SurfaceHeader
            title="Result Workspace"
            description="Read the assistant output, inspect JSON, or open interactive VNC."
            action={
              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                {[
                  ['response', 'Response'],
                  ['json', 'JSON'],
                  ['history', 'History'],
                  ['vnc', 'VNC'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={activeTab === value ? 'ui-btn-primary min-h-8 px-3 text-xs' : 'ui-btn-secondary min-h-8 border-transparent px-3 text-xs'}
                    onClick={() => setActiveTab(value as typeof activeTab)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            }
          />

          {activeTab === 'response' ? (
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Mode</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{stream ? 'Stream' : 'Standard'}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Prompt Tokens</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{formatNumber(usage?.prompt_tokens ?? 0)}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Total Tokens</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{formatNumber(usage?.total_tokens ?? 0)}</p>
                </div>
              </div>

              <div className="min-h-[420px] overflow-auto rounded-2xl border border-slate-200 bg-slate-950 p-4 text-sm leading-6 text-slate-100 ui-scroll">
                {responseText ? responseText : running ? 'Waiting for response chunks...' : 'No response yet.'}
                {running ? <span className="ml-1 inline-block h-4 w-2 animate-pulse bg-blue-400 align-middle" /> : null}
              </div>
            </div>
          ) : null}

          {activeTab === 'json' ? (
            <div className="grid gap-4 xl:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Request JSON</p>
                <pre className="ui-scroll min-h-[420px] overflow-auto rounded-2xl border border-slate-200 bg-slate-900 p-4 text-xs text-slate-100">
                  {rawRequest || 'No request sent yet.'}
                </pre>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Response JSON</p>
                <pre className="ui-scroll min-h-[420px] overflow-auto rounded-2xl border border-slate-200 bg-slate-900 p-4 text-xs text-slate-100">
                  {rawResponse || 'No response yet.'}
                </pre>
              </div>
            </div>
          ) : null}

          {activeTab === 'history' ? (
            history.length ? (
              <div className="space-y-2">
                {history.map(item => (
                  <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-mono text-xs text-slate-700">{item.model}</p>
                      <Chip tone={item.status === 'ok' ? 'good' : 'bad'}>{item.status}</Chip>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">
                      {item.provider} • {item.mode} • {formatNumber(item.latencyMs)} ms • {formatNumber(item.totalTokens)} tokens • {formatDate(item.at)}
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyPanel text="No playground runs in this session yet." />
            )
          ) : null}

          {activeTab === 'vnc' ? (
            catalog?.vnc.url ? (
              <iframe
                title="Playground VNC"
                src={catalog.vnc.url}
                className="h-[620px] w-full rounded-2xl border border-slate-200 bg-white"
                allow="clipboard-read; clipboard-write"
              />
            ) : (
              <EmptyPanel text="VNC endpoint is unavailable in this environment." />
            )
          ) : null}
        </Surface>
      </section>

      <Surface className="bg-gradient-to-br from-blue-50 to-white">
        <div className="flex items-center gap-2 text-blue-700">
          <TerminalSquare size={15} />
          <p className="text-sm font-semibold">Playground Notes</p>
        </div>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>Streaming mode is ideal for validating long-running responses and chunk delivery behavior.</li>
          <li>Use VNC for provider login steps when a provider session is disconnected.</li>
          <li>Every run in this page is logged through admin endpoints and appears in the logs section.</li>
        </ul>
      </Surface>
    </PageShell>
  )
}
