"use client"

import { ChevronUp, Shuffle } from "lucide-react"
import { useRef } from "react"
import { LOOP_BY_ID } from "@/lib/loops"
import { actions, store, useStudio, GRID_ROWS, GRID_COLS } from "@/lib/store"
import { engine } from "@/lib/engine"
import { usePlayheadFrame } from "./ui"

const ROW_COLORS = ["#e6b800", "#2196f3", "#4caf50", "#8a2be2"]
const ROW_LABELS = ["BEATS", "BASS", "KEYS", "FX"]

function cellKey(col: number, row: number) {
  return `${col}-${row}`
}

/** Circular waveform icon drawn as SVG. */
function WaveIcon({ color, active }: { color: string; active: boolean }) {
  return (
    <svg viewBox="0 0 100 100" className="size-full" aria-hidden="true">
      <circle cx="50" cy="50" r="42" fill="none" stroke={color} strokeWidth="1.5" opacity={active ? 0.35 : 0.2} />
      <circle cx="50" cy="50" r="28" fill="none" stroke={color} strokeWidth="1.5" opacity={active ? 0.22 : 0.12} />
      <circle cx="50" cy="50" r="14" fill="none" stroke={color} strokeWidth="1.5" opacity={active ? 0.18 : 0.1} />
      <path
        d="M18 50 Q28 32 38 50 T58 50 T78 50"
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity={active ? 0.7 : 0.4}
      />
    </svg>
  )
}

/** Pie-slice progress overlay for an active cell. */
function ProgressPie({ progress, color }: { progress: number; color: string }) {
  if (progress <= 0) return null
  const angle = progress * 2 * Math.PI - Math.PI / 2
  const x = 50 + 44 * Math.cos(angle)
  const y = 50 + 44 * Math.sin(angle)
  const largeArc = progress > 0.5 ? 1 : 0
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" aria-hidden="true">
      <path
        d={`M50 50 L50 6 A44 44 0 ${largeArc} 1 ${x} ${y} Z`}
        fill={color}
        opacity={0.25}
      />
    </svg>
  )
}

function GridCell({ col, row, loopId }: { col: number; row: number; loopId: string }) {
  const key = cellKey(col, row)
  const playing = useStudio((s) => s.livePlaying[key] !== undefined)
  const queued = useStudio((s) => s.liveQueued.includes(key))
  const startStep = useStudio((s) => s.livePlaying[key] ?? -1)
  const loop = LOOP_BY_ID.get(loopId)
  const color = ROW_COLORS[row]
  const progressRef = useRef(0)
  const pieRef = useRef<SVGSVGElement>(null)
  const cellRef = useRef<HTMLButtonElement>(null)

  usePlayheadFrame((pos) => {
    if (startStep < 0 || !loop) return
    const step = pos * 16
    const totalSteps = loop.bars * 16
    const local = (((step - startStep) % totalSteps) + totalSteps) % totalSteps
    const prog = local / totalSteps
    progressRef.current = prog
    if (pieRef.current) {
      const angle = prog * 2 * Math.PI - Math.PI / 2
      const x = 50 + 44 * Math.cos(angle)
      const y = 50 + 44 * Math.sin(angle)
      const largeArc = prog > 0.5 ? 1 : 0
      const path = pieRef.current.querySelector("path")
      if (path) path.setAttribute("d", `M50 50 L50 6 A44 44 0 ${largeArc} 1 ${x} ${y} Z`)
    }
  })

  if (!loop) return <div className="flex-1" />

  const active = playing

  return (
    <button
      ref={cellRef}
      type="button"
      aria-label={`${loop.name} — ${active ? "stop" : "start"}`}
      aria-pressed={active}
      onClick={() => engine.toggleLiveCell(key, loopId, col, row)}
      onContextMenu={(e) => {
        e.preventDefault()
        store.set((s) => {
          const grid = s.grid.map((r) => [...r])
          grid[row] = grid[row].map((id) => (id === loopId ? nextVariant(id) : id))
          return { grid }
        })
      }}
      className="group relative flex aspect-square items-center justify-center overflow-hidden rounded-lg border transition-all touch-none"
      style={{
        background: active ? color : "#333333",
        borderColor: active ? color : "rgba(255,255,255,0.08)",
        boxShadow: active ? `0 0 12px ${color}55` : "none",
      }}
    >
      {/* Waveform icon */}
      <div className="absolute inset-[18%] transition-opacity" style={{ opacity: active ? 1 : 0.5 }}>
        <WaveIcon color={active ? "#ffffff" : color} active={active} />
      </div>

      {/* Progress pie (only when playing) */}
      {active && (
        <svg ref={pieRef} viewBox="0 0 100 100" className="absolute inset-0 size-full" aria-hidden="true">
          <path d="M50 50 L50 6 A44 44 0 0 1 50 6 Z" fill="#ffffff" opacity={0.2} />
        </svg>
      )}

      {/* Queued pulse */}
      {queued && (
        <div
          className="absolute inset-0 animate-pulse rounded-lg border-2"
          style={{ borderColor: color }}
        />
      )}

      {/* Loop name */}
      <span
        className="absolute bottom-0.5 left-0 right-0 truncate px-1 text-center text-[7px] font-semibold uppercase tracking-wide"
        style={{ color: active ? "#fff" : "rgba(255,255,255,0.5)" }}
      >
        {loop.name.replace(/\s\d+$/, "")}
      </span>
    </button>
  )
}

