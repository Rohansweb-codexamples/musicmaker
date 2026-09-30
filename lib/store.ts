"use client"

import { useSyncExternalStore } from "react"
import type { PresetId } from "./instruments"
import { isDrumPreset } from "./instruments"
import { LOOP_BY_ID, loopId, type NoteEvent } from "./loops"
import type { Mode } from "./music"

export type TrackKind = "drums" | "instrument" | "audio"

export interface Track {
  id: string
  name: string
  kind: TrackKind
  preset: PresetId
  volume: number
  pan: number
  mute: boolean
  solo: boolean
  cutoff: number
  resonance: number
  reverb: number
  delay: number
}

export interface Region {
  id: string
  trackId: string
  name: string
  start: number
  length: number
  loopSteps: number
  preset: PresetId
  loopId?: string
  notes?: NoteEvent[]
  audioId?: string
  audioOffset?: number
  peaks?: number[]
}

export type BottomPanel = "none" | "controls" | "keyboard"

export interface StudioState {
  bpm: number
  keyRoot: number
  keyMode: Mode
  tracks: Track[]
  regions: Region[]
  selectedTrackId: string | null
  selectedRegionId: string | null
  playhead: number
  playing: boolean
  recording: boolean
  countingIn: boolean
  cycle: { on: boolean; start: number; end: number }
  metronome: boolean
  countIn: boolean
  pump: boolean
  masterVolume: number
  barWidth: number
  previewId: string | null
  previewVolume: number
  browserOpen: boolean
  bottomPanel: BottomPanel
  octave: number
  velocity: number
  exporting: null | { progress: number }
  micError: string | null
  heldNotes: number[]
}

let uid = 0
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(uid++).toString(36)}`

export function kindForPreset(preset: PresetId): TrackKind {
  return isDrumPreset(preset) ? "drums" : "instrument"
}

function makeTrack(name: string, preset: PresetId, kind: TrackKind = kindForPreset(preset)): Track {
  return {
    id: newId("trk"),
    name,
    kind,
    preset,
    volume: 0.8,
    pan: 0,
    mute: false,
    solo: false,
    cutoff: 1,
    resonance: 0,
    reverb: kind === "drums" ? 0.05 : 0.18,
    delay: 0,
  }
}

function loopRegion(trackId: string, id: string, start: number, length: number): Region {
  const loop = LOOP_BY_ID.get(id)!
  return {
    id: newId("rgn"),
    trackId,
    name: loop.name,
    start,
    length,
    loopSteps: loop.bars * 16,
    preset: loop.preset,
    loopId: id,
  }
}

function demoProject(): Pick<StudioState, "tracks" | "regions"> {
  const A = 9
  const beat = makeTrack("House Beat", "kit-deep")
  const hats = makeTrack("Open Hats", "kit-house")
  const bass = makeTrack("Deep Bass", "bass-deep")
  const keys = makeTrack("Rhodes Chords", "keys-rhodes")
  const pad = makeTrack("Warm Pad", "pad-warm")
  const fx = makeTrack("Riser FX", "fx")
  keys.delay = 0.12
  pad.volume = 0.6
  const regions = [
    loopRegion(beat.id, loopId("beat-deep-groove", null, 5), 0, 16),
    loopRegion(hats.id, loopId("hats-offbeat", null, 1), 4, 12),
    loopRegion(bass.id, loopId("bass-deep-night", A, 0), 4, 12),
    loopRegion(keys.id, loopId("keys-deep-rhodes", A, 0), 0, 16),
    loopRegion(pad.id, loopId("pad-warm", A, 0), 8, 8),
    loopRegion(fx.id, loopId("fx-noise-riser", null, 2), 0, 4),
  ]
  return { tracks: [beat, hats, bass, keys, pad, fx], regions }
}

const demo = demoProject()

let state: StudioState = {
  bpm: 124,
  keyRoot: 9,
  keyMode: "min",
  tracks: demo.tracks,
  regions: demo.regions,
  selectedTrackId: demo.tracks[0].id,
  selectedRegionId: null,
  playhead: 0,
  playing: false,
  recording: false,
  countingIn: false,
  cycle: { on: false, start: 0, end: 8 },
  metronome: false,
  countIn: true,
  pump: true,
  masterVolume: 0.85,
  barWidth: 44,
  previewId: null,
  previewVolume: 0.8,
  browserOpen: true,
  bottomPanel: "none",
  octave: 4,
  velocity: 0.8,
  exporting: null,
  micError: null,
  heldNotes: [],
}

const listeners = new Set<() => void>()

export const store = {
  get: () => state,
  set(patch: Partial<StudioState> | ((s: StudioState) => Partial<StudioState>)) {
    const next = typeof patch === "function" ? patch(state) : patch
    state = { ...state, ...next }
    listeners.forEach((l) => l())
  },
  subscribe(l: () => void) {
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  },
}

export function useStudio<T>(selector: (s: StudioState) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(state),
    () => selector(state),
  )
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export const actions = {
  addTrack(name: string, preset: PresetId, kind?: TrackKind) {
    const t = makeTrack(name, preset, kind)
    store.set((s) => ({ tracks: [...s.tracks, t], selectedTrackId: t.id }))
    return t
  },
  updateTrack(id: string, patch: Partial<Track>) {
    store.set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }))
  },
  removeTrack(id: string) {
    store.set((s) => {
      const tracks = s.tracks.filter((t) => t.id !== id)
      return {
        tracks,
        regions: s.regions.filter((r) => r.trackId !== id),
        selectedTrackId: s.selectedTrackId === id ? (tracks[0]?.id ?? null) : s.selectedTrackId,
      }
    })
  },
  addLoopRegion(loopIdValue: string, trackId: string | null, start: number) {
    const loop = LOOP_BY_ID.get(loopIdValue)
    if (!loop) return
    let tid = trackId
    const s = store.get()
    const track = tid ? s.tracks.find((t) => t.id === tid) : null
    if (!track || track.kind === "audio") {
      const base = loop.name.replace(/\s\d+$/, "")
      tid = actions.addTrack(base, loop.preset).id
    }
    const length = Math.max(loop.bars, 4)
    const region = loopRegion(tid!, loopIdValue, Math.max(0, start), length)
    store.set((st) => ({ regions: [...st.regions, region], selectedRegionId: region.id, selectedTrackId: tid }))
  },
  addRegion(region: Region) {
    store.set((s) => ({ regions: [...s.regions, region], selectedRegionId: region.id }))
  },
  updateRegion(id: string, patch: Partial<Region>) {
    store.set((s) => ({ regions: s.regions.map((r) => (r.id === id ? { ...r, ...patch } : r)) }))
  },
  deleteRegion(id: string) {
    store.set((s) => ({
      regions: s.regions.filter((r) => r.id !== id),
      selectedRegionId: s.selectedRegionId === id ? null : s.selectedRegionId,
    }))
  },
  duplicateRegion(id: string) {
    const r = store.get().regions.find((x) => x.id === id)
    if (!r) return
    const copy = { ...r, id: newId("rgn"), start: r.start + r.length }
    store.set((s) => ({ regions: [...s.regions, copy], selectedRegionId: copy.id }))
  },
  select(trackId: string | null, regionId: string | null = null) {
    store.set({ selectedTrackId: trackId, selectedRegionId: regionId })
  },
}

export function songEndBar(s: StudioState) {
  return s.regions.reduce((m, r) => Math.max(m, r.start + r.length), 0)
}
