import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { api } from '@/lib/api'
import type { Config } from '@/types'
import {
  BusyPanel,
  ErrorBanner,
  PageShell,
  SuccessBanner,
  Surface,
  SurfaceHeader,
} from '@/components/dashboard/UiKit'

export function SettingsPage() {
  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)

    try {
      const next = await api.config.get()
      setConfig(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load runtime config')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function save() {
    if (!config) return

    setSaving(true)
    setError(null)
    setNotice(null)

    try {
      const updated = await api.config.set({
        host: config.host,
        port: config.port,
        headless: config.headless,
        logLevel: config.logLevel,
        admin: config.admin,
      })
      setConfig(updated)
      setNotice('Settings saved. Some fields may require service restart to fully apply.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageShell
      title="Runtime Settings"
      description="Manage service runtime behavior, auth policy, retention, and CORS for the admin plane."
      action={<button type="button" className="ui-btn-secondary" onClick={() => void load()}>Reload</button>}
    >
      {error ? <ErrorBanner text={error} /> : null}
      {notice ? <SuccessBanner text={notice} /> : null}

      {loading || !config ? (
        <BusyPanel text="Loading settings..." />
      ) : (
        <section className="grid gap-4 xl:grid-cols-2">
          <Surface>
            <SurfaceHeader title="Service Runtime" description="Core host, port, browser mode, and log behavior." />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="ui-label">Host</label>
                <input
                  className="ui-input"
                  value={config.host}
                  onChange={event => setConfig(current => current ? { ...current, host: event.target.value } : current)}
                />
              </div>
              <div>
                <label className="ui-label">Port</label>
                <input
                  className="ui-input"
                  type="number"
                  min={1}
                  value={config.port}
                  onChange={event => setConfig(current => current ? { ...current, port: Number(event.target.value) } : current)}
                />
              </div>
              <div>
                <label className="ui-label">Log Level</label>
                <select
                  className="ui-input"
                  value={config.logLevel}
                  onChange={event => setConfig(current => current ? { ...current, logLevel: event.target.value as Config['logLevel'] } : current)}
                >
                  <option value="silent">silent</option>
                  <option value="info">info</option>
                  <option value="debug">debug</option>
                </select>
              </div>
              <label className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={config.headless}
                  onChange={event => setConfig(current => current ? { ...current, headless: event.target.checked } : current)}
                  className="mr-2"
                />
                Headless browser automation
              </label>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              <p>Profile directory: <span className="font-mono text-slate-700">{config.profileBaseDir}</span></p>
            </div>
          </Surface>

          <Surface>
            <SurfaceHeader title="Admin Security Policy" description="Configure token TTL, key enforcement, retention, and CORS." />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="ui-label">Token TTL (seconds)</label>
                <input
                  className="ui-input"
                  type="number"
                  min={300}
                  value={config.admin.tokenTtlSeconds}
                  onChange={event =>
                    setConfig(current =>
                      current
                        ? {
                            ...current,
                            admin: { ...current.admin, tokenTtlSeconds: Number(event.target.value) },
                          }
                        : current,
                    )
                  }
                />
              </div>

              <div>
                <label className="ui-label">Log Retention (days)</label>
                <input
                  className="ui-input"
                  type="number"
                  min={1}
                  value={config.admin.logRetentionDays}
                  onChange={event =>
                    setConfig(current =>
                      current
                        ? {
                            ...current,
                            admin: { ...current.admin, logRetentionDays: Number(event.target.value) },
                          }
                        : current,
                    )
                  }
                />
              </div>

              <div className="sm:col-span-2">
                <label className="ui-label">CORS Origin</label>
                <input
                  className="ui-input"
                  value={config.admin.corsOrigin}
                  onChange={event =>
                    setConfig(current =>
                      current
                        ? {
                            ...current,
                            admin: { ...current.admin, corsOrigin: event.target.value },
                          }
                        : current,
                    )
                  }
                />
              </div>

              <label className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={config.admin.requireApiKey}
                  onChange={event =>
                    setConfig(current =>
                      current
                        ? {
                            ...current,
                            admin: { ...current.admin, requireApiKey: event.target.checked },
                          }
                        : current,
                    )
                  }
                  className="mr-2"
                />
                Require API key for /v1 endpoints
              </label>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              <p>Admin DB Path: <span className="font-mono text-slate-700">{config.admin.dbPath}</span></p>
              <p>JWT Secret: {config.admin.jwtSecretConfigured ? 'Configured' : 'Generated at runtime'}</p>
              <p>noVNC proxy path: <span className="font-mono text-slate-700">{config.vnc.proxyPath}</span></p>
            </div>
          </Surface>
        </section>
      )}

      {!loading && config ? (
        <button type="button" className="ui-btn-primary" onClick={() => void save()} disabled={saving}>
          <Save size={14} /> {saving ? 'Saving...' : 'Save settings'}
        </button>
      ) : null}
    </PageShell>
  )
}
