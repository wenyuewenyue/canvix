'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  Bold, Italic, Underline, Strikethrough, CaseUpper, AlignLeft, AlignCenter, AlignRight,
  AlignJustify, Minus, Plus, LetterText, Percent, Sparkles, Move, CopyPlus, Trash2,
  Group, Ungroup, ArrowUpToLine, ArrowDownToLine, BringToFront, SendToBack,
  AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd,
  AlignHorizontalJustifyStart, AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd,
  AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter,
  FlipHorizontal, FlipVertical, Sun, Contrast, Palette, RotateCcw, Replace, Lock, LockOpen,
  Layers, SquareDashed, Crop, Spline, Table2, Rows3, Columns3, Trash, Upload, ExternalLink,
  Music, Film, Play, Repeat, Volume2, VolumeX, SlidersHorizontal, Activity, Puzzle, LayoutGrid, Wand2,
  BarChart3, LineChart, PieChart, ScatterChart, List, ListOrdered, Languages, Shrink, Hexagon, Shapes,
} from 'lucide-react'
import { useEditorStore, selectedElements, currentPageData } from '@/store/editor-store'
import type { AudioElement, ChartElement, ChartSeries, EmbedElement, FrameElement, ImageElement, LineElement, PluginElement, ShapeElement, StickerElement, TableElement, TextElement, VideoElement, AnyElement, FrameShape, ChartKind } from '@/lib/types'
import { FRAME_SHAPES, isGroup, CHART_KINDS, CHART_KIND_LABELS } from '@/lib/types'
import { CHART_PALETTE, MAX_CHART_LABELS, MAX_CHART_SERIES, CHART_VALUE_LIMIT } from '@/lib/chart-geometry'
import { TEXT_EFFECTS } from '@/lib/types'
import { beatSourceOf } from '@/lib/media/beat-detect'
import { cn } from '@/lib/utils'
import { getPluginSystemState, subscribePluginSystem } from '@/lib/plugins/renderer-cache'
import { applyDesignAction } from '@/lib/design-actions'
import { normalizeSpans } from '@/lib/rich-text'
import { FontDropdown } from './toolbar/FontDropdown'
import { ColorMenu } from './toolbar/ColorMenu'
import { IMAGE_FILTER_PRESETS, applyPresetToImageData, isImageFilterId, clampFilterIntensity } from '@/lib/image-filters'
import { MASK_SHAPES, MASK_SHAPE_LABELS, isMaskShape, maskPolygon } from '@/lib/shapes'
import { useLoadedImage } from './canvas/use-loaded-image'
import { ToolbarPopover, SliderRow, IconTile } from './toolbar/popover-kit'
import { BgRemoverPopover, MagicEraserPopover, EnhanceButton, UpscaleButton, BrushEraserDialog, AltTextPopover } from './ImageAI'

const ALIGN_ICONS = {
  left: AlignLeft,
  center: AlignCenter,
  right: AlignRight,
  justify: AlignJustify,
} as const

const EFFECT_PREVIEW: Record<string, React.CSSProperties> = {
  none: {},
  shadow: { textShadow: '2px 3px 4px rgba(0,0,0,0.7)' },
  lift: { textShadow: '0 4px 0 rgba(0,0,0,0.75)' },
  glow: { textShadow: '0 0 10px rgba(255,255,255,0.9)' },
  hollow: { color: 'transparent', WebkitTextStroke: '0.8px #fff' },
  outline: { WebkitTextStroke: '0.7px #fff' },
  background: { background: '#EFEFEF', color: '#7630D7', padding: '2px 6px', borderRadius: 4 },
  splice: { textShadow: '0 -2px 0 rgba(255,255,255,0.4), 0 2px 0 rgba(255,255,255,0.4)' },
  neon: { textShadow: '0 0 6px #7630D7, 0 0 14px #7630D7, 0 0 22px #9954FF' },
  echo: { textShadow: '4px 4px 0 rgba(255,255,255,0.35)' },
}

