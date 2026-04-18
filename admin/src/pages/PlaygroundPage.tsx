import * as React from "react"
import {
  Activity, Check, ChevronDown, Cpu, ExternalLink, Loader2, Maximize2, Minimize2,
  Monitor, PlugZap, Radio, RefreshCw, RefreshCcw, Search, Send, TerminalSquare,
} from "lucide-react"
import { api } from "~/lib/api"
import { formatDate } from "~/lib/utils"
import { PageHeader } from "~/components/shared/PageHeader"
import { Badge } from "~/components/ui/badge"
import type { ModelCatalog, PlaygroundResponse } from "~/types"

export function PlaygroundPage() {
  const [catalog, setCatalog] = React.useState<ModelCatalog | null>(null)
  const [model, setModel] = React.useState("")
  const [systemPrompt, setSystemPrompt] = React.useState("You are a precise assistant for operational testing.")
  const [prompt, setPrompt] = React.useState("")
  const [mode, setMode] = React.useState<"standard" | "stream">("standard")
  const [temperature, setTemperature] = React.useState(0.7)
  const [maxTokens, setMaxTokens] = React.useState(800)
  const [newConversation, setNewConversation] = React.useState(true)
  const [showVnc, setShowVnc] = React.useState(true)
  const [vncSize, setVncSize] = React.useState<"standard" | "large">("standard")
  const [vncFrameKey, setVncFrameKey] = React.useState(0)
  const [fullscreen, setFullscreen] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [responseText, setResponseText] = React.useState("")
  const [usage, setUsage] = React.useState<PlaygroundResponse["usage"] | null>(null)
  const [rawRequest, setRawRequest] = React.useState("")
  const [rawResponse, setRawResponse] = React.useState("")
  const [elapsedMs, setElapsedMs] = React.useState<number | null>(null)
  const [abortController, setAbortController] = React.useState<AbortController | null>(null)
  const [result, setResult] = React.useState<PlaygroundResponse | null>(null)
  const [history, setHistory] = React.useState<Array<{ id: string; at: string; model: string; provider: string; mode: string; latency: number; tokens: number; status: string }>>([])

  async function load() {
    setLoading(true)
    try {
      const next = await api.providers.models()
      setCatalog(next)
      setModel(current => current || next.models[0]?.id || "")
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => { load() }, [])

  const selectedModel = catalog?.models.find(item => item.id === model)
  const selectedProvider = catalog?.providers.find(provider => provider.name === selectedModel?.provider)
  const vncUrl = catalog?.vnc.url

  async function submitReq(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setResult(null)
    setResponseText("")
    setUsage(null)
    setRawResponse("")
    setElapsedMs(null)

    const trimmedPrompt = prompt.trim()
    if (!model) { setError("Select a model before sending a request."); return }
    if (!trimmedPrompt) { setError("Enter a user prompt before sending a request."); return }

    setSubmitting(true)
    const startedAt = performance.now()
    try {
      const messages = [
        ...(systemPrompt.trim() ? [{ role: "system" as const, content: systemPrompt.trim() }] : []),
        { role: "user" as const, content: trimmedPrompt },
      ]
      const payload = {
        model, messages, stream: mode === "stream",
        temperature, max_tokens: maxTokens, newConversation,
      }
      setRawRequest(JSON.stringify(payload, null, 2))

      if (mode === "stream") {
        const controller = new AbortController()
        setAbortController(controller)
        let streamed = ""
        let finalPayload: Partial<PlaygroundResponse> & { usage?: PlaygroundResponse["usage"] } = {}

        await api.playground.stream(payload, {
          signal: controller.signal,
          onChunk: chunk => { streamed += chunk; setResponseText(streamed) },
          onDone: payload => { finalPayload = payload; if (payload.usage) setUsage(payload.usage) },
          onError: message => setError(message),
        })

        const elapsed = Math.round(performance.now() - startedAt)
        const finalUsage = finalPayload.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
        const responsePayload = { ...finalPayload, model, provider: selectedModel?.provider ?? "unknown", choices: [{ index: 0, message: { role: "assistant", content: streamed }, finish_reason: "stop" }], usage: finalUsage }
        setElapsedMs(elapsed)
        setUsage(finalUsage)
        setRawResponse(JSON.stringify(responsePayload, null, 2))
        setHistory(items => [{ id: `${Date.now()}`, at: new Date().toISOString(), model, provider: selectedModel?.provider ?? "unknown", mode: "stream", latency: elapsed, tokens: finalUsage.total_tokens, status: streamed ? "ok" : "empty" }, ...items].slice(0, 8))
      } else {
        const next = await api.playground.chat(payload)
        const elapsed = Math.round(performance.now() - startedAt)
        setResult(next)
        setResponseText(next.choices[0]?.message.content ?? "")
        setUsage(next.usage)
        setElapsedMs(elapsed)
        setRawResponse(JSON.stringify(next, null, 2))
        setHistory(items => [{ id: next.id, at: new Date().toISOString(), model: next.model, provider: next.provider, mode: "standard", latency: elapsed, tokens: next.usage.total_tokens, status: "ok" }, ...items].slice(0, 8))
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") setError("Streaming request stopped.")
      else setError(err instanceof Error ? err.message : "Playground request failed")
    } finally {
      setSubmitting(false)
      setAbortController(null)
    }
  }

  async function providerAction(operation: "login" | "logout") {
    if (!selectedModel) return
    setError(null)
    try {
      if (operation === "login") await api.providers.login(selectedModel.provider)
      else await api.providers.logout(selectedModel.provider)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Provider action failed")
    }
  }

  const content = (
    <>
      {error && <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">{error}</div>}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex flex-wrap gap-2">
          <button className={mode === "standard" ? "btn-primary" : "btn-ghost"} onClick={() => setMode("standard")} disabled={submitting}>Non-streaming</button>
          <button className={mode === "stream" ? "btn-primary" : "btn-ghost"} onClick={() => setMode("stream")} disabled={submitting}><Radio size={16} /> Streaming</button>
          <button className={showVnc ? "btn-primary" : "btn-ghost"} onClick={() => setShowVnc(!showVnc)}><Monitor size={16} /> VNC</button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={load} disabled={loading}><RefreshCcw className={loading ? "animate-spin" : ""} size={16} /> Refresh</button>
          <button className="btn-ghost" onClick={() => setFullscreen(!fullscreen)}>
            {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            {fullscreen ? "Exit fullscreen" : "Fullscreen"}
          </button>
        </div>
      </div>

      <div className={`grid gap-5 ${fullscreen ? "xl:grid-cols-[380px_minmax(0,1fr)_430px]" : "xl:grid-cols-[380px_minmax(0,1fr)] 2xl:grid-cols-[380px_minmax(0,1fr)_430px]"}`}>
        {/* Left: Request cockpit */}
        <div className="panel p-5 space-y-4">
          <h3 className="text-base font-semibold">Request cockpit</h3>
          <p className="text-xs text-muted-foreground">Choose execution mode, model, parameters, and provider session state.</p>

          <form className="space-y-4" onSubmit={submitReq}>
            <div>
              <label className="label" htmlFor="model-select">Model</label>
              <ModelPicker
                models={catalog?.models ?? []}
                providers={catalog?.providers ?? []}
                value={model}
                onChange={setModel}
                disabled={loading || submitting}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="label">Provider</p>
                <div className="flex items-center gap-2 mt-1">
                  <PlugZap size={14} className="text-muted-foreground" />
                  <span className="text-sm">{selectedModel?.provider ?? "None"}</span>
                  {selectedProvider?.sessionValid && <span className="status-success text-xs">Connected</span>}
                </div>
              </div>
              <div>
                <p className="label">Mode</p>
                <div className="flex items-center gap-2 mt-1">
                  <TerminalSquare size={14} className="text-muted-foreground" />
                  <span className="text-sm">Unlimited</span>
                </div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="temp">Temperature</label>
                <input id="temp" className="input" type="number" min="0" max="2" step="0.1" value={temperature} onChange={e => setTemperature(Number(e.target.value))} />
              </div>
              <div>
                <label className="label" htmlFor="maxtokens">Max tokens</label>
                <input id="maxtokens" className="input" type="number" min="1" max="32000" value={maxTokens} onChange={e => setMaxTokens(Number(e.target.value))} />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="system-prompt">System prompt</label>
              <textarea id="system-prompt" className="input min-h-20 resize-y" value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="user-prompt">User prompt</label>
              <textarea id="user-prompt" className="input min-h-32 resize-y" value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Write the request to test..." />
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={newConversation} onChange={e => setNewConversation(e.target.checked)} className="w-4 h-4 rounded border-border bg-background-secondary text-primary focus:ring-primary/20" />
              Start a fresh provider conversation
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <button className="btn-primary" type="submit" disabled={submitting || loading || !model}>
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {mode === "stream" ? "Start stream" : "Send request"}
              </button>
              <button className="btn-ghost" type="button" disabled={!submitting || !abortController} onClick={() => abortController?.abort()}>Stop stream</button>
            </div>
          </form>

          <div className="border-t border-border pt-4">
            <p className="label mb-3">Provider controls</p>
            <div className="flex flex-wrap gap-2">
              <button className="btn-ghost" onClick={() => providerAction("login")} disabled={!selectedModel || selectedModel.provider.endsWith("-api")}>Login</button>
              <button className="btn-ghost" onClick={() => providerAction("logout")} disabled={!selectedModel}>Logout</button>
              {vncUrl && <a className="btn-ghost flex items-center gap-1" href={vncUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open VNC</a>}
            </div>
          </div>
        </div>

        {/* Center: Response */}
        <div className="space-y-5">
          <div className="panel p-5">
            <h3 className="text-base font-semibold mb-3">Live response</h3>
            <div className="grid gap-3 sm:grid-cols-4 mb-4">
              {[
                { label: "Mode", value: mode === "stream" ? "Stream" : "Standard", helper: submitting ? "Running" : "Ready" },
                { label: "Latency", value: elapsedMs === null ? "-" : `${elapsedMs} ms`, helper: "Last request" },
                { label: "Input", value: `${usage?.prompt_tokens ?? 0}`, helper: "tokens" },
                { label: "Output", value: `${usage?.total_tokens ?? 0}`, helper: "total" },
              ].map(stat => (
                <div key={stat.label} className="flex items-start gap-2">
                  <Cpu size={14} className="text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                    <p className="text-sm font-semibold">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.helper}</p>
                  </div>
                </div>
              ))}
            </div>
            {responseText || submitting ? (
              <div className={`${fullscreen ? "min-h-[48vh]" : "min-h-64"} rounded-lg bg-muted/50 p-4`}>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{responseText}{submitting && <span className="ml-1 inline-block h-4 w-1.5 animate-pulse bg-primary align-middle" />}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <TerminalSquare size={24} className="text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">Send a request to see the provider response.</p>
              </div>
            )}
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <div className="panel p-5">
              <h3 className="text-base font-semibold mb-2">Request JSON</h3>
              <pre className="max-h-48 overflow-auto rounded-lg bg-muted/50 p-3 text-xs font-mono">{rawRequest || "No request sent yet."}</pre>
            </div>
            <div className="panel p-5">
              <h3 className="text-base font-semibold mb-2">Response JSON</h3>
              <pre className="max-h-48 overflow-auto rounded-lg bg-muted/50 p-3 text-xs font-mono">{rawResponse || (result ? JSON.stringify(result, null, 2) : "No response yet.")}</pre>
            </div>
          </div>
        </div>

        {/* Right: VNC + History */}
        <div className={`space-y-5 ${showVnc ? "" : "hidden 2xl:block"}`}>
          {showVnc && (
            <div className="panel p-5">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">Live VNC</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Use Large when provider controls are clipped.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={vncSize === "standard" ? "btn-primary min-h-8 px-3 py-1.5 text-xs" : "btn-ghost min-h-8 px-3 py-1.5 text-xs"} onClick={() => setVncSize("standard")}>Standard</button>
                  <button type="button" className={vncSize === "large" ? "btn-primary min-h-8 px-3 py-1.5 text-xs" : "btn-ghost min-h-8 px-3 py-1.5 text-xs"} onClick={() => setVncSize("large")}>Large</button>
                  <button type="button" className="btn-ghost min-h-8 px-3 py-1.5 text-xs" onClick={() => setVncFrameKey(key => key + 1)}><RefreshCw size={13} />Reload</button>
                </div>
              </div>
              {vncUrl ? (
                <iframe
                  key={vncFrameKey}
                  title="Playground VNC"
                  src={vncUrl}
                  className={`${fullscreen ? "h-[calc(100vh-230px)] min-h-[520px]" : vncSize === "large" ? "h-[min(78vh,820px)] min-h-[560px]" : "h-[460px]"} w-full rounded-lg border border-border bg-[#101411]`}
                  allow="clipboard-read; clipboard-write"
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-48 text-center">
                  <Monitor size={24} className="text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">VNC endpoint is unavailable.</p>
                </div>
              )}
            </div>
          )}
          <div className="panel p-5">
            <h3 className="text-base font-semibold mb-3">Run history</h3>
            <div className="space-y-3">
              {history.map(item => (
                <div key={item.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-mono text-xs">{item.model}</p>
                    <Badge variant={item.status === "ok" ? "success" : "warning"}>{item.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{item.provider} · {item.mode} · {item.latency}ms · {item.tokens} tokens · {formatDate(item.at)}</p>
                </div>
              ))}
              {history.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Activity size={24} className="text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No playground runs yet.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 overflow-auto bg-background p-4 md:p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">API Playground</h1>
            <p className="mt-1 text-sm text-muted-foreground">Fullscreen cockpit for master API requests.</p>
          </div>
        </div>
        {content}
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="API Playground"
        description="Super-admin master API testing with streaming, non-streaming, live VNC, and JSON inspection."
      />
      {content}
    </div>
  )
}

function ModelPicker({
  models,
  providers,
  value,
  onChange,
  disabled,
}: {
  models: ModelCatalog["models"]
  providers: ModelCatalog["providers"]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const buttonRef = React.useRef<HTMLButtonElement | null>(null)
  const panelRef = React.useRef<HTMLDivElement | null>(null)
  const selected = models.find(item => item.id === value)
  const providerStatus = React.useMemo(() => new Map(providers.map(provider => [provider.name, provider])), [providers])

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return models
    return models.filter(item =>
      item.displayName.toLowerCase().includes(q) ||
      item.id.toLowerCase().includes(q) ||
      item.provider.toLowerCase().includes(q) ||
      item.owned_by.toLowerCase().includes(q),
    )
  }, [models, query])

  React.useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  function pick(id: string) {
    onChange(id)
    setOpen(false)
    setQuery("")
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        id="model-select"
        type="button"
        className="input flex min-h-[68px] items-center justify-between gap-3 text-left"
        onClick={() => !disabled && setOpen(item => !item)}
        disabled={disabled}
      >
        {selected ? (
          <span className="min-w-0">
            <span className="block truncate font-medium">{selected.displayName}</span>
            <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono">{selected.id}</span>
              <span className="rounded-md border border-white/10 px-1.5 py-0.5">{selected.provider}</span>
              {providerStatus.get(selected.provider)?.sessionValid && <span className="status-success rounded-md px-1.5 py-0.5 text-[11px]">Connected</span>}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">Select a model</span>
        )}
        <ChevronDown size={18} className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div ref={panelRef} className="absolute z-40 mt-2 w-full overflow-hidden rounded-lg border border-white/10 bg-popover shadow-xl">
          <div className="border-b border-white/10 p-3">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                className="input min-h-10 pl-9"
                autoFocus
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search by model, provider, or owner"
              />
            </div>
          </div>
          <div className="max-h-[360px] overflow-auto p-2">
            {filtered.map(item => {
              const status = providerStatus.get(item.provider)
              const active = item.id === value
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`w-full rounded-lg px-3 py-3 text-left transition-colors hover:bg-white/[0.08] ${active ? "bg-primary/10" : ""}`}
                  onClick={() => pick(item.id)}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{item.displayName}</span>
                      <span className="mt-1 block break-all font-mono text-xs text-muted-foreground">{item.id}</span>
                      <span className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-md border border-white/10 px-2 py-0.5 text-muted-foreground">{item.provider}</span>
                        <span className="rounded-md border border-white/10 px-2 py-0.5 text-muted-foreground">{item.owned_by}</span>
                        <span className={status?.sessionValid ? "status-success rounded-md px-2 py-0.5" : "status-warning rounded-md px-2 py-0.5"}>
                          {status?.sessionValid ? "Connected" : status?.hasProfile ? "Profile found" : "Disconnected"}
                        </span>
                      </span>
                    </span>
                    {active && <Check size={16} className="mt-0.5 shrink-0 text-primary" />}
                  </span>
                </button>
              )
            })}
            {filtered.length === 0 && (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">No models match your search.</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
