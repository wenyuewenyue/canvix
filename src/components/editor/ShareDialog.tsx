'use client'

import { Link2, Check, Copy, Eye, Info, QrCode } from 'lucide-react'
import { useState } from 'react'
import { useEditorStore } from '@/store/editor-store'
import { designShareUrl } from '@/lib/design-url'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'

/**
 * v0.11.7 (F6): the Share dialog documents the REAL access model instead of
 * offering a decorative Only-me/Public selector that nothing enforced.
 * The rules (src/lib/auth/design-guard.ts):
 *   • ownerless design (created signed-out) → anyone with the link can edit
 *   • design owned by an account            → the owner edits; everyone else
 *                                             opens it read-only (honest
 *                                             view-only banner, 403 on saves)
 * Canvix has no cloud access control — who can reach the link at all is
 * decided by the deployment (LAN, VPN, reverse-proxy auth).
 */

/** Canva-style Share dialog — copy link + the honest access model. */
export function ShareDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const designId = useEditorStore((s) => s.designId)
  const designName = useEditorStore((s) => s.designName)
  const [copied, setCopied] = useState(false)

  // v0.11.4: canonical share URLs — /design/<id> (legacy /?design=<id> links keep working)
  const link = designId ? designShareUrl(designId) : ''

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      toast({ title: '分享链接已复制到剪贴板' })
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast({ title: '无法复制 — 请手动选择并复制', description: link })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[28px] bg-[#16181D] border-white/10 text-white sm:max-w-md">
        <ShareBody designName={designName} link={link} copied={copied} onCopy={() => void copy()} />
      </DialogContent>
    </Dialog>
  )
}

function ShareBody({ designName, link, copied, onCopy }: {
  designName: string
  link: string
  copied: boolean
  onCopy: () => void
}) {
  // v0.9: the editor already knows when the open design belongs to another
  // account — surface it here so the access card describes THIS design
  const readOnly = useEditorStore((s) => s.readOnly)

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-lg font-bold flex items-center gap-2">
          分享 “{designName || 'Untitled design'}”
        </DialogTitle>
        <DialogDescription className="text-white/60">
          Canvix 本地优先：链接指向你自己的 Canvix 实例。
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 pl-3 pr-1.5 py-1.5 h-12">
          <Link2 size={16} className="text-white/50 shrink-0" />
          <input
            readOnly
            value={link}
            className="flex-1 min-w-0 bg-transparent outline-none text-[13px] text-white/80 truncate"
            aria-label="分享链接"
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button className="btn-cv h-9 px-4 shrink-0 gap-1.5" onClick={onCopy}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? '已复制' : '复制链接'}
          </Button>
        </div>

        {/* F6 (v0.11.7): the honest access model, documented where the link
            is handed out — this is the contract the server actually enforces */}
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5 space-y-2">
          <div className="text-xs font-semibold text-white/75 flex items-center gap-1.5">
            <Info size={13} className="text-[#02C0CC] shrink-0" /> 谁可以打开此链接
          </div>
          <ul className="text-[11px] leading-relaxed text-white/55 space-y-1.5 list-none">
            <li className="flex gap-2">
              <span aria-hidden className="text-white/35">•</span>
              <span>
                Anyone who can reach this Canvix instance. There is no cloud gatekeeping — reachability is decided by
                your deployment (LAN, VPN or reverse-proxy auth).
              </span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden className="text-white/35">•</span>
              <span>
                <strong className="text-white/75">无主设计</strong> (created while signed out) stay editable by
                everyone with the link — the pre-accounts behaviour, kept on purpose so existing shares never break.
              </span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden className="text-white/35">•</span>
              <span>
                <strong className="text-white/75">我拥有的设计</strong> 除所有者外，其他人均以只读方式打开：编辑器中显示真实的仅查看横幅，每次保存均返回 403。
              </span>
            </li>
          </ul>
          {readOnly && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 p-2.5 text-[11px] text-amber-200/90">
              <Eye size={13} className="shrink-0 mt-0.5" />
              <span>
                您正在以只读方式查看此设计——它属于其他账号。该链接仍可供任何持有者打开。
              </span>
            </div>
          )}
        </div>

        <p className="text-[11px] text-white/40 flex items-center gap-1.5">
          <QrCode size={13} /> 秉承开源精神 — 访问控制由你的部署决定，而非我们的云端。
        </p>
      </div>
    </>
  )
}
