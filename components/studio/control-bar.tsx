"use client"

import { Download, Grid3x3, Keyboard, Layers, ListMusic, Play, Repeat, SkipBack, SlidersHorizontal, Square, Timer } from "lucide-react"
import { engine } from "@/lib/engine"
import { actions, store, useStudio } from "@/lib/store"
import { Lcd } from "./lcd"
import { cx, IconButton, Range } from "./ui"

export function ControlBar() {
  const playing = useStudio((s) => s.playing)
  const recording = useStudio((s) => s.recording)
  const cycleOn = useStudio((s) => s.cycle.on)
  const metronome = useStudio((s) => s.metronome)
  const countIn = useStudio((s) => s.countIn)
  const pump = useStudio((s) => s.pump)
  const masterVolume = useStudio((s) => s.masterVolume)
  const browserOpen = useStudio((s) => s.browserOpen)
  const bottomPanel = useStudio((s) => s.bottomPanel)
  const view = useStudio((s) => s.view)

  const togglePanel = (p: "controls" | "keyboard") =>
    store.set((s) => ({ bottomPanel: s.bottomPanel === p ? "none" : p }))

  const switchView = (v: "live" | "tracks") => {
    if (v === "tracks") engine.stopAllLiveCells()
    actions.setView(v)
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-black/50 bg-panel px-2 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]">
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <h1 className="mr-2 hidden items-center gap-1.5 text-sm font-semibold tracking-tight lg:flex">
          <span className="grid size-6 place-items-center rounded-md bg-inst text-[11px] font-bold text-black">H</span>
          HouseBand
        </h1>
        <div className="flex items-center rounded-md bg-fg/5 p-0.5">
          <button
            type="button"
            aria-label="Live Loops view"
            aria-pressed={view === "live"}
            onClick={() => switchView("live")}
            className={cx(
              "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors",
              view === "live" ? "bg-purple text-white" : "text-muted hover:text-fg",
            )}
          >
            <Grid3x3 className="size-3.5" />
            <span className="hidden sm:inline">Live</span>
          </button>
          <button
            type="button"
            aria-label="Tracks timeline view"
            aria-pressed={view === "tracks"}
            onClick={() => switchView("tracks")}
            className={cx(
              "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors",
              view === "tracks" ? "bg-inst text-black" : "text-muted hover:text-fg",
            )}
          >
            <Layers className="size-3.5" />
            <span className="hidden sm:inline">Tracks</span>
          </button>
        </div>
        <IconButton label="Smart Controls (B)" active={bottomPanel === "controls"} onClick={() => togglePanel("controls")}>
          <SlidersHorizontal className="size-4" />
        </IconButton>
        <IconButton
          label="Musical Typing keyboard (Ctrl+K)"
          active={bottomPanel === "keyboard"}
          onClick={() => togglePanel("keyboard")}
        >
          <Keyboard className="size-4" />
        </IconButton>
      </div>

      <div className="flex items-center gap-1">
        <IconButton label="Go to beginning (Enter)" onClick={() => engine.setPlayhead(0)}>
          <SkipBack className="size-4 fill-current" />
        </IconButton>
        <IconButton
          label={playing ? "Stop (Space)" : "Play (Space)"}
          active={playing && !recording}
          activeClassName="bg-inst/20 text-inst"
          onClick={() => (playing ? engine.stop() : engine.play())}
          className="w-10"
        >
          {playing ? <Square className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
        </IconButton>
        <button
          type="button"
          aria-label={recording ? "Stop recording (R)" : "Record (R)"}
          title={recording ? "Stop recording (R)" : "Record (R)"}
          aria-pressed={recording}
          onClick={() => engine.record()}
          className={cx(
            "flex size-8 items-center justify-center rounded-md transition-colors hover:bg-fg/10 focus-visible:outline-2 focus-visible:outline-audio",
            recording && "bg-rec/20",
          )}
        >
          <span className={cx("size-3.5 rounded-full bg-rec", recording && "animate-pulse")} />
        </button>
        <IconButton
          label="Cycle (C)"
          active={cycleOn}
          activeClassName="bg-drum/20 text-drum"
          onClick={() => store.set((s) => ({ cycle: { ...s.cycle, on: !s.cycle.on } }))}
        >
          <Repeat className="size-4" />
        </IconButton>
      </div>

      <div className="mx-1">
        <Lcd />
      </div>

      <div className="flex items-center gap-1">
        <IconButton label="Metronome (K)" active={metronome} onClick={() => store.set((s) => ({ metronome: !s.metronome }))}>
          <Timer className="size-4" />
        </IconButton>
        <IconButton label="Count-in before recording" active={countIn} onClick={() => store.set((s) => ({ countIn: !s.countIn }))}>
          <span className="font-mono text-[10px] font-semibold tracking-tighter">1234</span>
        </IconButton>
        <IconButton
          label="Sidechain pump on music tracks"
          active={pump}
          activeClassName="bg-inst/20 text-inst"
          onClick={() => store.set((s) => ({ pump: !s.pump }))}
          className="hidden md:flex"
        >
          <span className="text-[10px] font-semibold uppercase tracking-wide">Pump</span>
        </IconButton>
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
        <div className="hidden w-24 items-center xl:flex">
          <Range label="Master volume" value={masterVolume} onChange={(v) => store.set({ masterVolume: v })} className="w-full" />
        </div>
        <IconButton label="Export song" onClick={() => engine.exportSong()}>
          <Download className="size-4" />
          <span className="hidden text-xs xl:inline">Export</span>
        </IconButton>
        <IconButton
          label="Loop Browser (O)"
          active={browserOpen}
          onClick={() => store.set((s) => ({ browserOpen: !s.browserOpen }))}
        >
          <ListMusic className="size-4" />
          <span className="hidden text-xs xl:inline">Loops</span>
        </IconButton>
      </div>
    </header>
  )
}
