'use client'

import { useEffect, useState } from 'react'
import { getJson } from './fetch'
import { StatCard, Card, Chip } from './bits'
import { BarChart, LineChart, HBars, fmt, fmtBytes } from './charts'
import { AdminRealtime } from './realtime'

interface DayPoint {
  day: string
  value: number
}
interface AiDayPoint extends DayPoint {
  ok: number
}
interface Overview {
  version: string
  dbLatencyMs: number
  totals: {
    users: number
    designs: number
    templates: number
    mediaCount: number
    mediaBytes: number
    comments: number
    aiCalls: number
    activeSessions: number
  }
  windows: { requests24h: number; requests7d: number; ai7d: number; dauToday: number }
  series: { traffic: DayPoint[]; dau: DayPoint[]; signups: DayPoint[]; aiCalls: AiDayPoint[] }
  topRoutes: { route: string; method: string; hits: number }[]
  aiByFeature: { feature: string; calls: number; ok: number }[]
  recentUsers: { id: string; username: string; role: string; createdAt: string; admin: boolean }[]
  provider: { configured: boolean; source: string | null; providerCount: number; slotsSet: number }
}

const SOURCE_LABEL: Record<string, string> = {
  multi: '提供商表',
  db: '控制台覆盖',
  env: 'environment',
  file: '配置文件',
}

export function AdminOverview() {
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    getJson<Overview>('/api/admin/overview').then((res) => {
      if (!alive) return
      if (res.ok) setData(res.data)
      else setError(res.data?.error ?? `Request failed (${res.status})`)
    })
    return () => {
      alive = false
    }
  }, [])

  if (error) {
    return (
      <Card title="总览">
        <p className="text-sm text-destructive">{error}</p>
      </Card>
    )
  }
  if (!data) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    )
  }

  const aiFail7d = Math.max(
    0,
    data.series.aiCalls.slice(-7).reduce((a, p) => a + Math.max(0, p.value - p.ok), 0)
  )

  return (
    <>
      <AdminRealtime />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="用户" value={fmt(data.totals.users)} sub={`${data.windows.dauToday} 人今日活跃`} />
        <StatCard label="设计" value={fmt(data.totals.designs)} sub={`${fmt(data.totals.templates)} 个模板`} />
        <StatCard label="API 请求" value={fmt(data.windows.requests24h)} sub={`${fmt(data.windows.requests7d)} 次（7 天内）`} />
        <StatCard
          label="AI 调用"
          value={fmt(data.windows.ai7d)}
          sub={`7 天 · ${aiFail7d > 0 ? `${fmt(aiFail7d)} 次失败` : '无失败'}`}
        />
        <StatCard label="活跃会话" value={fmt(data.totals.activeSessions)} sub="未过期" />
        <StatCard label="已存媒体" value={fmtBytes(data.totals.mediaBytes)} sub={`${fmt(data.totals.mediaCount)} 个文件`} />
        <StatCard label="评论" value={fmt(data.totals.comments)} sub="全部设计" />
        <StatCard
          label="AI 服务商"
          value={data.provider.configured ? (data.provider.source === 'multi' ? String(data.provider.providerCount) : '已配置') : '无'}
          sub={
            data.provider.configured
              ? data.provider.source === 'multi'
                ? `${data.provider.slotsSet}/5 slots wired · via ${SOURCE_LABEL[data.provider.source] ?? data.provider.source}`
                : `via ${SOURCE_LABEL[data.provider.source ?? ''] ?? data.provider.source}`
              : '仅本地功能'
          }
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title="API 流量 — 最近 14 天"
          right={<Chip>{fmt(data.series.traffic.reduce((a, p) => a + p.value, 0))} 总计</Chip>}
        >
          <BarChart bars={data.series.traffic.map((p) => ({ label: p.day, value: p.value }))} />
        </Card>
        <Card title="日活跃用户 — 最近 14 天" right={<Chip tone={data.windows.dauToday > 0 ? 'good' : 'neutral'}>{data.windows.dauToday} 今天</Chip>}>
          <LineChart points={data.series.dau.map((p) => ({ label: p.day, value: p.value }))} />
        </Card>
        <Card title="新注册用户 — 最近 14 天">
          <BarChart bars={data.series.signups.map((p) => ({ label: p.day, value: p.value }))} color="var(--cv-violet)" />
        </Card>
        <Card title="AI 调用 — 最近 14 天" right={<Chip tone={aiFail7d > 0 ? 'bad' : 'good'}>青色 = 正常 · 红色 = 失败</Chip>}>
          <BarChart
            bars={data.series.aiCalls.map((p) => ({
              label: p.day,
              value: Math.max(0, p.value - Math.max(0, p.value - p.ok)),
              alt: Math.max(0, p.value - p.ok),
            }))}
          />
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="热门路由——最近 7 天">
          <HBars
            rows={data.topRoutes.map((r) => ({
              label: `${r.method} ${r.route.replace('/api/', '')}`,
              value: r.hits,
              hint: `${r.method} ${r.route}`,
            }))}
          />
        </Card>
        <Card title="按功能统计的 AI 用量 — 最近 7 天">
          <HBars
            rows={data.aiByFeature.map((f) => ({
              label: f.feature,
              value: f.calls,
              hint: `${f.calls} calls · ${f.ok} succeeded`,
            }))}
            color="var(--cv-violet)"
          />
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="最新账号">
          <ul className="divide-y">
            {data.recentUsers.length === 0 && <li className="py-2 text-sm text-muted-foreground">暂无账号</li>}
            {data.recentUsers.map((u) => (
              <li key={u.id} className="flex items-center justify-between py-2 text-sm">
                <span className="font-medium">{u.username}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {u.admin && <Chip tone="good">管理员</Chip>}
                  {new Date(u.createdAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="实例">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Canvix 版本</dt>
            <dd className="text-right font-medium tabular-nums">{data.version}</dd>
            <dt className="text-muted-foreground">数据库延迟</dt>
            <dd className="text-right font-medium tabular-nums">{data.dbLatencyMs} ms</dd>
            <dt className="text-muted-foreground">AI 服务商</dt>
            <dd className="text-right font-medium">
              {data.provider.configured
                ? data.provider.source === 'multi'
                  ? `${data.provider.providerCount} in table · ${data.provider.slotsSet}/5 slots wired`
                  : `configured · ${SOURCE_LABEL[data.provider.source ?? ''] ?? data.provider.source}`
                : 'not configured'}
            </dd>
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">
            Live counters are in-memory (reset on restart); the charts above are the durable record. Traffic counters are aggregate
            counts only — no ids, no IPs, no query strings. 90-day retention. Disable with{' '}
            <code className="rounded bg-muted px-1">CANVIX_TRAFFIC=0</code>.
          </p>
        </Card>
      </div>
    </>
  )
}
