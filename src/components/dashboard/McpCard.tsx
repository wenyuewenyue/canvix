'use client'

import { useEffect, useState } from 'react'
import { Bot, Copy, Check, Plug, KeyRound, Info } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * v0.6 — "AI agents (MCP)" dashboard card. Shows the real endpoint status
 * (probed via OPTIONS /api/mcp) and a copy-paste client config.
 */
export function McpCard() {
  const [status, setStatus] = useState<'checking' | 'enabled' | 'disabled'>('checking')
  const [copied, setCopied] = useState<'url' | 'config' | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/mcp', { method: 'OPTIONS' })
      .then((r) => r.json())
      .then((d: { mcp?: string }) => {
        if (!cancelled) setStatus(d.mcp === 'enabled' ? 'enabled' : 'disabled')
      })
      .catch(() => {
        if (!cancelled) setStatus('disabled')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://your-canvix.example.com'
  const endpoint = `${origin}/api/mcp`
  const clientConfig = JSON.stringify(
    {
      mcpServers: {
        canvix: {
          url: endpoint,
          headers: { Authorization: 'Bearer <CANVIX_MCP_TOKEN>' },
        },
      },
    },
    null,
    2
  )

  const copy = async (what: 'url' | 'config', text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(what)
      setTimeout(() => setCopied(null), 1800)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <section id="cv-agents" className="pt-12 scroll-mt-20">
      <h2 className="text-xl font-bold">AI 智能体 (MCP)</h2>
      <div className="mt-4 rounded-2xl border border-white/10 bg-[#16171D] p-5 flex flex-col sm:flex-row items-center gap-6">
        <div className="h-12 w-12 rounded-2xl bg-brand-gradient-soft flex items-center justify-center text-[#A78BFA] shrink-0">
          <Bot size={24} />
        </div>
        <div className="flex-1 text-center sm:text-left">
          <div className="text-sm font-semibold flex items-center justify-center sm:justify-start gap-2 flex-wrap">
            让 AI 助手用 Canvix 进行设计
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                status === 'enabled'
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : status === 'disabled'
                    ? 'bg-amber-500/15 text-amber-300'
                    : 'bg-white/10 text-white/50'
              )}
              data-testid="mcp-status"
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', status === 'enabled' ? 'bg-emerald-400' : status === 'disabled' ? 'bg-amber-400' : 'bg-white/40')} />
              {status === 'enabled' ? '已启用' : status === 'disabled' ? '已关闭 — 请设置 CANVIX_MCP_TOKEN' : '检查中…'}
            </span>
          </div>
          <div className="text-xs text-white/40 mt-1">
            Claude、Cursor、ChatGPT 以及任何 MCP 客户端都可以在此服务器上创建和编辑真实设计——与你使用的是同一块画布。
          </div>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" className="rounded-xl border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white shrink-0">
              <Plug size={14} className="mr-1.5" /> 连接智能体
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg bg-[#16171D] border-white/10 text-white">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Bot size={16} className="text-[#A78BFA]" /> 将 AI 智能体连接到 Canvix
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 text-sm">
              <div className="flex items-start gap-2 text-[13px] text-white/70">
                <KeyRound size={14} className="mt-0.5 shrink-0 text-[#A78BFA]" />
                <p>
                  <span className="text-white font-medium">1. 设置令牌。</span> 在运行 Canvix 的服务器上，添加{' '}
                  <code className="rounded bg-white/10 px-1 py-0.5 text-[11px]">CANVIX_MCP_TOKEN=&lt;your-secret&gt;</code> 到环境变量并
                  重启。在此之前端点保持禁用状态。
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[13px] font-medium text-white">2. 将 MCP 客户端指向此端点</span>
                  <button
                    className="flex items-center gap-1 text-[11px] text-white/50 hover:text-white"
                    onClick={() => void copy('url', endpoint)}
                    aria-label="复制端点 URL"
                  >
                    {copied === 'url' ? <Check size={12} /> : <Copy size={12} />} 复制链接
                  </button>
                </div>
                <code className="block rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-[12px] text-[#02C0CC] break-all" data-testid="mcp-endpoint">
                  {endpoint}
                </code>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[13px] font-medium text-white">3. 客户端配置（Claude Desktop、Cursor 等）</span>
                  <button
                    className="flex items-center gap-1 text-[11px] text-white/50 hover:text-white"
                    onClick={() => void copy('config', clientConfig)}
                    aria-label="复制客户端配置"
                  >
                    {copied === 'config' ? <Check size={12} /> : <Copy size={12} />} 复制 JSON
                  </button>
                </div>
                <pre className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-[11.5px] leading-relaxed text-white/80 overflow-x-auto cv-scroll-dark">
                  {clientConfig}
                </pre>
              </div>

              <div className="flex items-start gap-2 text-[12px] text-white/50 border-t border-white/10 pt-3">
                <Info size={13} className="mt-0.5 shrink-0" />
                <p>
                  20 tools: generate &amp; create designs, add text/shapes/images/tables/embeds, restyle elements, animate, comment and export
                  (SVG/PNG/JSON). Agent edits show up live in open editor sessions. Requests need the Bearer token; per-IP rate limits apply.
                  Details in the README → <span className="text-white/70">AI 智能体 (MCP)</span>.
                </p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </section>
  )
}
