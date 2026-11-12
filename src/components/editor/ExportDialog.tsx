'use client'

import { useEffect, useState } from 'react'
import { Download, Loader2, FileImage, FileType2, FileCode2, Film, ImagePlay, Presentation } from 'lucide-react'
import { useEditorStore } from '@/store/editor-store'
import { captureStage, canvasBridge } from './canvas/canvas-bridge'
import { exportDesignToSVGs, downloadSVG } from '@/lib/svg-export'
import { collectPluginElements, primePluginRenders } from '@/lib/plugins/renderer-cache'
import {
  chooseVideoExportEngine,
  computeExportSize,
  detectVideoFormat,
  detectWebCodecsVideoSupport,
  downloadVideo,
  buildTimeline,
  estimateVideoDuration,
  exportVideo,
  pagesHaveAutoplayAudio,
  pagesHaveSfxCues,
  pagesHaveAutoplayVideo,
  type VideoExportEngineDecision,
} from '@/lib/video-export'
import { planGifFrames, selectGifPages, type GifPageRange } from '@/lib/gif-plan'
import { toast } from '@/hooks/use-toast'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

function sanitizeFilename(name: string): string {
  return (name || 'canvix-design').trim().toLowerCase().replace(/[^a-z0-9-_ ]/g, '').replace(/\s+/g, '-') || 'canvix-design'
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

const SCALES = [
  { id: 1, label: '1×', hint: '标准' },
  { id: 2, label: '2×', hint: '高分辨率' },
  { id: 3, label: '3×', hint: '最高画质' },
]

const FORMATS = [
  { id: 'png', label: 'PNG', hint: '无损 · 透明', icon: FileImage },
  { id: 'jpg', label: 'JPG', hint: '更小的文件', icon: FileImage },
  { id: 'pdf', label: 'PDF', hint: '矢量文字 · 全部页面', icon: FileType2 },
  { id: 'pptx', label: 'PPTX', hint: 'PowerPoint · 可编辑幻灯片', icon: Presentation },
  { id: 'svg', label: 'SVG', hint: '矢量 · 可编辑', icon: FileCode2 },
  { id: 'mp4', label: '视频', hint: 'MP4 / WebM · animated', icon: Film },
  { id: 'gif', label: 'GIF', hint: '动画 · 循环播放', icon: ImagePlay },
] as const

/** v0.15 (R5): GIF export options — size caps, centisecond-friendly
 *  frame rates, and dithering (the roadmap acceptance: "size cap +
 *  dithering options"). */
const GIF_SIZES = [
  { id: 480, label: '小', hint: '480 px' },
  { id: 720, label: '中', hint: '720 px' },
  { id: 1080, label: '大', hint: '1080 px' },
] as const

const GIF_FPSES = [
  { id: 10, label: '10 帧/秒', hint: '最小的文件' },
  { id: 15, label: '15 fps', hint: '均衡' },
  { id: 20, label: '20 帧/秒', hint: '流畅' },
] as const

type FormatId = (typeof FORMATS)[number]['id']

export function ExportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const name = useEditorStore((s) => s.designName)
  const pages = useEditorStore((s) => s.pages)
  const setCurrentPage = useEditorStore((s) => s.setCurrentPage)
  const currentPage = useEditorStore((s) => s.currentPage)

  const [format, setFormat] = useState<FormatId>('png')
  const [scale, setScale] = useState(2)
  const [allPages, setAllPages] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [progressLabel, setProgressLabel] = useState('')
  // v0.15 (R5): GIF options — size cap, frame rate, dithering, and
  // the page range ("a social-loop GIF from any page range")
  const [gifSize, setGifSize] = useState<number>(720)
  const [gifFps, setGifFps] = useState<number>(15)
  const [gifDither, setGifDither] = useState(true)
  const [gifRangeMode, setGifRangeMode] = useState<'current' | 'all' | 'range'>('all')
  const [gifFrom, setGifFrom] = useState(1)
  const [gifTo, setGifTo] = useState(pages.length)
  const videoFormat = detectVideoFormat()
  const videoDuration = estimateVideoDuration(pages)
  // v0.15 R2: which engine will exportVideo use for THIS design?
  // (audio designs keep MediaRecorder; silent designs get WebCodecs)
  const [engine, setEngine] = useState<VideoExportEngineDecision | null>(null)
  useEffect(() => {
    let live = true
    void (async () => {
      const { width, height } = computeExportSize(
        canvasBridge.pageWidth || 1080,
        canvasBridge.pageHeight || 1080,
        scale === 3 ? 1920 : scale === 2 ? 1440 : 960,
      )
      const wc = await detectWebCodecsVideoSupport(width, height)
      const mr = detectVideoFormat()
      const decision = chooseVideoExportEngine({
        webcodecs: wc.supported,
        mediaRecorder: mr !== null,
        mediaRecorderAudio: mr?.audio ?? false,
        hasPageAudio: pagesHaveAutoplayAudio(pages),
        // v0.22: transition/element SFX are timeline audio too — the
        // dialog's engine note must match what exportVideo will do
        hasSfxCues: pagesHaveSfxCues(pages),
      })
      if (live) setEngine(decision)
    })()
    return () => {
      live = false
    }
  }, [pages, scale])

  const base = sanitizeFilename(name)
  const pageCount = allPages ? pages.length : 1
  const estWidth = canvasBridge.pageWidth * scale
  const estHeight = canvasBridge.pageHeight * scale

  // GIF pre-flight: which pages, how long, how many frames — computed
  // BEFORE the export so the dialog can refuse the impossible ones
  // up front (the caps are on the record in docs/GIF-EXPORT.md)
  const gifRange: GifPageRange =
    gifRangeMode === 'all'
      ? { mode: 'all' }
      : gifRangeMode === 'current'
        ? { mode: 'current', currentPage }
        : { mode: 'range', from: gifFrom, to: Math.min(gifTo, pages.length) }
  let gifPages: typeof pages | null = null
  let gifError: string | null = null
  let gifDuration = 0
  let gifFrames = 0
  try {
    gifPages = selectGifPages(pages, gifRange)
    const { total } = buildTimeline(gifPages)
    const plan = planGifFrames(total, gifFps)
    gifDuration = plan.durationSec
    gifFrames = plan.frames
  } catch (e) {
    gifError = e instanceof Error ? e.message : String(e)
  }
  const gifSize2d = computeExportSize(canvasBridge.pageWidth || 1080, canvasBridge.pageHeight || 1080, gifSize)

  const run = async () => {
    setBusy(true)
    setProgress(null)
    try {
      if (format === 'mp4') {
        if (!videoFormat) throw new Error('This browser cannot record video. Try Chrome or Edge.')
        const result = await exportVideo({
          designWidth: canvasBridge.pageWidth || 1080,
          designHeight: canvasBridge.pageHeight || 1080,
          pages,
          maxWidth: scale === 3 ? 1920 : scale === 2 ? 1440 : 960,
          onProgress: (ratio, label) => {
            setProgress(Math.round(ratio * 100))
            setProgressLabel(label)
          },
        })
        downloadVideo(result, base)
        toast({
          title: `Video downloaded (${result.extension.toUpperCase()})`,
          description: `${result.frames} frames · ${result.durationSec.toFixed(1)}s · rendered locally in your browser`,
        })
        onOpenChange(false)
        return
      }
      if (format === 'gif') {
        if (!gifPages) throw new Error(gifError ?? 'The GIF export has no pages.')
        // the encoder (quantizer + LZW writer) loads on demand — the
        // editor page's module graph stays as light as it was (the
        // pdf-export precedent)
        const { exportGif, downloadGif } = await import('@/lib/gif-export')
        const result = await exportGif({
          designWidth: canvasBridge.pageWidth || 1080,
          designHeight: canvasBridge.pageHeight || 1080,
          pages: gifPages,
          maxWidth: gifSize,
          fps: gifFps,
          dither: gifDither,
          onProgress: (ratio, label) => {
            setProgress(Math.round(ratio * 100))
            setProgressLabel(label)
          },
        })
        downloadGif(result, base)
        toast({
          title: 'GIF 已下载',
          description: `${result.frames} frames · ${result.durationSec.toFixed(1)}s · ${(result.bytes / 1048576).toFixed(1)} MB · loops forever · rendered locally in your browser`,
        })
        onOpenChange(false)
        return
      }
      if (format === 'pptx') {
        // Wave 5: PowerPoint export — native editable shapes, text
        // and images; speaker notes ride along as notes slides;
        // charts/tables/embeds/plugins fall back to PNG snapshots.
        // Pages render from DATA (the PDF posture — no stage flips).
        const pagesToExport = allPages ? pages : [pages[currentPage]]
        await primePluginRenders(collectPluginElements(pagesToExport), 'export')
        const { inlineMediaImages } = await import('@/lib/svg-export')
        const inlined = await inlineMediaImages(pagesToExport)
        const { exportDesignToPptx, downloadPptx } = await import('@/lib/pptx-export')
        const result = await exportDesignToPptx({
          designWidth: canvasBridge.pageWidth || 1080,
          designHeight: canvasBridge.pageHeight || 1080,
          pages: inlined,
          pixelScale: scale,
          title: name,
          onProgress: (ratio, label) => {
            setProgress(Math.round(ratio * 100))
            setProgressLabel(label)
          },
        })
        downloadPptx(result, `${base}.pptx`)
        toast({
          title: `PPTX downloaded (${result.pages} slide${result.pages > 1 ? 's' : ''})`,
          description: `${result.natives} editable elements · ${result.rasters} snapshot${result.rasters === 1 ? '' : 's'}${result.notes ? ` · ${result.notes} notes page${result.notes === 1 ? '' : 's'}` : ''} — opens in PowerPoint, Keynote and Google Slides.`,
        })
        onOpenChange(false)
        return
      }
      if (format === 'svg') {
        // true vector export — no rasterization of vector elements.
        // v0.13 (P4): plugin renders are awaited FIRST (bounded by
        // the 10 s contract deadline) so their sanitized svg can be
        // embedded; missing plugins degrade to placeholder cards.
        const pagesToExport = allPages ? pages : [pages[currentPage]]
        await primePluginRenders(collectPluginElements(pagesToExport), 'export')
        // v0.14 (D1): media-store images inline to data URLs so the
        // file is portable (deep-copy inside — the live pages untouched)
        const { inlineMediaImages } = await import('@/lib/svg-export')
        const inlined = await inlineMediaImages(pagesToExport)
        const svgs = exportDesignToSVGs(inlined, canvasBridge.pageWidth, canvasBridge.pageHeight)
        for (let k = 0; k < svgs.length; k++) {
          const suffix = svgs.length > 1 ? `-page-${(allPages ? 0 : currentPage) + k + 1}` : ''
          downloadSVG(svgs[k], `${base}${suffix}.svg`)
          if (svgs.length > 1) await new Promise((r) => setTimeout(r, 380))
        }
        toast({
          title: `SVG downloaded (${svgs.length} file${svgs.length > 1 ? 's' : ''})`,
          description: '文本保留字体系列引用 — 查看者将回退到已安装的字体。',
        })
        onOpenChange(false)
        return
      }
      if (format === 'pdf') {
        // v0.15 (R4): vector-text PDF — real selectable, searchable text
        // with embedded subset fonts. Pages render from DATA (no stage
        // capture, no page-flip waits); anything vectors can't express
        // (emoji, plugin renders, filtered images, shadows) falls back to
        // per-element raster strips at the chosen detail level.
        const pagesToExport = allPages ? pages : [pages[currentPage]]
        await primePluginRenders(collectPluginElements(pagesToExport), 'export')
        const { inlineMediaImages } = await import('@/lib/svg-export')
        const inlined = await inlineMediaImages(pagesToExport)
        const { exportDesignToPdf, downloadPdf } = await import('@/lib/pdf-export')
        const result = await exportDesignToPdf({
          designWidth: canvasBridge.pageWidth || 1080,
          designHeight: canvasBridge.pageHeight || 1080,
          pages: inlined,
          pixelScale: scale,
          title: name,
          onProgress: (ratio, label) => {
            setProgress(Math.round(ratio * 100))
            setProgressLabel(label)
          },
        })
        downloadPdf(result, `${base}.pdf`)
        toast({
          title: `PDF downloaded (${result.pages} page${result.pages > 1 ? 's' : ''})`,
          description: '矢量文字 — 可选择、可搜索，字体在可用时嵌入。',
        })
        onOpenChange(false)
        return
      }
      const mimeType = format === 'png' ? 'image/png' : 'image/jpeg'
      const indices = allPages ? pages.map((_, i) => i) : [currentPage]
      const savedPage = currentPage
      for (let k = 0; k < indices.length; k++) {
        const idx = indices[k]
        if (idx !== useEditorStore.getState().currentPage) {
          setCurrentPage(idx)
          // wait for the stage to re-render the page
          await new Promise((r) => setTimeout(r, 220))
        }
        const url = await captureStage({ pixelScale: scale, mimeType, quality: 0.94 })
        const suffix = indices.length > 1 ? `-page-${idx + 1}` : ''
        triggerDownload(url, `${base}${suffix}.${format}`)
        if (indices.length > 1) await new Promise((r) => setTimeout(r, 380))
      }
      if (savedPage !== useEditorStore.getState().currentPage) setCurrentPage(savedPage)
      toast({ title: `已下载 ${pageCount} 个文件` })
      onOpenChange(false)
    } catch (err) {
      console.error('Export failed', err)
      toast({ title: '导出失败', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="rounded-[28px] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileImage size={18} className="text-[#7D2AE8]" /> 下载你的设计
          </DialogTitle>
          <DialogDescription>无水印，文件在你的浏览器本地生成。</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground mb-2">文件类型</h4>
            <div className="grid grid-cols-3 gap-1.5">
              {FORMATS.map((f) => {
                const Ico = f.icon
                return (
                  <button
                    key={f.id}
                    onClick={() => setFormat(f.id)}
                    className={cn(
                      'rounded-xl border-2 p-3 text-left transition-all',
                      format === f.id ? 'border-[#00C4CC] bg-[#F0FBFC]' : 'border-black/10 hover:border-black/25'
                    )}
                  >
                    <div className="font-bold text-sm flex items-center gap-1.5">
                      <Ico size={13} className="text-[#7D2AE8]" /> {f.label}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{f.hint}</div>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground mb-2">质量</h4>
            {format === 'svg' ? (
              <p className="text-[11px] text-muted-foreground py-3">
                Vector export — resolution-independent, opens in browsers & vector editors.
              </p>
            ) : format === 'pdf' ? (
              <p className="text-[11px] text-muted-foreground py-3">
                Vector text with embedded fonts — selectable & searchable, print-ready.
                The detail level sets the resolution of photos, stickers and other raster content.
              </p>
            ) : format === 'pptx' ? (
              <p className="text-[11px] text-muted-foreground py-3">
                Editable PowerPoint — text, shapes and images stay native objects, speaker notes
                ride along. The detail level sets the resolution of chart/table/plugin snapshots.
              </p>
            ) : format === 'gif' ? (
              <div className="text-[11px] text-muted-foreground space-y-3 py-1">
                <p>
                  渲染 <strong>{gifDuration.toFixed(1)}s</strong> 从 {gifPages ? gifPages.length : 0} page{gifPages && gifPages.length > 1 ? 's' : ''} — {gifFrames} frames,{' '}
                  <strong>无限循环</strong>.
                </p>
                {pagesHaveAutoplayVideo(pages) ? (
                  <p>Autoplay videos export with their moving content frame-accurately — non-autoplay videos keep their poster.</p>
                ) : null}
                <p>GIF 是 <strong>无声</strong> — the format has no audio track. Capped at 25 MB and 1 800 frames; the export stops with advice if it would exceed either.</p>
                <div>
                  <div className="grid grid-cols-3 gap-2">
                    {GIF_SIZES.map((sz) => (
                      <button
                        key={sz.id}
                        onClick={() => setGifSize(sz.id)}
                        className={cn(
                          'rounded-xl border-2 p-2.5 text-center transition-all',
                          gifSize === sz.id ? 'border-[#00C4CC] bg-[#F0FBFC]' : 'border-black/10 hover:border-black/25',
                        )}
                      >
                        <div className="font-bold text-sm">{sz.label}</div>
                        <div className="mt-0.5">{sz.hint}</div>
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5">输出： {gifSize2d.width} × {gifSize2d.height} px</p>
                </div>
                <div>
                  <div className="grid grid-cols-3 gap-2">
                    {GIF_FPSES.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => setGifFps(f.id)}
                        className={cn(
                          'rounded-xl border-2 p-2.5 text-center transition-all',
                          gifFps === f.id ? 'border-[#00C4CC] bg-[#F0FBFC]' : 'border-black/10 hover:border-black/25',
                        )}
                      >
                        <div className="font-bold text-sm">{f.label}</div>
                        <div className="mt-0.5">{f.hint}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <label className="flex items-center justify-between rounded-xl border border-black/10 px-4 py-3 cursor-pointer">
                  <span>
                    抖动
                    <span className="block font-normal">渐变更平滑，文件稍大</span>
                  </span>
                  <input type="checkbox" checked={gifDither} onChange={(e) => setGifDither(e.target.checked)} className="accent-[#00C4CC] h-4 w-4" />
                </label>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-4">
                    {(['all', 'current', 'range'] as const).map((m) => (
                      <label key={m} className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="gif-page-range"
                          checked={gifRangeMode === m}
                          onChange={() => setGifRangeMode(m)}
                          className="accent-[#00C4CC]"
                        />
                        {m === 'all' ? '全部页面' : m === 'current' ? '当前页面' : '范围'}
                      </label>
                    ))}
                  </div>
                  {gifRangeMode === 'range' && (
                    <div className="flex items-center gap-2 pl-6">
                      <span>第</span>
                      <input
                        type="number"
                        min={1}
                        max={pages.length}
                        value={gifFrom}
                        onChange={(e) => setGifFrom(Math.max(1, Math.round(Number(e.target.value) || 1)))}
                        className="w-16 rounded-lg border border-black/15 px-2 py-1 text-sm"
                        aria-label="第一页"
                      />
                      <span>页 至</span>
                      <input
                        type="number"
                        min={1}
                        max={pages.length}
                        value={gifTo}
                        onChange={(e) => setGifTo(Math.max(1, Math.round(Number(e.target.value) || 1)))}
                        className="w-16 rounded-lg border border-black/15 px-2 py-1 text-sm"
                        aria-label="最后一页"
                      />
                      <span className="text-muted-foreground">页，共 {pages.length} 页</span>
                    </div>
                  )}
                </div>
                {gifError ? <p className="text-red-500">{gifError}</p> : null}
              </div>
            ) : format === 'mp4' ? (
              <div className="text-[11px] text-muted-foreground space-y-1.5 py-1">
                <p>
                  渲染 <strong>{videoDuration.toFixed(1)}s</strong> 的动画播放（{pages.length} page{pages.length > 1 ? 's' : ''}) — element animations and page transitions included.
                </p>
                <p>
                  {engine === null ? (
                    <>Choosing the export engine…</>
                  ) : engine.engine === 'webcodecs' ? (
                    <>引擎： <strong>WebCodecs → WebM (VP9)</strong> ——逐帧精确时间轴、显式码率、本地渲染（不上传）</>
                  ) : engine.engine === 'mediarecorder' && videoFormat ? (
                    <>
                      引擎： <strong>MediaRecorder → {videoFormat.label}</strong>
                      {engine.reason.includes('page audio') ? (
                        <> — 渲染页面音频</>
                      ) : videoFormat.extension === 'webm' ? (
                        <> — 此浏览器无法编码 MP4，因此 Canvix 生成 WebM（随处可播放）</>
                      ) : null}
                      {' '}· 本地渲染（不上传）
                    </>
                  ) : (
                    <span className="text-red-500">This browser cannot export video — try Chrome or Edge.</span>
                  )}
                </p>
                {pagesHaveAutoplayVideo(pages) ? (
                  <p>Autoplay videos export with their moving content frame-accurately — non-autoplay videos keep their poster.</p>
                ) : null}
              </div>
            ) : (
              <>
            <div className="grid grid-cols-3 gap-2">
              {SCALES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setScale(s.id)}
                  className={cn(
                    'rounded-xl border-2 p-3 text-center transition-all',
                    scale === s.id ? 'border-[#00C4CC] bg-[#F0FBFC]' : 'border-black/10 hover:border-black/25'
                  )}
                >
                  <div className="font-bold text-sm">{s.label}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{s.hint}</div>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              输出： {estWidth} × {estHeight} 像素/文件
            </p>
              </>
            )}
          </div>

          {pages.length > 1 && format !== 'mp4' && format !== 'gif' && (
            <label className="flex items-center justify-between rounded-xl border border-black/10 px-4 py-3 cursor-pointer">
              <span className="text-sm font-medium">
                {format === 'pdf' || format === 'pptx' ? '包含全部页面' : '下载全部页面'}
                <span className="block text-[11px] text-muted-foreground font-normal">{format === 'pdf' || format === 'pptx' ? `${pages.length} pages in one ${format.toUpperCase()} file` : `${pages.length} files, one per page`}</span>
              </span>
              <input type="checkbox" checked={allPages} onChange={(e) => setAllPages(e.target.checked)} className="accent-[#00C4CC] h-4 w-4" />
            </label>
          )}
        </div>

        {busy && progress !== null && (
          <div className="space-y-2">
            <Progress value={progress} className="h-2" />
            <p className="text-[11px] text-muted-foreground text-center">{progressLabel}</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            取消
          </Button>
          <Button className="btn-brand-gradient gap-2 px-6" onClick={run} disabled={busy || (format === 'gif' && gifError !== null)}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            {busy ? '导出中…' : format === 'gif' ? '下载 GIF' : `Download ${pageCount} ${format.toUpperCase()}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
