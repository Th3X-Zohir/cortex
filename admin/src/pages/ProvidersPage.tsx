import { useEffect, useMemo, useState } from 'react'
import { Cpu, ExternalLink, Eye, PlugZap } from 'lucide-react'
import { api } from '@/lib/api'
import { formatDate, formatNumber } from '@/lib/utils'
import type { ModelCatalog } from '@/types'
import { Alert, Metric, Page, Panel, RefreshButton, StatusPill } from '@/components/shared/AppPrimitives'

export function ProvidersPage() {
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [apiKeyDrafts, setApiKeyDrafts] = useState<Record<string, string>>({})

  async function load() {
    setLoading(true)
    try {
      setCatalog(await api.providers.models())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function action(provider: string, operation: 'login' | 'logout') {
    setMessage(null)
    try {
      if (operation === 'login') await api.providers.login(provider)
      else await api.providers.logout(provider)
      setMessage(operation === 'login' ? 'Login browser started on the server.' : 'Provider session closed.')
      await load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Provider action failed')
    }
  }

  async function saveApiKey(provider: string) {
    const key = apiKeyDrafts[provider]?.trim()
    if (!key) {
      setMessage('Enter an API key before saving.')
      return
    }
    try {
      await api.providers.setApiKey(provider, key)
      setApiKeyDrafts({ ...apiKeyDrafts, [provider]: '' })
      setMessage(`${provider} credentials saved. Provider status will refresh on the next request.`)
      await load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to save provider credentials')
    }
  }

  const grouped = useMemo(() => {
    const byProvider = new Map<string, ModelCatalog['models']>()
    for (const model of catalog?.models ?? []) {
      const list = byProvider.get(model.provider) ?? []
      list.push(model)
      byProvider.set(model.provider, list)
    }
    return byProvider
  }, [catalog])

  return (
    <Page title="Model Control" description="Manage model sessions, provider credentials, usage, and browser login workflows." action={<RefreshButton onClick={load} loading={loading} />}>
      {message && <Alert>{message}</Alert>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Models" value={formatNumber(catalog?.models.length ?? 0)} helper="Registered in Cortex" icon={Cpu} />
        <Metric label="Connected" value={formatNumber(catalog?.providers.filter(p => p.sessionValid).length ?? 0)} helper="Ready providers" icon={PlugZap} tone={(catalog?.providers.some(p => p.sessionValid) ?? false) ? 'good' : 'warn'} />
        <Metric label="VNC" value={catalog?.vnc.enabled ? 'Ready' : 'Off'} helper={catalog?.vnc.url ? catalog.vnc.path : 'Unavailable'} icon={Eye} />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {(catalog?.providers ?? []).map(provider => (
          <Panel key={provider.name} title={provider.name} description={`${grouped.get(provider.name)?.length ?? provider.models.length} model configurations`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-2">
                <StatusPill ok={provider.sessionValid} trueLabel="Connected" falseLabel={provider.hasProfile ? 'Profile exists' : 'Disconnected'} />
                <p className="text-sm text-white/60">
                  {provider.name.endsWith('-api') ? 'Uses configured server API credentials.' : 'Uses a managed browser session profile.'}
                </p>
              </div>
              <div className="flex gap-2">
                {!provider.name.endsWith('-api') && <button className="btn-primary" onClick={() => action(provider.name, 'login')}>Login</button>}
                <button className="btn-ghost" onClick={() => action(provider.name, 'logout')}>Logout</button>
                {!provider.name.endsWith('-api') && catalog?.vnc.url && (
                  <a className="btn-ghost" href={catalog.vnc.url} target="_blank" rel="noreferrer"><ExternalLink size={15} />VNC</a>
                )}
              </div>
            </div>
            {provider.name.endsWith('-api') && (
              <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <input
                  className="input"
                  type="password"
                  placeholder={`${catalog?.apiKeysConfigured[provider.name] ? 'Replace' : 'Set'} ${provider.name} API key`}
                  value={apiKeyDrafts[provider.name] ?? ''}
                  onChange={event => setApiKeyDrafts({ ...apiKeyDrafts, [provider.name]: event.target.value })}
                />
                <button className="btn-primary" onClick={() => saveApiKey(provider.name)}>Save key</button>
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {(grouped.get(provider.name) ?? []).map(model => (
                <div className="min-w-56 flex-1 rounded-xl border border-white/10 bg-white/[0.02] p-3 backdrop-blur-xl" key={model.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{model.displayName}</p>
                      <p className="mt-1 font-mono text-xs text-white/40">{model.id}</p>
                    </div>
                    <span className="status-primary">{model.owned_by}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div><p className="label text-white/60">Requests</p><p className="font-semibold">{formatNumber(model.usage.requests)}</p></div>
                    <div><p className="label text-white/60">Tokens</p><p className="font-semibold">{formatNumber(model.usage.totalTokens)}</p></div>
                    <div><p className="label text-white/60">Errors</p><p className="font-semibold">{formatNumber(model.usage.errorCount)}</p></div>
                  </div>
                  <p className="mt-2 text-xs text-white/40">Last used {model.usage.lastUsed ? formatDate(model.usage.lastUsed) : 'never'}</p>
                </div>
              ))}
            </div>
          </Panel>
        ))}
      </div>
    </Page>
  )
}
