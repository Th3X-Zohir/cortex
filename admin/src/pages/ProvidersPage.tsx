import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, LogIn, LogOut, ShieldCheck } from 'lucide-react'
import { api } from '@/lib/api'
import { formatDate, formatNumber } from '@/lib/utils'
import type { ModelCatalog } from '@/types'
import {
  BusyPanel,
  Chip,
  EmptyPanel,
  ErrorBanner,
  PageShell,
  SuccessBanner,
  Surface,
  SurfaceHeader,
} from '@/components/dashboard/UiKit'

export function ProvidersPage() {
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [apiKeyDrafts, setApiKeyDrafts] = useState<Record<string, string>>({})

  async function load() {
    setLoading(true)
    setError(null)

    try {
      const next = await api.providers.models()
      setCatalog(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load provider catalog')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function trigger(provider: string, action: 'login' | 'logout') {
    setError(null)
    setNotice(null)

    try {
      if (action === 'login') await api.providers.login(provider)
      else await api.providers.logout(provider)
      setNotice(action === 'login' ? `Login started for ${provider}.` : `${provider} session closed.`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Provider action failed')
    }
  }

  async function saveApiKey(provider: string) {
    const value = apiKeyDrafts[provider]?.trim()
    if (!value) {
      setError('Enter an API key value before saving.')
      return
    }

    setError(null)
    setNotice(null)

    try {
      await api.providers.setApiKey(provider, value)
      setApiKeyDrafts(current => ({ ...current, [provider]: '' }))
      setNotice(`${provider} API key saved.`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save API key')
    }
  }

  const groupedModels = useMemo(() => {
    const map = new Map<string, ModelCatalog['models']>()
    for (const model of catalog?.models ?? []) {
      const current = map.get(model.provider) ?? []
      current.push(model)
      map.set(model.provider, current)
    }
    return map
  }, [catalog?.models])

  const providers = catalog?.providers ?? []
  const connected = providers.filter(provider => provider.sessionValid).length

  return (
    <PageShell
      title="Provider Control"
      description="Manage provider sessions, inspect model-level telemetry, and launch browser login workflows."
      action={<button type="button" className="ui-btn-secondary" onClick={() => void load()}>Refresh</button>}
    >
      {error ? <ErrorBanner text={error} /> : null}
      {notice ? <SuccessBanner text={notice} /> : null}

      <section className="grid gap-3 sm:grid-cols-3">
        <Surface className="p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Providers</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{formatNumber(providers.length)}</p>
          <p className="text-xs text-slate-600">Configured runtime providers</p>
        </Surface>
        <Surface className="p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Connected Sessions</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{formatNumber(connected)}</p>
          <p className="text-xs text-slate-600">Ready for immediate requests</p>
        </Surface>
        <Surface className="p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">VNC Endpoint</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">{catalog?.vnc.enabled ? 'Enabled' : 'Unavailable'}</p>
          <p className="text-xs text-slate-600">{catalog?.vnc.path ?? 'No path configured'}</p>
        </Surface>
      </section>

      {loading ? (
        <BusyPanel text="Loading provider metadata..." />
      ) : providers.length === 0 ? (
        <EmptyPanel text="No providers available in the current runtime." />
      ) : (
        <section className="grid gap-4 xl:grid-cols-2">
          {providers.map(provider => {
            const models = groupedModels.get(provider.name) ?? []
            const isApiProvider = provider.name.endsWith('-api')
            const apiConfigured = catalog?.apiKeysConfigured?.[provider.name]

            return (
              <Surface key={provider.name}>
                <SurfaceHeader
                  title={provider.name}
                  description={`${models.length} models linked`}
                  action={
                    <Chip tone={provider.sessionValid ? 'good' : provider.hasProfile ? 'warn' : 'bad'}>
                      {provider.sessionValid ? 'Connected' : provider.hasProfile ? 'Profile available' : 'Disconnected'}
                    </Chip>
                  }
                />

                <div className="mb-4 flex flex-wrap gap-2">
                  {!isApiProvider ? (
                    <button type="button" className="ui-btn-primary" onClick={() => void trigger(provider.name, 'login')}>
                      <LogIn size={15} /> Login
                    </button>
                  ) : null}

                  <button type="button" className="ui-btn-secondary" onClick={() => void trigger(provider.name, 'logout')}>
                    <LogOut size={15} /> Logout
                  </button>

                  {!isApiProvider && catalog?.vnc.url ? (
                    <a className="ui-btn-secondary" href={catalog.vnc.url} target="_blank" rel="noreferrer">
                      <ExternalLink size={15} /> Open VNC
                    </a>
                  ) : null}
                </div>

                {isApiProvider ? (
                  <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Server API Credential</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <input
                        className="ui-input"
                        type="password"
                        value={apiKeyDrafts[provider.name] ?? ''}
                        placeholder={apiConfigured ? 'Replace provider API key' : 'Set provider API key'}
                        onChange={event => setApiKeyDrafts(current => ({ ...current, [provider.name]: event.target.value }))}
                      />
                      <button type="button" className="ui-btn-primary" onClick={() => void saveApiKey(provider.name)}>
                        Save
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="space-y-2">
                  {models.length === 0 ? (
                    <EmptyPanel text="No models listed for this provider." />
                  ) : (
                    models.map(model => (
                      <article key={model.id} className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{model.displayName}</p>
                            <p className="font-mono text-xs text-slate-600">{model.id}</p>
                          </div>
                          <Chip tone="default">{model.owned_by}</Chip>
                        </div>

                        <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-4">
                          <p><span className="font-semibold text-slate-800">Requests:</span> {formatNumber(model.usage.requests)}</p>
                          <p><span className="font-semibold text-slate-800">Tokens:</span> {formatNumber(model.usage.totalTokens)}</p>
                          <p><span className="font-semibold text-slate-800">Latency:</span> {formatNumber(model.usage.avgResponseTime)} ms</p>
                          <p><span className="font-semibold text-slate-800">Errors:</span> {formatNumber(model.usage.errorCount)}</p>
                        </div>

                        <p className="mt-2 text-xs text-slate-500">
                          Last used {model.usage.lastUsed ? formatDate(model.usage.lastUsed) : 'never'}
                        </p>
                      </article>
                    ))
                  )}
                </div>

                <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-700">
                  <p className="inline-flex items-center gap-1 font-semibold"><ShieldCheck size={12} /> Session tip</p>
                  <p className="mt-1">If a provider is disconnected, launch Login and complete auth in VNC, then refresh status.</p>
                </div>
              </Surface>
            )
          })}
        </section>
      )}
    </PageShell>
  )
}
