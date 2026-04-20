# CorteX API Usage Guide

This document is a complete, shareable reference for integrating with the CorteX API correctly.

It covers:
- Base URLs and authentication
- Public API endpoints
- Request and response formats
- Streaming behavior
- Supported model IDs
- Postman workflow
- JavaScript and Python examples
- Admin/operations endpoints
- Error handling and troubleshooting

## 1. Base URL and Authentication

### Production Base URL

- https://cortex.zohirrayhan.com

### Local Base URL (default)

- http://localhost:31338

### API Key (current configured key)

- ctx_373762fcf6a1404ea7db393cce902498

Use either header format:

```http
X-API-Key: ctx_373762fcf6a1404ea7db393cce902498
```

or

```http
Authorization: Bearer ctx_373762fcf6a1404ea7db393cce902498
```

Important:
- API key enforcement is enabled by default.
- If API key is missing, the API returns 401.
- If API key is invalid, disabled, over daily limit, or over rate limit, requests fail with corresponding error codes.

### Quick curl Setup Variables

For terminal use, define these once:

```bash
BASE_URL="https://cortex.zohirrayhan.com"
API_KEY="ctx_373762fcf6a1404ea7db393cce902498"
```

PowerShell:

```powershell
$BASE_URL = "https://cortex.zohirrayhan.com"
$API_KEY = "ctx_373762fcf6a1404ea7db393cce902498"
```

## 2. Public API Endpoints

### Quick Copy-Paste curl Commands

List models:

```bash
curl "$BASE_URL/v1/models" -H "X-API-Key: $API_KEY"
```

Provider status:

```bash
curl "$BASE_URL/v1/status" -H "X-API-Key: $API_KEY"
```

Non-streaming chat:

```bash
curl "$BASE_URL/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "model": "web-grok/grok-expert",
    "messages": [{"role":"user","content":"Say hello in one line."}],
    "stream": false,
    "newConversation": true,
    "temperature": 0.7,
    "max_tokens": 120
  }'
```

Streaming chat:

```bash
curl -N "$BASE_URL/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "model": "web-chatgpt/gpt-5.4-thinking",
    "messages": [{"role":"user","content":"Write a 2-line poem about uptime."}],
    "stream": true,
    "newConversation": true,
    "temperature": 0.6,
    "max_tokens": 120
  }'
```

PowerShell note:
- Use curl.exe (not curl alias) to ensure standard curl behavior.

PowerShell non-streaming example:

```powershell
curl.exe "$BASE_URL/v1/chat/completions" -H "Content-Type: application/json" -H "X-API-Key: $API_KEY" -d '{"model":"web-grok/grok-expert","messages":[{"role":"user","content":"Say hello in one line."}],"stream":false,"newConversation":true,"temperature":0.7,"max_tokens":120}'
```

## Health

### GET /health

Auth: none

Use for liveness checks.

Example:

```bash
curl https://cortex.zohirrayhan.com/health
```

Typical response:

```json
{
  "status": "ok",
  "service": "cortex",
  "version": "0.2.0"
}
```

## List Models

### GET /v1/models

Auth: required (API key)

Example:

```bash
curl https://cortex.zohirrayhan.com/v1/models \
  -H "X-API-Key: ctx_373762fcf6a1404ea7db393cce902498"
```

Response shape:

```json
{
  "object": "list",
  "data": [
    {
      "id": "web-chatgpt/gpt-5.4-pro",
      "object": "model",
      "created": 0,
      "owned_by": "openai"
    }
  ]
}
```

## Provider Status

### GET /v1/status

Auth: required (API key)

Returns provider connection state, profile/session state, and uptime.

```bash
curl https://cortex.zohirrayhan.com/v1/status \
  -H "X-API-Key: ctx_373762fcf6a1404ea7db393cce902498"
```

## Chat Completions

### POST /v1/chat/completions

Auth: required (API key)

OpenAI-compatible endpoint for non-streaming and streaming chat generation.

## 3. Chat Request Schema

```json
{
  "model": "web-chatgpt/gpt-5.4-pro",
  "messages": [
    { "role": "system", "content": "You are a concise assistant." },
    { "role": "user", "content": "Summarize the platform in one sentence." }
  ],
  "stream": false,
  "newConversation": true,
  "temperature": 0.7,
  "max_tokens": 300
}
```

Field details:

| Field | Type | Required | Notes |
|---|---|---|---|
| model | string | Yes | Must match a model ID from GET /v1/models |
| messages | array | Yes | Ordered chat history |
| messages[].role | system \| user \| assistant | Yes | Valid roles only |
| messages[].content | string | Yes | Message text |
| stream | boolean | No | Default false |
| newConversation | boolean | No | Default false on public endpoint |
| temperature | number | No | Use range 0 to 2 |
| max_tokens | number | No | Max completion tokens |

System prompt guidance:
- Put system message first when used.
- Set newConversation=true while testing different system prompts to avoid context carryover.

## 4. Non-Streaming Example

