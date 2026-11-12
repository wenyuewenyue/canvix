'use client'

import { useState } from 'react'
import { Sparkles, Loader2, Plus, RefreshCw, Wand2 } from 'lucide-react'
import { createTextElement } from '@/lib/types'
import { placement } from '../add-element'
import { useEditorStore } from '@/store/editor-store'
import { AppHeader, type AppPanelProps } from './registry'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'

const KINDS = [
  { id: 'headline', label: '标题', fontSize: 64, bold: true },
  { id: 'tagline', label: '标语', fontSize: 44, bold: true },
  { id: 'body', label: '正文', fontSize: 28, bold: false },
  { id: 'social', label: '配文', fontSize: 30, bold: false },
] as const

const TONES = ['bold', 'playful', 'elegant', 'minimal', 'corporate', 'warm'] as const

const IDEAS = [
  'A poster for a summer music festival',
  'Instagram caption for a new coffee shop',
  'Headline for an eco-friendly water bottle',
  'Tagline for a fitness app launch',
]

export function MagicWriteApp({ onClose }: AppPanelProps) {
  const addElement = useEditorStore((s) => s.addElement)
  const pages = useEditorStore((s) => s.pages)
  const currentPage = useEditorStore((s) => s.currentPage)
  const width = useEditorStore((s) => s.width)
  const height = useEditorStore((s) => s.height)

  const [prompt, setPrompt] = useState('')
  const [kind, setKind] = useState<(typeof KINDS)[number]['id']>('tagline')
  const [tone, setTone] = useState<(typeof TONES)[number]>('bold')
  const [options, setOptions] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generate = async () => {
    if (!prompt.trim() || busy) return
    setBusy(true)
    setError(null)
    setOptions([])
    try {
      const res = await fetch('/api/ai/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, kind, tone }),
      })
      const data = (await res.json()) as { options?: string[]; error?: string }
      if (!res.ok || !data.options) throw new Error(data.error ?? '生成失败')
      setOptions(data.options)
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成失败')
    } finally {
      setBusy(false)
    }
  }

  const addToCanvas = (text: string) => {
    const preset = KINDS.find((k) => k.id === kind)!
    const pos = placement(Math.min(width * 0.7, 800), preset.fontSize, pages[currentPage].elements.length)
    addElement(
      createTextElement({
        ...pos,
        width: Math.min(width * 0.72, 820),
        height: preset.fontSize * 1.6,
        text,
        fontSize: preset.fontSize,
        bold: preset.bold,
        align: 'center',
      })
    )
    toast({ title: '已添加到画布' })
  }

  return (
    <div>
      <AppHeader icon={Wand2} title="魔法写作" onClose={onClose} />

      <div
        className="rounded-xl border border-white/10 bg-white/[0.04] focus-within:border-[#7630D7] transition-colors p-3 mb-2.5"
      >
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate() }}
          rows={2}
          maxLength={500}
          placeholder="描述你的需求——例如：“夏季音乐节海报标语”"
          className="w-full bg-transparent outline-none text-[12.5px] text-white resize-none placeholder:text-white/35"
          aria-label="魔法写作提示词"
        />
      </div>

      <div className="grid grid-cols-4 gap-1.5 mb-2">
        {KINDS.map((k) => (
          <button
            key={k.id}
            onClick={() => setKind(k.id)}
            className={cn(
              'h-7 rounded-lg text-[10.5px] font-semibold transition-colors',
              kind === k.id ? 'bg-[#7630D7] text-white' : 'bg-white/[0.05] text-white/60 hover:text-white'
            )}
          >
            {k.label}
          </button>
        ))}
      </div>

      <div className="flex gap-1.5 flex-wrap mb-2.5">
        {TONES.map((t) => (
          <button
            key={t}
            onClick={() => setTone(t)}
            className={cn(
              'h-6 px-2.5 rounded-full text-[10px] font-semibold border transition-colors capitalize',
              tone === t ? 'bg-white/[0.16] text-white border-white/25' : 'text-white/55 border-white/10 hover:text-white'
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <button
        onClick={generate}
        disabled={busy || !prompt.trim()}
        className="w-full h-10 rounded-xl bg-gradient-to-r from-[#7630D7] to-[#9B6BFF] text-white text-[13px] font-bold flex items-center justify-center gap-2 disabled:opacity-40 hover:brightness-110 transition-all"
        aria-label="生成文案"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
        {busy ? '写作中…' : '生成 3 个选项'}
      </button>

      {error && <p className="text-[11px] text-[#FF8095] mt-2.5">{error}</p>}

      {options.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-bold text-white/60 uppercase tracking-wide">结果</span>
            <button
              onClick={generate}
              className="text-[10px] text-white/50 hover:text-white flex items-center gap-1"
              aria-label="重新生成"
            >
              <RefreshCw size={10} /> 重新生成
            </button>
          </div>
          {options.map((opt, i) => (
            <button
              key={i}
              onClick={() => addToCanvas(opt)}
              className="group w-full text-left rounded-xl border border-white/10 bg-white/[0.04] hover:border-[#7630D7] p-2.5 transition-colors"
              role="button"
              aria-label={`Add option ${i + 1}`}
            >
              <p className="text-[12px] text-white/90 leading-snug">{opt}</p>
              <span className="hidden group-hover:flex items-center gap-1 mt-1.5 text-[10px] font-bold text-[#02C0CC]">
                <Plus size={10} /> 添加到画布
              </span>
            </button>
          ))}
        </div>
      )}

      {options.length === 0 && !busy && !error && (
        <div className="mt-3.5">
          <p className="text-[10.5px] font-bold text-white/60 uppercase tracking-wide mb-1.5">试着问问…</p>
          <div className="space-y-1">
            {IDEAS.map((idea) => (
              <button
                key={idea}
                onClick={() => setPrompt(idea)}
                className="block w-full text-left text-[11.5px] text-white/55 hover:text-white rounded-lg border border-white/[0.07] hover:border-white/20 px-2.5 py-1.5 transition-colors"
              >
                “{idea}”
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