/** canva-style contextual toolbar. Desktop: rendered inside the topbar row. Mobile: bottom bar. */
export function ContextToolbar({ variant = 'topbar' }: { variant?: 'topbar' | 'mobile' }) {
  const state = useEditorStore()
  const sel = selectedElements(state)
  if (sel.length === 0) return null

  const ids = sel.map((e) => e.id)
  const update = state.updateElements
  const updateLive = state.updateElementsLive

  const first = sel[0]
  const isMulti = sel.length > 1
  const text = first.type === 'text' ? (first as TextElement) : null
  const shape = ['rect', 'ellipse', 'triangle', 'star', 'polygon', 'path'].includes(first.type) ? (first as ShapeElement) : null
  const line = first.type === 'line' ? (first as LineElement) : null
  const image = first.type === 'image' ? (first as ImageElement) : null
  const sticker = first.type === 'sticker' ? (first as StickerElement) : null
  const group = first.type === 'group' ? first : null
  const table = first.type === 'table' ? (first as TableElement) : null
  const frame = first.type === 'frame' ? (first as FrameElement) : null
  const embed = first.type === 'embed' ? (first as EmbedElement) : null
  const chart = first.type === 'chart' ? (first as ChartElement) : null
  const plugin = first.type === 'plugin' ? (first as PluginElement) : null
  const audio = first.type === 'audio' ? (first as AudioElement) : null
  const video = first.type === 'video' ? (first as VideoElement) : null
  // v0.11: the page's beat grid — powers the Beat Sync popover below
  const beatSource = beatSourceOf(currentPageData(state))

  const canGroup = isMulti
  const canUngroup = sel.some((e) => isGroup(e))

  const isTopbar = variant === 'topbar'

  return (
    <div
      className={cn(
        'flex items-center gap-0.5 min-w-0 overflow-x-auto cv-scroll-dark',
        isTopbar ? 'h-14 items-center px-1' : 'h-14 items-center px-2 bg-[#16181D] border-t border-white/[0.09]'
      )}
      aria-label="所选元素的常用控件"
      style={{ scrollbarWidth: 'none' }}
    >
      {/* ── multi-select ─────────────────────────────────────── */}
      {isMulti ? (
        <>
          <span className="text-[12px] font-semibold text-white/85 px-2 shrink-0">{sel.length} 已选中</span>
          <TBtn onClick={() => state.groupSelection()} disabled={!canGroup} title="编组 (Ctrl+G)" ariaLabel="成组">
            <Group size={15} />
          </TBtn>
          <TBtn onClick={() => state.ungroupSelection()} disabled={!canUngroup} title="取消编组 (Ctrl+Shift+G)" ariaLabel="取消成组">
            <Ungroup size={15} />
          </TBtn>
          <Divider />
          <PositionPopover ids={ids} count={sel.length} />
          <Divider />
          <TBtn onClick={() => state.duplicateSelection()} title="复制（Ctrl+D）" ariaLabel="复制">
            <CopyPlus size={15} />
          </TBtn>
          <TBtn onClick={() => state.deleteSelection()} title="删除 (Del)" ariaLabel="删除" danger>
            <Trash2 size={15} />
          </TBtn>
        </>
      ) : text ? (
        <>
          <FontDropdown value={text.fontFamily} onChange={(f) => update(ids, { fontFamily: f })} />
          {/* size stepper */}
          <div className="flex items-center shrink-0">
            <TBtn onClick={() => update(ids, { fontSize: Math.max(6, text.fontSize - 2) })} title="减小字号" ariaLabel="减小字号" className="!rounded-r-none">
              <Minus size={14} />
            </TBtn>
            <input
              type="number"
              value={Math.round(text.fontSize)}
              min={6}
              max={400}
              onChange={(e) => { const v = Number(e.target.value); if (v >= 6 && v <= 400) updateLive(ids, { fontSize: v }) }}
              onBlur={() => update(ids, { fontSize: text.fontSize })}
              className="h-8 w-10 bg-white/[0.06] border-y border-white/10 text-white text-[12px] text-center outline-none focus:border-[#7630D7] [color-scheme:dark]"
              aria-label="字号"
            />
            <TBtn onClick={() => update(ids, { fontSize: Math.min(400, text.fontSize + 2) })} title="增大字号" ariaLabel="增大字号" className="!rounded-l-none">
              <Plus size={14} />
            </TBtn>
          </div>

          <ColorMenu
            value={text.fill}
            gradient={text.fillGradient ?? null}
            onChange={(c, committed) => committed ? update(ids, { fill: c, fillGradient: null }) : updateLive(ids, { fill: c, fillGradient: null })}
            onGradient={(g, committed) => { const patch = g ? { fillGradient: g, fill: g.from } : { fillGradient: null }; if (committed) update(ids, patch); else updateLive(ids, patch) }}
            title="文字颜色"
          />

          {/* v0.15 (R1): while the element carries rich spans, per-range
              styles rule the canvas — offer the honest one-click clear back
              to the flat base style instead of misleading flat toggles */}
          {normalizeSpans(text.spans, text.text) ? (
            <button
              className="cv-tbtn"
              style={{ width: 'auto', padding: '0 10px', fontSize: 11, gap: 6 }}
              onClick={() => update(ids, { spans: null })}
              title="富文本已启用 — 将分段样式清除回基础样式"
              aria-label="清除富文本样式"
              data-testid="clear-rich-text"
            >
              富文本 · 清除
            </button>
          ) : (
            <>
              <TBtn onClick={() => update(ids, { bold: !text.bold })} dataActive={text.bold} title="加粗" ariaLabel="加粗">
                <Bold size={14} />
              </TBtn>
              <TBtn onClick={() => update(ids, { italic: !text.italic })} dataActive={text.italic} title="斜体" ariaLabel="斜体">
                <Italic size={14} />
              </TBtn>
              <TBtn onClick={() => update(ids, { underline: !text.underline })} dataActive={text.underline} title="下划线" ariaLabel="下划线">
                <Underline size={14} />
              </TBtn>
              <TBtn onClick={() => update(ids, { strike: !text.strike })} dataActive={text.strike} title="删除线" ariaLabel="删除线">
                <Strikethrough size={14} />
              </TBtn>
            </>
          )}
          <TBtn onClick={() => update(ids, { uppercase: !text.uppercase })} dataActive={text.uppercase} title="大写" ariaLabel="全部大写">
            <CaseUpper size={14} />
          </TBtn>

          {/* alignment */}
          <ToolbarPopover
            trigger={(open) => (
              <button className="cv-tbtn" data-active={open} aria-label="切换文字对齐" title="文字对齐">
                {(() => { const I = ALIGN_ICONS[text.align] ?? AlignLeft; return <I size={14} /> })()}
              </button>
            )}
          >
            <div className="grid grid-cols-2 gap-1 w-[150px]">
              {(['left', 'center', 'right', 'justify'] as const).map((a) => {
                const I = ALIGN_ICONS[a]
                return (
                  <button
                    key={a}
                    onClick={() => update(ids, { align: a })}
                    className={cn('flex items-center justify-center gap-1.5 h-8 rounded-lg text-[11px] font-medium capitalize', text.align === a ? 'bg-white/[0.16] text-white' : 'text-white/75 hover:bg-white/[0.08]')}
                  >
                    <I size={13} /> <span className="w-[42px] text-left">{a}</span>
                  </button>
                )
              })}
            </div>
          </ToolbarPopover>

          {/* spacing */}
          <ToolbarPopover
            trigger={(open) => (
              <button className="cv-tbtn" data-active={open} aria-label="高级设置" title="字距与行距">
                <LetterText size={14} />
              </button>
            )}
          >
            <SliderRow label="Letter spacing" value={text.letterSpacing} min={-10} max={80} step={1} onChange={(v) => updateLive(ids, { letterSpacing: v })} onCommit={() => update(ids, { letterSpacing: text.letterSpacing })} />
            <SliderRow label="Line spacing" value={text.lineHeight} min={0.6} max={3} step={0.05} onChange={(v) => updateLive(ids, { lineHeight: v })} onCommit={() => update(ids, { lineHeight: text.lineHeight })} format={(v) => `${v.toFixed(2)}×`} />
          </ToolbarPopover>

          {/* v0.18 (Wave 3): list + direction + auto-fit */}
          <ToolbarPopover
            width={228}
            trigger={(open) => (
              <button className="cv-tbtn" data-active={open || !!text.listStyle || !!text.autoFit} aria-label="列表与适配选项" title="列表与自适应">
                <List size={14} />
              </button>
            )}
          >
            <div className="text-[12px] font-bold text-white/90 mb-1.5">列表样式</div>
            <div className="flex gap-1 mb-2.5">
              <TBtn onClick={() => update(ids, { listStyle: 'none' })} dataActive={!text.listStyle || text.listStyle === 'none'} title="无列表" ariaLabel="无列表">
                <List size={13} className="opacity-40 line-through" />
              </TBtn>
              <TBtn onClick={() => update(ids, { listStyle: 'bullet' })} dataActive={text.listStyle === 'bullet'} title="项目符号列表" ariaLabel="项目符号列表" data-testid="list-bullet">
                <List size={13} />
              </TBtn>
              <TBtn onClick={() => update(ids, { listStyle: 'number' })} dataActive={text.listStyle === 'number'} title="编号列表" ariaLabel="编号列表" data-testid="list-number">
                <ListOrdered size={13} />
              </TBtn>
            </div>
            <div className="text-[12px] font-bold text-white/90 mb-1.5">方向</div>
            <div className="flex gap-1 mb-2.5">
              <TBtn onClick={() => update(ids, { direction: 'ltr' })} dataActive={text.direction !== 'rtl'} title="从左到右" ariaLabel="从左到右">
                <span className="text-[11px] font-semibold px-1">LTR</span>
              </TBtn>
              <TBtn onClick={() => update(ids, { direction: 'rtl' })} dataActive={text.direction === 'rtl'} title="从右到左（阿拉伯语、希伯来语…）" ariaLabel="从右到左" data-testid="dir-rtl">
                <Languages size={13} />
              </TBtn>
            </div>
            <label className="flex items-center justify-between text-[12px] text-white/80 mb-1 cursor-pointer" data-testid="autofit-toggle">
              <span className="flex items-center gap-1.5">
                <Shrink size={13} /> 自适应
              </span>
              <input type="checkbox" checked={!!text.autoFit} onChange={(e) => update(ids, { autoFit: e.target.checked })} className="accent-[#7630D7]" />
            </label>
            <div className="text-[11px] text-white/40 leading-snug">
              缩小字体以使文字适应文本框 — 永远不会超过设定大小。
            </div>
          </ToolbarPopover>

          {/* v0.6: curved text (canva “Curve”) */}
          <ToolbarPopover
            width={228}
            trigger={(open) => (
              <button className="cv-tbtn" data-active={open || !!text.curve} aria-label="弯曲文字" title="弯曲文字">
                <Spline size={14} />
              </button>
            )}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[12px] font-bold text-white/90">弯曲文字</div>
              <button className="text-[11px] text-white/60 hover:text-white" onClick={() => update(ids, { curve: 0 })}>重置</button>
            </div>
            <SliderRow label="Curve" value={text.curve ?? 0} min={-180} max={180} step={5} onChange={(v) => updateLive(ids, { curve: v })} onCommit={() => update(ids, { curve: text.curve ?? 0 })} format={(v) => `${v}°`} />
            <div className="flex justify-center pt-1.5">
              <span className="text-[15px] text-white/85" style={{ fontFamily: text.fontFamily, color: text.fill }} aria-hidden="true">
                {(text.curve ?? 0) >= 0 ? '◠' : '◡'} 弯曲预览
              </span>
            </div>
          </ToolbarPopover>

          {/* transparency */}
          <ToolbarPopover
            trigger={(open) => (
              <button className="cv-tbtn" data-active={open} aria-label="透明度" title="透明度">
                <Percent size={14} />
              </button>
            )}
          >
            <SliderRow label="Transparency" value={Math.round(text.opacity * 100)} min={0} max={100} step={1}
              onChange={(v) => updateLive(ids, { opacity: v / 100 })}
              onCommit={() => update(ids, { opacity: text.opacity })}
              format={(v) => `${100 - v}% transparent`} />
          </ToolbarPopover>

          {/* effects */}
          <ToolbarPopover width={264} trigger={(open) => (
            <button className="cv-tbtn gap-1 !px-2.5" data-active={open} aria-label="效果" title="效果">
              <Sparkles size={14} /> <span className="text-[12px] hidden lg:inline">效果</span>
            </button>
          )}>
            <div className="text-[12px] font-bold text-white/90 mb-2">文字特效</div>
            <div className="grid grid-cols-3 gap-1.5">
              {TEXT_EFFECTS.map((fx) => (
                <button
                  key={fx.id}
                  onClick={() => update(ids, { effect: fx.id })}
                  className={cn(
                    'flex flex-col items-center justify-center rounded-lg py-2 gap-1 border transition-colors',
                    text.effect === fx.id ? 'bg-white/[0.14] border-white/30' : 'border-white/[0.09] hover:bg-white/[0.07]'
                  )}
                  aria-label={`Effect ${fx.label}`}
                >
                  <span className="text-[19px] leading-none text-white" style={{ fontFamily: 'Poppins', ...EFFECT_PREVIEW[fx.id] }}>Ag</span>
                  <span className="text-[9.5px] text-white/65 font-medium">{fx.label}</span>
                </button>
              ))}
            </div>
            {text.effect === 'background' && (
              <div className="mt-2.5 border-t border-white/[0.08] pt-2.5">
                <div className="text-[11px] text-white/60 mb-1.5 font-medium">背景块</div>
                <div className="flex flex-wrap gap-1.5">
                  {['#EFEFEF', '#7630D7', '#00C4CC', '#FF5C8A', '#1F2226', '#FFE066'].map((c) => (
                    <button key={c} className="cv-swatch h-6 w-6" style={{ background: c }} onClick={() => update(ids, { effectBackground: c })} data-selected={text.effectBackground === c} aria-label={`Background ${c}`} />
                  ))}
                </div>
              </div>
            )}
          </ToolbarPopover>

          <Divider />
          <PositionPopover ids={ids} count={1} element={first} />
        </>
      ) : shape || group || sticker || line ? (
        <>
          {shape && (
            <>
              <ColorMenu
                value={shape.fill}
                gradient={shape.fillGradient ?? null}
                onChange={(c, committed) => committed ? update(ids, { fill: c, fillGradient: null }) : updateLive(ids, { fill: c, fillGradient: null })}
                onGradient={(g, committed) => { const patch = g ? { fillGradient: g, fill: g.from } : { fillGradient: null }; if (committed) update(ids, patch); else updateLive(ids, patch) }}
                title="填充"
              />
              {/* border colour + width */}
              <ToolbarPopover trigger={(open) => (
                <button className="cv-tbtn gap-1 !px-2.5" data-active={open} aria-label="边框" title="边框">
                  <SquareDashed size={14} /> <span className="text-[12px] hidden lg:inline">边框</span>
                </button>
              )}>
                <div className="text-[12px] font-bold text-white/90 mb-2">边框</div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[11px] text-white/60">颜色</span>
                  <ColorMenu value={shape.stroke === 'transparent' ? '#FFFFFF' : shape.stroke} onChange={(c, committed) => committed ? update(ids, { stroke: c, strokeWidth: shape.strokeWidth || 4 }) : updateLive(ids, { stroke: c, strokeWidth: shape.strokeWidth || 4 })} title="边框颜色" />
                </div>
                <SliderRow label="Width" value={shape.strokeWidth} min={0} max={40} step={1} onChange={(v) => updateLive(ids, { strokeWidth: v })} onCommit={() => update(ids, { strokeWidth: shape.strokeWidth })} />
                {shape.type === 'rect' && <SliderRow label="Corner radius" value={shape.cornerRadius} min={0} max={Math.round(shape.width / 2)} step={1} onChange={(v) => updateLive(ids, { cornerRadius: v })} onCommit={() => update(ids, { cornerRadius: shape.cornerRadius })} />}
              </ToolbarPopover>
              {/* v0.18 (Wave 3): parametric polygon / star controls */}
              {(shape.type === 'polygon' || shape.type === 'star') && (
                <ToolbarPopover
                  width={228}
                  trigger={(open) => (
                    <button className="cv-tbtn gap-1 !px-2.5" data-active={open} aria-label="形状属性" title="形状属性">
                      {shape.type === 'polygon' ? <Hexagon size={14} /> : <Shapes size={14} />}
                      <span className="text-[12px] hidden lg:inline">形状</span>
                    </button>
                  )}
                >
                  <div className="text-[12px] font-bold text-white/90 mb-1.5">
                    {shape.type === 'polygon' ? '多边形' : '星形'}
                  </div>
                  <SliderRow
                    label={shape.type === 'polygon' ? '边数' : '点数'}
                    value={shape.type === 'polygon' ? (shape.sides ?? 6) : (shape.numPoints ?? 5)}
                    min={3}
                    max={shape.type === 'polygon' ? 12 : 16}
                    step={1}
                    onChange={(v) => updateLive(ids, shape.type === 'polygon' ? { sides: Math.round(v) } : { numPoints: Math.round(v) })}
                    onCommit={() => update(ids, shape.type === 'polygon' ? { sides: shape.sides ?? 6 } : { numPoints: shape.numPoints ?? 5 })}
                    format={(v) => String(Math.round(v))}
                  />
                  {shape.type === 'star' && (
                    <SliderRow
                      label="Spike ratio"
                      value={shape.innerRatio ?? 0.55}
                      min={0.15}
                      max={0.85}
                      step={0.05}
                      onChange={(v) => updateLive(ids, { innerRatio: v })}
                      onCommit={() => update(ids, { innerRatio: shape.innerRatio ?? 0.55 })}
                      format={(v) => v.toFixed(2)}
                    />
                  )}
                </ToolbarPopover>
              )}
            </>
          )}
          {line && (
            <>
              <ColorMenu value={line.stroke} onChange={(c, committed) => committed ? update(ids, { stroke: c }) : updateLive(ids, { stroke: c })} title="线条颜色" />
              <ToolbarPopover trigger={(open) => (
                <button className="cv-tbtn gap-1 !px-2.5" data-active={open} aria-label="线条样式" title="线条样式">
                  <Minus size={14} /> <span className="text-[12px] hidden lg:inline">样式</span>
                </button>
              )}>
                <SliderRow label="Thickness" value={line.strokeWidth} min={1} max={40} step={1} onChange={(v) => updateLive(ids, { strokeWidth: v })} onCommit={() => update(ids, { strokeWidth: line.strokeWidth })} />
                <label className="flex items-center justify-between text-[12px] text-white/80 mb-2.5 cursor-pointer">
                  虚线
                  <input type="checkbox" checked={line.dashed} onChange={(e) => update(ids, { dashed: e.target.checked })} className="accent-[#7630D7]" />
                </label>
                <div className="flex gap-1.5">
                  <TBtn onClick={() => update(ids, { arrowEnd: !line.arrowEnd })} dataActive={line.arrowEnd} title="箭头末端" ariaLabel="箭头末端">→</TBtn>
                  <TBtn onClick={() => update(ids, { arrowStart: !line.arrowStart })} dataActive={line.arrowStart} title="箭头起点" ariaLabel="箭头起点">←</TBtn>
                </div>
              </ToolbarPopover>
            </>
          )}
          {sticker && (
            <SliderRowMini label="Size" value={sticker.fontSize} min={24} max={320} onChange={(v) => updateLive(ids, { fontSize: v, width: v * 1.3, height: v * 1.3 })} onCommit={() => update(ids, { fontSize: sticker.fontSize })} />
          )}
          {group && (
            <span className="text-[12px] font-semibold text-white/85 px-2 shrink-0 flex items-center gap-1.5">
              <Layers size={13} /> 成组
            </span>
          )}
          <ToolbarPopover trigger={(open) => (
            <button className="cv-tbtn" data-active={open} aria-label="透明度" title="透明度">
              <Percent size={14} />
            </button>
          )}>
            <SliderRow label="Transparency" value={Math.round(first.opacity * 100)} min={0} max={100} step={1}
              onChange={(v) => updateLive(ids, { opacity: v / 100 })}
              onCommit={() => update(ids, { opacity: first.opacity })}
              format={(v) => `${100 - v}% transparent`} />
          </ToolbarPopover>
          <Divider />
          <PositionPopover ids={ids} count={1} element={first} />
        </>
      ) : image ? (
        <>
          <TBtn onClick={() => state.openCrop(image.id)} title="裁剪图片" ariaLabel="裁剪图片">
            <Crop size={14} />
          </TBtn>
          {/* v0.18 (Wave 3): shape masks */}
          <MaskPopover el={image} ids={ids} />
          <ImageAdjustPopover el={image} ids={ids} />
          {/* v0.4 Canva AI image tools */}
          <BgRemoverPopover el={image} />
          <MagicEraserPopover el={image} />
          <EnhanceButton el={image} />
          {/* v0.19 (Wave 4): local image power tools — any image, offline */}
          <UpscaleButton el={image} />
          <BrushEraserDialog el={image} />
          <AltTextPopover el={image} />
          <Divider />
          <ImageFilterPopover el={image} ids={ids} />
          <ToolbarPopover trigger={(open) => (
            <button className="cv-tbtn" data-active={open} aria-label="透明度" title="透明度">
              <Percent size={14} />
            </button>
          )}>
            <SliderRow label="Transparency" value={Math.round(image.opacity * 100)} min={0} max={100} step={1}
              onChange={(v) => updateLive(ids, { opacity: v / 100 })}
              onCommit={() => update(ids, { opacity: image.opacity })}
              format={(v) => `${100 - v}% transparent`} />
          </ToolbarPopover>
          {/* v0.16.4 (A4): durable stock-photo attribution — same pattern
              as the R6 video credit. User uploads show nothing. */}
          {image.credit ? (
            <a
              href={image.credit.url || undefined}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] font-semibold text-[#02C0CC] bg-[#02C0CC]/10 border border-[#02C0CC]/25 rounded-full px-2 py-0.5 shrink-0 max-w-[190px] truncate"
              title={`${image.credit.license}${image.credit.url ? ` — ${image.credit.url}` : ''}`}
              aria-label={`Stock photo by ${image.credit.author} on ${image.credit.provider}`}
            >
              {image.credit.provider} · {image.credit.author}
            </a>
          ) : null}
          <Divider />
          <PositionPopover ids={ids} count={1} element={first} />
        </>
      ) : table ? (
        <>
          <span className="text-[12px] font-semibold text-white/85 px-2 shrink-0 flex items-center gap-1.5">
            <Table2 size={13} /> 表格
          </span>
          <TableToolbar table={table} ids={ids} />
          <Divider />
          <PositionPopover ids={ids} count={1} element={first} />
        </>
      ) : frame ? (
        <>
          <span className="text-[12px] font-semibold text-white/85 px-2 shrink-0 flex items-center gap-1.5">
            <SquareDashed size={13} /> 画框
          </span>
          <FrameToolbar frame={frame} ids={ids} />
          <Divider />
          <PositionPopover ids={ids} count={1} element={first} />
        </>
      ) : embed ? (
        <>
          <span className="text-[12px] font-semibold text-white/85 px-2 shrink-0 flex items-center gap-1.5 capitalize">
            <ExternalLink size={13} /> {embed.kind} 卡片
          </span>
          <EmbedToolbar embed={embed} ids={ids} />
          <ToolbarPopover trigger={(open) => (
            <button className="cv-tbtn" data-active={open} aria-label="透明度" title="透明度">
              <Percent size={14} />
            </button>
          )}>
            <SliderRow label="Transparency" value={Math.round(embed.opacity * 100)} min={0} max={100} step={1}
              onChange={(v) => updateLive(ids, { opacity: v / 100 })}
              onCommit={() => update(ids, { opacity: embed.opacity })}
              format={(v) => `${100 - v}% transparent`} />
          </ToolbarPopover>
          <Divider />
          <PositionPopover ids={ids} count={1} element={first} />
        </>
      ) : chart ? (
        <>
          <span className="text-[12px] font-semibold text-white/85 px-2 shrink-0 flex items-center gap-1.5">
            <BarChart3 size={13} /> {CHART_KIND_LABELS[chart.kind]}
          </span>
          <ChartToolbar chart={chart} ids={ids} />
          <Divider />
          <PositionPopover ids={ids} count={1} element={first} />
        </>
      ) : plugin ? (
        <>
          <span className="text-[12px] font-semibold text-white/85 px-2 shrink-0 flex items-center gap-1.5">
            <Puzzle size={13} /> {plugin.name?.trim() || plugin.kind}
          </span>
          <PluginToolbar plugin={plugin} ids={ids} />
          <Divider />
          <PositionPopover ids={ids} count={1} element={first} />
        </>
      ) : audio ? (
        <>
          <span className="text-[12px] font-semibold text-white/85 px-2 shrink-0 flex items-center gap-1.5">
            <Music size={13} /> 音频
          </span>
          <MediaToolbar
            ids={ids}
            volume={audio.volume}
            loop={audio.loop}
            autoplay={audio.autoplay}
            muted={false}
            onMuted={undefined}
            duration={audio.duration}
            trim={undefined}
          />
          {audio.bpm ? (
            <span className="text-[11px] font-semibold text-[#02C0CC] bg-[#02C0CC]/10 border border-[#02C0CC]/25 rounded-full px-2 py-0.5 shrink-0 tabular-nums" title="检测到的节拍（节拍同步网格）">
              {Math.round(audio.bpm)} BPM
            </span>
          ) : null}
          {/* Sound wave: durable audio attribution — the A4 photo pattern
              (Freesound results, pack sounds, voiceover recordings). */}
          {audio.credit ? (
            <a
              href={audio.credit.url || undefined}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] font-semibold text-[#02C0CC] bg-[#02C0CC]/10 border border-[#02C0CC]/25 rounded-full px-2 py-0.5 shrink-0 max-w-[190px] truncate"
              title={`${audio.credit.license}${audio.credit.url ? ` — ${audio.credit.url}` : ''}`}
              aria-label={`Audio by ${audio.credit.author} on ${audio.credit.provider}`}
            >
              {audio.credit.provider} · {audio.credit.author}
            </a>
          ) : null}
          <Divider />
          <PositionPopover ids={ids} count={1} element={first} />
        </>
      ) : video ? (
        <>
          <span className="text-[12px] font-semibold text-white/85 px-2 shrink-0 flex items-center gap-1.5">
            <Film size={13} /> 视频
          </span>
          <MediaToolbar
            ids={ids}
            volume={video.volume}
            loop={video.loop}
            autoplay={video.autoplay}
            muted={video.muted}
            onMuted={(v) => update(ids, { muted: v })}
            duration={video.duration}
            trim={{ start: video.trimStart, end: video.trimEnd }}
          />
          {/* v0.15 (R6): durable stock-video attribution — the element
              carries its credit; selected = visible (license + source
              page in the tooltip). User uploads show nothing. */}
          {video.credit ? (
            <a
              href={video.credit.url || undefined}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] font-semibold text-[#02C0CC] bg-[#02C0CC]/10 border border-[#02C0CC]/25 rounded-full px-2 py-0.5 shrink-0 max-w-[190px] truncate"
              title={`${video.credit.license}${video.credit.url ? ` — ${video.credit.url}` : ''}`}
              aria-label={`Stock video by ${video.credit.author} on ${video.credit.provider}`}
            >
              {video.credit.provider} · {video.credit.author}
            </a>
          ) : null}
          <Divider />
          <PositionPopover ids={ids} count={1} element={first} />
        </>
      ) : null}

      {/* ── v0.11: Beat Sync — available on any single-selected element ── */}
      {!isMulti && beatSource && (
        <>
          <Divider />
          <BeatSyncPopover el={first} ids={ids} bpm={beatSource.bpm} />
        </>
      )}
    </div>
  )
}

