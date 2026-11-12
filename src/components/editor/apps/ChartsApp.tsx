'use client'

// ─────────────────────────────────────────────────────────────
// ChartsApp (v0.14, D7) — the Apps-panel rail for charts.
//
// Until v0.14 charts were one-shot: this app exploded a chart into
// loose rects/lines/text (edit a bar and the "chart" was gone).
// The rail now adds ONE native, data-bound chart element — the
// sample data is editable from the context toolbar (Edit data:
// labels, values, series, colours, kind) and re-renders in the
// editor, video exports and SVG exports.
// ─────────────────────────────────────────────────────────────

import { BarChart3, LineChart, PieChart, ScatterChart } from 'lucide-react'
import { addChart } from '../add-element'
import { AppHeader, type AppPanelProps } from './registry'
import { CHART_KIND_LABELS, type ChartKind } from '@/lib/types'

const ROWS: { kind: ChartKind; icon: typeof BarChart3; desc: string }[] = [
  { kind: 'bar', icon: BarChart3, desc: '分组或堆叠 — 每个数值都可编辑' },
  { kind: 'line', icon: LineChart, desc: '带圆点的趋势线，可选平滑' },
  { kind: 'donut', icon: PieChart, desc: '带中心总计和图例的圆环' },
  { kind: 'scatter', icon: ScatterChart, desc: '数值坐标轴上的 XY 点' },
]

export function ChartsApp({ onClose }: AppPanelProps) {
  return (
    <div>
      <AppHeader icon={BarChart3} title="图表" onClose={onClose} />
      <p className="text-[11px] text-white/45 leading-relaxed mb-3">
        图表是原生数据绑定元素——在画布上选择一个图表，然后点击 <span className="text-white/70">编辑数据</span> 在工具栏中更改标签、数值和颜色。
      </p>
      <div className="space-y-2">
        {ROWS.map((r) => (
          <ChartRow key={r.kind} icon={r.icon} name={CHART_KIND_LABELS[r.kind]} desc={r.desc} onAdd={() => addChart(r.kind)} />
        ))}
      </div>
    </div>
  )
}

function ChartRow({ icon: Icon, name, desc, onAdd }: { icon: typeof BarChart3; name: string; desc: string; onAdd: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Add ${name}`}
      onClick={onAdd}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onAdd()
        }
      }}
      className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 hover:border-[#7630D7] transition-colors cursor-pointer focus:outline-none focus-visible:border-[#7630D7]"
    >
      <Icon size={18} className="text-[#02C0CC] shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-white">{name}</div>
        <div className="text-[11px] text-white/45 truncate">{desc}</div>
      </div>
      <button className="btn-cv h-8 px-3.5 text-[11px] shrink-0" onClick={(e) => { e.stopPropagation(); onAdd() }}>
        添加
      </button>
    </div>
  )
}
