'use client'

// AI configuration (v0.16 A1 → v0.16.2 A2 rework → v0.16.5 A5).
//
// Five surfaces:
//   1. Providers — the multi-provider table: add any OpenAI-compatible
//      endpoint (NVIDIA NIM, OpenRouter, Z.ai, Groq, …), one key each,
//      write-only credentials, per-provider Test button.
//   2. Model slots — pin each capability (text / vision / image /
//      imageEdit) to a provider + model id, so different features can
//      run on different vendors. (v0.16.4 A4: imageSearch is retired —
//      photo search runs on the stock-media keys, see the banner.)
//   3. Legacy fallback — the v0.16 A1 single-provider override and model
//      ids, used only by slots that don't resolve through the table.
//   4. Feature kill switches.
//   5. Stock media (v0.16.5 A5) — the Pexels/Pixabay keys behind the
//      Photos and Videos search rails: write-only, per-provider Test
//      button, env vars as fallback. Not AI providers — library
//      catalogs with free keys (the A4 decision, made manageable).

import { useEffect, useState } from 'react'
import { Zap, Plus, Trash2, Import } from 'lucide-react'
import { getJson, sendJson } from './fetch'
import { Card, Toggle, Chip } from './bits'

interface ProviderEntryView {
  id: string
  label: string
  baseUrl: string
  keyMasked: string
}
interface SlotEntryView {
  providerId: string
  model?: string
}
interface SlotResolved {
  providerId: string | null
  label: string | null
  baseUrl: string
  model: string | null
  source: string
}
interface ConfigView {
  provider: {
    configured: boolean
    source: string | null
    activeBaseUrl: string | null
    stored: { baseUrl: string; keyMasked: string } | null
    env: { urlSet: boolean; keySet: boolean }
  }
  providers: {
    set: boolean
    list: ProviderEntryView[]
    slots: Record<string, SlotEntryView | undefined>
    resolved: Record<string, SlotResolved | null>
  }
  models: { text?: string; vision?: string; image?: string }
  features: Record<string, boolean>
  settings: { signupsOpen: boolean; anonymousEditing: boolean }
  /** v0.16.5 (A5): the stock-media keys — masks + which layer answers */
  stock: {
    available: boolean
    providers: Record<string, { set: boolean; source: 'db' | 'env' | null; keyMasked: string | null }>
  }
}

/** Local editing state for one provider row. New rows get a client-generated
 *  id so slots can reference them in the same save (the server accepts any
 *  `p`-prefixed id and keeps it). */
interface ProviderRow {
  id: string | null // null = new, unsaved
  label: string
  baseUrl: string
  apiKey: string // empty = keep stored key on save
}

/** `p` + 10 base36 chars — same shape the server generates. */
function newProviderId(): string {
  return 'p' + Array.from({ length: 10 }, () => Math.floor(Math.random() * 36).toString(36)).join('')
}

const SLOT_INFO: { key: string; label: string; hint: string; placeholder: string }[] = [
  { key: 'text', label: '文字', hint: '魔法写作 · 翻译 · 助手', placeholder: 'e.g. meta/llama-3.1-70b-instruct' },
  { key: 'vision', label: '视觉', hint: '魔法图层 — 图片理解', placeholder: 'e.g. meta/llama-3.2-90b-vision-instruct' },
  { key: 'image', label: '图片生成', hint: '照片面板中的文生图', placeholder: '服务商默认' },
  { key: 'imageEdit', label: '图片编辑', hint: 'Magic Eraser / Enhance', placeholder: '服务商默认' },
  // v0.19 (Wave 4): the video slot — Sora-style async generation
  { key: 'video', label: '视频生成', hint: '视频面板中的 AI 视频卡片', placeholder: '服务商默认' },
]

