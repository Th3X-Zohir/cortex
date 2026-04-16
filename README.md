# cortex

### OpenAI-Compatible AI Gateway for the Modern Web

<!-- Badges -->
<div align="center">

![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen?style=flat-square)
![License](https://img.shields.io/badge/license-Apache--2.0-blue?style=flat-square)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-informational?style=flat-square)

</div>

---

**cortex** is a self-hosted HTTP proxy that exposes web-based AI providers — **Grok, Claude, Gemini, and ChatGPT** — as a local **OpenAI-compatible API**. It uses Playwright to drive real Chromium sessions, so you get the full web experience with none of the API restrictions.

No API keys needed. No OAuth. Just log in once and go.

---

## Why cortex?

| Feature | Description |
|---|---|
| **OpenAI-compatible** | Drop-in replacement for any OpenAI-compatible client. Works with LangChain, LiteLLM, your own code, anything. |
| **Real web sessions** | Uses actual Chromium — not fake API calls. You get whatever ChatGPT/Grok/etc. serve on their web UI, including tools, plugins, and interactive widgets. |
| **Persistent sessions** | Browser state saved to disk. Log in once, restore on restart. No re-authentication. |
| **Streaming & non-streaming** | Full `text/event-stream` support for real-time responses. |
| **Docker ready** | Ships with Xvfb + noVNC — runs headless in any containerized environment. |
| **Provider-agnostic** | Same API for all providers. Swap models with a field change. |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Your Application                          │
│                   (any OpenAI-compatible client)                  │
└──────────────────────────┬────────────────────────────────────────┘
                           │ HTTP / OpenAI API
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     cortex  (:31338)                              │
│                                                                 │
│  ┌──────────────┐    ┌─────────────────────────────────────┐    │
│  │ REST Server  │───▶│  Provider Router                    │    │
│  │ /v1/chat... │    │  Grok · Claude · Gemini · ChatGPT   │    │
│  └──────────────┘    └───────────────┬─────────────────────┘    │
│                                      │                           │
│                                      ▼                           │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │              Playwright (persistent context)                 │ │
│  │                                                               │ │
│  │   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │ │
│  │   │ Grok.com │  │Claude.ai │  │ Gemini   │  │ChatGPT   │    │ │
│  │   │          │  │          │  │Google   │  │.com      │    │ │
│  │   └──────────┘  └──────────┘  └──────────┘  └──────────┘    │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Supported Providers & Models

### Grok
| Model ID | Display Name |
|---|---|
| `web-grok/grok-3` | Grok 3 |
| `web-grok/grok-3-fast` | Grok 3 Fast |
| `web-grok/grok-3-mini` | Grok 3 Mini |
| `web-grok/grok-2` | Grok 2 |
| `web-grok/grok-4.20-beta` | Grok 4.20 Beta |

### Claude (Anthropic)
| Model ID | Display Name |
|---|---|
| `web-claude/claude-opus` | Claude Opus |
| `web-claude/claude-sonnet` | Claude Sonnet |
| `web-claude/claude-haiku` | Claude Haiku |

### Gemini (Google)
| Model ID | Display Name |
|---|---|
| `web-gemini/gemini-3-pro` | Gemini 3 Pro |
| `web-gemini/gemini-3-flash` | Gemini 3 Flash |
| `web-gemini/gemini-2.5-pro` | Gemini 2.5 Pro |
| `web-gemini/gemini-2.5-flash` | Gemini 2.5 Flash |

### ChatGPT (OpenAI)
| Model ID | Display Name |
|---|---|
| `web-chatgpt/gpt-5.4-pro` | GPT-5.4 Pro |
| `web-chatgpt/gpt-5.4-thinking` | GPT-5.4 Thinking |
| `web-chatgpt/gpt-5.3-instant` | GPT-5.3 Instant |
| `web-chatgpt/gpt-5-thinking-mini` | GPT-5 Thinking Mini |
| `web-chatgpt/o3` | o3 |

---

## Quick Start

### Prerequisites

- **Node.js** ≥ 20
- **Chromium** (installed automatically by Playwright)
- ** Bun** (recommended) or **npm**

### 1 — Clone & Build

```bash
git clone https://github.com/Th3X-Zohir/cortex.git
cd cortex
npm install
npm run build
```

### 2 — Start the proxy

```bash
node dist/cli.js start --port=31338 --host=0.0.0.0
```

```
[cortex] cortex v0.2.0 starting on 0.0.0.0:31338…
[cortex] file logging → logs/cortex-2026-04-17T10-30-00.log
[cortex] Proxy listening on 0.0.0.0:31338
```

### 3 — Log in to a provider

```bash
node dist/cli.js login chatgpt
```

A browser window opens. Log in normally. The session is persisted automatically.

> **Tip:** Run `node dist/cli.js login <provider>` for each provider you want to use.

### 4 — Chat

```bash
curl -X POST http://localhost:31338/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "web-chatgpt/gpt-5.4-pro",
    "messages": [{"role": "user", "content": "Explain quantum entanglement in one sentence."}],
    "stream": false
  }'
```

### 5 — Streaming chat

```bash
curl -N -X POST http://localhost:31338/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "web-grok/grok-3",
    "messages": [{"role": "user", "content": "Write a haiku about the sea."}],
    "stream": true
  }'
```

---

## CLI Reference

```bash
cortex start [--port=31338] [--host=0.0.0.0] [--log-level=info|debug|silent]
cortex status
cortex login <grok|claude|gemini|chatgpt>
cortex config [key] [value]
```

### `start`
Launches the HTTP proxy. Accepts these flags:

| Flag | Default | Description |
|---|---|---|
| `--port` | `31338` | TCP port to listen on |
| `--host` | `0.0.0.0` | Host interface to bind |
| `--log-level` | `info` | Verbosity: `silent`, `info`, or `debug` |
| `--headless` | `false` | Run browser in headless mode |

### `status`
Reports whether the proxy is running and the connection status of each provider.

```bash
$ cortex status
cortex v0.2.0 — uptime 1234s
  ✅ grok      connected
  ✅ claude   connected
  ⚠️  gemini   profile exists, not connected
  ❌ chatgpt  no profile
```

### `login <provider>`
Opens a headful Chromium window for interactive login. Session is saved on success.

### `config [key] [value]`
Read or write persistent configuration.

```bash
# View current config
cortex config

# Set a value
cortex config port 8080
cortex config logLevel debug

# Set an API key (for API-based providers)
cortex config apiKeys.claude-api sk-ant-...
```

---

## API Reference

cortex implements the **OpenAI Chat Completions API**. Base URL: `http://localhost:31338`

### `POST /v1/chat/completions`

Send a chat message and receive a response.

**Request**

```json
{
  "model": "web-chatgpt/gpt-5.4-pro",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "What is 5x5?"}
  ],
  "stream": false,
  "temperature": 0.7,
  "max_tokens": 256,
  "newConversation": false
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `model` | string | ✅ | One of the supported model IDs from the table above |
| `messages` | array | ✅ | Array of `{role, content}` chat messages |
| `stream` | boolean | | Enable server-sent events streaming. Default: `false` |
| `temperature` | number | | Sampling temperature (0–2). Default: provider default |
| `max_tokens` | number | | Maximum tokens to generate. Default: provider default |
| `newConversation` | boolean | | Force-start a new conversation. Default: `false` |

**Non-streaming response**

```json
{
  "id": "chatcmpl-1713360000000",
  "object": "chat.completion",
  "model": "web-chatgpt/gpt-5.4-pro",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "5x5 equals 25."
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 0,
    "completion_tokens": 0,
    "total_tokens": 0
  }
}
```

**Streaming response (SSE)**

Each chunk:
```
data: {"id":"chatcmpl-1713360000000","object":"chat.completion.chunk","model":"web-chatgpt/gpt-5.4-pro","choices":[{"index":0,"delta":{"content":"5"},"finish_reason":null}]}

