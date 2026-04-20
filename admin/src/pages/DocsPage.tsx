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

  const authHeaders = `Authorization: Bearer ctx_your_api_key\n\n# Alternative header\nX-API-Key: ctx_your_api_key`

  const requestEnvelope = `{
  "model": "web-grok/grok-expert",
  "messages": [
    { "role": "system", "content": "You are a concise operations assistant." },
    { "role": "user", "content": "Summarize this service in one sentence." }
  ],
  "stream": false,
  "newConversation": true,
  "temperature": 0.7,
  "max_tokens": 300
}`

  const systemPromptCurl = `curl ${baseUrl}/v1/chat/completions \\
  -H "Authorization: Bearer ctx_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "web-gemini/gemini-3-thinking",
    "messages": [
      {
        "role": "system",
        "content": "You are a strict security reviewer. Return risks as numbered bullets."
      },
      {
        "role": "user",
        "content": "Review this endpoint design for auth weaknesses."
      }
    ],
    "stream": false,
    "newConversation": true,
    "temperature": 0.2,
    "max_tokens": 400
  }'`

  const chatCurl = `curl ${baseUrl}/v1/chat/completions \\
  -H "Authorization: Bearer ctx_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "web-grok/grok-expert",
    "messages": [
      {"role": "system", "content": "You are a concise assistant."},
      {"role": "user", "content": "Summarize this service in one sentence."}
    ],
    "stream": false,
    "newConversation": true,
    "temperature": 0.7,
    "max_tokens": 300
  }'`

  const chatResponse = `{
  "id": "chatcmpl-...",
  "object": "chat.completion",
  "model": "web-grok/grok-expert",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "..." },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 42,
    "completion_tokens": 126,
    "total_tokens": 168
  }
}`

  const chatError = `{
  "error": {
    "message": "Unknown model: web-unknown/demo",
    "type": "invalid_request"
  }
}`

  const streamExample = `data: {"id":"chatcmpl-...","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}\n\ndata: {"id":"chatcmpl-...","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}\n\ndata: {"id":"chatcmpl-...","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":42,"completion_tokens":126,"total_tokens":168}}\n\ndata: [DONE]`

  const modelsCurl = `curl ${baseUrl}/v1/models \\
  -H "Authorization: Bearer ctx_your_api_key"`

  const providerLoginCurl = `curl ${baseUrl}/api/providers/gemini/login \\
  -H "Authorization: Bearer <admin_jwt>" \\
  -X POST`

  const providerLogoutCurl = `curl ${baseUrl}/api/providers/gemini/logout \\
  -H "Authorization: Bearer <admin_jwt>" \\
  -X POST`

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
            <CodeBlock id="auth" label="Headers" value={authHeaders} onCopy={copy} copiedId={copiedId} />
          </Surface>

          <Surface>
            <SurfaceHeader
              title="Request Envelope"
              description="Use OpenAI-compatible messages with optional system prompt, deterministic conversation reset controls, and generation tuning fields."
            />
            <CodeBlock id="request-envelope" label="JSON body template" value={requestEnvelope} onCopy={copy} copiedId={copiedId} />
            <div className="mt-3 ui-table-wrap">
              <table className="ui-table min-w-full">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Type</th>
                    <th>Required</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>model</td>
                    <td>string</td>
                    <td>Yes</td>
                    <td>Must match an ID returned by /v1/models (for example web-chatgpt/gpt-5.4-pro).</td>
                  </tr>
                  <tr>
                    <td>messages</td>
                    <td>array</td>
                    <td>Yes</td>
                    <td>Ordered chat history with role/content objects.</td>
                  </tr>
                  <tr>
                    <td>messages[].role</td>
                    <td>system | user | assistant</td>
                    <td>Yes</td>
                    <td>Use system first when present, then user/assistant turns in order.</td>
                  </tr>
                  <tr>
                    <td>messages[].content</td>
                    <td>string</td>
                    <td>Yes</td>
                    <td>Natural language instruction or conversation text.</td>
                  </tr>
                  <tr>
                    <td>stream</td>
                    <td>boolean</td>
                    <td>No</td>
                    <td>Default false. Set true for Server-Sent Events streaming output.</td>
                  </tr>
                  <tr>
                    <td>newConversation</td>
                    <td>boolean</td>
                    <td>No</td>
                    <td>Default false on public endpoint. Set true to force a fresh provider-side thread/session for this call.</td>
                  </tr>
                  <tr>
                    <td>temperature</td>
                    <td>number</td>
                    <td>No</td>
                    <td>Sampling control from 0 to 2. Lower is more deterministic.</td>
                  </tr>
                  <tr>
                    <td>max_tokens</td>
                    <td>number</td>
                    <td>No</td>
                    <td>Upper limit for completion tokens.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Surface>

          <Surface>
            <SurfaceHeader
              title="System Prompt Guidance"
              description="System prompts are fully supported through messages[].role = system and should be the first message when used."
            />
            <CodeBlock id="system-prompt-curl" label="curl with system prompt" value={systemPromptCurl} onCopy={copy} copiedId={copiedId} />
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
              <li>Place one primary system prompt at the beginning of messages for predictable behavior.</li>
              <li>Use newConversation=true when testing new system prompt variants to avoid context carryover.</li>
              <li>If you omit a system prompt, the request still works with user and assistant turns only.</li>
            </ul>
          </Surface>

          <Surface>
            <SurfaceHeader title="POST /v1/chat/completions" description="Primary OpenAI-compatible generation endpoint." />
            <CodeBlock id="chat-curl" label="curl" value={chatCurl} onCopy={copy} copiedId={copiedId} />
            <CodeBlock id="chat-response" label="JSON response" value={chatResponse} onCopy={copy} copiedId={copiedId} />
            <CodeBlock id="chat-error" label="Error response example" value={chatError} onCopy={copy} copiedId={copiedId} />
          </Surface>

          <Surface>
            <SurfaceHeader title="Streaming" description="Set stream=true for Server-Sent Event chunks and consume until [DONE]." />
            <CodeBlock id="stream" label="SSE example" value={streamExample} onCopy={copy} copiedId={copiedId} />
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
              <li>Set Accept: text/event-stream on clients that enforce explicit content negotiation.</li>
              <li>Append each delta.content token in order to reconstruct the final assistant message.</li>
              <li>The terminal chunk may include usage before [DONE].</li>
            </ul>
          </Surface>

          <Surface>
            <SurfaceHeader title="Model Discovery" description="List available model IDs." />
            <CodeBlock id="models" label="GET /v1/models" value={modelsCurl} onCopy={copy} copiedId={copiedId} />
          </Surface>

          <Surface>
            <SurfaceHeader title="Admin Provider Controls" description="Provider login/logout is admin-managed, not available through /v1/login or /v1/logout." />
            <CodeBlock id="provider-login" label="Provider login" value={providerLoginCurl} onCopy={copy} copiedId={copiedId} />
            <CodeBlock id="provider-logout" label="Provider logout" value={providerLogoutCurl} onCopy={copy} copiedId={copiedId} />
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
            <SurfaceHeader title="Endpoint Matrix" />
            <div className="ui-table-wrap">
              <table className="ui-table min-w-full">
                <thead>
                  <tr>
                    <th>Endpoint</th>
                    <th>Auth</th>
                    <th>Purpose</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td>/health</td><td>None</td><td>Service liveness check.</td></tr>
                  <tr><td>/v1/models</td><td>API key</td><td>Discover supported model IDs.</td></tr>
                  <tr><td>/v1/status</td><td>API key</td><td>Provider connection and readiness status.</td></tr>
                  <tr><td>/v1/chat/completions</td><td>API key</td><td>Primary generation endpoint with streaming and non-streaming support.</td></tr>
                  <tr><td>/api/providers/:provider/login</td><td>Admin JWT</td><td>Trigger provider browser login flow from admin context.</td></tr>
                  <tr><td>/api/providers/:provider/logout</td><td>Admin JWT</td><td>Clear provider session from admin context.</td></tr>
                </tbody>
              </table>
            </div>
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
              <li>Request logs capture structured request and response payload JSON for troubleshooting.</li>
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