// ── v0.11: media + beat sync toolbars ──────────────────────

function MediaToolbar({
  ids,
  volume,
  loop,
  autoplay,
  muted,
  onMuted,
  duration,
  trim,
}: {
  ids: string[]
  volume: number
  loop: boolean
  autoplay: boolean
  muted: boolean
  onMuted?: (v: boolean) => void
  duration: number
  trim?: { start: number; end: number }
}) {
  const update = useEditorStore((s) => s.updateElements)
  const updateLive = useEditorStore((s) => s.updateElementsLive)
  return (
    <ToolbarPopover
      width={264}
      trigger={(open) => (
        <button className="cv-tbtn gap-1 !px-2.5" data-active={open} aria-label="媒体设置" title="媒体设置">
          <SlidersHorizontal size={14} /> <span className="text-[12px] hidden lg:inline">媒体</span>
        </button>
      )}
    >
      <SliderRow label="Volume" value={Math.round(volume * 100)} min={0} max={100} step={1}
        onChange={(v) => updateLive(ids, { volume: v / 100 })}
        onCommit={() => update(ids, { volume })}
        format={(v) => `${v}%`} />
      <div className="flex gap-1.5 mt-1">
        <TBtn onClick={() => update(ids, { loop: !loop })} dataActive={loop} title="循环" ariaLabel="循环">
          <Repeat size={14} />
        </TBtn>
        <TBtn onClick={() => update(ids, { autoplay: !autoplay })} dataActive={autoplay} title="Play when the page appears (Preview / Present / video export)" ariaLabel="打开页面时播放">
          <Play size={14} />
        </TBtn>
        {onMuted ? (
          <TBtn onClick={() => onMuted(!muted)} dataActive={muted} title="静音" ariaLabel="静音">
            {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </TBtn>
        ) : null}
      </div>
      {trim && Number.isFinite(duration) && duration > 0.2 ? (
        <div className="mt-2 border-t border-white/[0.08] pt-2">
          <SliderRow label="Trim start" value={Number(trim.start.toFixed(1))} min={0} max={Math.max(0.1, duration - 0.1)} step={0.1}
            onChange={(v) => updateLive(ids, { trimStart: Math.min(v, trim.end - 0.1) })}
            onCommit={() => update(ids, { trimStart: trim.start })}
            format={(v) => `${v.toFixed(1)}s`} />
          <SliderRow label="Trim end" value={Number(trim.end.toFixed(1))} min={0.1} max={duration} step={0.1}
            onChange={(v) => updateLive(ids, { trimEnd: Math.max(v, trim.start + 0.1) })}
            onCommit={() => update(ids, { trimEnd: trim.end })}
            format={(v) => `${v.toFixed(1)}s`} />
        </div>
      ) : null}
      <p className="text-[10px] text-white/40 leading-relaxed mt-2">
        媒体可在预览/演示模式和导出的视频中播放（音频混流效果因浏览器而异）。
      </p>
    </ToolbarPopover>
  )
}

function BeatSyncPopover({ el, ids, bpm }: { el: AnyElement; ids: string[]; bpm: number }) {
  const update = useEditorStore((s) => s.updateElements)
  const updateLive = useEditorStore((s) => s.updateElementsLive)
  const strength = Math.round((el.beatPulse ?? 0) * 100)
  return (
    <ToolbarPopover
      width={252}
      trigger={(open) => (
        <button className="cv-tbtn gap-1 !px-2.5" data-active={open || strength > 0} aria-label="节拍同步" title="节拍同步——让该元素随音乐节拍跳动">
          <Activity size={14} /> <span className="text-[12px] hidden lg:inline">节拍{strength > 0 ? ` ${strength}%` : ''}</span>
        </button>
      )}
    >
      <div className="text-[10px] font-semibold text-white/45 uppercase tracking-wide mb-1.5">
        节拍同步 · {Math.round(bpm)} BPM
      </div>
      <SliderRow label="Pulse" value={strength} min={0} max={100} step={1}
        onChange={(v) => updateLive(ids, { beatPulse: v / 100 })}
        onCommit={() => update(ids, { beatPulse: (el.beatPulse ?? 0) })}
        format={(v) => (v === 0 ? 'off' : `+${(v * 0.12).toFixed(2)}× scale`)} />
      <p className="text-[10px] text-white/40 leading-relaxed mt-2">
        The element scales on every beat of the page's audio (Preview, Present and video export). Enable “Play on page open” on the audio element so the music runs with it.
      </p>
    </ToolbarPopover>
  )
}

// ── v0.6: table / frame / embed toolbars ──────────────────────

function TableToolbar({ table, ids }: { table: TableElement; ids: string[] }) {
  const update = useEditorStore((s) => s.updateElements)
  const updateLive = useEditorStore((s) => s.updateElementsLive)

  const addRow = () => {
    const cells = [...table.cells]
    for (let c = 0; c < table.cols; c += 1) cells.push({ text: '' })
    update(ids, { rows: table.rows + 1, cells, height: Math.round((table.rows + 1) * (table.height / table.rows)) })
  }
  const addCol = () => {
    const cells: typeof table.cells = []
    for (let r = 0; r < table.rows; r += 1) {
      for (let c = 0; c < table.cols; c += 1) {
        cells.push(table.cells[r * table.cols + c] ?? { text: '' })
      }
      if (r === 0) cells.push({ text: '', bold: true, fill: table.headerFill })
      else cells.push({ text: '' })
    }
    const colWidths = [...table.colWidths, Math.round(table.width / (table.cols + 1))]
    update(ids, { cols: table.cols + 1, cells, colWidths, width: table.width + Math.round(table.width / (table.cols + 1)) })
  }
  const removeRow = () => {
    if (table.rows <= 1) return
    update(ids, { rows: table.rows - 1, cells: table.cells.slice(0, (table.rows - 1) * table.cols), height: Math.round((table.rows - 1) * (table.height / table.rows)) })
  }
  const removeCol = () => {
    if (table.cols <= 1) return
    const cells: typeof table.cells = []
    for (let r = 0; r < table.rows; r += 1) {
      for (let c = 0; c < table.cols - 1; c += 1) cells.push(table.cells[r * table.cols + c] ?? { text: '' })
    }
    update(ids, { cols: table.cols - 1, cells, colWidths: table.colWidths.slice(0, -1) })
  }

  return (
    <>
      <TBtn onClick={addRow} title="添加行" ariaLabel="添加行"><Rows3 size={15} /><Plus size={9} className="-ml-1.5 -mb-1.5" /></TBtn>
      <TBtn onClick={removeRow} title="删除行" ariaLabel="删除行"><Rows3 size={15} /><Minus size={9} className="-ml-1.5 -mb-1.5" /></TBtn>
      <TBtn onClick={addCol} title="添加列" ariaLabel="添加列"><Columns3 size={15} /><Plus size={9} className="-ml-1.5 -mb-1.5" /></TBtn>
      <TBtn onClick={removeCol} title="删除列" ariaLabel="删除列"><Columns3 size={15} /><Minus size={9} className="-ml-1.5 -mb-1.5" /></TBtn>
      <ToolbarPopover trigger={(open) => (
        <button className="cv-tbtn gap-1 !px-2.5" data-active={open} aria-label="表格样式" title="表格样式">
          <Palette size={14} /> <span className="text-[12px] hidden lg:inline">样式</span>
        </button>
      )}>
        <div className="text-[12px] font-bold text-white/90 mb-2">表格样式</div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[11px] text-white/60">边框</span>
          <ColorMenu value={table.borderColor} onChange={(c, committed) => committed ? update(ids, { borderColor: c }) : updateLive(ids, { borderColor: c })} title="边框颜色" />
        </div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[11px] text-white/60">表头</span>
          <ColorMenu value={table.headerFill} onChange={(c, committed) => committed ? update(ids, { headerFill: c }) : updateLive(ids, { headerFill: c })} title="表头填充" />
        </div>
        <SliderRow label="Border width" value={table.borderWidth} min={0} max={6} step={0.5} onChange={(v) => updateLive(ids, { borderWidth: v })} onCommit={() => update(ids, { borderWidth: table.borderWidth })} />
        <SliderRow label="Text size" value={table.fontSize} min={8} max={40} step={1} onChange={(v) => updateLive(ids, { fontSize: v })} onCommit={() => update(ids, { fontSize: table.fontSize })} />
      </ToolbarPopover>
    </>
  )
}

function FrameToolbar({ frame, ids }: { frame: FrameElement; ids: string[] }) {
  const update = useEditorStore((s) => s.updateElements)

  const onFill = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const src = String(reader.result)
      const img = new window.Image()
      img.onload = () => update(ids, { src, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight })
      img.src = src
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  return (
    <>
      <label className="cv-tbtn gap-1 !px-2.5 cursor-pointer" title="用图片填充画框" aria-label="用图片填充画框">
        <Upload size={14} /> <span className="text-[12px] hidden lg:inline">填充</span>
        <input type="file" accept="image/*" className="hidden" onChange={onFill} />
      </label>
      <ToolbarPopover trigger={(open) => (
        <button className="cv-tbtn gap-1 !px-2.5" data-active={open} aria-label="画框形状" title="画框形状">
          <SquareDashed size={14} /> <span className="text-[12px] hidden lg:inline">形状</span>
        </button>
      )}>
        <div className="text-[12px] font-bold text-white/90 mb-2">画框形状</div>
        <div className="grid grid-cols-3 gap-1.5">
          {FRAME_SHAPES.map((fs: FrameShape) => (
            <button
              key={fs}
              onClick={() => update(ids, { frameShape: fs })}
              className={cn(
                'h-9 rounded-lg text-[11px] font-medium capitalize border transition-colors',
                frame.frameShape === fs ? 'bg-white/[0.16] border-white/30 text-white' : 'border-white/[0.09] text-white/75 hover:bg-white/[0.07]'
              )}
              aria-label={`Frame shape ${fs}`}
            >
              {fs}
            </button>
          ))}
        </div>
        {frame.frameShape === 'rect' && (
          <div className="mt-2 border-t border-white/[0.08] pt-2">
            <SliderRow label="Corner radius" value={frame.radius} min={0} max={Math.round(frame.width / 2)} step={1} onChange={(v) => useEditorStore.getState().updateElementsLive(ids, { radius: v })} onCommit={() => update(ids, { radius: frame.radius })} />
          </div>
        )}
      </ToolbarPopover>
    </>
  )
}

function EmbedToolbar({ embed, ids }: { embed: EmbedElement; ids: string[] }) {
  const update = useEditorStore((s) => s.updateElements)
  const [editingUrl, setEditingUrl] = useState(embed.url)

  return (
    <>
      <ToolbarPopover width={280} trigger={(open) => (
        <button className="cv-tbtn gap-1 !px-2.5" data-active={open} aria-label="编辑链接" title="编辑链接">
          <ExternalLink size={14} /> <span className="text-[12px] hidden lg:inline">链接</span>
        </button>
      )}>
        <div className="text-[12px] font-bold text-white/90 mb-2">嵌入链接</div>
        <input
          value={editingUrl}
          onChange={(e) => setEditingUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && editingUrl.trim()) update(ids, { url: editingUrl.trim(), title: undefined })
          }}
          className="w-full h-8 rounded-lg bg-white/[0.06] border border-white/10 px-2.5 text-[12px] text-white outline-none focus:border-[#7630D7]"
          aria-label="嵌入链接"
        />
        <div className="flex gap-1.5 mt-2">
          <button className="btn-cv h-8 px-3 text-[11px]" onClick={() => editingUrl.trim() && update(ids, { url: editingUrl.trim(), title: undefined })}>应用</button>
          <button className="h-8 px-3 text-[11px] rounded-lg border border-white/10 text-white/70 hover:bg-white/[0.07]" onClick={() => setEditingUrl(embed.url)}>重置</button>
        </div>
        <p className="text-[10px] text-white/40 mt-2 leading-relaxed">卡片链接将在预览和共享视图中打开。</p>
      </ToolbarPopover>
    </>
  )
}

