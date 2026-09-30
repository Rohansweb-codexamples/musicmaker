"use client"

import { memo, useMemo, useRef } from "react"
import { regionNotes } from "@/lib/engine"
import { actions, type Region, type TrackKind } from "@/lib/store"
import { cx, regionColor } from "./ui"

function NotesPreview({ region }: { region: Region }) {
  const notes = regionNotes(region)
  const total = region.length * 16
  const content = useMemo(() => {
    if (!notes.length) return null
    const isDrum = region.preset === "kit-house" || region.preset === "kit-deep"
    const pitches = Array.from(new Set(notes.map((n) => n.midi))).sort((a, b) => b - a)
    const min = Math.min(...pitches)
    const max = Math.max(...pitches)
    const rows = isDrum ? pitches.length : Math.max(12, max - min + 1)
    const rowH = 100 / rows
    const yOf = (m: number) => (isDrum ? pitches.indexOf(m) : max - m + (rows - (max - min + 1)) / 2) * rowH
    const rects: React.ReactNode[] = []
    const reps = Math.ceil(total / region.loopSteps)
    for (let k = 0; k < reps && rects.length < 3000; k++) {
      for (const n of notes) {
        const x = n.step + k * region.loopSteps
        if (x >= total) continue
        rects.push(
          <rect
            key={`${k}-${n.step}-${n.midi}`}
            x={x + 0.08}
            y={yOf(n.midi) + rowH * 0.12}
            width={Math.max(0.35, Math.min(n.dur, total - x) - 0.16)}
            height={Math.max(1.5, rowH * 0.76)}
            rx={0.2}
          />,
        )
      }
    }
    return rects
  }, [notes, total, region.loopSteps, region.preset])

  if (region.audioId && region.peaks) {
    const peaks = region.peaks
    return (
      <svg viewBox={`0 0 ${peaks.length} 100`} preserveAspectRatio="none" className="size-full" aria-hidden="true">
        {peaks.map((p, i) => (
          <rect key={i} x={i} y={50 - p * 46} width={0.8} height={Math.max(1, p * 92)} fill="currentColor" />
        ))}
      </svg>
    )
  }
  return (
    <svg viewBox={`0 0 ${total} 100`} preserveAspectRatio="none" className="size-full" aria-hidden="true">
      <g fill="currentColor">{content}</g>
    </svg>
  )
}

export const RegionView = memo(function RegionView({
  region,
  kind,
  barWidth,
  selected,
}: {
  region: Region
  kind: TrackKind
  barWidth: number
  selected: boolean
}) {
  const color = regionColor(region, kind)
  const drag = useRef<null | { x: number; start: number; length: number; mode: "move" | "resize"; moved: boolean }>(null)

  const onPointerDown = (e: React.PointerEvent, mode: "move" | "resize") => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, start: region.start, length: region.length, mode, moved: false }
    actions.select(region.trackId, region.id)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dxBars = Math.round((e.clientX - d.x) / barWidth)
    if (dxBars !== 0) d.moved = true
    if (d.mode === "resize") {
      const length = Math.max(1, d.length + dxBars)
      if (length !== region.length) actions.updateRegion(region.id, { length })
      return
    }
    const start = Math.max(0, d.start + dxBars)
    const lane = document
      .elementsFromPoint(e.clientX, e.clientY)
      .map((el) => (el as HTMLElement).dataset?.lane)
      .find((id) => id && id !== "new")
    const patch: Partial<Region> = {}
    if (start !== region.start) patch.start = start
    if (lane && lane !== region.trackId) patch.trackId = lane
    if (Object.keys(patch).length) actions.updateRegion(region.id, patch)
  }

  const reps = Math.ceil(region.length * 16 / region.loopSteps)
  const loopMarks = region.loopId
    ? Array.from({ length: Math.max(0, reps - 1) }, (_, i) => ((i + 1) * region.loopSteps) / 16)
    : []

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${region.name}, bar ${region.start + 1}, ${region.length} bars`}
      aria-pressed={selected}
      className={cx(
        "group absolute top-1 bottom-1 flex cursor-grab touch-none flex-col overflow-hidden rounded-[5px] border active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-white",
        selected ? "z-[2] ring-2 ring-white/90" : "z-[1]",
      )}
      style={{
        left: region.start * barWidth,
        width: region.length * barWidth - 1,
        borderColor: color,
        background: `color-mix(in oklab, ${color} ${selected ? 34 : 22}%, #1c1c1f)`,
        color,
      }}
      onPointerDown={(e) => onPointerDown(e, "move")}
      onPointerMove={onPointerMove}
      onPointerUp={() => {
        drag.current = null
      }}
      onKeyDown={(e) => {
        if (e.key === "Delete" || e.key === "Backspace") {
          e.stopPropagation()
          actions.deleteRegion(region.id)
        }
      }}
    >
      <div
        className="flex h-4 shrink-0 items-center truncate px-1.5 text-[10px] font-semibold text-black/85"
        style={{ background: color }}
      >
        {region.name}
      </div>
      <div className="relative min-h-0 flex-1 px-0 py-0.5 opacity-90">
        <NotesPreview region={region} />
        {loopMarks.map((m) => (
          <span
            key={m}
            aria-hidden="true"
            className="absolute top-0 bottom-0 w-px bg-black/50"
            style={{ left: m * barWidth }}
          />
        ))}
      </div>
      <div
        aria-hidden="true"
        className="absolute top-0 right-0 bottom-0 w-2 cursor-ew-resize bg-transparent group-hover:bg-white/15"
        onPointerDown={(e) => onPointerDown(e, "resize")}
        onPointerMove={onPointerMove}
        onPointerUp={() => {
          drag.current = null
        }}
      />
    </div>
  )
})
