import * as React from "react"
import { Copy, Check } from "lucide-react"
import { PageHeader } from "~/components/shared/PageHeader"

export function DocsPage() {
  const [copied, setCopied] = React.useState<string | null>(null)
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"

  function copy(text: string, id: string) {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="API Documentation"
        description="Share this reference with API consumers. All endpoints are OpenAI-compatible."
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        {/* Main content */}
        <div className="space-y-5">
          {/* Authentication */}
          <div className="panel p-5 space-y-4">
            <h3 className="text-base font-semibold">Authentication</h3>
            <p className="text-sm text-muted-foreground">
              All <code className="rounded bg-muted px-1.5 py-0.5 text-xs">/v1/*</code> endpoints require an API key passed via the <code className="rounded bg-muted px-1.5 py-0.5 text-xs">Authorization</code> header or <code className="rounded bg-muted px-1.5 py-0.5 text-xs">X-API-Key</code> header.
            </p>
            <CodeBlock label="Header format" id="auth" onCopy={copy} copied={copied}>{`Authorization: Bearer ctx_your_api_key_here\n\n# Alternative:\nX-API-Key: ctx_your_api_key_here`}</CodeBlock>
          </div>

          {/* Chat completions */}
          <div className="panel p-5 space-y-4">
            <h3 className="text-base font-semibold">POST /v1/chat/completions</h3>
            <p className="text-xs text-muted-foreground">Send a chat message and receive a completion. Supports streaming.</p>
            <CodeBlock label="curl" id="curl-chat" onCopy={copy} copied={copied}>{`curl ${baseUrl}/v1/chat/completions \\\n  -H "Authorization: Bearer ctx_your_api_key_here" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "model": "web-grok/grok-3",\n    "messages": [\n      {"role": "system", "content": "You are a helpful assistant."},\n      {"role": "user", "content": "Hello!"}\n    ],\n    "stream": false\n  }'`}</CodeBlock>
            <CodeBlock label="Response" id="resp-chat" onCopy={copy} copied={copied}>{`{\n  "id": "chatcmpl-1710000000000",\n  "object": "chat.completion",\n  "model": "web-grok/grok-3",\n  "choices": [{\n    "index": 0,\n    "message": {"role": "assistant", "content": "Hello! How can I help?"},\n    "finish_reason": "stop"\n  }],\n  "usage": {"prompt_tokens": 18, "completion_tokens": 9, "total_tokens": 27}\n}`}</CodeBlock>
          </div>

          {/* Streaming */}
          <div className="panel p-5 space-y-4">
            <h3 className="text-base font-semibold">Streaming</h3>
            <p className="text-xs text-muted-foreground">Set stream: true to receive Server-Sent Events.</p>
            <CodeBlock label="Request body" id="stream-req" onCopy={copy} copied={copied}>{`{\n  "model": "web-claude/claude-opus",\n  "messages": [{"role": "user", "content": "Explain quantum computing"}],\n  "stream": true\n}`}</CodeBlock>
            <CodeBlock label="SSE output" id="stream-resp" onCopy={copy} copied={copied}>{`data: {"id":"chatcmpl-...","object":"chat.completion.chunk","choices":[{"delta":{"content":"Quantum"},"finish_reason":null}]}\n\ndata: {"id":"chatcmpl-...","object":"chat.completion.chunk","choices":[{"delta":{"content":" computing"},"finish_reason":null}]}\n\ndata: {"id":"chatcmpl-...","object":"chat.completion.chunk","choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]`}</CodeBlock>
          </div>

          {/* Models */}
          <div className="panel p-5 space-y-4">
            <h3 className="text-base font-semibold">GET /v1/models</h3>
            <p className="text-xs text-muted-foreground">List all available models.</p>
            <CodeBlock label="curl" id="curl-models" onCopy={copy} copied={copied}>{`curl ${baseUrl}/v1/models \\\n  -H "Authorization: Bearer ctx_your_api_key_here"`}</CodeBlock>
          </div>

          {/* Python */}
          <div className="panel p-5 space-y-4">
            <h3 className="text-base font-semibold">Python SDK</h3>
            <p className="text-xs text-muted-foreground">Use the official OpenAI Python library.</p>
            <CodeBlock label="example.py" id="python" onCopy={copy} copied={copied}>{`from openai import OpenAI\n\nclient = OpenAI(\n    base_url="${baseUrl}/v1",\n    api_key="ctx_your_api_key_here"\n)\n\nresponse = client.chat.completions.create(\n    model="web-grok/grok-3",\n    messages=[{"role": "user", "content": "Hello!"}],\n    stream=False\n)\nprint(response.choices[0].message.content)`}</CodeBlock>
          </div>

          {/* JavaScript */}
          <div className="panel p-5 space-y-4">
            <h3 className="text-base font-semibold">JavaScript / TypeScript</h3>
            <p className="text-xs text-muted-foreground">Use the OpenAI Node.js library.</p>
            <CodeBlock label="example.ts" id="js" onCopy={copy} copied={copied}>{`import OpenAI from "openai";\n\nconst client = new OpenAI({\n  baseURL: "${baseUrl}/v1",\n  apiKey: "ctx_your_api_key_here",\n});\n\nconst response = await client.chat.completions.create({\n  model: "web-gemini/gemini-2.5-pro",\n  messages: [{ role: "user", content: "Hello!" }],\n});\nconsole.log(response.choices[0].message.content);`}</CodeBlock>
          </div>

          {/* Error codes */}
          <div className="panel p-5">
            <h3 className="text-base font-semibold mb-4">Error codes</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border">
                  <tr>
                    <th className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Code</th>
                    <th className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Meaning</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["401", "Missing or invalid API key"],
                    ["403", "API key is disabled"],
                    ["404", "Unknown model or endpoint"],
                    ["429", "Rate limit or daily limit exceeded"],
                    ["500", "Internal server error"],
                    ["503", "Provider not connected — contact admin"],
                  ].map(([code, desc]) => (
                    <tr key={code} className="border-b border-border last:border-0">
                      <td className="py-2 pr-4 font-mono text-xs">{code}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <div className="panel p-5 space-y-3">
            <h3 className="text-base font-semibold">Quick reference</h3>
            <div className="space-y-3 text-sm">
              <div>
                <p className="label">Base URL</p>
                <code className="mt-1 block break-all rounded-lg bg-muted/50 p-2 text-xs">{baseUrl}/v1</code>
              </div>
              <div>
                <p className="label">Chat endpoint</p>
                <code className="mt-1 block rounded-lg bg-muted/50 p-2 text-xs">POST /v1/chat/completions</code>
              </div>
              <div>
                <p className="label">Models endpoint</p>
                <code className="mt-1 block rounded-lg bg-muted/50 p-2 text-xs">GET /v1/models</code>
              </div>
              <div>
                <p className="label">Compatibility</p>
                <p className="text-muted-foreground">OpenAI API (chat completions)</p>
              </div>
              <div>
                <p className="label">Auth method</p>
                <p className="text-muted-foreground">Bearer token / X-API-Key</p>
              </div>
              <div>
                <p className="label">Streaming</p>
                <p className="text-muted-foreground">text/event-stream (SSE)</p>
              </div>
            </div>
          </div>

          <div className="panel p-5 space-y-2">
            <h3 className="text-base font-semibold mb-3">Request parameters</h3>
            {[
              ["model", "string", "Required. Model ID (e.g. web-grok/grok-3)"],
              ["messages", "array", "Required. Array of {role, content} objects"],
              ["stream", "boolean", "Optional. Enable SSE streaming (default: false)"],
              ["temperature", "number", "Optional. Sampling temperature"],
              ["max_tokens", "number", "Optional. Max tokens to generate"],
            ].map(([name, type, desc]) => (
              <div key={name}>
                <p className="font-mono text-xs font-semibold">{name} <span className="text-muted-foreground">({type})</span></p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>

          <div className="panel p-5">
            <h3 className="text-base font-semibold mb-2">Rate limits</h3>
            <p className="text-sm text-muted-foreground">Each API key has per-minute and daily request limits configured by your administrator. Exceeding limits returns a <code className="rounded bg-muted px-1 py-0.5 text-xs">429</code> status code.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

interface CodeBlockProps {
  children: string
  label: string
  id: string
  onCopy: (text: string, id: string) => void
  copied: string | null
}

function CodeBlock({ children, label, id, onCopy, copied }: CodeBlockProps) {
  return (
    <div className="rounded-xl border border-border bg-[#101411] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
        <span className="text-xs font-semibold text-white/60">{label}</span>
        <button
          className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white transition-colors"
          onClick={() => onCopy(children, id)}
        >
          {copied === id ? <><Check size={12} className="text-success" /> Copied!</> : <><Copy size={12} /> Copy</>}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-sm leading-relaxed"><code className="text-[#e0e5dc]">{children}</code></pre>
    </div>
  )
}