/** canva position popover: arrange 2×2 + align 6 + advanced W/H/X/Y/rotate */
function PositionPopover({ ids, count, element }: { ids: string[]; count: number; element?: AnyElement }) {
  const store = useEditorStore()
  const el = element ?? selectedElements(store)[0]

  const [ratio, setRatio] = useState(false)
  const W = el?.width ?? 0
  const H = el?.height ?? 0

  const setSize = (w: number, h: number) => {
    store.updateElements(ids, { width: Math.max(4, Math.round(w)), height: Math.max(4, Math.round(h)) })
  }

  return (
    <ToolbarPopover
      width={252}
      trigger={(open) => (
        <button className="cv-tbtn gap-1 !px-2.5" data-active={open} aria-label="位置" title="位置、图层顺序和大小">
          <Move size={14} /> <span className="text-[12px] hidden lg:inline">位置</span>
        </button>
      )}
    >
      {/* arrange 2×2 */}
      <div className="grid grid-cols-2 gap-1 mb-2.5">
        <IconTile icon={<ArrowUpToLine size={15} />} label="Forward" onClick={() => ids.forEach((id) => store.moveLayer(id, 'up'))} />
        <IconTile icon={<ArrowDownToLine size={15} />} label="Backward" onClick={() => ids.forEach((id) => store.moveLayer(id, 'down'))} />
        <IconTile icon={<BringToFront size={15} />} label="To front" onClick={() => ids.forEach((id) => store.moveLayer(id, 'front'))} />
        <IconTile icon={<SendToBack size={15} />} label="To back" onClick={() => ids.forEach((id) => store.moveLayer(id, 'back'))} />
      </div>

      <div className="border-t border-white/[0.08] pt-2 mb-2.5">
        <div className="text-[10px] font-semibold text-white/45 uppercase tracking-wide mb-1.5">对齐到页面</div>
        <div className="grid grid-cols-3 gap-1">
          <IconTile icon={<AlignVerticalJustifyStart size={15} />} label="Top" onClick={() => store.alignElements(ids, 'top')} />
          <IconTile icon={<AlignVerticalJustifyCenter size={15} />} label="Middle" onClick={() => store.alignElements(ids, 'cy')} />
          <IconTile icon={<AlignVerticalJustifyEnd size={15} />} label="Bottom" onClick={() => store.alignElements(ids, 'bottom')} />
          <IconTile icon={<AlignHorizontalJustifyStart size={15} />} label="Left" onClick={() => store.alignElements(ids, 'left')} />
          <IconTile icon={<AlignHorizontalJustifyCenter size={15} />} label="Centre" onClick={() => store.alignElements(ids, 'cx')} />
          <IconTile icon={<AlignHorizontalJustifyEnd size={15} />} label="Right" onClick={() => store.alignElements(ids, 'right')} />
        </div>
      </div>

      {count >= 3 && (
        <div className="border-t border-white/[0.08] pt-2 mb-2.5">
          <div className="text-[10px] font-semibold text-white/45 uppercase tracking-wide mb-1.5">分布</div>
          <div className="grid grid-cols-3 gap-1">
            <IconTile icon={<AlignHorizontalDistributeCenter size={15} />} label="Spacing H" onClick={() => store.distributeElements(ids, 'x')} />
            <IconTile icon={<AlignVerticalDistributeCenter size={15} />} label="Spacing V" onClick={() => store.distributeElements(ids, 'y')} />
          </div>
        </div>
      )}

      {count === 1 && el && (
        <div className="border-t border-white/[0.08] pt-2">
          <div className="text-[10px] font-semibold text-white/45 uppercase tracking-wide mb-1.5">高级</div>
          <div className="grid grid-cols-3 gap-1.5 mb-1.5">
            <NumField label="宽" value={W} onCommit={(v) => setSize(ratio ? v * (H / W) : v, ratio ? v * (H / W) : H)} />
            <NumField label="高" value={H} onCommit={(v) => setSize(ratio ? v * (W / H) : W, ratio ? v * (W / H) : v)} />
            <button
              className="flex flex-col items-center justify-center gap-0.5 rounded-lg border border-white/10 text-white/75 hover:bg-white/[0.09] text-[10px] font-medium py-1"
              onClick={() => setRatio(!ratio)}
              title="锁定宽高比"
            >
              <Lock size={12} className={ratio ? 'text-[#7630D7]' : 'opacity-50'} />
              比例
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <NumField label="X" value={Math.round(el.x)} onCommit={(v) => store.updateElements(ids, { x: Math.round(v) })} />
            <NumField label="Y" value={Math.round(el.y)} onCommit={(v) => store.updateElements(ids, { y: Math.round(v) })} />
            <NumField label="Rotate" value={Math.round(el.rotation)} suffix="°" onCommit={(v) => store.updateElements(ids, { rotation: ((v % 360) + 360) % 360 })} />
          </div>
        </div>
      )}
    </ToolbarPopover>
  )
}