const FEATURE_INFO: { key: string; label: string; hint: string }[] = [
  { key: 'magicWrite', label: '魔法写作', hint: '文字工具栏中的 AI 文案建议' },
  { key: 'imageGeneration', label: '图片生成', hint: '照片面板中的文生图' },
  { key: 'imageEditing', label: '图片编辑', hint: 'Magic Eraser / Enhance on selected images' },
  { key: 'vision', label: '魔法图层', hint: '理解图片并重建分层设计' },
  { key: 'translation', label: '翻译', hint: '文字工具栏中的文本翻译' },
  { key: 'assistant', label: '助手', hint: '可编辑设计的聊天助手' },
  { key: 'photoSearch', label: '图片搜索', hint: 'Stock photo search in the Photos panel — Pexels/Pixabay keys, not an AI provider' },
  { key: 'soundSearch', label: '声音搜索', hint: 'Stock sound search in the Audio panel — Freesound key (CC0 by default), not an AI provider' },
  // v0.19 (Wave 4 — AI Power-Up):
  { key: 'agenticPlanning', label: 'AI 设计方案', hint: '描述 → 审核方案 → 应用可编辑页面' },
  { key: 'notesGeneration', label: '演讲者备注', hint: 'AI drafts presenter notes (reviewed before saving)' },
  { key: 'themeGeneration', label: 'AI 主题', hint: '配色与字体搭配已应用于整个设计' },
  { key: 'altText', label: '替代文本', hint: 'AI alt-text suggestions for images (vision slot)' },
  { key: 'videoGeneration', label: '视频生成', hint: 'Text-to-video in the Videos panel (video slot)' },
]

const SOURCE_LABEL: Record<string, string> = {
  multi: '服务商表',
  db: '旧版覆盖',
  env: '环境变量',
  file: '.z-ai-config file',
}

interface TestState {
  providerId: string | 'default'
  ok: boolean
  message: string
}

/** Per-slot probe result (A3) — the verdict says WHY, not just pass/fail. */
interface SlotTestState {
  slot: string
  ok: boolean
  message: string
  busy?: boolean
}

/** Stock-key probe result (A5) — same verdict posture as the slot probe. */
interface StockTestState {
  provider: string
  ok: boolean
  message: string
  busy?: boolean
}

/** The endpoint each slot exercises — shown next to the slot so the
 * provider-fit question ("can NVIDIA generate images?") answers itself. */
const SLOT_ENDPOINT: Record<string, string> = {
  text: 'chat/completions',
  vision: 'chat/completions',
  image: 'images/generations',
  imageEdit: 'images/generations/edit',
  video: 'videos/generations',
}

/** The stock-media connectors (A5) — a fixed set, one free key each,
 * shared by the Photos and Videos search rails; Freesound (Sound wave)
 * keys the Audio rail on its own key. */
const STOCK_PROVIDERS = [
  {
    key: 'pexels',
    label: 'Pexels',
    hint: 'Photos + Videos search · free key at pexels.com/api',
    env: 'PEXELS_API_KEY',
    placeholder: '免费 Pexels 密钥',
  },
  {
    key: 'pixabay',
    label: 'Pixabay',
    hint: 'Photos + Videos search · free key at pixabay.com/api/docs',
    env: 'PIXABAY_API_KEY',
    placeholder: '免费 Pixabay 密钥',
  },
  {
    key: 'freesound',
    label: 'Freesound',
    hint: 'Audio search (CC0 by default) · free key at freesound.org/apiv2/apply',
    env: 'FREESOUND_API_KEY',
    placeholder: '免费 Freesound 密钥',
  },
] as const

