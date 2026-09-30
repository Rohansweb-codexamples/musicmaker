"use client"

import { Trash2 } from "lucide-react"
import { memo } from "react"
import { instrumentName } from "@/lib/instruments"
import { actions, type Track } from "@/lib/store"
import { colorVar, cx, iconFor, Range } from "./ui"

export const TrackHeader = memo(function TrackHeader({ track, selected }: { track: Track; selected: boolean }) {
  const Icon = iconFor(track.kind, track.preset)
  const color = colorVar(track.kind)
  return (
    <div
      className={cx(
        "group sticky left-0 z-30 flex w-52 shrink-0 cursor-default items-center gap-2 border-r border-b border-black/50 px-2",
        selected ? "bg-[#3a3a41]" : "bg-panel hover:bg-[#2c2c30]",
      )}
      onPointerDown={() => actions.select(track.id)}
    >
      <div
        className="grid size-9 shrink-0 place-items-center rounded-md"
        style={{ background: `color-mix(in oklab, ${color} 28%, #1d1d20)`, color }}
      >
        <Icon className="size-5" aria-hidden="true" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-1">
          <span className="min-w-0 flex-1 truncate text-xs font-medium">{track.name}</span>
          <button
            type="button"
            aria-label={`Delete ${track.name}`}
            onClick={(e) => {
              e.stopPropagation()
              actions.removeTrack(track.id)
            }}
            className="hidden size-5 place-items-center rounded text-muted hover:text-rec focus-visible:grid group-hover:grid"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label={`Mute ${track.name}`}
            aria-pressed={track.mute}
            onClick={() => actions.updateTrack(track.id, { mute: !track.mute })}
            className={cx(
              "grid h-4 w-5 place-items-center rounded-sm text-[9px] font-bold",
              track.mute ? "bg-audio text-black" : "bg-[#45454c] text-fg/80 hover:bg-[#55555c]",
            )}
          >
            M
          </button>
          <button
            type="button"
            aria-label={`Solo ${track.name}`}
            aria-pressed={track.solo}
            onClick={() => actions.updateTrack(track.id, { solo: !track.solo })}
            className={cx(
              "grid h-4 w-5 place-items-center rounded-sm text-[9px] font-bold",
              track.solo ? "bg-drum text-black" : "bg-[#45454c] text-fg/80 hover:bg-[#55555c]",
            )}
          >
            S
          </button>
          <Range
            label={`${track.name} volume`}
            value={track.volume}
            onChange={(v) => actions.updateTrack(track.id, { volume: v })}
            className="min-w-0 flex-1"
          />
        </div>
        <span className="sr-only">{instrumentName(track.preset)}</span>
      </div>
    </div>
  )
})
