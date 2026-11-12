'use client'

import { useEffect, useState } from 'react'
import { getJson, sendJson } from './fetch'
import { Card, Toggle, Chip } from './bits'
import { fmt, fmtBytes } from './charts'

interface ConfigView {
  provider: { configured: boolean; source: string | null }
  settings: { signupsOpen: boolean; anonymousEditing: boolean }
}
interface OverviewLite {
  version: string
  dbLatencyMs: number
  totals: { mediaCount: number; mediaBytes: number; designs: number; comments: number }
}

export function AdminSettings() {
  const [view, setView] = useState<ConfigView | null>(null)
  const [instance, setInstance] = useState<OverviewLite | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void (async () => {
      const [cfg, ov] = await Promise.all([
        getJson<ConfigView>('/api/admin/config'),
        getJson<OverviewLite>('/api/admin/overview'),
      ])
      if (cfg.ok) setView(cfg.data)
      else setError(cfg.data?.error ?? `Request failed (${cfg.status})`)
      if (ov.ok) setInstance(ov.data)
    })()
  }, [])

  async function save(next: { signupsOpen: boolean; anonymousEditing: boolean }) {
    setBusy(true)
    const res = await sendJson<ConfigView & { error?: string }>('/api/admin/config', 'PUT', { settings: next })
    setBusy(false)
    if (!res.ok) {
      setNotice(null)
      setError(res.data?.error ?? `Could not save (${res.status}).`)
      return
    }
    setError(null)
    setView(res.data)
    setNotice('Settings saved.')
    setTimeout(() => setNotice(null), 4000)
  }

  if (!view) {
    return <div className="h-40 animate-pulse rounded-xl bg-muted" />
  }

  return (
    <>
      {error && <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {notice && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700">{notice}</div>}

      <Card title="访问">
        <ul className="divide-y">
          <li className="flex items-center justify-between gap-4 py-4">
            <div className="max-w-lg">
              <p className="text-sm font-medium">允许新用户注册</p>
              <p className="text-xs text-muted-foreground">
                关闭时， <code className="rounded bg-muted px-1">POST /api/auth/register</code> answers 503 with a
                friendly message — before the rate limiter, so a closed instance burns none of a visitor&apos;s attempt
                budget. Existing accounts sign in as usual.
              </p>
            </div>
            <Toggle
              label="允许新用户注册"
              checked={view.settings.signupsOpen}
              disabled={busy}
              onChange={(next) => void save({ ...view.settings, signupsOpen: next })}
            />
          </li>
          <li className="flex items-center justify-between gap-4 py-4">
            <div className="max-w-lg">
              <p className="text-sm font-medium">匿名编辑</p>
              <p className="text-xs text-muted-foreground">
                When off, only signed-in accounts can create or save designs. Reading, sharing and exporting existing
                designs (including the anonymous commons) keeps working — this gates writes, not reads.
              </p>
            </div>
            <Toggle
              label="匿名编辑"
              checked={view.settings.anonymousEditing}
              disabled={busy}
              onChange={(next) => void save({ ...view.settings, anonymousEditing: next })}
            />
          </li>
        </ul>
      </Card>

      <Card title="实例">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Canvix 版本</dt>
          <dd className="text-right font-medium tabular-nums">{instance?.version ?? '—'}</dd>
          <dt className="text-muted-foreground">数据库延迟</dt>
          <dd className="text-right font-medium tabular-nums">{instance ? `${instance.dbLatencyMs} ms` : '—'}</dd>
          <dt className="text-muted-foreground">设计</dt>
          <dd className="text-right font-medium tabular-nums">{instance ? fmt(instance.totals.designs) : '—'}</dd>
          <dt className="text-muted-foreground">媒体</dt>
          <dd className="text-right font-medium tabular-nums">
            {instance ? `${fmt(instance.totals.mediaCount)} files · ${fmtBytes(instance.totals.mediaBytes)}` : '—'}
          </dd>
          <dt className="text-muted-foreground">AI 服务商</dt>
          <dd className="text-right">
            {view.provider.configured ? <Chip tone="good">{view.provider.source}</Chip> : <Chip tone="bad">无</Chip>}
          </dd>
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">
          首位管理员：请设置{' '}
          <code className="rounded bg-muted px-1">CANVIX_ADMIN_USERS=&quot;your-username&quot;</code> 并登录 — 登录后
          工作台上会出现管理链接。其他功能都可以在这些页面上操作。
        </p>
      </Card>

      <Card title="隐私策略">
        <ul className="list-disc space-y-1.5 pl-4 text-xs text-muted-foreground">
          <li>流量计数按天汇总：路由、方法、状态、数量。不含 ID、IP 或查询字符串。</li>
          <li>日活记录存储 userId 或哈希后的匿名 Cookie 键 — 仅限第一方，仅管理员可见。</li>
          <li>计数器可通过以下方式完全关闭 <code className="rounded bg-muted px-1">CANVIX_TRAFFIC=0</code>；超过 90 天的记录将自动清理。</li>
          <li>服务商 API 密钥仅可写入：保存一次，回显时仅显示掩码。</li>
        </ul>
      </Card>
    </>
  )
}
