"use client"

import { INSTRUMENTS, type PresetId } from "@/lib/instruments"
import { actions, store, useStudio } from "@/lib/store"
import { Knob } from "./knob"
import { colorVar, iconFor } from "./ui"

const pct = (v: number) => `${Math.round(v * 100)}`

export function SmartControls() {
  const track = useStudio((s) => s.tracks.find((t) => t.id === s.selectedTrackId) ?? null)
  const masterVolume = useStudio((s) => s.masterVolume)

  return (
    <div className="flex h-full items-center gap-6 overflow-x-auto px-4">
      {track ? (
        <>
          <div className="flex w-48 shrink-0 flex-col gap-2">
            <div className="flex items-center gap-2">
              {(() => {
                const Icon = iconFor(track.kind, track.preset)
                return (
                  <div
                    className="grid size-10 place-items-center rounded-lg"
                    style={{ background: `color-mix(in oklab, ${colorVar(track.kind)} 28%, #1d1d20)`, color: colorVar(track.kind) }}
                  >
                    <Icon className="size-5" aria-hidden="true" />
                  </div>
                )
              })()}
              <label className="sr-only" htmlFor="track-name">
                Track name
              </label>
              <input
                id="track-name"
                value={track.name}
                onChange={(e) => actions.updateTrack(track.id, { name: e.target.value })}
                className="min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-sm font-medium outline-none hover:bg-fg/5 focus:bg-lcd"
              />
            </div>
            {track.kind !== "audio" ? (
              <>
                <label className="sr-only" htmlFor="track-preset">
                  Instrument
                </label>
                <select
                  id="track-preset"
                  value={track.preset}
                  onChange={(e) => actions.updateTrack(track.id, { preset: e.target.value as PresetId })}
                  className="h-7 rounded border border-black/50 bg-panel-2 px-1.5 text-xs outline-none focus:border-audio"
                >
                  {Array.from(new Set(INSTRUMENTS.map((i) => i.group))).map((g) => (
                    <optgroup key={g} label={g}>
                      {INSTRUMENTS.filter((i) => i.group === g).map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </>
            ) : (
              <p className="text-[11px] leading-snug text-muted">
                Select this track and press Record to capture from your microphone.
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-start gap-1 rounded-lg bg-black/20 px-2 py-2">
            {track.kind !== "audio" && (
              <>
                <Knob
                  label="Cutoff"
                  value={track.cutoff}
                  onChange={(v) => actions.updateTrack(track.id, { cutoff: v })}
                  color="var(--inst)"
                  format={pct}
                />
                <Knob
                  label="Reso"
                  value={track.resonance}
                  onChange={(v) => actions.updateTrack(track.id, { resonance: v })}
                  color="var(--inst)"
                  format={pct}
                />
              </>
            )}
            <Knob
              label="Reverb"
              value={track.reverb}
              onChange={(v) => actions.updateTrack(track.id, { reverb: v })}
              color="var(--audio)"
              format={pct}
            />
            <Knob
              label="Delay"
              value={track.delay}
              onChange={(v) => actions.updateTrack(track.id, { delay: v })}
              color="var(--audio)"
              format={pct}
            />
            <Knob
              label="Pan"
              value={track.pan}
              min={-1}
              max={1}
              bipolar
              onChange={(v) => actions.updateTrack(track.id, { pan: Math.abs(v) < 0.04 ? 0 : v })}
              format={(v) => (Math.abs(v) < 0.04 ? "C" : v < 0 ? `L${Math.round(-v * 50)}` : `R${Math.round(v * 50)}`)}
            />
            <Knob
              label="Volume"
              value={track.volume}
              onChange={(v) => actions.updateTrack(track.id, { volume: v })}
              format={pct}
            />
          </div>
        </>
      ) : (
        <p className="text-xs text-muted">Select a track to edit its sound.</p>
      )}
      <div className="ml-auto flex shrink-0 items-start gap-1 rounded-lg bg-black/20 px-2 py-2">
        <Knob label="Master" value={masterVolume} onChange={(v) => store.set({ masterVolume: v })} format={pct} />
      </div>
    </div>
  )
}
