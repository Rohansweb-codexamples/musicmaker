"use client"

import { ZoomIn, ZoomOut } from "lucide-react"
import { useRef, useState } from "react"
import { dragState, LOOP_MIME } from "@/lib/drag"
import { LOOP_BY_ID } from "@/lib/loops"
import { actions, songEndBar, store, useStudio, type Track } from "@/lib/store"
import { AddTrackMenu } from "./add-track-menu"
import { RegionView } from "./region-view"
import { Ruler } from "./ruler"
import { TrackHeader } from "./track-header"
import { cx, usePlayheadFrame } from "./ui"

const HEADER_W = 208
const ROW_H = 64

type Ghost = { lane: string; bar: number; bars: number } | null

function laneGrid(barWidth: number) {
  return {
    backgroundImage: `repeating-linear-gradient(to right, rgba(255,255,255,0.09) 0 1px, transparent 1px ${barWidth}px), repeating-linear-gradient(to right, rgba(255,255,255,0.035) 0 1px, transparent 1px ${barWidth / 4}px)`,
  }
}

export function TracksView() {
  const tracks = useStudio((s) => s.tracks)
  const regions = useStudio((s) => s.regions)
  const barWidth = useStudio((s) => s.barWidth)
  const selectedTrackId = useStudio((s) => s.selectedTrackId)
  const selectedRegionId = useStudio((s) => s.selectedRegionId)
  const songEnd = useStudio(songEndBar)
  const [ghost, setGhost] = useState<Ghost>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const playheadRef = useRef<HTMLDivElement>(null)

  const totalBars = Math.max(64, songEnd + 24)

  usePlayheadFrame((pos) => {
    const x = pos * barWidth
    if (playheadRef.current) playheadRef.current.style.transform = `translateX(${x}px)`
    const el = scrollRef.current
    if (el && store.get().playing) {
      const visibleRight = el.scrollLeft + el.clientWidth - HEADER_W - 60
      if (x > visibleRight) el.scrollLeft = x - 40
      else if (x < el.scrollLeft - 1) el.scrollLeft = Math.max(0, x - 40)
    }
  })

  const zoom = (factor: number) =>
    store.set((s) => ({ barWidth: Math.min(140, Math.max(12, Math.round(s.barWidth * factor))) }))

  const laneHandlers = (lane: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(LOOP_MIME) || !dragState.loopId) return
      e.preventDefault()
      e.dataTransfer.dropEffect = "copy"
      const rect = e.currentTarget.getBoundingClientRect()
      const bar = Math.max(0, Math.floor((e.clientX - rect.left) / barWidth))
      const bars = LOOP_BY_ID.get(dragState.loopId)?.bars ?? 1
      if (!ghost || ghost.lane !== lane || ghost.bar !== bar) setGhost({ lane, bar, bars })
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setGhost(null)
    },
    onDrop: (e: React.DragEvent) => {
      const id = e.dataTransfer.getData(LOOP_MIME) || dragState.loopId
      setGhost(null)
      if (!id) return
      e.preventDefault()
      const rect = e.currentTarget.getBoundingClientRect()
      const bar = Math.max(0, Math.floor((e.clientX - rect.left) / barWidth))
      actions.addLoopRegion(id, lane === "new" ? null : lane, bar)
    },
  })

  const ghostEl = (lane: string) =>
    ghost?.lane === lane ? (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1 bottom-1 rounded-[5px] border-2 border-dashed border-white/60 bg-white/10"
        style={{ left: ghost.bar * barWidth, width: ghost.bars * barWidth }}
      />
    ) : null

  return (
    <div
      ref={scrollRef}
      className="studio-scroll relative min-h-0 flex-1 overflow-auto bg-lane"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) actions.select(null)
      }}
    >
      <div className="relative min-h-full" style={{ width: HEADER_W + totalBars * barWidth }}>
        <div className="sticky top-0 z-20 flex">
          <div className="sticky left-0 z-40 flex h-7 w-52 shrink-0 items-center gap-0.5 border-r border-b border-black/50 bg-panel px-1.5">
            <AddTrackMenu />
            <span className="flex-1 pl-1 text-[10px] font-semibold uppercase tracking-wider text-muted">Tracks</span>
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() => zoom(1 / 1.3)}
              className="grid size-6 place-items-center rounded text-muted hover:bg-fg/10 hover:text-fg"
            >
              <ZoomOut className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() => zoom(1.3)}
              className="grid size-6 place-items-center rounded text-muted hover:bg-fg/10 hover:text-fg"
            >
              <ZoomIn className="size-3.5" />
            </button>
          </div>
          <Ruler totalBars={totalBars} barWidth={barWidth} />
        </div>

        {tracks.map((t: Track) => (
          <div key={t.id} className="flex" style={{ height: ROW_H }}>
            <TrackHeader track={t} selected={t.id === selectedTrackId} />
            <div
              data-lane={t.id}
              className={cx(
                "relative flex-1 border-b border-black/40",
                t.id === selectedTrackId ? "bg-white/[0.035]" : "",
                t.mute && "opacity-50",
              )}
              style={laneGrid(barWidth)}
              onPointerDown={(e) => {
                if (e.target === e.currentTarget) actions.select(t.id)
              }}
              {...laneHandlers(t.id)}
            >
              {regions
                .filter((r) => r.trackId === t.id)
                .map((r) => (
                  <RegionView
                    key={r.id}
                    region={r}
                    kind={t.kind}
                    barWidth={barWidth}
                    selected={r.id === selectedRegionId}
                  />
                ))}
              {ghostEl(t.id)}
            </div>
          </div>
        ))}

        <div className="flex min-h-40">
          <div className="sticky left-0 z-30 w-52 shrink-0 border-r border-black/50 bg-panel/60" />
          <div
            data-lane="new"
            className={cx("relative flex-1 transition-colors", ghost?.lane === "new" && "bg-white/[0.04]")}
            {...laneHandlers("new")}
          >
            <p className="sticky left-4 inline-block max-w-xs py-6 pl-4 text-xs leading-relaxed text-muted">
              {tracks.length === 0
                ? "Your song is empty. Drag loops from the Loop Browser here, or add a track with the + button."
                : "Drag loops here to create a new track."}
            </p>
            {ghostEl("new")}
          </div>
        </div>

        <div
          ref={playheadRef}
          aria-hidden="true"
          className="pointer-events-none absolute top-0 bottom-0 z-[25] w-px bg-white"
          style={{ left: HEADER_W }}
        >
          <div className="absolute -top-px -left-[5px] size-0 border-x-[5.5px] border-t-[8px] border-x-transparent border-t-white" />
        </div>
      </div>
    </div>
  )
}
