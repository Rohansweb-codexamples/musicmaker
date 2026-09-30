"use client"

import { useRef } from "react"
import { engine } from "@/lib/engine"
import { store, useStudio } from "@/lib/store"
import { cx } from "./ui"

const CYCLE_H = 10

export function Ruler({ totalBars, barWidth }: { totalBars: number; barWidth: number }) {
  const cycle = useStudio((s) => s.cycle)
  const drag = useRef<null | { mode: "cycle" | "seek"; anchor: number; left: number }>(null)
  const every = barWidth < 20 ? 8 : barWidth < 34 ? 4 : barWidth < 60 ? 2 : 1

  const barAt = (clientX: number, left: number) => Math.max(0, (clientX - left) / barWidth)

  return (
    <div
      className="relative h-7 cursor-pointer touch-none select-none border-b border-black/50 bg-panel"
      style={{
        width: totalBars * barWidth,
        backgroundImage: `repeating-linear-gradient(to right, #56565e 0 1px, transparent 1px ${barWidth}px)`,
        backgroundSize: `100% 8px`,
        backgroundPosition: "0 100%",
        backgroundRepeat: "repeat-x",
      }}
      onPointerDown={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        e.currentTarget.setPointerCapture(e.pointerId)
        const bar = barAt(e.clientX, rect.left)
        if (e.clientY - rect.top < CYCLE_H + 2) {
          const anchor = Math.floor(bar)
          drag.current = { mode: "cycle", anchor, left: rect.left }
          store.set({ cycle: { on: true, start: anchor, end: anchor + 1 } })
        } else {
          drag.current = { mode: "seek", anchor: 0, left: rect.left }
          engine.setPlayhead(Math.round(bar * 4) / 4)
        }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d) return
        const bar = barAt(e.clientX, d.left)
        if (d.mode === "seek") {
          engine.setPlayhead(Math.round(bar * 4) / 4)
          return
        }
        const cur = bar < d.anchor ? Math.floor(bar) : Math.ceil(bar)
        const start = Math.min(d.anchor, cur)
        const end = Math.max(d.anchor + (cur <= d.anchor ? 1 : 0), cur, start + 1)
        store.set({ cycle: { on: true, start, end } })
      }}
      onPointerUp={() => {
        drag.current = null
      }}
      aria-label="Timeline ruler. Click to move the playhead, drag the top strip to set a cycle region."
    >
      <div
        className={cx(
          "absolute top-0.5 rounded-sm border",
          cycle.on ? "border-drum bg-drum/80" : "border-drum/30 bg-drum/15",
        )}
        style={{ left: cycle.start * barWidth, width: (cycle.end - cycle.start) * barWidth, height: CYCLE_H }}
        aria-hidden="true"
      />
      {Array.from({ length: Math.ceil(totalBars / every) }, (_, i) => i * every).map((b) => (
        <span
          key={b}
          className="pointer-events-none absolute bottom-0.5 pl-1 font-mono text-[10px] text-muted"
          style={{ left: b * barWidth }}
        >
          {b + 1}
        </span>
      ))}
    </div>
  )
}
