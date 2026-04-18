import * as React from "react"
import { motion, useInView, useSpring, useTransform } from "framer-motion"
import {
  Activity, AlertTriangle, Cpu, Gauge, PlugZap, Clock3, RefreshCcw,
  CheckCircle2, TrendingUp, Zap, Server, BarChart3, Circle
} from "lucide-react"
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts"
import { api } from "~/lib/api"
import { formatNumber } from "~/lib/utils"
import { Skeleton } from "~/components/ui/skeleton"
import type { Stats, UsageSummary, BridgeStatus } from "~/types"

const providerColors = ["#00ffd5", "#ffd700", "#00bfff", "#ff6b6b", "#4ecdc4", "#ff9f43"]

function AnimatedNumber({ value, suffix = "" }: { value: number; suffix?: string }) {
  const spring = useSpring(0, { stiffness: 60, damping: 20 })
  const display = useTransform(spring, (v) => `${formatNumber(Math.round(v))}${suffix}`)
  const ref = React.useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { once: true, margin: "-50px" })

  React.useEffect(() => {
    if (isInView) {
      spring.set(value)
    }
  }, [isInView, spring, value])

  return <motion.span ref={ref}>{display}</motion.span>
}

function MetricBento({
  label,
  value,
  rawValue,
  icon: Icon,
  description,
  accentColor = "var(--primary)",
  index
}: {
  label: string
  value: string
  rawValue: number
  icon: React.ElementType
  description?: string
  accentColor?: string
  index: number
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: "-30px" })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={isInView ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={{
        duration: 0.5,
        delay: index * 0.08,
        ease: [0.16, 1, 0.3, 1]
      }}
      className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-xl p-5 hover:border-white/[0.15] transition-all duration-500"
    >
      {/* Ambient glow */}
      <div
        className="absolute -top-20 -right-20 w-32 h-32 rounded-full opacity-0 group-hover:opacity-20 transition-opacity duration-700 blur-2xl"
        style={{ background: accentColor }}
      />

      {/* Animated border gradient on hover */}
      <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500">
        <div
          className="absolute inset-0 rounded-2xl p-[1px]"
          style={{
            background: `linear-gradient(135deg, ${accentColor}40, transparent 50%, ${accentColor}40)`,
            WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
            WebkitMaskComposite: "xor",
            maskComposite: "exclude"
          }}
        />
      </div>

      <div className="relative z-10 flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center border border-white/[0.1] bg-white/[0.05]"
            style={{
              boxShadow: `0 0 20px ${accentColor}20, inset 0 1px 0 rgba(255,255,255,0.1)`
            }}
          >
            <Icon size={22} style={{ color: accentColor }} />
          </div>
          <motion.div
            className="flex items-center gap-1 px-2 py-1 rounded-full bg-white/[0.05] border border-white/[0.08]"
            initial={{ opacity: 0, x: 10 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: index * 0.08 + 0.3, duration: 0.3 }}
          >
            <Circle size={6} fill={accentColor} style={{ color: accentColor }} className="animate-pulse" />
            <span className="text-[10px] font-medium text-white/60">LIVE</span>
          </motion.div>
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40 mb-1.5">{label}</p>
          <p className="text-3xl font-bold tracking-tight text-white">
            <AnimatedNumber value={rawValue} suffix={value.replace(/[0-9,]/g, "")} />
          </p>
          {description && (
            <p className="text-xs text-white/40 mt-1.5 line-clamp-1">{description}</p>
          )}
        </div>
      </div>

      {/* Bottom accent line */}
      <motion.div
        className="absolute bottom-0 left-4 right-4 h-[2px] rounded-full"
        style={{ background: `linear-gradient(90deg, transparent, ${accentColor}60, transparent)` }}
        initial={{ scaleX: 0, opacity: 0 }}
        animate={isInView ? { scaleX: 1, opacity: 1 } : {}}
        transition={{ delay: index * 0.08 + 0.4, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      />
    </motion.div>
  )
}

function ChartCard({
  title,
  subtitle,
  children,
  index,
  className = ""
}: {
  title: string
  subtitle: string
  children: React.ReactNode
  index: number
  className?: string
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: "-30px" })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay: index * 0.1, ease: [0.16, 1, 0.3, 1] }}
      className={`rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-xl overflow-hidden ${className}`}
    >
      <div className="p-6 pb-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-semibold text-white">{title}</h3>
          <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
        </div>
        <p className="text-xs text-white/40">{subtitle}</p>
      </div>
      <div className="px-6 pb-6">
        {children}
      </div>
    </motion.div>
  )
}

