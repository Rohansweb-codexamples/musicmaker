"use client"

import { useRef } from "react"
import { KEY_NAMES, type Mode } from "@/lib/music"
import { store, useStudio } from "@/lib/store"
import { usePlayheadFrame } from "./ui"

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-3 leading-none">
      <div className="flex h-5 items-center">{children}</div>
      <span className="mt-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</span>
    </div>
  )
}

export function Lcd() {
  const bpm = useStudio((s) => s.bpm)
  const keyRoot = useStudio((s) => s.keyRoot)
  const keyMode = useStudio((s) => s.keyMode)
  const countingIn = useStudio((s) => s.countingIn)
  const recording = useStudio((s) => s.recording)
  const barRef = useRef<HTMLSpanElement>(null)
  const beatRef = useRef<HTMLSpanElement>(null)

  usePlayheadFrame((pos) => {
    const bar = Math.floor(pos) + 1
    const beat = Math.floor((pos % 1) * 4) + 1
    if (barRef.current) barRef.current.textContent = String(bar).padStart(3, " ")
    if (beatRef.current) beatRef.current.textContent = String(beat)
  })

  return (
    <div
      className="flex h-10 items-stretch divide-x divide-white/10 rounded-md border border-black/60 bg-lcd font-mono text-[#dfe7f2] shadow-[inset_0_1px_6px_rgba(0,0,0,0.7)]"
      aria-label="Song display"
    >
      <Cell label={countingIn ? "Count in" : recording ? "Recording" : "Bar   Beat"}>
        <span className="flex items-baseline gap-2 text-lg tabular-nums">
          <span ref={barRef} className="whitespace-pre">
            {"  1"}
          </span>
          <span ref={beatRef} className="text-[#9fb4cf]">
            1
          </span>
        </span>
      </Cell>
      <Cell label="Tempo">
        <label className="sr-only" htmlFor="tempo">
          Tempo in BPM
        </label>
        <input
          id="tempo"
          type="number"
          min={60}
          max={180}
          value={bpm}
          onChange={(e) => {
            const v = Number(e.target.value)
            if (!Number.isNaN(v)) store.set({ bpm: Math.min(180, Math.max(60, v)) })
          }}
          className="w-12 bg-transparent text-center text-lg tabular-nums outline-none [appearance:textfield] focus:text-white [&::-webkit-inner-spin-button]:appearance-none"
        />
      </Cell>
      <Cell label="Key">
        <label className="sr-only" htmlFor="key-root">
          Song key
        </label>
        <select
          id="key-root"
          value={keyRoot}
          onChange={(e) => store.set({ keyRoot: Number(e.target.value) })}
          className="cursor-pointer appearance-none bg-transparent text-sm outline-none"
        >
          {KEY_NAMES.map((k, i) => (
            <option key={k} value={i} className="bg-panel">
              {k}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="key-mode">
          Scale
        </label>
        <select
          id="key-mode"
          value={keyMode}
          onChange={(e) => store.set({ keyMode: e.target.value as Mode })}
          className="ml-1 cursor-pointer appearance-none bg-transparent text-sm text-[#9fb4cf] outline-none"
        >
          <option value="min" className="bg-panel">
            min
          </option>
          <option value="maj" className="bg-panel">
            maj
          </option>
        </select>
      </Cell>
      <Cell label="Time">
        <span className="text-sm">4/4</span>
      </Cell>
    </div>
  )
}