data: {"id":"chatcmpl-1713360000000","object":"chat.completion.chunk","model":"web-chatgpt/gpt-5.4-pro","choices":[{"index":0,"delta":{"content":"x"},"finish_reason":null}]}

data: {"id":"chatcmpl-1713360000000","object":"chat.completion.chunk","model":"web-chatgpt/gpt-5.4-pro","choices":[{"index":0,"delta":{"content":"5"},"finish_reason":null}]}

data: {"id":"chatcmpl-1713360000000","object":"chat.completion.chunk","model":"web-chatgpt/gpt-5.4-pro","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

### `GET /v1/models`

Returns all available models.

### `GET /v1/status`

Returns running status and per-provider connection health.

### `GET /health`

Basic health check.

```json
{ "status": "ok", "service": "cortex", "version": "0.2.0" }
```

### `POST /v1/login/:provider`

Programmatically trigger a provider login. Opens headful browser.

### `POST /v1/logout/:provider`

Close the browser context for a provider.

---

## Docker

### Using the official image

```bash
docker run -d \
  --name cortex \
  -p 31338:31338 \
  -p 5900:5900 \
  -p 6080:6080 \
  -v cortex-profiles:/app/profiles \
  -v cortex-logs:/app/logs \
  th3x-zohir/cortex
```

Then open **http://localhost:6080** in your browser to access the noVNC web interface.

### Using docker-compose

```yaml
services:
  cortex:
    image: th3x-zohir/cortex:latest
    container_name: cortex
    ports:
      - "31338:31338"   # API
      - "5900:5900"       # VNC (optional)
      - "6080:6080"       # noVNC web UI (optional)
    volumes:
      - cortex-profiles:/app/profiles
      - cortex-logs:/app/logs
    environment:
      - CORTEX_PORT=31338
      - CORTEX_HOST=0.0.0.0
      - CORTEX_LOG_LEVEL=info
    restart: unless-stopped

volumes:
  cortex-profiles:
  cortex-logs:
```

### Build your own image

```bash
docker build -t cortex .
docker run -p 31338:31338 cortex
```

---

## Configuration

Config file: `~/.cortex/config.json`

```json
{
  "port": 31338,
  "host": "0.0.0.0",
  "headless": false,
  "logLevel": "info",
  "profileBaseDir": "~/.cortex/profiles",
  "apiKeys": {}
}
```

### Environment variables

All config keys can be set via environment variables with the `CORTEX_` prefix:

| Variable | Description |
|---|---|
| `CORTEX_PORT` | Server port |
| `CORTEX_HOST` | Server host |
| `CORTEX_LOG_LEVEL` | Log level |
| `CORTEX_HEADLESS` | Run browsers headless |
| `ANTHROPIC_API_KEY` | Override for Claude API provider |
| `GEMINI_API_KEY` | Override for Gemini API provider |
| `OPENAI_API_KEY` | Override for Codex API provider |

---

## File Structure

```
~/.cortex/
├── config.json                      # Configuration
├── profiles/                        # Browser session data
│   ├── grok-profile/
│   ├── claude-profile/
│   ├── gemini-profile/
│   └── chatgpt-profile/
├── grok-expiry.json                # Session expiry metadata
├── claude-expiry.json
├── gemini-expiry.json
└── chatgpt-expiry.json

./cortex/
├── logs/                           # Log files
│   └── cortex-YYYY-MM-DDTHH-MM-SS.log
└── dist/                           # Build output
```

---

## Library Usage

cortex is also importable as a Node.js module.

```typescript
import { BridgeServer, loadConfig } from 'cortex';

const config = loadConfig({ port: 31338 });
const server = new BridgeServer(config);

await server.start();
console.log('cortex running on', config.port);

// Access the provider registry
const status = await server.registry.getStatus();
for (const p of status.providers) {
  console.log(`${p.name}: ${p.sessionValid ? 'connected' : 'offline'}`);
}

// Send a chat request programmatically
const grok = server.registry.get('grok');
await grok.ensureConnected();

for await (const chunk of grok.chatStream({
  model: 'web-grok/grok-3',
  messages: [{ role: 'user', content: 'Hello!' }],
})) {
  process.stdout.write(chunk);
}
```

---

## Troubleshooting

### Browser doesn't launch / provider stays offline

1. Make sure Playwright's browser is installed:
   ```bash
   npx playwright install chromium
   ```

2. Check that `$HOME/.cortex/profiles/` is writable.

3. Try with `--log-level=debug` for detailed diagnostics:
   ```bash
   cortex start --log-level=debug
   ```

### Session not persisting / keeps asking to log in

- Ensure you're not clearing browser data between runs.
- Check that your antivirus isn't stripping cookies.
- Try deleting the profile folder and logging in again:
  ```bash
  rm -rf ~/.cortex/profiles/<provider>-profile/
  cortex login <provider>
  ```

### `ECONNREFUSED` when calling the API

- Verify cortex is running: `cortex status`
- Check the port matches: `curl http://localhost:31338/health`
- Ensure no firewall is blocking the port

### Docker: Chromium fails inside container

- Ensure the Docker container has sufficient permissions and resources.
- Use the provided `docker-compose.yml` which includes proper volume mounts.
- For ARM devices (Raspberry Pi), use the `--platform=linux/amd64` flag if needed.

---

## Contributing

Contributions are welcome. Please open an issue first to discuss what you'd like to change.

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -am 'Add my feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request

---

## License

Apache License 2.0 — see [LICENSE](LICENSE) for details.
