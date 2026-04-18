import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { Config } from '@/types'
import { Alert, Field, FullWidthLoading, Page, Panel, RefreshButton } from '@/components/shared/AppPrimitives'

export function SettingsPage() {
  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)

  async function load() {
    setLoading(true)
    try {
      setConfig(await api.config.get())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function save() {
    if (!config) return
    const next = await api.config.set({
      host: config.host,
      port: config.port,
      headless: config.headless,
      logLevel: config.logLevel,
      admin: config.admin,
    })
    setConfig(next)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2500)
  }

  if (!config) {
    return <Page title="Settings" description="Runtime configuration and security controls."><FullWidthLoading /></Page>
  }

  return (
    <Page title="Settings" description="Runtime configuration, retention, CORS, and authentication enforcement." action={<RefreshButton onClick={load} loading={loading} />}>
      {saved && <Alert tone="good">Settings saved. Restart the service for host, port, and some runtime changes to take effect.</Alert>}
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Panel title="Service runtime" description="Network and provider process configuration.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Host"><input className="input" value={config.host} onChange={event => setConfig({ ...config, host: event.target.value })} /></Field>
            <Field label="Port"><input className="input" type="number" min={1} value={config.port} onChange={event => setConfig({ ...config, port: Number(event.target.value) })} /></Field>
            <Field label="Log level">
              <select className="input" value={config.logLevel} onChange={event => setConfig({ ...config, logLevel: event.target.value as Config['logLevel'] })}>
                <option value="silent">Silent</option>
                <option value="info">Info</option>
                <option value="debug">Debug</option>
              </select>
            </Field>
            <label className="cursor-pointer rounded-xl border border-white/10 bg-white/[0.02] p-3 text-sm backdrop-blur-xl">
              <span className="flex items-center gap-3">
                <input type="checkbox" checked={config.headless} onChange={event => setConfig({ ...config, headless: event.target.checked })} className="accent-primary" />
                Headless provider browsers
              </span>
            </label>
          </div>
        </Panel>

        <Panel title="Security controls" description="Authentication, retention, and browser API access policy.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Admin token TTL seconds"><input className="input" type="number" min={300} value={config.admin.tokenTtlSeconds} onChange={event => setConfig({ ...config, admin: { ...config.admin, tokenTtlSeconds: Number(event.target.value) } })} /></Field>
            <Field label="Log retention days"><input className="input" type="number" min={1} value={config.admin.logRetentionDays} onChange={event => setConfig({ ...config, admin: { ...config.admin, logRetentionDays: Number(event.target.value) } })} /></Field>
            <Field label="CORS origin"><input className="input" value={config.admin.corsOrigin} onChange={event => setConfig({ ...config, admin: { ...config.admin, corsOrigin: event.target.value } })} /></Field>
            <label className="cursor-pointer rounded-xl border border-white/10 bg-white/[0.02] p-3 text-sm backdrop-blur-xl">
              <span className="flex items-center gap-3">
                <input type="checkbox" checked={config.admin.requireApiKey} onChange={event => setConfig({ ...config, admin: { ...config.admin, requireApiKey: event.target.checked } })} className="accent-primary" />
                Require API keys for /v1
              </span>
            </label>
          </div>
          <div className="mt-4 space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-sm text-white/40 backdrop-blur-xl">
            <p>Admin database: <span className="font-mono text-primary/60">{config.admin.dbPath}</span></p>
            <p>JWT secret configured: {config.admin.jwtSecretConfigured ? 'yes' : 'generated local secret file'}</p>
            <p>noVNC public port: <span className="font-mono text-primary/60">{config.vnc.externalPort}</span></p>
          </div>
        </Panel>
      </div>
      <button className="btn-primary mt-5" onClick={save}>Save settings</button>
    </Page>
  )
}