/** v0.18 (Wave 3): one mask option's silhouette — the polygon scaled
 *  into a 34×34 chip (pure SVG, same geometry as the canvas clip). */
function MaskThumb({ shape, sides, innerRatio, active }: { shape: string; sides?: number; innerRatio?: number; active?: boolean }) {
  const pts = isMaskShape(shape) && shape !== 'none' ? maskPolygon(shape, sides, innerRatio) : null
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full" aria-hidden="true">
      {pts ? (
        <polygon
          points={pts.map(([x, y]) => `${x},${y}`).join(' ')}
          fill={active ? '#02C0CC33' : '#FFFFFF22'}
          stroke={active ? '#02C0CC' : '#FFFFFF66'}
          strokeWidth={4}
        />
      ) : (
        <rect x={10} y={10} width={80} height={80} rx={10} fill="none" stroke={active ? '#02C0CC' : '#FFFFFF66'} strokeWidth={4} strokeDasharray="10 8" />
      )}
    </svg>
  )
}

/** v0.18 (Wave 3): image shape-mask picker — 10 presets + parametric
 *  polygon / starburst. Writes maskShape/maskSides/maskInnerRatio onto
 *  the element (validated on render by isMaskShape — hostile pastes
 *  degrade to 'none'). */
function MaskPopover({ el, ids }: { el: ImageElement; ids: string[] }) {
  const update = useEditorStore((s) => s.updateElements)
  const updateLive = useEditorStore((s) => s.updateElementsLive)
  const current = isMaskShape(el.maskShape) ? el.maskShape : 'none'
  return (
    <ToolbarPopover
      width={244}
      trigger={(open) => (
        <button className="cv-tbtn gap-1 !px-2.5" data-active={open || (current !== 'none' && !!current)} aria-label="图片遮罩" title="遮罩形状">
          <Shapes size={14} /> <span className="text-[12px] hidden lg:inline">遮罩</span>
        </button>
      )}
    >
      <div className="text-[12px] font-bold text-white/90 mb-1.5">遮罩形状</div>
      <div className="grid grid-cols-4 gap-1.5" data-testid="mask-grid">
        {MASK_SHAPES.map((m) => (
          <button
            key={m}
            onClick={() => update(ids, { maskShape: m })}
            data-testid={`mask-${m}`}
            title={MASK_SHAPE_LABELS[m]}
            aria-label={MASK_SHAPE_LABELS[m]}
            className={cn(
              'h-[38px] rounded-lg border flex items-center justify-center p-1 transition-colors',
              current === m ? 'border-[#02C0CC] bg-[#02C0CC]/10' : 'border-white/10 hover:border-white/30'
            )}
          >
            <MaskThumb shape={m} sides={el.maskSides} innerRatio={el.maskInnerRatio} active={current === m} />
          </button>
        ))}
      </div>
      {(current === 'poly' || current === 'polyStar') && (
        <div className="mt-2">
          <SliderRow
            label={current === 'poly' ? '边数' : '点数'}
            value={el.maskSides ?? 6}
            min={3}
            max={current === 'poly' ? 12 : 16}
            step={1}
            onChange={(v) => updateLive(ids, { maskSides: Math.round(v) })}
            onCommit={() => update(ids, { maskSides: el.maskSides ?? 6 })}
            format={(v) => String(Math.round(v))}
          />
          {current === 'polyStar' && (
            <SliderRow
              label="Spike ratio"
              value={el.maskInnerRatio ?? 0.55}
              min={0.15}
              max={0.85}
              step={0.05}
              onChange={(v) => updateLive(ids, { maskInnerRatio: v })}
              onCommit={() => update(ids, { maskInnerRatio: el.maskInnerRatio ?? 0.55 })}
              format={(v) => v.toFixed(2)}
            />
          )}
        </div>
      )}
      <div className="text-[11px] text-white/40 leading-snug mt-2">
        将图片裁剪为该形状——设置遮罩后圆角将被忽略。
      </div>
    </ToolbarPopover>
  )
}

