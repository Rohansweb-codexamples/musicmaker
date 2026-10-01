"use client"

import { useRef } from "react"
import { AudioWaveform, Lock, RotateCcw, Square } from "lucide-react"
import { actions, store, useStudio } from "@/lib/store"
import { engine } from "@/lib/engine"
import { Knob } from "./knob"

const FX_TYPES = [
  { type: 1, label: "Riser", icon: "▲" },
  { type: 2, label: "Down", icon: "▼" },
  { type: 3, label: "Impact", icon: "●" },
  { type: 4, label: "Sweep", icon: "≋" },
  { type: 5, label: "Tonal", icon: "♪" },
]

function XYPad() {
  const cutoff = useStudio((s) => s.liveFilter.cutoff)
  const resonance = useStudio((s) => s.liveFilter.resonance)
  const padRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const update = (e: React.PointerEvent) => {
    const el = padRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height))
    actions.setLiveFilter(x, y)
  }

  return (
    <div
      ref={padRef}
      className="relative aspect-square w-full touch-none rounded-lg"
      style={{ background: "linear-gradient(135deg, #4b0058, #2a0030)" }}
      onPointerDown={(e) => {
        dragging.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        update(e)
      }}
      onPointerMove={(e) => dragging.current && update(e)}
      onPointerUp={() => { dragging.current = false }}
    >
      {/* Grid lines */}
      <div className="absolute inset-0 rounded-lg" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)", backgroundSize: "25% 25%" }} />

      {/* Glow dot */}
      <div
        className="pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white transition-transform"
        style={{
          left: `${cutoff * 100}%`,
          top: `${(1 - resonance) * 100}%`,
          boxShadow: "0 0 16px 6px rgba(255,255,255,0.5), 0 0 32px 12px rgba(255,150,255,0.3)",
        }}
      >
        <div className="absolute inset-0 rounded-full bg-white/80 blur-[3px]" />
      </div>

      {/* Labels */}
      <span className="absolute bottom-1 right-2 text-[9px] font-semibold uppercase tracking-wider text-white/50">
        Cutoff
      </span>
      <span className="absolute top-1 left-2 text-[9px] font-semibold uppercase tracking-wider text-white/50">
        Reso
      </span>
    </div>
  )
}

export function EffectsPanel() {
  const wobbleOn = useStudio((s) => s.liveWobble.on)
  const wobbleRate = useStudio((s) => s.liveWobble.rate)
  const playing = useStudio((s) => s.playing)

  return (
    <div className="flex h-40 shrink-0 gap-2 border-t border-black/50 bg-[#0d0d0d] px-3 py-2">
      {/* Wobble section */}
      <div className="flex w-44 shrink-0 flex-col gap-1 rounded-lg bg-[#1a1a1a] p-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-fg/80">Wobble</span>
          <button
            type="button"
            aria-label={wobbleOn ? "Lock wobble off" : "Lock wobble on"}
            onClick={() => actions.setLiveWobble(!wobbleOn, wobbleRate)}
            className="text-muted hover:text-fg"
          >
            <Lock className={`size-3 ${wobbleOn ? "fill-current text-purple" : ""}`} />
          </button>
        </div>
        <div className="flex flex-1 items-center justify-center gap-3">
          <Knob
            label="Rate"
            value={wobbleRate}
            min={0.5}
            max={16}
            onChange={(v) => actions.setLiveWobble(wobbleOn, v)}
            format={(v) => `${v.toFixed(1)}Hz`}
            color={wobbleOn ? "#8a2be2" : "var(--muted)"}
          />
        </div>
      </div>

      {/* Performance / FX section */}
      <div className="flex flex-1 flex-col gap-1 rounded-lg bg-[#1a1a1a] p-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-fg/80">Performance</span>
          <button
            type="button"
            aria-label="Stop all loops"
            onClick={() => engine.stopAllLiveCells()}
            disabled={!playing}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase text-muted transition-colors hover:bg-fg/10 hover:text-fg disabled:opacity-30"
          >
            <RotateCcw className="size-3" />
            Stop All
          </button>
        </div>
        <div className="flex flex-1 items-center justify-center gap-2">
          <Square className="size-4 text-muted" />
          <div className="flex gap-1.5">
            {FX_TYPES.map((fx) => (
              <button
                key={fx.type}
                type="button"
                aria-label={`Trigger ${fx.label} FX`}
                onClick={() => engine.triggerLiveFx(fx.type)}
                className="grid size-10 place-items-center rounded-md bg-[#333] text-lg transition-all hover:bg-[#444] active:scale-90 active:bg-purple"
                style={{ color: "#aaa" }}
              >
                {fx.icon}
              </button>
            ))}
          </div>
          <AudioWaveform className="size-4 text-muted" />
        </div>
      </div>

      {/* Filter XY pad section */}
      <div className="flex w-44 shrink-0 flex-col gap-1 rounded-lg bg-[#1a1a1a] p-2">
        <div className="flex items-center justify-between">
          <Lock className="size-3 text-muted" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-fg/80">Filter</span>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <XYPad />
        </div>
      </div>
    </div>
  )
}
