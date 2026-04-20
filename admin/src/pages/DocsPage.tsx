import { useState } from 'react'
import { Copy } from 'lucide-react'
import {
  Chip,
  PageShell,
  Surface,
  SurfaceHeader,
  SuccessBanner,
} from '@/components/dashboard/UiKit'

export function DocsPage() {
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const baseUrl = window.location.origin

  function copy(text: string, id: string) {
    void navigator.clipboard.writeText(text)
    setCopiedId(id)
    window.setTimeout(() => setCopiedId(null), 1500)
  }

  return (
    <PageShell
      title="Developer API Docs"
      description="Operational integration reference for OpenAI-compatible requests and admin control endpoints."
      action={<Chip tone="default">Base URL: {baseUrl}</Chip>}
    >
      {copiedId ? <SuccessBanner text="Code snippet copied to clipboard." /> : null}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Surface>
            <SurfaceHeader title="Authentication" description="All /v1 endpoints require a valid API key unless API key enforcement is disabled." />
            <CodeBlock
              id="auth"
              label="Headers"
              value={`Authorization: Bearer ctx_your_api_key\n\n# Alternative header\nX-API-Key: ctx_your_api_key`}
              onCopy={copy}
              copiedId={copiedId}
            />
          </Surface>

          <Surface>
            <SurfaceHeader title="POST /v1/chat/completions" description="Primary OpenAI-compatible generation endpoint." />
            <CodeBlock
              id="chat-curl"
              label="curl"
              value={`curl ${baseUrl}/v1/chat/completions \\\n  -H "Authorization: Bearer ctx_your_api_key" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "model": "web-grok/grok-expert",\n    "messages": [\n      {"role": "user", "content": "Summarize this service in one sentence."}\n    ],\n    "stream": false,\n    "temperature": 0.7,\n    "max_tokens": 300\n  }'`}
              onCopy={copy}
              copiedId={copiedId}
            />
            <CodeBlock
              id="chat-response"
              label="JSON response"
              value={`{\n  "id": "chatcmpl-...",\n  "object": "chat.completion",\n  "model": "web-grok/grok-expert",\n  "choices": [\n    {\n      "index": 0,\n      "message": { "role": "assistant", "content": "..." },\n      "finish_reason": "stop"\n    }\n  ],\n  "usage": {\n    "prompt_tokens": 42,\n    "completion_tokens": 126,\n    "total_tokens": 168\n  }\n}`}
              onCopy={copy}
              copiedId={copiedId}
            />
          </Surface>

          <Surface>
            <SurfaceHeader title="Streaming" description="Set stream=true for server-sent event chunks." />
            <CodeBlock
              id="stream"
              label="SSE example"
              value={`data: {"id":"chatcmpl-...","choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}\n\ndata: {"id":"chatcmpl-...","choices":[{"delta":{"content":" world"},"finish_reason":null}]}\n\ndata: [DONE]`}
              onCopy={copy}
              copiedId={copiedId}
            />
          </Surface>

          <Surface>
            <SurfaceHeader title="Model Discovery" description="List available model IDs." />
            <CodeBlock
              id="models"
              label="GET /v1/models"
              value={`curl ${baseUrl}/v1/models \\\n  -H "Authorization: Bearer ctx_your_api_key"`}
              onCopy={copy}
              copiedId={copiedId}
            />
          </Surface>

          <Surface>
            <SurfaceHeader title="Admin Provider Controls" description="Provider login/logout is admin-managed, not available through /v1/login or /v1/logout." />
            <CodeBlock
              id="provider-login"
              label="Provider login"
              value={`curl ${baseUrl}/api/providers/gemini/login \\\n  -H "Authorization: Bearer <admin_jwt>" \\\n  -X POST`}
              onCopy={copy}
              copiedId={copiedId}
            />
            <CodeBlock
              id="provider-logout"
              label="Provider logout"
              value={`curl ${baseUrl}/api/providers/gemini/logout \\\n  -H "Authorization: Bearer <admin_jwt>" \\\n  -X POST`}
              onCopy={copy}
              copiedId={copiedId}
            />
          </Surface>
        </div>

        <div className="space-y-4">
          <Surface>
            <SurfaceHeader title="Supported Provider Families" />
            <ul className="space-y-2 text-sm text-slate-700">
              <li className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">ChatGPT models: web-chatgpt/*</li>
              <li className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">Grok models: web-grok/*</li>
              <li className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">Gemini models: web-gemini/*</li>
            </ul>
          </Surface>

          <Surface>
            <SurfaceHeader title="Common Errors" />
            <div className="ui-table-wrap">
              <table className="ui-table min-w-full">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Meaning</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td>401</td><td>Missing or invalid API key</td></tr>
                  <tr><td>403</td><td>Request blocked by auth or route policy</td></tr>
                  <tr><td>404</td><td>Model or endpoint not found</td></tr>
                  <tr><td>429</td><td>Rate limit or daily key limit exceeded</td></tr>
                  <tr><td>503</td><td>Provider session unavailable</td></tr>
                </tbody>
              </table>
            </div>
          </Surface>

          <Surface>
            <SurfaceHeader title="Integration Notes" />
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
              <li>Provider browser login is handled via admin endpoints.</li>
              <li>Use /api/providers/models to fetch provider status and VNC metadata.</li>
              <li>Use /api/playground/chat for admin-side testing with bearer auth.</li>
            </ul>
          </Surface>
        </div>
      </section>
    </PageShell>
  )
}

function CodeBlock({
  id,
  label,
  value,
  copiedId,
  onCopy,
}: {
  id: string
  label: string
  value: string
  copiedId: string | null
  onCopy: (text: string, id: string) => void
}) {
  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-slate-950">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-300">{label}</p>
        <button type="button" className="inline-flex items-center gap-1 text-xs text-slate-300 hover:text-white" onClick={() => onCopy(value, id)}>
          <Copy size={12} /> {copiedId === id ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="ui-scroll overflow-x-auto p-4 text-xs leading-6 text-slate-100">
        <code>{value}</code>
      </pre>
    </div>
  )
}
