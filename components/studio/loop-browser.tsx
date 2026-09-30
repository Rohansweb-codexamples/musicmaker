"use client"

import { Plus, Search, Volume2, X } from "lucide-react"
import { useLayoutEffect, useMemo, useRef, useState } from "react"
import { dragState, LOOP_MIME } from "@/lib/drag"
import { engine } from "@/lib/engine"
import { CATEGORIES, DESCRIPTORS, GENRES, LOOPS, type Category, type LoopInfo } from "@/lib/loops"
import { KEY_NAMES } from "@/lib/music"
import { actions, store, useStudio } from "@/lib/store"
import { cx, Range } from "./ui"

const ROW_H = 34

function minorRoot(root: number, mode: "min" | "maj") {
  return mode === "min" ? root : (root + 9) % 12
}

function LoopRow({ loop, playing, top }: { loop: LoopInfo; playing: boolean; top: number }) {
  const color = loop.drums ? "var(--drum)" : loop.category === "vocals" || loop.category === "fx" ? "var(--audio)" : "var(--inst)"
  return (
    <div
      role="listitem"
      draggable
      onDragStart={(e) => {
        dragState.loopId = loop.id
        e.dataTransfer.setData(LOOP_MIME, loop.id)
        e.dataTransfer.effectAllowed = "copy"
      }}
      onDragEnd={() => {
        dragState.loopId = null
      }}
      className={cx(
        "group absolute inset-x-0 flex items-center gap-2 border-b border-black/30 px-2 text-xs",
        playing ? "bg-audio/25" : "hover:bg-fg/[0.06]",
      )}
      style={{ top, height: ROW_H }}
    >
      <button
        type="button"
        onClick={() => engine.togglePreview(loop.id)}
        aria-label={playing ? `Stop preview of ${loop.name}` : `Preview ${loop.name}`}
        className="flex min-w-0 flex-1 cursor-grab items-center gap-2 text-left active:cursor-grabbing"
      >
        <span
          className="grid size-5 shrink-0 place-items-center rounded-sm"
          style={{ background: `color-mix(in oklab, ${color} 30%, transparent)`, color }}
          aria-hidden="true"
        >
          {playing ? <Volume2 className="size-3 animate-pulse" /> : <span className="size-1.5 rounded-full bg-current" />}
        </span>
        <span className="min-w-0 flex-1 truncate">{loop.name}</span>
        <span className="w-7 shrink-0 text-right font-mono text-[10px] text-muted">{loop.bars * 4}</span>
        <span className="w-11 shrink-0 truncate text-right text-[10px] text-muted">{loop.keyText}</span>
      </button>
      <button
        type="button"
        aria-label={`Add ${loop.name} to song`}
        title="Add to song at playhead"
        onClick={() => {
          const s = store.get()
          const target = s.tracks.find((t) => t.id === s.selectedTrackId && t.preset === loop.preset)
          actions.addLoopRegion(loop.id, target?.id ?? null, Math.floor(s.playhead))
        }}
        className="grid size-6 shrink-0 place-items-center rounded text-muted opacity-0 hover:bg-fg/10 hover:text-fg focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  )
}

export function LoopBrowser() {
  const keyRoot = useStudio((s) => s.keyRoot)
  const keyMode = useStudio((s) => s.keyMode)
  const previewId = useStudio((s) => s.previewId)
  const previewVolume = useStudio((s) => s.previewVolume)
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<Category | null>(null)
  const [descriptor, setDescriptor] = useState<string | null>(null)
  const [genre, setGenre] = useState("all")
  const [keyFilter, setKeyFilter] = useState<"song" | "any" | number>("song")
  const listRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewH, setViewH] = useState(400)

  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewH(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const results = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    const songMinor = minorRoot(keyRoot, keyMode)
    return LOOPS.filter((l) => {
      if (category && l.category !== category) return false
      if (descriptor && !l.descriptors.includes(descriptor)) return false
      if (genre !== "all" && l.genre !== genre) return false
      if (l.root !== null && l.mode) {
        if (keyFilter === "song" && minorRoot(l.root, l.mode) !== songMinor) return false
        if (typeof keyFilter === "number" && l.root !== keyFilter) return false
      }
      return terms.every((t) => l.search.includes(t))
    })
  }, [query, category, descriptor, genre, keyFilter, keyRoot, keyMode])

  const first = Math.max(0, Math.floor(scrollTop / ROW_H) - 5)
  const last = Math.min(results.length, Math.ceil((scrollTop + viewH) / ROW_H) + 5)

  const resetScroll = () => {
    listRef.current?.scrollTo({ top: 0 })
    setScrollTop(0)
  }

  return (
    <aside
      aria-label="Loop Browser"
      className="absolute inset-y-0 right-0 z-40 flex w-80 shrink-0 flex-col border-l border-black/60 bg-panel shadow-2xl lg:static lg:shadow-none"
    >
      <div className="flex flex-col gap-2 border-b border-black/50 p-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold">
            Loops <span className="font-normal text-muted">· {LOOPS.length.toLocaleString()} total</span>
          </h2>
          <button
            type="button"
            aria-label="Close Loop Browser"
            onClick={() => store.set({ browserOpen: false })}
            className="grid size-6 place-items-center rounded text-muted hover:bg-fg/10 hover:text-fg"
          >
            <X className="size-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-5 gap-1" role="group" aria-label="Instrument filter">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={category === c.id}
              onClick={() => {
                setCategory((cur) => (cur === c.id ? null : c.id))
                resetScroll()
              }}
              className={cx(
                "h-6 truncate rounded px-1 text-[10px] font-medium transition-colors",
                category === c.id ? "bg-audio text-black" : "bg-panel-2 text-fg/85 hover:bg-[#3d3d44]",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-1" role="group" aria-label="Mood filter">
          {DESCRIPTORS.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={descriptor === d}
              onClick={() => {
                setDescriptor((cur) => (cur === d ? null : d))
                resetScroll()
              }}
              className={cx(
                "h-6 truncate rounded px-1 text-[10px] transition-colors",
                descriptor === d ? "bg-fg text-black" : "bg-panel-2/60 text-muted hover:bg-[#3d3d44] hover:text-fg",
              )}
            >
              {d}
            </button>
          ))}
        </div>

        <div className="flex gap-1">
          <label className="sr-only" htmlFor="genre-filter">
            Genre
          </label>
          <select
            id="genre-filter"
            value={genre}
            onChange={(e) => {
              setGenre(e.target.value)
              resetScroll()
            }}
            className="h-7 min-w-0 flex-1 rounded border border-black/50 bg-panel-2 px-1.5 text-[11px] outline-none focus:border-audio"
          >
            <option value="all">All genres</option>
            {GENRES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="key-filter">
            Key
          </label>
          <select
            id="key-filter"
            value={String(keyFilter)}
            onChange={(e) => {
              const v = e.target.value
              setKeyFilter(v === "song" || v === "any" ? v : Number(v))
              resetScroll()
            }}
            className="h-7 w-28 rounded border border-black/50 bg-panel-2 px-1.5 text-[11px] outline-none focus:border-audio"
          >
            <option value="song">
              Song key ({KEY_NAMES[keyRoot]} {keyMode})
            </option>
            <option value="any">Any key</option>
            {KEY_NAMES.map((k, i) => (
              <option key={k} value={i}>
                {k}
              </option>
            ))}
          </select>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted" aria-hidden="true" />
          <label className="sr-only" htmlFor="loop-search">
            Search loops
          </label>
          <input
            id="loop-search"
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              resetScroll()
            }}
            placeholder="Search loops"
            className="h-7 w-full rounded-md border border-black/50 bg-lcd pr-2 pl-7 text-xs outline-none placeholder:text-muted focus:border-audio"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-black/50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
        <span className="flex-1">Name</span>
        <span className="w-7 text-right">Beats</span>
        <span className="w-11 text-right">Key</span>
        <span className="w-6" />
      </div>

      <div
        ref={listRef}
        role="list"
        aria-label={`${results.length} loops`}
        className="studio-scroll relative min-h-0 flex-1 overflow-y-auto"
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >
        <div style={{ height: results.length * ROW_H }} className="relative">
          {results.slice(first, last).map((l, i) => (
            <LoopRow key={l.id} loop={l} playing={l.id === previewId} top={(first + i) * ROW_H} />
          ))}
        </div>
        {results.length === 0 && (
          <p className="absolute inset-x-0 top-8 px-6 text-center text-xs text-muted">
            No loops match these filters. Try another key or clear a filter.
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-black/50 px-2 py-2 text-[11px] text-muted">
        <span className="tabular-nums">{results.length.toLocaleString()} loops</span>
        <Volume2 className="ml-auto size-3.5" aria-hidden="true" />
        <Range
          label="Preview volume"
          value={previewVolume}
          onChange={(v) => store.set({ previewVolume: v })}
          className="w-24"
        />
      </div>
    </aside>
  )
}