```bash
curl https://cortex.zohirrayhan.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ctx_373762fcf6a1404ea7db393cce902498" \
  -d '{
    "model": "web-grok/grok-expert",
    "messages": [
      {"role": "system", "content": "You are a concise assistant."},
      {"role": "user", "content": "Give me a 1-line summary."}
    ],
    "stream": false,
    "newConversation": true,
    "temperature": 0.7,
    "max_tokens": 150
  }'
```

Typical response:

```json
{
  "id": "chatcmpl-1713360000000",
  "object": "chat.completion",
  "model": "web-grok/grok-expert",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Your one-line response here."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 42,
    "completion_tokens": 28,
    "total_tokens": 70
  }
}
```

## 5. Streaming Example (SSE)

```bash
curl -N https://cortex.zohirrayhan.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ctx_373762fcf6a1404ea7db393cce902498" \
  -d '{
    "model": "web-chatgpt/gpt-5.4-thinking",
    "messages": [
      {"role": "user", "content": "Write a short haiku about reliability."}
    ],
    "stream": true,
    "newConversation": true,
    "temperature": 0.6,
    "max_tokens": 120
  }'
```

SSE chunk format:

```text
data: {"id":"chatcmpl-...","object":"chat.completion.chunk","model":"web-chatgpt/gpt-5.4-thinking","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}

data: {"id":"chatcmpl-...","object":"chat.completion.chunk","model":"web-chatgpt/gpt-5.4-thinking","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":42,"completion_tokens":30,"total_tokens":72}}

data: [DONE]
```

Streaming notes:
- Consume until [DONE].
- Build final text by appending each delta.content in order.
- If provider fails after stream starts, an SSE error event can be sent in-stream.

## 6. Supported Model IDs

Always call GET /v1/models for latest runtime list. Current configured models:

### ChatGPT
- web-chatgpt/gpt-5.4-pro
- web-chatgpt/gpt-5.4-thinking
- web-chatgpt/gpt-5.3-instant
- web-chatgpt/gpt-5-thinking-mini
- web-chatgpt/o3

### Grok
- web-grok/grok-expert
- web-grok/grok-fast
- web-grok/grok-heavy
- web-grok/grok-4.20-beta

### Gemini
- web-gemini/gemini-3-fast
- web-gemini/gemini-3-thinking
- web-gemini/gemini-3.1-pro

## 7. JavaScript Integration

Important:
- The following examples are JavaScript/Node.js only.
- Do not put JavaScript import syntax inside a Python file.
- If your file is run.py, use the Python examples in the next section.

## Using fetch

```js
const baseUrl = "https://cortex.zohirrayhan.com";
const apiKey = "ctx_373762fcf6a1404ea7db393cce902498";

const res = await fetch(`${baseUrl}/v1/chat/completions`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": apiKey,
  },
  body: JSON.stringify({
    model: "web-gemini/gemini-3-thinking",
    messages: [
      { role: "system", content: "You are a concise assistant." },
      { role: "user", content: "Explain this API in one paragraph." },
    ],
    stream: false,
    newConversation: true,
    temperature: 0.5,
    max_tokens: 250,
  }),
});

if (!res.ok) {
  const err = await res.json();
  throw new Error(err?.error?.message || "Request failed");
}

const data = await res.json();
console.log(data.choices?.[0]?.message?.content || "");
```

## Using OpenAI SDK compatible mode

```js
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "ctx_373762fcf6a1404ea7db393cce902498",
  baseURL: "https://cortex.zohirrayhan.com/v1",
});

const completion = await client.chat.completions.create({
  model: "web-chatgpt/gpt-5.4-pro",
  messages: [
    { role: "system", content: "You are a concise assistant." },
    { role: "user", content: "Give me a one-line health summary." },
  ],
  stream: false,
  temperature: 0.4,
  max_tokens: 120,
});

console.log(completion.choices[0]?.message?.content || "");
```

## 8. Python Integration

```python
import requests

base_url = "https://cortex.zohirrayhan.com"
api_key = "ctx_373762fcf6a1404ea7db393cce902498"

payload = {
    "model": "web-grok/grok-expert",
    "messages": [
        {"role": "system", "content": "You are a concise assistant."},
        {"role": "user", "content": "Summarize your capabilities in one line."}
    ],
    "stream": False,
    "newConversation": True,
    "temperature": 0.7,
    "max_tokens": 150,
}

r = requests.post(
    f"{base_url}/v1/chat/completions",
    headers={
        "Content-Type": "application/json",
        "X-API-Key": api_key,
    },
    json=payload,
    timeout=120,
)

r.raise_for_status()
print(r.json()["choices"][0]["message"]["content"])
```

### Python OpenAI SDK Compatible Mode (Correct for run.py)

If you saw this error:

```text
SyntaxError: import OpenAI from "openai";
```

that means JavaScript code was pasted into Python.

Use this Python code instead:

```python
from openai import OpenAI

client = OpenAI(
  api_key="ctx_373762fcf6a1404ea7db393cce902498",
  base_url="https://cortex.zohirrayhan.com/v1",
)

completion = client.chat.completions.create(
  model="web-chatgpt/gpt-5.4-pro",
  messages=[
    {"role": "system", "content": "You are a concise assistant."},
    {"role": "user", "content": "Say hello in one short sentence."},
  ],
  stream=False,
  temperature=0.5,
  max_tokens=120,
)

print(completion.choices[0].message.content)
```

Install dependency first:

```bash
pip install --upgrade openai
```

## 9. Postman Setup

A full Postman collection already exists in this repo:
- cortex.postman_collection.json

Collection variables (currently set):
- baseUrl = https://cortex.zohirrayhan.com
- apiKey = ctx_373762fcf6a1404ea7db393cce902498
- defaultPrompt = Say hello in 5 words
- defaultTemp = 0.7
- defaultMaxTokens = 150

How to use:
1. Import cortex.postman_collection.json.
2. Select any request under ChatGPT, Grok, or Gemini folders.
3. Use Non-Streaming requests for regular JSON responses.
4. Use Streaming requests to inspect SSE events.
5. For admin requests, set adminUsername, adminPassword, and adminToken variables.

## 10. Admin and Operations API

These endpoints are for system operators, not regular API consumers.

Admin auth flow:
1. POST /api/auth/login with username/password.
2. Receive JWT token in response.
3. Send Authorization: Bearer <admin_jwt> for subsequent /api/* admin calls.

Important:
- /v1/login/:provider and /v1/logout/:provider are intentionally blocked (403).
- Browser provider login/logout is done via /api/providers/:provider/login and /api/providers/:provider/logout with admin JWT.

Core admin endpoints:

| Endpoint | Method | Purpose |
|---|---|---|
| /api/auth/login | POST | Admin login |
| /api/auth/logout | POST | Admin logout |
| /api/auth/me | GET | Current admin profile |
| /api/providers/status | GET | Provider session health |
| /api/providers/models | GET | Models plus provider status/usage |
| /api/providers/:provider/login | POST | Trigger provider browser login |
| /api/providers/:provider/logout | POST | Disconnect provider session |
| /api/playground/chat | POST | Admin playground chat endpoint |
| /api/logs | GET | Request logs with filtering |
| /api/audit-logs | GET | Admin action audit logs |
| /api/stats | GET | Dashboard metrics |
| /api/admin/keys | GET/POST | List/create API keys |
| /api/admin/keys/:id | PATCH/DELETE | Update/delete API key |
| /api/admin/admins | GET/POST | List/create admin accounts |
| /api/admin/admins/:id/role | PATCH | Update admin role |
| /api/admin/admins/:id/password | PATCH | Update admin password |
| /api/admin/admins/:id | DELETE | Delete admin |
| /api/config | GET/POST | Read/update runtime config |
| /api/logs/prune | POST | Delete old logs |
| /api/health | GET | Admin API health |

## 11. Errors and Status Codes

| Status | Typical Cause | Example Error |
|---|---|---|
| 400 | Invalid JSON or bad request shape | Invalid JSON / model and messages required |
| 401 | Missing or invalid API key | API key required / Invalid API key |
| 403 | Disabled API key or forbidden route | API key is disabled / forbidden |
| 404 | Unknown model or endpoint | Unknown model: <id> |
| 429 | Daily or rate limit exceeded | Daily limit exceeded / Rate limit exceeded |
| 503 | Provider not connected or provider-side failure | <provider> is not connected |

Public chat error response shape:

```json
{
  "error": {
    "message": "Unknown model: web-unknown/demo",
    "type": "invalid_request"
  }
}
```

## 12. Limit and Quota Behavior

API keys are checked in this order:
1. Key exists
2. Key is active
3. Daily usage has not reached daily_limit
4. Requests in last minute are below rate_limit_per_min

If any check fails, request is denied immediately.

## 13. Logging and Observability

Every request is logged with:
- Provider and model
- API key identity (if applicable)
- HTTP status and response time
- Prompt/completion/total token counts
- Request payload JSON snapshot
- Response payload JSON snapshot
- Error message, IP, and user-agent

Use these endpoints to inspect:
- GET /api/logs
- GET /api/stats
- GET /api/admin/usage

## 14. Best Practices for Reliable Use

1. Call GET /v1/models at startup and cache model IDs.
2. Always send one clear system message first when you need strict behavior.
3. Use newConversation=true for clean independent tasks.
4. Use newConversation=false only when you intentionally want context carryover.
5. Set request timeouts on client side (especially streaming).
6. Handle 429 with retry/backoff.
7. Handle 503 by checking provider connection state via /v1/status or admin routes.
8. Never expose API keys in browser frontend code for public apps.

## 15. Security Note Before Sharing This File

This guide currently contains an active API key value for convenience.
If you share this file outside trusted users:
1. Rotate/revoke the key first.
2. Replace the key value with a placeholder.
3. Issue per-user keys with daily and per-minute limits.