function ImageAdjustPopover({ el, ids }: { el: ImageElement; ids: string[] }) {
  const update = useEditorStore((s) => s.updateElements)
  const updateLive = useEditorStore((s) => s.updateElementsLive)
  return (
    <ToolbarPopover
      width={252}
      trigger={(open) => (
        <button className="cv-tbtn gap-1 !px-2.5" data-active={open} aria-label="调整图片" title="调整图片">
          <Sun size={14} /> <span className="text-[12px] hidden lg:inline">调整</span>
        </button>
      )}
    >
      <SliderRow label="Brightness" value={el.brightness ?? 0} min={-100} max={100} step={1} onChange={(v) => updateLive(ids, { brightness: v })} onCommit={() => update(ids, { brightness: el.brightness ?? 0 })} />
      <SliderRow label="Contrast" value={el.contrast ?? 0} min={-100} max={100} step={1} onChange={(v) => updateLive(ids, { contrast: v })} onCommit={() => update(ids, { contrast: el.contrast ?? 0 })} />
      <SliderRow label="Saturation" value={el.saturation ?? 0} min={-100} max={100} step={1} onChange={(v) => updateLive(ids, { saturation: v })} onCommit={() => update(ids, { saturation: el.saturation ?? 0 })} />
      <div className="flex gap-1.5 mt-1 border-t border-white/[0.08] pt-2.5">
        <TBtn onClick={() => update(ids, { flipH: !el.flipH })} dataActive={el.flipH} title="水平翻转" ariaLabel="水平翻转"><FlipHorizontal size={14} /></TBtn>
        <TBtn onClick={() => update(ids, { flipV: !el.flipV })} dataActive={el.flipV} title="垂直翻转" ariaLabel="垂直翻转"><FlipVertical size={14} /></TBtn>
        <TBtn onClick={() => update(ids, { brightness: 0, contrast: 0, saturation: 0 })} title="重置调整" ariaLabel="重置调整"><RotateCcw size={14} /></TBtn>
        <TBtn onClick={() => useEditorStore.getState().setPanel('uploads')} title="替换图片" ariaLabel="替换图片"><Replace size={14} /></TBtn>
      </div>
    </ToolbarPopover>
  )
}

/** v0.14 (D4): the filter gallery — preset chips with live previews
 *  of the element's own image + an intensity slider. Replaces the old
 *  "Filter tint (soon)" stub. */
function ImageFilterPopover({ el, ids }: { el: ImageElement; ids: string[] }) {
  const update = useEditorStore((s) => s.updateElements)
  const updateLive = useEditorStore((s) => s.updateElementsLive)
  const image = useLoadedImage(el.src)
  const active = isImageFilterId(el.filter) ? el.filter : 'none'
  const intensity = clampFilterIntensity(el.filterIntensity)
  return (
    <ToolbarPopover
      width={268}
      trigger={(open) => (
        <button className="cv-tbtn gap-1 !px-2.5" data-active={open || active !== 'none'} aria-label="滤镜" title="滤镜">
          <Wand2 size={14} /> <span className="text-[12px] hidden lg:inline">滤镜</span>
        </button>
      )}
    >
      <div className="grid grid-cols-4 gap-1.5 mb-2.5">
        {IMAGE_FILTER_PRESETS.map((p) => (
          <button
            key={p.id}
            title={p.hint}
            aria-label={`Filter ${p.label}`}
            aria-pressed={active === p.id}
            onClick={() => update(ids, { filter: p.id, filterIntensity: p.id === 'none' ? 100 : intensity })}
            className={cn(
              'rounded-lg overflow-hidden border transition-colors',
              active === p.id ? 'border-[#7630D7] bg-white/[0.13]' : 'border-white/10 hover:border-white/25'
            )}
          >
            <FilterThumb image={image} preset={p.id} intensity={intensity} />
            <div className="text-[10px] text-white/80 py-1 text-center leading-none">{p.label}</div>
          </button>
        ))}
      </div>
      {active !== 'none' && (
        <SliderRow label="Intensity" value={intensity} min={0} max={100} step={1}
          onChange={(v) => updateLive(ids, { filterIntensity: v })}
          onCommit={() => update(ids, { filterIntensity: el.filterIntensity ?? 100 })} />
      )}
    </ToolbarPopover>
  )
}

/** tiny live preview — the preset applied to the element's own image */
function FilterThumb({ image, preset, intensity }: { image: HTMLImageElement | null; preset: string; intensity: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const w = 56
    const h = 40
    canvas.width = w
    canvas.height = h
    ctx.clearRect(0, 0, w, h)
    if (!image) return
    // cover-crop the source into the thumb
    const sr = image.naturalWidth / image.naturalHeight
    const tr = w / h
    let sw = image.naturalWidth
    let sh = image.naturalHeight
    let sx = 0
    let sy = 0
    if (sr > tr) {
      sw = image.naturalHeight * tr
      sx = (image.naturalWidth - sw) / 2
    } else {
      sh = image.naturalWidth / tr
      sy = (image.naturalHeight - sh) / 2
    }
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, w, h)
    if (preset === 'none' || intensity <= 0) return
    const data = ctx.getImageData(0, 0, w, h)
    applyPresetToImageData(data, preset, intensity / 100)
    ctx.putImageData(data, 0, 0)
  }, [image, preset, intensity])
  return <canvas ref={ref} className="block w-full aspect-[7/5] bg-white/[0.06]" />
}

function SliderRowMini({ label, value, min, max, onChange, onCommit }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; onCommit: () => void }) {
  return (
    <div className="flex items-center gap-2 px-2 shrink-0 w-[150px]">
      <span className="text-[11px] text-white/60 w-8">{label}</span>
      <input
        type="range"
        className="cv-slider w-full"
        style={{ background: `linear-gradient(to right, #7630D7 ${((value - min) / (max - min)) * 100}%, rgba(255,255,255,0.14) ${((value - min) / (max - min)) * 100}%)` }}
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit}
        aria-label={label}
      />
    </div>
  )
}