export function AdminAiConfig() {
  const [view, setView] = useState<ConfigView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [rows, setRows] = useState<ProviderRow[]>([])
  const [slots, setSlots] = useState<Record<string, { providerId: string; model: string }>>({})
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [models, setModels] = useState<{ text: string; vision: string; image: string }>({ text: '', vision: '', image: '' })
  const [features, setFeatures] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [test, setTest] = useState<TestState | null>(null)

  function applyView(data: ConfigView) {
    setView(data)
    setRows(
      data.providers.list.map((p) => ({
        id: p.id,
        label: p.label,
        baseUrl: p.baseUrl,
        apiKey: '', // write-only: never prefilled
      }))
    )
    const slotState: Record<string, { providerId: string; model: string }> = {}
    for (const s of SLOT_INFO) {
      const stored = data.providers.slots[s.key]
      slotState[s.key] = { providerId: stored?.providerId ?? '', model: stored?.model ?? '' }
    }
    setSlots(slotState)
    setBaseUrl(data.provider.stored?.baseUrl ?? '')
    setModels({
      text: data.models.text ?? '',
      vision: data.models.vision ?? '',
      image: data.models.image ?? '',
    })
    setFeatures(data.features)
    // write-only credentials: never prefilled, cleared after every save
    setStockKeys({})
  }

  async function put(body: unknown, message: string) {
    setBusy(true)
    const res = await sendJson<ConfigView & { error?: string }>('/api/admin/config', 'PUT', body)
    setBusy(false)
    if (!res.ok) {
      setNotice(null)
      setError(res.data?.error ?? `Could not save (${res.status}).`)
      return
    }
    setError(null)
    setNotice(message)
    applyView(res.data)
    setApiKey('')
    setTimeout(() => setNotice(null), 4000)
  }

  /** Save the providers table (list full-replace + slots full-replace). */
  async function saveProviders() {
    const list = rows.map((r) => ({
      ...(r.id ? { id: r.id } : {}),
      label: r.label,
      baseUrl: r.baseUrl,
      ...(r.apiKey ? { apiKey: r.apiKey } : {}),
    }))
    const slotBody: Record<string, { providerId: string; model?: string } | null> = {}
    for (const s of SLOT_INFO) {
      const cur = slots[s.key]
      slotBody[s.key] = cur.providerId ? { providerId: cur.providerId, ...(cur.model ? { model: cur.model } : {}) } : null
    }
    await put({ providers: { list, slots: slotBody } }, 'Providers and slots saved.')
  }

  async function importLegacy() {
    await put({ importLegacyProvider: true }, 'Legacy override imported into the providers table.')
  }

  async function testProvider(providerId: string | null) {
    setBusy(true)
    setTest(null)
    const res = await sendJson<{ ok: boolean; providerLabel?: string; model?: string; reply?: string; error?: string }>(
      '/api/admin/config/ai-test',
      'POST',
      providerId ? { providerId } : {}
    )
    setBusy(false)
    if (res.ok && res.data.ok) {
      setTest({
        providerId: providerId ?? 'default',
        ok: true,
        message: `${res.data.providerLabel ?? 'Provider'} answered (model ${res.data.model}): “${res.data.reply}”`,
      })
    } else {
      setTest({ providerId: providerId ?? 'default', ok: false, message: (res.data.error as string) ?? `Test failed (${res.status})` })
    }
  }

  const [slotTest, setSlotTest] = useState<SlotTestState | null>(null)

  // ── stock media (A5 + Sound wave): stock keys, write-only like providers ──
  const [stockKeys, setStockKeys] = useState<Record<string, string>>({})
  const [stockTest, setStockTest] = useState<StockTestState | null>(null)

  /** Probe the ENDPOINT the slot actually uses (A3) — a chat-only
   * provider passes the text test but cannot generate images. */
  async function testSlot(slot: string) {
    setSlotTest({ slot, ok: true, busy: true, message: '检测中…' })
    const res = await sendJson<{ ok: boolean; endpoint?: string; providerLabel?: string; message?: string; reply?: string; error?: string }>(
      '/api/admin/config/ai-test',
      'POST',
      { slot }
    )
    if (res.ok && res.data.ok) {
      setSlotTest({
        slot,
        ok: true,
        message: `${res.data.providerLabel ?? 'Provider'} · ${res.data.message}${res.data.reply ? ` “${res.data.reply.slice(0, 60)}”` : ''}`,
      })
    } else {
      setSlotTest({ slot, ok: false, message: res.data.message ?? res.data.error ?? `Test failed (${res.status})` })
    }
  }

  /** Save the stock-media keys — only the fields the operator typed;
   * empty keeps the stored credential (the write-only posture). */
  async function saveStockKeys() {
    const stock: Record<string, string> = {}
    for (const p of STOCK_PROVIDERS) {
      const v = (stockKeys[p.key] ?? '').trim()
      if (v) stock[p.key] = v
    }
    await put({ stock }, 'Stock keys saved — the stock rails pick them up immediately.')
  }

  /** Remove one stored key (explicit null) — env fallback restored. */
  async function clearStockKey(name: 'pexels' | 'pixabay' | 'freesound') {
    await put({ stock: { [name]: null } }, `Stored ${name} key cleared.`)
  }

  /** Probe the provider's real search endpoint with the effective key. */
  async function testStockKey(name: 'pexels' | 'pixabay' | 'freesound') {
    setStockTest({ provider: name, ok: true, busy: true, message: '检测中…' })
    const res = await sendJson<{ ok: boolean; message?: string; error?: string }>(
      '/api/admin/config/stock-test',
      'POST',
      { provider: name }
    )
    if (res.ok && res.data.ok) {
      setStockTest({ provider: name, ok: true, message: res.data.message ?? 'Key valid.' })
    } else {
      setStockTest({
        provider: name,
        ok: false,
        message: res.data.message ?? res.data.error ?? `Test failed (${res.status}).`,
      })
    }
  }

  useEffect(() => {
    getJson<ConfigView>('/api/admin/config').then((res) => {
      if (res.ok) {
        applyView(res.data)
        setError(null)
      } else {
        setError(res.data?.error ?? `Request failed (${res.status})`)
      }
    })
  }, [])

  if (error && !view) {
    return (
      <Card title="AI 配置">
        <p className="text-sm text-destructive">{error}</p>
      </Card>
    )
  }
  if (!view) {
    return <div className="h-40 animate-pulse rounded-xl bg-muted" />
  }

  const providerSectionReady = Boolean(baseUrl.trim()) === Boolean(apiKey.trim()) || (!baseUrl && !apiKey)
  const legacyStored = view.provider.stored !== null
  const tableEmpty = rows.length === 0
  const stockKeyedCount = Object.values(view.stock.providers).filter((p) => p.set).length

  return (
    <>
      {error && <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {notice && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700">{notice}</div>}

      <Card
        title="AI 服务商"
        right={
          view.providers.set && rows.length > 0 ? (
            <Chip tone="good">{rows.length} 已存储</Chip>
          ) : (
            <Chip tone={tableEmpty && !legacyStored && !view.provider.configured ? 'bad' : 'neutral'}>未配置</Chip>
          )
        }
      >
        <p className="mb-4 text-sm text-muted-foreground">
          Add any OpenAI-compatible endpoint — NVIDIA NIM, OpenRouter, Z.ai, Groq, OpenAI… Each provider keeps its own
          write-only key, and every capability below can run on a different vendor. The key is stored, never displayed
          again; leave the field empty when editing to keep the stored one.
        </p>

        {legacyStored && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            <span>
              已存储旧版单服务商覆盖配置（{view.provider.stored?.baseUrl}). It only answers slots that
              have no provider above — import it to manage it here.
            </span>
            <button
              onClick={() => void importLegacy()}
              disabled={busy}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-600/40 bg-amber-500/20 px-3 py-1.5 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-500/30 disabled:opacity-50"
            >
              <Import size={14} /> 导入到提供商
            </button>
          </div>
        )}

        {rows.length === 0 && (
          <p className="mb-4 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            暂无服务商。请在下方添加一个 — 你需要它的基础 URL（以 <code className="rounded bg-muted px-1">/v1</code>{' '}
            （适用于大多数服务商）和 API 密钥。
          </p>
        )}

        <div className="space-y-3">
          {rows.map((row, i) => {
            const usedBy = SLOT_INFO.filter((s) => slots[s.key]?.providerId === row.id).map((s) => s.label)
            const saved = view.providers.list.some((p) => p.id === row.id)
            return (
              <div key={row.id ?? `new-${i}`} className="rounded-xl border p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_2fr_1fr_auto]">
                  <label className="text-xs">
                    <span className="mb-1 block font-medium">标签</span>
                    <input
                      value={row.label}
                      onChange={(e) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))}
                      placeholder="NVIDIA NIM"
                      className="h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                  </label>
                  <label className="text-xs">
                    <span className="mb-1 block font-medium">基础 URL</span>
                    <input
                      value={row.baseUrl}
                      onChange={(e) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, baseUrl: e.target.value } : r)))}
                      placeholder="https://integrate.api.nvidia.com/v1"
                      className="h-9 w-full rounded-lg border bg-background px-3 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
                    />
                  </label>
                  <label className="text-xs">
                    <span className="mb-1 block font-medium">API 密钥</span>
                    <input
                      type="password"
                      value={row.apiKey}
                      onChange={(e) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, apiKey: e.target.value } : r)))}
                      placeholder={saved ? `stored: ${view.providers.list.find((p) => p.id === row.id)?.keyMasked ?? '—'}` : 'new key — required'}
                      autoComplete="off"
                      className="h-9 w-full rounded-lg border bg-background px-3 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
                    />
                  </label>
                  <div className="flex items-end gap-1.5">
                    <button
                      onClick={() => void testProvider(row.id)}
                      disabled={busy || !saved}
                      title={saved ? '通过此服务商发送一条最简聊天补全请求' : '请先保存，再测试'}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
                    >
                      <Zap size={14} /> 测试
                    </button>
                    <button
                      onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                      disabled={busy}
                      title="移除此服务商（保存时生效）"
                      className="inline-flex h-9 items-center rounded-lg border px-2.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {row.id && usedBy.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {saved ? `serves: ${usedBy.join(' · ')}` : 'unsaved — press “Save providers & slots” to activate'}
                  </p>
                )}
                {test && (test.providerId === row.id) && (
                  <p className={`mt-2 text-sm ${test.ok ? 'text-emerald-600' : 'text-destructive'}`}>{test.message}</p>
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => setRows((rs) => [...rs, { id: newProviderId(), label: '', baseUrl: '', apiKey: '' }])}
            disabled={busy || rows.length >= 8}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-1.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
          >
            <Plus size={14} /> 添加服务商
          </button>
          <button
            onClick={() => void saveProviders()}
            disabled={busy || rows.length === 0}
            className="rounded-lg bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            保存服务商与插槽
          </button>
        </div>
        {test && test.providerId === 'default' && (
          <p className={`mt-3 text-sm ${test.ok ? 'text-emerald-600' : 'text-destructive'}`}>{test.message}</p>
        )}
      </Card>

      <Card
        title="模型插槽"
        right={
          <Chip tone={Object.values(view.providers.resolved).some((r) => r !== null) ? 'good' : 'neutral'}>
            {Object.values(view.providers.resolved).filter((r) => r !== null).length}/4 wired
          </Chip>
        }
      >
        <p className="mb-4 text-sm text-muted-foreground">
          将每个功能固定到一个服务商和模型。未指定服务商的槽位会回退到下方的旧链路 —
          每个功能都可以用不同的服务商。
        </p>
        {/* v0.16.4 (A4): photo search LEFT the AI table — it runs on the
            free stock-media keys (same keys as the Videos rail), not on a
            model slot. v0.16.5 (A5): those keys are managed in the Stock
            media card below. State where they live so the operator is
            never sent hunting for a slot that no longer exists. */}
        <div className="mb-4 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-sm">
          <p>
            Photo search is not a model slot — it runs on the free stock-media keys (Pexels / Pixabay) managed in the{' '}
            <strong>素材库</strong> 下方的卡片，与视频栏共用（docs/STOCK-PHOTO.md）。
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {view.stock.available
              ? `Active — keyed: ${Object.entries(view.stock.providers)
                  .filter(([, p]) => p.set)
                  .map(([n, p]) => `${n}${p.source === 'db' ? ' (console)' : ' (env)'}`)
                  .join(' · ')}.`
              : '未设置图库密钥 — 照片面板仅保留内置图库。'}
          </p>
        </div>
        <div className="space-y-3">
          {SLOT_INFO.map((s) => {
            const resolved = view.providers.resolved[s.key]
            const current = slots[s.key] ?? { providerId: '', model: '' }
            return (
              <div key={s.key} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[1.4fr_1fr_1.4fr]">
                <div>
                  <p className="text-sm font-medium">{s.label}</p>
                  <p className="text-xs text-muted-foreground">{s.hint}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">使用 {SLOT_ENDPOINT[s.key]}</p>
                </div>
                <label className="text-xs">
                  <span className="mb-1 block font-medium">提供商</span>
                  <select
                    value={current.providerId}
                    onChange={(e) => setSlots((sl) => ({ ...sl, [s.key]: { ...current, providerId: e.target.value } }))}
                    className="h-9 w-full rounded-lg border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">— 回退 —</option>
                    {rows.map((r) => (
                      <option key={r.id ?? r.label} value={r.id ?? ''} disabled={!r.id}>
                        {r.label || r.baseUrl || 'unsaved provider'}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs">
                  <span className="mb-1 block font-medium">模型 ID</span>
                  <input
                    value={current.model}
                    onChange={(e) => setSlots((sl) => ({ ...sl, [s.key]: { ...current, model: e.target.value } }))}
                    placeholder={s.placeholder}
                    className="h-9 w-full rounded-lg border bg-background px-3 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
                  />
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    {resolved
                      ? `→ ${resolved.label ?? resolved.baseUrl} · ${resolved.model ?? 'provider default'} (${SOURCE_LABEL[resolved.source] ?? resolved.source})`
                      : '→ not configured (feature reports unavailable)'}
                  </span>
                </label>
                <div className="flex items-end sm:col-start-3">
                  <button
                    onClick={() => void testSlot(s.key)}
                    disabled={busy || slotTest?.busy === true}
                    title={`检测此槽位实际使用的 ${SLOT_ENDPOINT[s.key]} 端点`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    <Zap size={14} /> 测试 {s.label.toLowerCase()}
                  </button>
                </div>
                {slotTest && slotTest.slot === s.key && !slotTest.busy && (
                  <p className={`sm:col-span-3 text-sm ${slotTest.ok ? 'text-emerald-600' : 'text-destructive'}`}>
                    {slotTest.message}
                  </p>
                )}
              </div>
            )
          })}
        </div>
        <button
          onClick={() => void saveProviders()}
          disabled={busy || rows.length === 0}
          className="mt-4 rounded-lg bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          保存服务商与插槽
        </button>
      </Card>

      {/* v0.16.5 (A5) + Sound wave: the stock-media card — Pexels/Pixabay
          keys for the Photos + Videos search rails and the Freesound key
          for the Audio rail, managed like the AI providers: write-only
          credentials, masked placeholders, per-provider Test (a real
          one-result search through the effective key) and Clear (env
          fallback restored). NOT model slots — the A4 decision. */}
      <Card
        title="图库媒体 — Pexels、Pixabay 与 Freesound"
        right={<Chip tone={stockKeyedCount > 0 ? 'good' : 'neutral'}>{stockKeyedCount > 0 ? `${stockKeyedCount} keyed` : '无密钥'}</Chip>}
      >
        <p className="mb-4 text-sm text-muted-foreground">
          The Pexels/Pixabay keys power the Photos and Videos search rails; the Freesound key powers the Audio rail
          (Creative Commons 0 results by default) — no AI provider involved. Get free keys at{' '}
          <a href="https://www.pexels.com/api/" target="_blank" rel="noreferrer" className="underline">
            pexels.com/api
          </a>
          ,{' '}
          <a href="https://pixabay.com/api/docs/" target="_blank" rel="noreferrer" className="underline">
            pixabay.com/api/docs
          </a>{' '}
          and{' '}
          <a href="https://freesound.org/apiv2/apply/" target="_blank" rel="noreferrer" className="underline">
            freesound.org/apiv2/apply
          </a>
          . Keys are write-only — stored, never displayed again; leave a field empty to keep the stored one. A stored
          key wins over the matching environment variable (<code className="rounded bg-muted px-1">PEXELS_API_KEY</code> /{' '}
          <code className="rounded bg-muted px-1">PIXABAY_API_KEY</code> /{' '}
          <code className="rounded bg-muted px-1">FREESOUND_API_KEY</code>); clearing a stored key falls back to the
          env key when one is set.
        </p>
        <div className="space-y-3">
          {STOCK_PROVIDERS.map((s) => {
            const state = view.stock.providers[s.key]
            const savedHere = state?.source === 'db'
            const testHere = stockTest?.provider === s.key ? stockTest : null
            return (
              <div key={s.key} className="rounded-xl border p-3">
                <div className="grid gap-2 sm:grid-cols-[1.1fr_1.6fr_auto]">
                  <div>
                    <p className="text-sm font-medium">{s.label}</p>
                    <p className="text-xs text-muted-foreground">{s.hint}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {state?.set ? `active · ${savedHere ? '控制台密钥' : `env ${s.env}`}` : '未配置密钥'}
                    </p>
                  </div>
                  <label className="text-xs">
                    <span className="mb-1 block font-medium">API 密钥</span>
                    <input
                      type="password"
                      value={stockKeys[s.key] ?? ''}
                      onChange={(e) => setStockKeys((m) => ({ ...m, [s.key]: e.target.value }))}
                      placeholder={
                        state?.keyMasked
                          ? `stored: ${state.keyMasked}`
                          : state?.source === 'env'
                            ? '环境变量密钥已生效 — 可保存一个来覆盖'
                            : s.placeholder
                      }
                      autoComplete="off"
                      className="h-9 w-full rounded-lg border bg-background px-3 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
                    />
                  </label>
                  <div className="flex items-end gap-1.5">
                    <button
                      onClick={() => void testStockKey(s.key)}
                      disabled={busy || stockTest?.busy === true || !state?.set}
                      title={state?.set ? `One minimal real search through ${s.label}` : '请先保存密钥，再测试'}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
                    >
                      <Zap size={14} /> 测试
                    </button>
                    <button
                      onClick={() => void clearStockKey(s.key)}
                      disabled={busy || !savedHere}
                      title={savedHere ? 'Remove the stored key (env fallback restored)' : '未存储 — 环境变量或未设置'}
                      className="inline-flex h-9 items-center rounded-lg border px-2.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {testHere && !testHere.busy && (
                  <p className={`mt-2 text-sm ${testHere.ok ? 'text-emerald-600' : 'text-destructive'}`}>
                    {testHere.message}
                  </p>
                )}
              </div>
            )
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={() => void saveStockKeys()}
            disabled={busy || !STOCK_PROVIDERS.some((p) => (stockKeys[p.key] ?? '').trim())}
            className="rounded-lg bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            保存图库密钥
          </button>
          <span className="text-xs text-muted-foreground">
            {view.stock.available
              ? '图库搜索已启用——已配置的渠道正在响应。'
              : '未设置图库密钥 — 照片保留内置图库，视频和音频的网络搜索栏目将保持隐藏。'}
          </span>
        </div>
      </Card>

      <Card
        title="回退——单服务商与默认模型"
        right={
          view.provider.configured ? (
            <Chip tone={view.provider.source === 'db' ? 'good' : 'neutral'}>
              备用已启用 · {SOURCE_LABEL[view.provider.source ?? ''] ?? view.provider.source}
            </Chip>
          ) : (
            <Chip tone="bad">无回退</Chip>
          )
        }
      >
        <p className="mb-4 text-sm text-muted-foreground">
          仅适用于上方设为“— 回退 —”的插槽。单个覆盖配置优先于{' '}
          <code className="rounded bg-muted px-1">ZAI_BASE_URL</code> /{' '}
          <code className="rounded bg-muted px-1">ZAI_API_KEY</code> environment variables; model ids apply to the
          matching fallback slot. Keys are write-only — stored, never displayed again.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">基础 URL</span>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.example.com/v1"
              className="h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">API 密钥</span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={view.provider.stored ? `stored: ${view.provider.stored.keyMasked}` : '提供商 API 密钥'}
              autoComplete="off"
              className="h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {(['text', 'vision', 'image'] as const).map((key) => (
            <label key={key} className="text-sm">
              <span className="mb-1 block font-medium capitalize">{key} 模型</span>
              <input
                value={models[key]}
                onChange={(e) => setModels((m) => ({ ...m, [key]: e.target.value }))}
                placeholder={key === 'vision' ? 'glm-4.5v (default)' : 'SDK 默认'}
                className="h-9 w-full rounded-lg border bg-background px-3 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            环境变量： {view.provider.env.urlSet ? '已设置基础 URL' : '未设置基础 URL'} · {view.provider.env.keySet ? '已设置密钥' : '无密钥'}
          </span>
          {view.provider.activeBaseUrl && <span className="break-all">当前备用地址： {view.provider.activeBaseUrl}</span>}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() =>
              baseUrl.trim() && apiKey.trim()
                ? void put({ provider: { baseUrl, apiKey } }, 'Fallback override saved.')
                : void put({ provider: null }, 'Fallback override cleared — env/file fallback restored.')
            }
            disabled={busy || !providerSectionReady}
            className="rounded-lg bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {baseUrl.trim() && apiKey.trim() ? '保存备用覆盖' : '清除备用覆盖'}
          </button>
          <button
            onClick={() => void put({ models }, 'Fallback models saved.')}
            disabled={busy}
            className="rounded-lg border px-3.5 py-1.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
          >
            保存回退模型
          </button>
          <button
            onClick={() => void testProvider(null)}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-1.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
          >
            <Zap size={14} /> 测试回退（文本插槽）
          </button>
        </div>
      </Card>

      <Card title="AI 功能">
        <p className="mb-4 text-sm text-muted-foreground">
          Kill switches per feature. A switched-off feature reports as unavailable everywhere (panels grey out, the
          capabilities endpoint says no) and its API route refuses work — even with providers configured.
        </p>
        <ul className="divide-y">
          {FEATURE_INFO.map((f) => (
            <li key={f.key} className="flex items-center justify-between gap-4 py-3">
              <div>
                <p className="text-sm font-medium">{f.label}</p>
                <p className="text-xs text-muted-foreground">{f.hint}</p>
              </div>
              <Toggle
                label={f.label}
                checked={features[f.key] ?? true}
                onChange={(next) => setFeatures((s) => ({ ...s, [f.key]: next }))}
              />
            </li>
          ))}
        </ul>
        <button
          onClick={() => void put({ features }, 'Feature switches saved.')}
          disabled={busy}
          className="mt-4 rounded-lg bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          保存功能
        </button>
      </Card>
    </>
  )
}