function ProviderHealthItem({ name, models, connected, hasProfile }: {
  name: string
  models: number
  connected: boolean
  hasProfile: boolean
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x: -20 }}
      animate={isInView ? { opacity: 1, x: 0 } : {}}
      className="group flex items-center justify-between py-3 border-b border-white/[0.05] last:border-0"
    >
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${connected ? "bg-success/10" : "bg-warning/10"}`}>
          <Server size={14} className={connected ? "text-success" : "text-warning"} />
        </div>
        <div>
          <p className="text-sm font-medium text-white/90">{name}</p>
          <p className="text-[11px] text-white/40">{models} models</p>
        </div>
      </div>
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={isInView ? { scale: 1, opacity: 1 } : {}}
        className={`px-3 py-1 rounded-full text-[11px] font-medium border ${
          connected
            ? "bg-success/10 text-success border-success/20"
            : hasProfile
              ? "bg-warning/10 text-warning border-warning/20"
              : "bg-white/5 text-white/40 border-white/10"
        }`}
      >
        {connected ? (
          <span className="flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success" />
            </span>
            Connected
          </span>
        ) : hasProfile ? "Profile found" : "Disconnected"}
      </motion.div>
    </motion.div>
  )
}

function FailureItem({ model, error, statusCode, time }: {
  model: string
  error?: string | null
  statusCode?: number | null
  time: string
}) {
  const getStatusStyle = () => {
    if (!statusCode) return "bg-info/10 text-info border-info/20"
    if (statusCode >= 500) return "bg-destructive/10 text-destructive border-destructive/20"
    if (statusCode >= 400) return "bg-warning/10 text-warning border-warning/20"
    return "bg-success/10 text-success border-success/20"
  }

  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-white/[0.05] last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-mono text-white/80 truncate">{model}</p>
        <p className="text-[11px] text-white/40 mt-0.5 truncate">{error || "Request failed"}</p>
      </div>
      <div className="text-right shrink-0">
        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${getStatusStyle()}`}>
          {statusCode || "Pending"}
        </span>
        <p className="text-[10px] text-white/30 mt-1">{time}</p>
      </div>
    </div>
  )
}

function TokenDisplay({ label, value, icon: Icon, accentColor }: {
  label: string
  value: number
  icon: React.ElementType
  accentColor: string
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 10 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]"
    >
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center"
        style={{ background: `${accentColor}15` }}
      >
        <Icon size={18} style={{ color: accentColor }} />
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">{label}</p>
        <p className="text-lg font-bold text-white">
          <AnimatedNumber value={value} />
        </p>
      </div>
    </motion.div>
  )
}

