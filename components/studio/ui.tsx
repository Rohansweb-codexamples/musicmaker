"use client"

import {
  AudioWaveform,
  Drum,
  Guitar,
  Mic,
  MicVocal,
  Piano,
  Sparkles,
  Waves,
  type LucideIcon,
} from "lucide-react"
import { useEffect, useRef, type ReactNode } from "react"
import { INSTRUMENTS, type PresetId } from "@/lib/instruments"
import { engine } from "@/lib/engine"
import type { Region, TrackKind } from "@/lib/store"

const GROUP_ICON: Record<string, LucideIcon> = {
  Drums: Drum,
  Bass: Guitar,
  Keys: Piano,
  Synth: AudioWaveform,
  Pads: Waves,
  Vocals: MicVocal,
  FX: Sparkles,
}

export function iconFor(kind: TrackKind, preset: PresetId): LucideIcon {
  if (kind === "audio") return Mic
  const group = INSTRUMENTS.find((i) => i.id === preset)?.group ?? "Keys"
  return GROUP_ICON[group] ?? Piano
}

export function colorVar(kind: TrackKind | "region-audio") {
  if (kind === "audio" || kind === "region-audio") return "var(--audio)"
  if (kind === "drums") return "var(--drum)"
  return "var(--inst)"
}

export function regionColor(r: Region, kind: TrackKind) {
  if (r.audioId) return "var(--audio)"
  if (r.preset === "kit-house" || r.preset === "kit-deep") return "var(--drum)"
  return kind === "audio" ? "var(--audio)" : "var(--inst)"
}

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ")
}

/** Calls cb with the current playhead position (in bars) on every animation frame. */
export function usePlayheadFrame(cb: (bars: number) => void) {
  const ref = useRef(cb)
  useEffect(() => {
    ref.current = cb
  })
  useEffect(() => {
    let raf = 0
    const loop = () => {
      ref.current(engine.positionBars())
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
}

export function IconButton({
  label,
  onClick,
  active,
  children,
  className,
  activeClassName = "bg-fg/15 text-fg",
}: {
  label: string
  onClick: () => void
  active?: boolean
  children: ReactNode
  className?: string
  activeClassName?: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        "flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-md px-2 text-muted transition-colors hover:bg-fg/10 hover:text-fg focus-visible:outline-2 focus-visible:outline-audio",
        active && activeClassName,
        className,
      )}
    >
      {children}
    </button>
  )
}

export function Range({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  className,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  className?: string
}) {
  const fill = ((value - min) / (max - min)) * 100
  return (
    <input
      type="range"
      aria-label={label}
      title={label}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      onPointerDown={(e) => e.stopPropagation()}
      style={{ ["--fill" as string]: `${fill}%` }}
      className={cx("studio-range h-4", className)}
    />
  )
}
