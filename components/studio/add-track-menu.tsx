"use client"

import { Mic, Plus } from "lucide-react"
import { useState } from "react"
import { INSTRUMENTS } from "@/lib/instruments"
import { actions } from "@/lib/store"
import { iconFor } from "./ui"
import { kindForPreset } from "@/lib/store"

export function AddTrackMenu() {
  const [open, setOpen] = useState(false)
  const groups = Array.from(new Set(INSTRUMENTS.map((i) => i.group)))

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Add track"
        title="Add track"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid size-6 place-items-center rounded-md text-muted hover:bg-fg/10 hover:text-fg"
      >
        <Plus className="size-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onPointerDown={() => setOpen(false)} aria-hidden="true" />
          <div
            role="menu"
            className="studio-scroll absolute top-8 left-0 z-50 max-h-[60vh] w-60 overflow-y-auto rounded-lg border border-black/60 bg-panel-2 p-1 shadow-2xl"
          >
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                actions.addTrack("Audio Recorder", "keys-rhodes", "audio")
                setOpen(false)
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-audio/25"
            >
              <Mic className="size-4 text-audio" />
              <span>
                Audio Recorder
                <span className="block text-[10px] text-muted">Record your voice or instrument</span>
              </span>
            </button>
            {groups.map((g) => (
              <div key={g} className="mt-1">
                <div className="px-2 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">{g}</div>
                {INSTRUMENTS.filter((i) => i.group === g).map((inst) => {
                  const Icon = iconFor(kindForPreset(inst.id), inst.id)
                  return (
                    <button
                      key={inst.id}
                      role="menuitem"
                      type="button"
                      onClick={() => {
                        actions.addTrack(inst.name, inst.id)
                        setOpen(false)
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-fg/10"
                    >
                      <Icon className="size-3.5 text-muted" />
                      {inst.name}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