function NumField({ label, value, onCommit, suffix }: { label: string; value: number; onCommit: (v: number) => void; suffix?: string }) {
  const [v, setV] = useState(String(value))
  const [editing, setEditing] = useState(false)
  if (!editing && String(value) !== v) setV(String(value))
  return (
    <label className="flex flex-col items-center gap-0.5">
      <span className="text-[9px] text-white/40 font-medium">{label}</span>
      <span className="relative w-full">
        <input
          value={v}
          onFocus={() => setEditing(true)}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => { setEditing(false); const n = Number(v); if (!Number.isNaN(n)) onCommit(n) }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          className="h-7 w-full rounded-lg bg-white/[0.07] border border-white/10 px-1 text-[11px] text-white text-center outline-none focus:border-[#7630D7] [color-scheme:dark]"
          aria-label={label}
        />
        {suffix && <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-white/35 pointer-events-none">{suffix}</span>}
      </span>
    </label>
  )
}

function TBtn({ children, onClick, title, ariaLabel, disabled, danger, className, dataActive, ...rest }: {
  children: React.ReactNode
  onClick?: () => void
  title?: string
  ariaLabel?: string
  disabled?: boolean
  danger?: boolean
  className?: string
  dataActive?: boolean
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'title' | 'className' | 'disabled'>) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      data-active={dataActive ? 'true' : undefined}
      className={cn('cv-tbtn', danger && 'hover:bg-[#ff5a5a]/15 hover:text-[#ff8080]', className)}
      {...rest}
    >
      {children}
    </button>
  )
}

const Divider = () => <span className="w-px h-5 bg-white/15 mx-1 shrink-0" />

// ── v0.13 (P4): plugin element properties slot ───────────────

/** One schema-driven field row (host-rendered — no plugin code runs
 *  in the toolbar; research §4.4 "UI — properties slot"). */
function PluginToolbar({ plugin, ids }: { plugin: PluginElement; ids: string[] }) {
  const setPanel = useEditorStore((s) => s.setPanel)
  const system = useSyncExternalStore(subscribePluginSystem, getPluginSystemState, getPluginSystemState)

  const install = system.installs.get(plugin.pluginId)
  const spec = install?.elements.find((e) => e.kind === plugin.kind)
  const patchData = async (patch: Record<string, unknown>) => {
    if (!install) return
    // host-side editing acts with the install's identity (the host is
    // trusted; the caller scoping exists so PLUGINS cannot forge each
    // other's elements — the user owns the design)
    await applyDesignAction(
      { type: 'updatePluginElementData', ids, patch },
      { pluginId: install.pluginId, pluginVersion: install.version, elementKinds: install.elements.map((e) => e.kind) },
    )
  }

  return (
    <>
      {spec ? (
        spec.schema.slice(0, 5).map((raw) => {
          const f = raw as { key: string; type: string; label: string; min?: number; max?: number; step?: number; maxLength?: number; options?: { value: string; label: string }[] }
          const value = plugin.data[f.key]
          const inputCls = 'h-7 rounded-lg bg-white/[0.07] border border-white/10 px-1.5 text-[11px] text-white outline-none focus:border-[#7630D7] [color-scheme:dark]'
          return (
            <label key={f.key} className="flex items-center gap-1.5 shrink-0" title={f.label}>
              <span className="text-[10px] text-white/45">{f.label}</span>
              {f.type === 'text' && (
                <input
                  defaultValue={typeof value === 'string' ? value : ''}
                  maxLength={f.maxLength ?? 200}
                  onBlur={(e) => { const v = e.target.value; if (v !== (plugin.data[f.key] ?? '')) void patchData({ [f.key]: v }) }}
                  className={cn(inputCls, 'w-28')}
                  aria-label={f.label}
                />
              )}
              {(f.type === 'number' || f.type === 'range') && (
                <input
                  type="number"
                  defaultValue={Number(value ?? f.min ?? 0)}
                  min={f.min}
                  max={f.max}
                  step={f.step ?? 1}
                  onBlur={(e) => {
                    const n = Number(e.target.value)
                    const clamped = Math.min(f.max ?? Infinity, Math.max(f.min ?? -Infinity, Number.isFinite(n) ? n : (f.min ?? 0)))
                    if (clamped !== Number(plugin.data[f.key] ?? NaN)) void patchData({ [f.key]: clamped })
                  }}
                  className={cn(inputCls, 'w-16 text-center')}
                  aria-label={f.label}
                />
              )}
              {f.type === 'color' && (
                <input
                  type="color"
                  defaultValue={typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#7630D7'}
                  onBlur={(e) => { const v = e.target.value; if (v !== plugin.data[f.key]) void patchData({ [f.key]: v }) }}
                  className="h-7 w-8 rounded-lg border border-white/10 bg-transparent cursor-pointer"
                  aria-label={f.label}
                />
              )}
              {f.type === 'select' && (
                <select
                  defaultValue={typeof value === 'string' ? value : (f.options?.[0]?.value ?? '')}
                  onChange={(e) => { const v = e.target.value; if (v !== plugin.data[f.key]) void patchData({ [f.key]: v }) }}
                  className={cn(inputCls, 'w-24')}
                  aria-label={f.label}
                >
                  {(f.options ?? []).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              )}
            </label>
          )
        })
      ) : (
        <span className="text-[11px] text-white/40 shrink-0" title="安装该应用以编辑此元素的设置">
          {install ? `"${plugin.kind}" settings` : '应用未安装 — 设置不可用'}
        </span>
      )}
      <TBtn onClick={() => setPanel('apps')} title="在应用中打开（应用面板）" ariaLabel="在应用中打开">
        <LayoutGrid size={14} />
      </TBtn>
    </>
  )
}

// ── v0.14 (D7): chart toolbar — kind switcher, data editor, options ──

const CHART_KIND_ICONS: Record<ChartKind, typeof BarChart3> = {
  bar: BarChart3,
  line: LineChart,
  donut: PieChart,
  scatter: ScatterChart,
}

function ChartToolbar({ chart, ids }: { chart: ChartElement; ids: string[] }) {
  const update = useEditorStore((s) => s.updateElements)
  const updateLive = useEditorStore((s) => s.updateElementsLive)

  /** convert in place — scatter keeps labels empty; scatter→other reuses
   *  the y values as data so nothing is lost in the round trip */
  const switchKind = (k: ChartKind) => {
    if (k === chart.kind) return
    const patch: Partial<ChartElement> = { kind: k }
    if (k === 'scatter') {
      patch.labels = []
    } else if (chart.kind === 'scatter' && !chart.labels.length) {
      const n = Math.max(2, Math.floor((chart.series[0]?.values.length ?? 0) / 2))
      patch.labels = Array.from({ length: n }, (_, i) => `Item ${i + 1}`)
      patch.series = chart.series.map((sr) => ({ ...sr, values: sr.values.filter((_, j) => j % 2 === 1) }))
    }
    update(ids, patch)
  }

  return (
    <>
      {CHART_KINDS.map((k) => {
        const Icon = CHART_KIND_ICONS[k]
        return (
          <TBtn key={k} onClick={() => switchKind(k)} title={CHART_KIND_LABELS[k]} ariaLabel={`Convert to ${CHART_KIND_LABELS[k]}`} dataActive={chart.kind === k}>
            <Icon size={15} />
          </TBtn>
        )
      })}
      <Divider />
      <ToolbarPopover
        width={540}
        trigger={(open) => (
          <button className="cv-tbtn gap-1 !px-2.5" data-active={open} aria-label="编辑图表数据" title="编辑图表数据">
            <Table2 size={14} /> <span className="text-[12px] hidden lg:inline">编辑数据</span>
          </button>
        )}
      >
        <ChartDataEditor chart={chart} ids={ids} />
      </ToolbarPopover>
      <ToolbarPopover
        trigger={(open) => (
          <button className="cv-tbtn gap-1 !px-2.5" data-active={open} aria-label="图表选项" title="图表选项">
            <SlidersHorizontal size={14} /> <span className="text-[12px] hidden lg:inline">选项</span>
          </button>
        )}
      >
        <div className="text-[12px] font-bold text-white/90 mb-2">图表选项</div>
        {chart.kind === 'bar' && (
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] text-white/60 w-16">柱形</span>
            <ChartToggle label="Group" active={chart.barMode !== 'stack'} onClick={() => update(ids, { barMode: 'group' })} />
            <ChartToggle label="Stack" active={chart.barMode === 'stack'} onClick={() => update(ids, { barMode: 'stack' })} />
          </div>
        )}
        {chart.kind === 'donut' && (
          <SliderRow
            label="Hole size"
            value={Math.round(chart.hole * 100)}
            min={0}
            max={85}
            step={1}
            onChange={(v) => updateLive(ids, { hole: v / 100 })}
            onCommit={() => update(ids, { hole: chart.hole })}
            format={(v) => `${v}%`}
          />
        )}
        {chart.kind === 'line' && (
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] text-white/60 w-16">线条</span>
            <ChartToggle label="流畅" active={chart.smooth} onClick={() => update(ids, { smooth: !chart.smooth })} />
          </div>
        )}
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <ChartToggle label="Grid" active={chart.showGrid} onClick={() => update(ids, { showGrid: !chart.showGrid })} />
          <ChartToggle label="Values" active={chart.showValues} onClick={() => update(ids, { showValues: !chart.showValues })} />
          <ChartToggle label="Legend" active={chart.showLegend} onClick={() => update(ids, { showLegend: !chart.showLegend })} />
        </div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[11px] text-white/60">面板</span>
          <ColorMenu value={chart.fill} onChange={(c, committed) => committed ? update(ids, { fill: c }) : updateLive(ids, { fill: c })} title="图表背景" />
          <span className="text-[11px] text-white/60 ml-2">文字</span>
          <ColorMenu value={chart.textColor} onChange={(c, committed) => committed ? update(ids, { textColor: c }) : updateLive(ids, { textColor: c })} title="文字颜色" />
        </div>
        <SliderRow
          label="Text size"
          value={chart.fontSize}
          min={8}
          max={24}
          step={1}
          onChange={(v) => updateLive(ids, { fontSize: v })}
          onCommit={() => update(ids, { fontSize: chart.fontSize })}
        />
      </ToolbarPopover>
      <ToolbarPopover trigger={(open) => (
        <button className="cv-tbtn" data-active={open} aria-label="透明度" title="透明度">
          <Percent size={14} />
        </button>
      )}>
        <SliderRow label="Transparency" value={Math.round(chart.opacity * 100)} min={0} max={100} step={1}
          onChange={(v) => updateLive(ids, { opacity: v / 100 })}
          onCommit={() => update(ids, { opacity: chart.opacity })}
          format={(v) => `${100 - v}% transparent`} />
      </ToolbarPopover>
    </>
  )
}

function ChartToggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'h-7 rounded-md px-2.5 text-[11px] border transition-colors shrink-0',
        active ? 'bg-[#7630D7] border-[#7630D7] text-white' : 'bg-white/[0.05] border-white/10 text-white/60 hover:text-white'
      )}
    >
      {label}
    </button>
  )
}

/** number input with a typing draft — "-" and partial numbers never
 *  snap back mid-edit, valid numbers commit live (the house pattern) */
function ChartNumInput({ value, onCommit, ariaLabel, className }: { value: number; onCommit: (n: number) => void; ariaLabel: string; className?: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={draft ?? String(value)}
      onChange={(e) => {
        const raw = e.target.value
        setDraft(raw)
        if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return
        const n = Number(raw)
        if (Number.isFinite(n)) onCommit(Math.max(-CHART_VALUE_LIMIT, Math.min(CHART_VALUE_LIMIT, n)))
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
      className={cn('w-14 bg-white/[0.06] rounded-md px-1.5 py-1 text-[12px] text-white/90 border border-white/10 focus:border-[#7630D7] outline-none tabular-nums', className)}
    />
  )
}

const CV_INPUT_CLS = 'bg-white/[0.06] rounded-md px-1.5 py-1 text-[12px] text-white/90 border border-white/10 focus:border-[#7630D7] outline-none'

function ChartDataEditor({ chart, ids }: { chart: ChartElement; ids: string[] }) {
  const update = useEditorStore((s) => s.updateElements)
  const updateLive = useEditorStore((s) => s.updateElementsLive)
  const scatter = chart.kind === 'scatter'

  // typing = live (house pattern — table cells do the same);
  // structural ops = one undo step each
  const setLabels = (labels: string[]) => updateLive(ids, { labels })
  const setSeries = (series: ChartSeries[]) => updateLive(ids, { series })
  const setSeriesField = (i: number, patch: Partial<ChartSeries>) =>
    setSeries(chart.series.map((sr, j) => (j === i ? { ...sr, ...patch } : sr)))

  const setLabel = (i: number, v: string) => {
    const labels = [...chart.labels]
    labels[i] = v.slice(0, 24)
    setLabels(labels)
  }
  const addLabel = () => {
    if (chart.labels.length >= MAX_CHART_LABELS) return
    update(ids, {
      labels: [...chart.labels, `Item ${chart.labels.length + 1}`],
      series: chart.series.map((sr) => ({ ...sr, values: [...sr.values, 0] })),
    })
  }
  const removeLabel = () => {
    if (chart.labels.length <= 1) return
    update(ids, {
      labels: chart.labels.slice(0, -1),
      series: chart.series.map((sr) => ({ ...sr, values: sr.values.slice(0, -1) })),
    })
  }
  const addSeries = () => {
    if (chart.series.length >= MAX_CHART_SERIES) return
    const values = scatter ? [10, 20, 30, 40] : chart.labels.map((_, i) => 20 + i * 5)
    update(ids, {
      series: [...chart.series, { name: `Series ${chart.series.length + 1}`, color: CHART_PALETTE[chart.series.length % CHART_PALETTE.length], values }],
    })
  }
  const removeSeries = (i: number) => {
    if (chart.series.length <= 1) return
    update(ids, { series: chart.series.filter((_, j) => j !== i) })
  }
  const setValue = (si: number, vi: number, n: number) => {
    const values = [...chart.series[si].values]
    values[vi] = n
    setSeriesField(si, { values })
  }
  const addPoint = (si: number) => {
    const values = [...chart.series[si].values]
    if (values.length >= 48) return
    const lastX = values.length >= 2 ? values[values.length - 2] : 0
    values.push(Math.round(lastX + 10), 50)
    setSeriesField(si, { values })
  }
  const removePoint = (si: number, pi: number) => {
    if (chart.series[si].values.length <= 4) return
    const values = [...chart.series[si].values]
    values.splice(pi * 2, 2)
    setSeriesField(si, { values })
  }

  return (
    <div>
      <div className="text-[12px] font-bold text-white/90 mb-2">图表数据</div>
      {scatter ? (
        <div className="max-h-[320px] overflow-y-auto cv-scroll-dark pr-1">
          {chart.series.map((sr, si) => (
            <div key={si} className="mb-3 pb-2 border-b border-white/[0.07] last:border-b-0">
              <div className="flex items-center gap-1.5 mb-1.5">
                <ColorMenu value={sr.color} onChange={(c, committed) => committed ? update(ids, { series: chart.series.map((x, j) => (j === si ? { ...x, color: c } : x)) }) : setSeriesField(si, { color: c })} title={`Series ${si + 1} colour`} />
                <input value={sr.name} onChange={(e) => setSeriesField(si, { name: e.target.value.slice(0, 40) })} aria-label={`Series ${si + 1} name`} className={cn(CV_INPUT_CLS, 'w-28')} />
                {chart.series.length > 1 && (
                  <TBtn onClick={() => removeSeries(si)} title="移除系列" ariaLabel={`Remove series ${si + 1}`} danger className="!h-7 !w-7">
                    <Trash2 size={12} />
                  </TBtn>
                )}
              </div>
              {Array.from({ length: Math.floor(sr.values.length / 2) }, (_, pi) => (
                <div key={pi} className="flex items-center gap-1.5 mb-1">
                  <span className="w-4 text-[10px] text-white/35 text-right">x</span>
                  <ChartNumInput value={sr.values[pi * 2] ?? 0} onCommit={(n) => setValue(si, pi * 2, n)} ariaLabel={`Series ${si + 1} point ${pi + 1} x`} />
                  <span className="w-4 text-[10px] text-white/35 text-right">y</span>
                  <ChartNumInput value={sr.values[pi * 2 + 1] ?? 0} onCommit={(n) => setValue(si, pi * 2 + 1, n)} ariaLabel={`Series ${si + 1} point ${pi + 1} y`} />
                  <TBtn onClick={() => removePoint(si, pi)} title="移除点" ariaLabel={`Remove point ${pi + 1}`} disabled={sr.values.length <= 4} className="!h-6 !w-6">
                    <Minus size={11} />
                  </TBtn>
                </div>
              ))}
              <button onClick={() => addPoint(si)} disabled={sr.values.length >= 48} className="btn-cv h-7 px-3 text-[11px] mt-1">
                + 数据点
              </button>
            </div>
          ))}
          <p className="text-[10px] text-white/35">每个点都是数值轴上的一组 x、y 坐标。</p>
        </div>
      ) : (
        <div>
          <div className="max-h-[240px] overflow-auto cv-scroll-dark">
            <table className="border-collapse text-[12px]">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-[#1B1D24] z-10 pr-2 pb-2 text-left text-white/40 font-medium text-[10px] w-[128px]">系列 \ 标签</th>
                  {chart.labels.map((l, i) => (
                    <th key={i} className="px-1 pb-2">
                      <input value={l} onChange={(e) => setLabel(i, e.target.value)} aria-label={`Label ${i + 1}`} className={cn(CV_INPUT_CLS, 'w-16')} />
                    </th>
                  ))}
                  <th className="pl-1 pb-2 w-[52px]">
                    <TBtn onClick={addLabel} title="添加标签" ariaLabel="添加标签" disabled={chart.labels.length >= MAX_CHART_LABELS} className="!h-6 !w-6">
                      <Plus size={11} />
                    </TBtn>
                  </th>
                  <th className="pb-2 w-[36px]">
                    <TBtn onClick={removeLabel} title="移除最后一个标签" ariaLabel="删除上一个标签" disabled={chart.labels.length <= 1} className="!h-6 !w-6">
                      <Minus size={11} />
                    </TBtn>
                  </th>
                </tr>
              </thead>
              <tbody>
                {chart.series.map((sr, si) => (
                  <tr key={si}>
                    <td className="sticky left-0 bg-[#1B1D24] z-10 pr-2 pb-2">
                      <div className="flex items-center gap-1">
                        <ColorMenu value={sr.color} onChange={(c, committed) => committed ? update(ids, { series: chart.series.map((x, j) => (j === si ? { ...x, color: c } : x)) }) : setSeriesField(si, { color: c })} title={`Series ${si + 1} colour`} />
                        <input value={sr.name} onChange={(e) => setSeriesField(si, { name: e.target.value.slice(0, 40) })} aria-label={`Series ${si + 1} name`} className={cn(CV_INPUT_CLS, 'w-16')} />
                        {chart.series.length > 1 && (
                          <TBtn onClick={() => removeSeries(si)} title="移除系列" ariaLabel={`Remove series ${si + 1}`} danger className="!h-6 !w-6">
                            <Trash2 size={11} />
                          </TBtn>
                        )}
                      </div>
                    </td>
                    {chart.labels.map((_, vi) => (
                      <td key={vi} className="px-1 pb-2">
                        <ChartNumInput value={sr.values[vi] ?? 0} onCommit={(n) => setValue(si, vi, n)} ariaLabel={`Series ${si + 1} value ${vi + 1}`} />
                      </td>
                    ))}
                    <td />
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 mt-2">
        <button onClick={addSeries} disabled={chart.series.length >= MAX_CHART_SERIES} className="btn-cv h-7 px-3 text-[11px]">
          ＋ 系列
        </button>
        <span className="text-[10px] text-white/35">
          {scatter ? '每行一个 x,y 坐标点。' : chart.kind === 'donut' ? '环形图仅渲染第一个数据系列。' : '数值会实时更新图表。'}
        </span>
      </div>
    </div>
  )
}