export function OverviewPage() {
  const [stats, setStats] = React.useState<Stats | null>(null)
  const [usage, setUsage] = React.useState<UsageSummary | null>(null)
  const [status, setStatus] = React.useState<BridgeStatus | null>(null)
  const [loading, setLoading] = React.useState(true)

  async function load() {
    setLoading(true)
    try {
      const [nextStats, nextUsage, nextStatus] = await Promise.all([
        api.stats.get(),
        api.admin.usage(),
        api.providers.status(),
      ])
      setStats(nextStats)
      setUsage(nextUsage)
      setStatus(nextStatus)
    } catch {
      // handle error silently
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    load()
    const timer = window.setInterval(load, 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.06, delayChildren: 0.1 }
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="min-h-screen p-6 lg:p-8 space-y-6"
    >
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col lg:flex-row lg:items-center justify-between gap-4"
      >
        <div>
          <div className="flex items-center gap-3 mb-2">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border border-white/10 flex items-center justify-center"
            >
              <Zap size={20} className="text-primary" />
            </motion.div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Dashboard</h1>
          </div>
          <p className="text-sm text-white/50">Real-time metrics and system health monitoring</p>
        </div>

        <motion.button
          onClick={load}
          disabled={loading}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="group relative inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 hover:border-white/20 transition-all duration-300 overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-accent/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <RefreshCcw size={16} className={`text-white/70 ${loading ? "animate-spin" : ""}`} />
          <span className="relative text-sm font-medium text-white/80">Refresh</span>
        </motion.button>
      </motion.div>

      {/* Bento Grid - Metrics Row */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4"
      >
        {loading && !stats ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-xl p-5 space-y-4">
              <Skeleton className="h-12 w-12 rounded-xl" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-8 w-16" />
            </div>
          ))
        ) : (
          <>
            <MetricBento
              label="Requests 24h"
              value={formatNumber(stats?.overview.requestsLast24h ?? 0)}
              rawValue={stats?.overview.requestsLast24h ?? 0}
              icon={Activity}
              description={`${formatNumber(stats?.overview.requestsLast1h ?? 0)} in last hour`}
              accentColor="var(--primary)"
              index={0}
            />
            <MetricBento
              label="Error Rate"
              value={`${stats?.overview.errorRate ?? "0%"}`}
              rawValue={Number.parseFloat(stats?.overview.errorRate ?? "0")}
              icon={AlertTriangle}
              description={`${formatNumber(stats?.overview.errorCount ?? 0)} failed`}
              accentColor={Number.parseFloat(stats?.overview.errorRate ?? "0") > 5 ? "#ff6b6b" : "var(--success)"}
              index={1}
            />
            <MetricBento
              label="Avg Latency"
              value={`${formatNumber(stats?.overview.avgResponseTime ?? 0)}ms`}
              rawValue={stats?.overview.avgResponseTime ?? 0}
              icon={Clock3}
              description="All provider calls"
              accentColor="var(--info)"
              index={2}
            />
            <MetricBento
              label="Daily Usage"
              value={`${usage?.summary.usagePercent ?? 0}%`}
              rawValue={usage?.summary.usagePercent ?? 0}
              icon={Gauge}
              description={`${formatNumber(usage?.summary.totalUsage ?? 0)} of ${formatNumber(usage?.summary.totalLimit ?? 0)}`}
              accentColor={(usage?.summary.usagePercent ?? 0) > 85 ? "#ff6b6b" : "var(--warning)"}
              index={3}
            />
            <MetricBento
              label="Tokens 24h"
              value={formatNumber(stats?.overview.tokensLast24h ?? 0)}
              rawValue={stats?.overview.tokensLast24h ?? 0}
              icon={Cpu}
              description={`${formatNumber(stats?.overview.totalTokens ?? 0)} lifetime`}
              accentColor="var(--accent)"
              index={4}
            />
            <MetricBento
              label="Providers"
              value={`${status?.providers.filter(p => p.sessionValid).length ?? 0}/${status?.providers.length ?? 0}`}
              rawValue={status?.providers.filter(p => p.sessionValid).length ?? 0}
              icon={PlugZap}
              description="Connected sessions"
              accentColor={status?.providers.some(p => p.sessionValid) ? "var(--success)" : "var(--warning)"}
              index={5}
            />
          </>
        )}
      </motion.div>

      {/* Main Charts Row - Bento Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Request Trend - Large Chart */}
        <ChartCard
          title="Request Volume"
          subtitle="Hourly distribution over 24h window"
          index={0}
          className="lg:col-span-2"
        >
          {loading && !stats ? (
            <Skeleton className="h-72 w-full rounded-xl" />
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="h-72"
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats?.hourlyData ?? []}>
                  <defs>
                    <linearGradient id="requestFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00ffd5" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#00ffd5" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="tokenFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6a9bcc" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#6a9bcc" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis
                    dataKey="hour"
                    tick={{ fontSize: 11, fill: "rgba(255,255,255,0.4)" }}
                    minTickGap={30}
                    axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "rgba(255,255,255,0.4)" }}
                    width={45}
                    axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(10,10,10,0.9)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "12px",
                      fontSize: "12px",
                      backdropFilter: "blur(10px)"
                    }}
                    labelStyle={{ color: "rgba(255,255,255,0.6)" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#00ffd5"
                    fill="url(#requestFill)"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4, fill: "#00ffd5", strokeWidth: 0 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="totalTokens"
                    stroke="#6a9bcc"
                    fill="url(#tokenFill)"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    dot={false}
                    activeDot={{ r: 4, fill: "#6a9bcc", strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </motion.div>
          )}
        </ChartCard>

        {/* Provider Health */}
        <ChartCard
          title="Provider Status"
          subtitle="Session connectivity"
          index={1}
        >
          {loading && !status ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <Skeleton className="h-10 w-40" />
                  <Skeleton className="h-6 w-24 rounded-full" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {(status?.providers ?? []).map(provider => (
                <ProviderHealthItem
                  key={provider.name}
                  name={provider.name}
                  models={provider.models.length}
                  connected={provider.sessionValid}
                  hasProfile={provider.hasProfile}
                />
              ))}
              {(!status?.providers || status.providers.length === 0) && (
                <div className="flex flex-col items-center justify-center py-12">
                  <Server size={32} className="text-white/20 mb-3" />
                  <p className="text-sm text-white/40">No providers configured</p>
                </div>
              )}
            </div>
          )}
        </ChartCard>
      </div>

      {/* Second Row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Token Accounting - Bento */}
        <ChartCard
          title="Token Accounting"
          subtitle="Prompt & completion breakdown"
          index={2}
          className="lg:col-span-2"
        >
          {loading && !stats ? (
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <TokenDisplay
                label="Input"
                value={stats?.overview.promptTokens ?? 0}
                icon={TrendingUp}
                accentColor="#00ffd5"
              />
              <TokenDisplay
                label="Output"
                value={stats?.overview.completionTokens ?? 0}
                icon={BarChart3}
                accentColor="#6a9bcc"
              />
              <TokenDisplay
                label="Total"
                value={stats?.overview.totalTokens ?? 0}
                icon={Cpu}
                accentColor="#ffd700"
              />
            </div>
          )}
        </ChartCard>

        {/* Recent Failures */}
        <ChartCard
          title="Recent Failures"
          subtitle="Latest rejected requests"
          index={3}
          className="lg:col-span-3"
        >
          {loading && !stats ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto pr-2 -mr-2">
              {(stats?.recentErrors ?? []).slice(0, 6).map(item => (
                <FailureItem
                  key={item.id}
                  model={item.model}
                  error={item.error}
                  statusCode={item.statusCode}
                  time={item.createdAt ? new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                />
              ))}
              {(!stats?.recentErrors || stats.recentErrors.length === 0) && (
                <div className="flex flex-col items-center justify-center py-12">
                  <motion.div
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <CheckCircle2 size={32} className="text-success mb-3" />
                  </motion.div>
                  <p className="text-sm text-white/40">No recent failures detected</p>
                  <p className="text-[11px] text-white/25 mt-1">All systems operational</p>
                </div>
              )}
            </div>
          )}
        </ChartCard>
      </div>

      {/* Third Row - Distribution Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Provider Distribution */}
        <ChartCard
          title="Provider Distribution"
          subtitle="Request share by provider"
          index={4}
        >
          {loading && !stats ? (
            <Skeleton className="h-72 w-full rounded-xl" />
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="h-72 flex items-center justify-center"
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats?.providerDistribution ?? []}
                    dataKey="value"
                    nameKey="name"
                    outerRadius={100}
                    innerRadius={60}
                    paddingAngle={3}
                    strokeWidth={0}
                  >
                    {(stats?.providerDistribution ?? []).map((_, index) => (
                      <Cell
                        key={index}
                        fill={providerColors[index % providerColors.length]}
                        style={{
                          filter: `drop-shadow(0 0 8px ${providerColors[index % providerColors.length]}40)`
                        }}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "rgba(10,10,10,0.95)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "12px",
                      fontSize: "12px",
                      backdropFilter: "blur(10px)"
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </motion.div>
          )}
          {/* Legend */}
          {!loading && stats?.providerDistribution && (
            <div className="flex flex-wrap gap-3 justify-center mt-2">
              {stats.providerDistribution.map((item, i) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ background: providerColors[i % providerColors.length] }}
                  />
                  <span className="text-xs text-white/50">{item.name}</span>
                </div>
              ))}
            </div>
          )}
        </ChartCard>

        {/* Top Models */}
        <ChartCard
          title="Top Models"
          subtitle="Most frequently requested"
          index={5}
        >
          {loading && !stats ? (
            <Skeleton className="h-72 w-full rounded-xl" />
          ) : (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className="h-72"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={(stats?.byModel ?? []).slice(0, 8)}
                  layout="vertical"
                  margin={{ left: 20, right: 30 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.05)"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: "rgba(255,255,255,0.4)" }}
                    axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="model"
                    tick={{ fontSize: 10, fill: "rgba(255,255,255,0.5)" }}
                    width={120}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(10,10,10,0.95)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "12px",
                      fontSize: "12px",
                      backdropFilter: "blur(10px)"
                    }}
                    cursor={{ fill: "rgba(255,255,255,0.03)" }}
                  />
                  <Bar
                    dataKey="count"
                    fill="#00ffd5"
                    radius={[0, 6, 6, 0]}
                    maxBarSize={24}
                    style={{
                      filter: "drop-shadow(0 0 6px rgba(0,255,213,0.3))"
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </motion.div>
          )}
        </ChartCard>
      </div>
    </motion.div>
  )
}