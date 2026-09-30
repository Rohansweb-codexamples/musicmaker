"use client"

import { Minus, Plus } from "lucide-react"
import { engine } from "@/lib/engine"
import { KEY_NAMES } from "@/lib/music"
import { store, useStudio } from "@/lib/store"
import { cx } from "./ui"

/** GarageBand musical-typing layout: semitone offset from the current octave's C. */
export const TYPING_MAP: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11,
  k: 12, o: 13, l: 14, p: 15, ";": 16, "'": 17,
}
const LABEL_BY_OFFSET = Object.fromEntries(Object.entries(TYPING_MAP).map(([k, v]) => [v, k.toUpperCase()]))

const BLACK = new Set([1, 3, 6, 8, 10])
const OCTAVES = 3

export function KeyboardPanel() {
  const octave = useStudio((s) => s.octave)
  const velocity = useStudio((s) => s.velocity)
  const held = useStudio((s) => s.heldNotes)
  const track = useStudio((s) => s.tracks.find((t) => t.id === s.selectedTrackId) ?? null)
  const base = (octave + 1) * 12
  const whites: number[] = []
  for (let i = 0; i <= OCTAVES * 12; i++) if (!BLACK.has(i % 12)) whites.push(i)

  const press = (midi: number) => {
    engine.noteOn(midi, velocity)
    store.set((s) => ({ heldNotes: [...s.heldNotes, midi] }))
  }
  const release = (midi: number) => {
    engine.noteOff(midi)
    store.set((s) => ({ heldNotes: s.heldNotes.filter((n) => n !== midi) }))
  }

  const keyProps = (offset: number) => {
    const midi = base + offset
    return {
      "aria-label": `${KEY_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`,
      onPointerDown: (e: React.PointerEvent) => {
        e.currentTarget.releasePointerCapture?.(e.pointerId)
        press(midi)
      },
      onPointerUp: () => release(midi),
      onPointerLeave: () => held.includes(midi) && release(midi),
      onPointerEnter: (e: React.PointerEvent) => e.buttons === 1 && press(midi),
    }
  }

  return (
    <div className="flex h-full flex-col gap-2 px-4 py-2">
      <div className="flex items-center gap-4 text-[11px] text-muted">
        <span className="font-medium text-fg">
          Musical Typing{track && track.kind !== "audio" ? ` · ${track.name}` : " · select an instrument track"}
        </span>
        <div className="flex items-center gap-1">
          <span>Octave</span>
          <button
            type="button"
            aria-label="Octave down (Z)"
            onClick={() => store.set((s) => ({ octave: Math.max(1, s.octave - 1) }))}
            className="grid size-5 place-items-center rounded bg-panel-2 hover:bg-[#3d3d44]"
          >
            <Minus className="size-3" />
          </button>
          <span className="w-7 text-center font-mono text-fg">C{octave}</span>
          <button
            type="button"
            aria-label="Octave up (X)"
            onClick={() => store.set((s) => ({ octave: Math.min(7, s.octave + 1) }))}
            className="grid size-5 place-items-center rounded bg-panel-2 hover:bg-[#3d3d44]"
          >
            <Plus className="size-3" />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <span>Velocity</span>
          <button
            type="button"
            aria-label="Velocity down (C)"
            onClick={() => store.set((s) => ({ velocity: Math.max(0.1, +(s.velocity - 0.1).toFixed(2)) }))}
            className="grid size-5 place-items-center rounded bg-panel-2 hover:bg-[#3d3d44]"
          >
            <Minus className="size-3" />
          </button>
          <span className="w-7 text-center font-mono text-fg">{Math.round(velocity * 127)}</span>
          <button
            type="button"
            aria-label="Velocity up (V)"
            onClick={() => store.set((s) => ({ velocity: Math.min(1, +(s.velocity + 0.1).toFixed(2)) }))}
            className="grid size-5 place-items-center rounded bg-panel-2 hover:bg-[#3d3d44]"
          >
            <Plus className="size-3" />
          </button>
        </div>
        <span className="ml-auto hidden lg:inline">Keys A–{"'"} play · W E T Y U O P sharps · Z/X octave · C/V velocity</span>
      </div>
      <div className="relative flex min-h-0 flex-1 select-none touch-none" role="group" aria-label="Piano keyboard">
        {whites.map((off) => {
          const midi = base + off
          return (
            <button
              key={off}
              type="button"
              {...keyProps(off)}
              className={cx(
                "relative flex flex-1 items-end justify-center rounded-b-md border border-black/70 pb-1 text-[9px] font-semibold",
                held.includes(midi) ? "bg-audio text-black" : "bg-[#efeff1] text-black/45 hover:bg-white",
              )}
            >
              {LABEL_BY_OFFSET[off] ?? (off % 12 === 0 ? `C${Math.floor(midi / 12) - 1}` : "")}
            </button>
          )
        })}
        {Array.from({ length: OCTAVES * 12 }, (_, i) => i)
          .filter((off) => BLACK.has(off % 12))
          .map((off) => {
            const midi = base + off
            const whiteIndex = whites.filter((w) => w < off).length
            const w = 100 / whites.length
            return (
              <button
                key={off}
                type="button"
                {...keyProps(off)}
                className={cx(
                  "absolute top-0 z-10 flex h-[60%] items-end justify-center rounded-b-md border border-black pb-1 text-[9px] font-semibold",
                  held.includes(midi) ? "bg-audio text-black" : "bg-[#1a1a1c] text-white/40 hover:bg-[#2a2a2e]",
                )}
                style={{ left: `calc(${whiteIndex * w}% - ${w * 0.3}%)`, width: `${w * 0.6}%` }}
              >
                {LABEL_BY_OFFSET[off] ?? ""}
              </button>
            )
          })}
      </div>
    </div>
  )
}
