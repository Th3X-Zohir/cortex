import { useState } from 'react'
import { Copy } from 'lucide-react'
import { Page, Panel } from '@/components/shared/AppPrimitives'

export function DocsPage() {
  const [copied, setCopied] = useState<string | null>(null)

  function copy(text: string, id: string) {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  const baseUrl = window.location.origin

  return (
    <Page title="API Documentation" description="Share this reference with API consumers. All endpoints are OpenAI-compatible.">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Panel title="Authentication">
            <p className="text-sm text-white/60">All <code className="rounded bg-white/5 px-1.5 py-0.5 text-xs text-primary/60">/v1/*</code> endpoints require an API key passed via the <code className="rounded bg-white/5 px-1.5 py-0.5 text-xs text-primary/60">Authorization</code> header or <code className="rounded bg-white/5 px-1.5 py-0.5 text-xs text-primary/60">X-API-Key</code> header.</p>
            <CodeBlock label="Header format" id="auth" onCopy={copy} copied={copied}>{`Authorization: Bearer ctx_your_api_key_here\n\n# Alternative:\nX-API-Key: ctx_your_api_key_here`}</CodeBlock>
          </Panel>

          <Panel title="POST /v1/chat/completions" description="Send a chat message and receive a completion. Supports streaming.">
            <CodeBlock label="curl" id="curl-chat" onCopy={copy} copied={copied}>{`curl ${baseUrl}/v1/chat/completions \\\n  -H "Authorization: Bearer ctx_your_api_key_here" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "model": "web-grok/grok-3",\n    "messages": [\n      {"role": "system", "content": "You are a helpful assistant."},\n      {"role": "user", "content": "Hello!"}\n    ],\n    "stream": false,\n    "newConversation": true\n  }'`}</CodeBlock>
            <CodeBlock label="Response" id="resp-chat" onCopy={copy} copied={copied}>{`{\n  "id": "chatcmpl-1710000000000",\n  "object": "chat.completion",\n  "model": "web-grok/grok-3",\n  "choices": [{\n    "index": 0,\n    "message": {"role": "assistant", "content": "Hello! How can I help?"},\n    "finish_reason": "stop"\n  }],\n  "usage": {"prompt_tokens": 18, "completion_tokens": 9, "total_tokens": 27}\n}`}</CodeBlock>
          </Panel>

          <Panel title="Streaming" description="Set stream: true to receive Server-Sent Events.">
            <CodeBlock label="Request body" id="stream-req" onCopy={copy} copied={copied}>{`{\n  "model": "web-claude/claude-opus",\n  "messages": [{"role": "user", "content": "Explain quantum computing"}],\n  "stream": true,\n  "newConversation": true\n}`}</CodeBlock>
            <CodeBlock label="SSE output" id="stream-resp" onCopy={copy} copied={copied}>{`data: {"id":"chatcmpl-...","object":"chat.completion.chunk","choices":[{"delta":{"content":"Quantum"},"finish_reason":null}]}\n\ndata: {"id":"chatcmpl-...","object":"chat.completion.chunk","choices":[{"delta":{"content":" computing"},"finish_reason":null}]}\n\ndata: {"id":"chatcmpl-...","object":"chat.completion.chunk","choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]`}</CodeBlock>
          </Panel>

          <Panel title="GET /v1/models" description="List all available models.">
            <CodeBlock label="curl" id="curl-models" onCopy={copy} copied={copied}>{`curl ${baseUrl}/v1/models \\\n  -H "Authorization: Bearer ctx_your_api_key_here"`}</CodeBlock>
          </Panel>

          <Panel title="Python SDK" description="Use the official OpenAI Python library.">
            <CodeBlock label="example.py" id="python" onCopy={copy} copied={copied}>{`from openai import OpenAI\n\nclient = OpenAI(\n    base_url="${baseUrl}/v1",\n    api_key="ctx_your_api_key_here"\n)\n\nresponse = client.chat.completions.create(\n    model="web-grok/grok-3",\n    messages=[{"role": "user", "content": "Hello!"}],\n    stream=False\n)\nprint(response.choices[0].message.content)\n\n# Streaming:\nfor chunk in client.chat.completions.create(\n    model="web-claude/claude-sonnet",\n    messages=[{"role": "user", "content": "Explain AI"}],\n    stream=True\n):\n    print(chunk.choices[0].delta.content or "", end="")`}</CodeBlock>
          </Panel>

          <Panel title="JavaScript / TypeScript" description="Use the OpenAI Node.js library.">
            <CodeBlock label="example.ts" id="js" onCopy={copy} copied={copied}>{`import OpenAI from "openai";\n\nconst client = new OpenAI({\n  baseURL: "${baseUrl}/v1",\n  apiKey: "ctx_your_api_key_here",\n});\n\nconst response = await client.chat.completions.create({\n  model: "web-gemini/gemini-2.5-pro",\n  messages: [{ role: "user", content: "Hello!" }],\n});\nconsole.log(response.choices[0].message.content);\n\n// Streaming:\nconst stream = await client.chat.completions.create({\n  model: "web-chatgpt/gpt-4o",\n  messages: [{ role: "user", content: "Hello!" }],\n  stream: true,\n});\nfor await (const chunk of stream) {\n  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");\n}`}</CodeBlock>
          </Panel>

          <Panel title="Error codes" description="Standard error response format.">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-white/5 text-xs uppercase text-white/40">
                  <tr>
                    <th className="py-2 pr-4 text-left">Code</th>
                    <th className="py-2 pr-4 text-left">Meaning</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['401', 'Missing or invalid API key'],
                    ['403', 'API key is disabled'],
                    ['404', 'Unknown model or endpoint'],
                    ['429', 'Rate limit or daily limit exceeded'],
                    ['500', 'Internal server error'],
                    ['503', 'Provider not connected — contact admin'],
                  ].map(([code, desc]) => (
                    <tr key={code} className="border-b border-white/5 last:border-0">
                      <td className="py-2 pr-4 font-mono text-primary/60">{code}</td>
                      <td className="py-2 pr-4 text-white/60">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title="Quick reference">
            <div className="space-y-3 text-sm">
              <div>
                <p className="label text-white/60">Base URL</p>
                <code className="mt-1 block break-all rounded-lg border border-white/10 bg-white/5 p-2 text-xs text-primary/60">{baseUrl}/v1</code>
              </div>
              <div>
                <p className="label text-white/60">Chat endpoint</p>
                <code className="mt-1 block rounded-lg border border-white/10 bg-white/5 p-2 text-xs">POST /v1/chat/completions</code>
              </div>
              <div>
                <p className="label text-white/60">Models endpoint</p>
                <code className="mt-1 block rounded-lg border border-white/10 bg-white/5 p-2 text-xs">GET /v1/models</code>
              </div>
              <div>
                <p className="label text-white/60">Compatibility</p>
                <p className="text-white/60">OpenAI API (chat completions)</p>
              </div>
              <div>
                <p className="label text-white/60">Auth method</p>
                <p className="text-white/60">Bearer token / X-API-Key</p>
              </div>
              <div>
                <p className="label text-white/60">Streaming</p>
                <p className="text-white/60">text/event-stream (SSE)</p>
              </div>
            </div>
          </Panel>

          <Panel title="Request parameters">
            <div className="space-y-2 text-sm">
              {[
                ['model', 'string', 'Required. Model ID (e.g. web-grok/grok-3)'],
                ['messages', 'array', 'Required. Array of {role, content} objects'],
                ['stream', 'boolean', 'Optional. Enable SSE streaming (default: false)'],
                ['newConversation', 'boolean', 'Optional. Start fresh conversation (default: true)'],
                ['temperature', 'number', 'Optional. Sampling temperature'],
                ['max_tokens', 'number', 'Optional. Max tokens to generate'],
              ].map(([name, type, desc]) => (
                <div key={name}>
                  <p className="font-mono text-xs font-semibold text-primary/80">{name} <span className="text-white/40">({type})</span></p>
                  <p className="text-xs text-white/60">{desc}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Rate limits">
            <p className="text-sm text-white/60">Each API key has per-minute and daily request limits configured by your administrator. Exceeding limits returns a <code className="rounded bg-white/5 px-1 py-0.5 text-xs text-primary/60">429</code> status code.</p>
          </Panel>
        </div>
      </div>
    </Page>
  )
}

function CodeBlock({ children, label, id, onCopy, copied }: { children: string; label: string; id: string; onCopy: (text: string, id: string) => void; copied: string | null }) {
  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-[#080808] text-white/80">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-2">
        <span className="text-xs font-semibold text-white/40">{label}</span>
        <button className="text-xs text-white/40 transition-colors hover:text-primary" onClick={() => onCopy(children, id)}>
          {copied === id ? 'Copied!' : <><Copy size={12} className="mr-1 inline" />Copy</>}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-sm leading-relaxed"><code>{children}</code></pre>
    </div>
  )
}
