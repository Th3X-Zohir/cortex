import { useRef, useState } from 'react'
import { BookOpen, Copy, ExternalLink, Loader2, Send, TerminalSquare } from 'lucide-react'

export function PublicDocsPage() {
  const base = window.location.origin
  const [copied, setCopied] = useState<string | null>(null)

  function copy(text: string, id: string) {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  function CodeBlock({ id, code }: { id: string; code: string }) {
    return (
      <div className="relative mt-2 rounded-xl border border-slate-200 bg-slate-900 p-4">
        <button
          type="button"
          className="absolute right-3 top-3 flex items-center gap-1 rounded-lg bg-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-600"
          onClick={() => copy(code, id)}
        >
          <Copy size={11} />
          {copied === id ? 'Copied!' : 'Copy'}
        </button>
        <pre className="overflow-x-auto text-xs text-slate-300">{code}</pre>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="Cortex" className="h-8 w-auto" />
            <div>
              <p className="text-sm font-bold text-slate-900">Cortex API</p>
              <p className="text-xs text-slate-500">Developer Reference</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/admin/"
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Sign in
            </a>
            <a
              href="/admin/"
              className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-700"
            >
              Get API key <ExternalLink size={13} />
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-10 space-y-8">
        {/* Hero */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <BookOpen size={20} className="text-teal-600" />
            <span className="text-sm font-semibold uppercase tracking-wider text-teal-600">API Reference</span>
          </div>
          <h1 className="text-4xl font-bold text-slate-900">Cortex API</h1>
          <p className="mt-3 text-lg text-slate-600 max-w-2xl">
            A drop-in OpenAI-compatible proxy. Point any OpenAI SDK at this server and start using it immediately.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {['OpenAI compatible', 'Multi-provider', 'Streaming', 'Usage tracking'].map(tag => (
              <span key={tag} className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">{tag}</span>
            ))}
          </div>
        </div>

        {/* Quick start */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-3">
          <h2 className="text-xl font-bold text-slate-900">Quick Start</h2>
          <p className="text-sm text-slate-600">Make your first request in under a minute.</p>
          <CodeBlock id="qs" code={`curl ${base}/v1/chat/completions \\
  -H "Authorization: Bearer cx-your-api-key-here" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Hello!"}]}'`} />
          <p className="text-sm text-slate-500">
            Don't have a key yet?{' '}
            <a href="/admin/" className="font-semibold text-teal-600 hover:underline">Register and request one →</a>
          </p>
        </section>

        {/* Base URL */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-3">
          <h2 className="text-xl font-bold text-slate-900">Base URL</h2>
          <CodeBlock id="base" code={`${base}/v1`} />
        </section>

        {/* Authentication */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-3">
          <h2 className="text-xl font-bold text-slate-900">Authentication</h2>
          <p className="text-sm text-slate-600">
            All requests require an API key passed as a Bearer token in the{' '}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs font-mono">Authorization</code> header.
          </p>
          <CodeBlock id="auth" code={`Authorization: Bearer cx-your-api-key-here`} />
        </section>

        {/* Endpoints */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-6">
          <h2 className="text-xl font-bold text-slate-900">Endpoints</h2>

          {/* Chat completions */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700">POST</span>
              <code className="text-sm font-semibold text-slate-800">/v1/chat/completions</code>
            </div>
            <p className="text-sm text-slate-600">Create a chat completion. Supports streaming via SSE.</p>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Parameter</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Type</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Required</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[
                    ['model', 'string', 'Yes', 'Model ID — e.g. gpt-4o, claude-3-5-sonnet, gemini-2.0-flash'],
                    ['messages', 'array', 'Yes', 'Array of {role, content} objects'],
                    ['stream', 'boolean', 'No', 'Stream chunks via SSE (default: false)'],
                    ['temperature', 'number', 'No', 'Sampling temperature 0–2'],
                    ['max_tokens', 'number', 'No', 'Max tokens in the completion'],
                    ['system', 'string', 'No', 'System prompt (alternative to messages[0].role="system")'],
                  ].map(([p, t, r, d]) => (
                    <tr key={p} className="bg-white">
                      <td className="px-3 py-2 font-mono font-semibold text-slate-800">{p}</td>
                      <td className="px-3 py-2 text-slate-500">{t}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${r === 'Yes' ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500'}`}>{r}</span>
                      </td>
                      <td className="px-3 py-2 text-slate-600">{d}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <CodeBlock id="chat-resp" code={`{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "model": "gpt-4o",
  "choices": [{
    "index": 0,
    "message": { "role": "assistant", "content": "Hello! How can I help?" },
    "finish_reason": "stop"
  }],
  "usage": { "prompt_tokens": 10, "completion_tokens": 9, "total_tokens": 19 }
}`} />
          </div>

          <hr className="border-slate-100" />

          {/* Models */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-700">GET</span>
              <code className="text-sm font-semibold text-slate-800">/v1/models</code>
            </div>
            <p className="text-sm text-slate-600">List all available models across configured providers.</p>
            <CodeBlock id="models-resp" code={`{
  "object": "list",
  "data": [
    { "id": "gpt-4o", "object": "model", "owned_by": "chatgpt" },
    { "id": "claude-3-5-sonnet", "object": "model", "owned_by": "claude" },
    { "id": "gemini-2.0-flash", "object": "model", "owned_by": "gemini" }
  ]
}`} />
          </div>
        </section>

        {/* SDK examples */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
          <h2 className="text-xl font-bold text-slate-900">SDK Examples</h2>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">Python</h3>
            <CodeBlock id="py" code={`from openai import OpenAI

client = OpenAI(
    api_key="cx-your-api-key-here",
    base_url="${base}/v1"
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)`} />
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">JavaScript / TypeScript</h3>
            <CodeBlock id="js" code={`import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: 'cx-your-api-key-here',
  baseURL: '${base}/v1',
  dangerouslyAllowBrowser: true, // only for browser usage
})

const response = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello!' }],
})
console.log(response.choices[0].message.content)`} />
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">Streaming (Python)</h3>
            <CodeBlock id="py-stream" code={`from openai import OpenAI

client = OpenAI(api_key="cx-your-api-key-here", base_url="${base}/v1")

with client.chat.completions.stream(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Tell me a joke"}],
) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)`} />
          </div>
        </section>

        {/* Try it */}
        <TryItSection base={base} />

        {/* Footer */}
        <footer className="border-t border-slate-200 pt-6 pb-10 text-center text-xs text-slate-400">
          Powered by <span className="font-semibold text-slate-600">Cortex</span> ·{' '}
          <a href="/admin/" className="hover:underline">Sign in</a>
        </footer>
      </div>
    </div>
  )
}

function TryItSection({ base }: { base: string }) {
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('gpt-4o')
  const [message, setMessage] = useState('')
  const [response, setResponse] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  async function send() {
    if (!apiKey.trim() || !message.trim()) return
    setResponse('')
    setError(null)
    setStreaming(true)
    abortRef.current = new AbortController()

    try {
      const res = await fetch(`${base}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({ model, stream: true, messages: [{ role: 'user', content: message }] }),
        signal: abortRef.current.signal,
      })

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        const msg = typeof payload.error === 'string' ? payload.error : payload.error?.message
        throw new Error(msg || `HTTP ${res.status}`)
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop() || ''
        for (const part of parts) {
          for (const line of part.split('\n')) {
            if (!line.startsWith('data: ')) continue
            const raw = line.slice(6).trim()
            if (!raw || raw === '[DONE]') continue
            try {
              const chunk = JSON.parse(raw)
              const delta = chunk.choices?.[0]?.delta?.content
              if (delta) setResponse(prev => prev + delta)
            } catch { /* ignore */ }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') setError(err.message)
    } finally {
      setStreaming(false)
    }
  }

  return (
    <section className="rounded-2xl border border-teal-200 bg-teal-50/50 p-6 space-y-4">
      <div className="flex items-center gap-2">
        <TerminalSquare size={18} className="text-teal-600" />
        <h2 className="text-xl font-bold text-slate-900">Try It</h2>
      </div>
      <p className="text-sm text-slate-600">Paste your API key below and send a test request directly from this page.</p>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-3">
          <div>
            <label className="ui-label">API Key</label>
            <input
              className="ui-input font-mono text-xs"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="cx-..."
              type="password"
            />
          </div>
          <div>
            <label className="ui-label">Model</label>
            <input
              className="ui-input"
              value={model}
              onChange={e => setModel(e.target.value)}
              placeholder="gpt-4o"
            />
          </div>
          <div>
            <label className="ui-label">Message</label>
            <textarea
              className="ui-input min-h-[100px] resize-none"
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Enter your message..."
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void send() }}
            />
            <p className="mt-1 text-xs text-slate-400">Ctrl+Enter to send</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="ui-btn-primary flex-1"
              onClick={send}
              disabled={streaming || !apiKey.trim() || !message.trim()}
            >
              {streaming ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              {streaming ? 'Generating…' : 'Send'}
            </button>
            {streaming && (
              <button type="button" className="ui-btn-secondary" onClick={() => abortRef.current?.abort()}>
                Stop
              </button>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 min-h-[200px]">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Response</p>
          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
          ) : response ? (
            <pre className="whitespace-pre-wrap text-sm text-slate-800">{response}{streaming ? '▌' : ''}</pre>
          ) : (
            <p className="text-sm text-slate-400">Response will appear here…</p>
          )}
        </div>
      </div>
    </section>
  )
}
