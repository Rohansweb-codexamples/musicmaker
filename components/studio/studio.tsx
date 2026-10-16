"use client"

import { useEffect } from "react"
import { engine } from "@/lib/engine"
import { store, useStudio } from "@/lib/store"
import { ControlBar } from "./control-bar"
import { TracksView } from "./tracks-view"
import { LoopBrowser } from "./loop-browser"
import { SmartControls } from "./smart-controls"
import { KeyboardPanel, TYPING_MAP } from "./keyboard-panel"
import { LiveGrid } from "./live-grid"
import { EffectsPanel } from "./effects-panel"

export function Studio() {
  const browserOpen = useStudio((s) => s.browserOpen)
  const bottomPanel = useStudio((s) => s.bottomPanel)
  const exporting = useStudio((s) => s.exporting)
  const micError = useStudio((s) => s.micError)
  const view = useStudio((s) => s.view)

  useEffect(() => {
    const isTypingTarget = (el: EventTarget | null) => {
      const t = el as HTMLElement | null
      return (
        !!t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      )
    }

    const onDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return
      const s = store.get()
      const typing = s.bottomPanel === "keyboard"
      const key = e.key.toLowerCase()

      // Always-on transport shortcuts
      if (e.code === "Space") {
        e.preventDefault()
        s.playing ? engine.stop() : engine.play()
        return
      }
      if (key === "enter") {
        e.preventDefault()
        engine.setPlayhead(0)
        return
      }
      if (key === "r" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        engine.record()
        return
      }

      // Ctrl/Cmd+K toggles musical typing panel
      if (e.ctrlKey || e.metaKey) {
        if (key === "k") {
          e.preventDefault()
          store.set((st) => ({
            bottomPanel: st.bottomPanel === "keyboard" ? "none" : "keyboard",
          }))
        }
        return
      }

      // Musical typing — only when the keyboard panel is open
      if (typing && key in TYPING_MAP) {
        e.preventDefault()
        const midi = (s.octave + 1) * 12 + TYPING_MAP[key]
        if (!e.repeat) {
          engine.noteOn(midi, s.velocity)
          store.set((st) => ({ heldNotes: [...st.heldNotes, midi] }))
        }
        return
      }

      // Octave / velocity adjustments — only when the keyboard panel is open
      if (typing) {
        if (key === "z") store.set((st) => ({ octave: Math.max(1, st.octave - 1) }))
        else if (key === "x") store.set((st) => ({ octave: Math.min(7, st.octave + 1) }))
        else if (key === "c")
          store.set((st) => ({ velocity: Math.max(0.1, +(st.velocity - 0.1).toFixed(2)) }))
        else if (key === "v")
          store.set((st) => ({ velocity: Math.min(1, +(st.velocity + 0.1).toFixed(2)) }))
        return
      }

      // Number keys 1-9 launch grid columns in live mode
      if (s.view === "live") {
        const num = parseInt(key)
        if (num >= 1 && num <= 9) {
          e.preventDefault()
          engine.playLiveColumn(num - 1)
          return
        }
      }

      // Single-key shortcuts — only when the keyboard panel is closed
      if (key === "c") store.set((st) => ({ cycle: { ...st.cycle, on: !st.cycle.on } }))
      else if (key === "b")
        store.set((st) => ({
          bottomPanel: st.bottomPanel === "controls" ? "none" : "controls",
        }))
      else if (key === "k") store.set((st) => ({ metronome: !st.metronome }))
      else if (key === "o") store.set((st) => ({ browserOpen: !st.browserOpen }))
    }

    const onUp = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return
      const s = store.get()
      if (s.bottomPanel !== "keyboard") return
      const key = e.key.toLowerCase()
      if (key in TYPING_MAP) {
        const midi = (s.octave + 1) * 12 + TYPING_MAP[key]
        engine.noteOff(midi)
        store.set((st) => ({ heldNotes: st.heldNotes.filter((n) => n !== midi) }))
      }
    }

    window.addEventListener("keydown", onDown)
    window.addEventListener("keyup", onUp)
    return () => {
      window.removeEventListener("keydown", onDown)
      window.removeEventListener("keyup", onUp)
    }
  }, [])

  return (
    <div className="flex h-dvh flex-col bg-studio">
      <ControlBar />
      {view === "live" ? (
        <>
          <LiveGrid />
          <EffectsPanel />
          {bottomPanel === "keyboard" && (
            <div className="h-48 shrink-0 border-t border-black/50 bg-panel">
              <KeyboardPanel />
            </div>
          )}
        </>
      ) : (
        <>
          <div className="relative flex min-h-0 flex-1">
            <TracksView />
            {browserOpen && <LoopBrowser />}
          </div>
          {bottomPanel === "controls" && (
            <div className="h-32 shrink-0 border-t border-black/50 bg-panel">
              <SmartControls />
            </div>
          )}
          {bottomPanel === "keyboard" && (
            <div className="h-48 shrink-0 border-t border-black/50 bg-panel">
              <KeyboardPanel />
            </div>
          )}
        </>
      )}
      {micError && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-rec/40 bg-rec/15 px-4 py-2 text-sm text-rec">
          {micError}
        </div>
      )}
      {exporting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="flex flex-col items-center gap-3 rounded-xl border border-black/60 bg-panel p-6">
            <p className="text-sm font-medium">Exporting song…</p>
            <div className="h-2 w-64 overflow-hidden rounded-full bg-lcd">
              <div
                className="h-full bg-inst transition-all"
                style={{ width: `${Math.round(exporting.progress * 100)}%` }}
              />
            </div>
            <button
              type="button"
              onClick={() => engine.cancelExport()}
              className="text-xs text-muted hover:text-fg"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