/** Cycle to the next variant of a loop. */
function nextVariant(id: string): string {
  const parts = id.split(".")
  if (parts.length !== 3) return id
  const styleId = parts[0]
  const root = parts[1]
  const variant = parseInt(parts[2])
  const next = variant + 1
  const nextId = `${styleId}.${root}.${next}`
  return LOOP_BY_ID.has(nextId) ? nextId : `${styleId}.${root}.0`
}

export function LiveGrid() {
  const grid = useStudio((s) => s.grid)

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#1a1a1a] px-3 py-2">
      {/* Shuffle button */}
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
          Live Loops
        </span>
        <button
          type="button"
          aria-label="Shuffle grid with new loops"
          onClick={() => {
            engine.stopAllLiveCells()
            actions.shuffleGrid()
          }}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-muted transition-colors hover:bg-fg/10 hover:text-fg"
        >
          <Shuffle className="size-3" />
          Shuffle
        </button>
      </div>

      {/* Grid */}
      <div className="flex min-h-0 flex-1 gap-2">
        {/* Row labels */}
        <div className="flex shrink-0 flex-col gap-2">
          {ROW_LABELS.map((label, row) => (
            <div
              key={row}
              className="flex aspect-square items-center justify-center rounded-lg"
              style={{ width: "clamp(28px, 4vw, 48px)", background: `${ROW_COLORS[row]}22` }}
            >
              <span
                className="rotate-180 text-[8px] font-bold uppercase tracking-wider"
                style={{ writingMode: "vertical-rl", color: ROW_COLORS[row] }}
              >
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* Cells */}
        <div className="grid min-h-0 flex-1 gap-2" style={{ gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`, gridTemplateRows: `repeat(${GRID_ROWS}, 1fr)` }}>
          {grid.map((row, ri) =>
            row.map((loopId, ci) => (
              <GridCell key={`${ci}-${ri}`} col={ci} row={ri} loopId={loopId} />
            )),
          )}
        </div>
      </div>

      {/* Column launchers */}
      <div className="mt-1 flex gap-2 pl-[clamp(36px,5vw,56px)]">
        {Array.from({ length: GRID_COLS }, (_, col) => (
          <button
            key={col}
            type="button"
            aria-label={`Launch column ${col + 1}`}
            onClick={() => engine.playLiveColumn(col)}
            className="flex flex-1 flex-col items-center gap-0.5 rounded-md py-1 text-muted transition-colors hover:bg-fg/10 hover:text-fg"
          >
            <ChevronUp className="size-3" />
            <span className="text-[10px] font-mono">{col + 1}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
