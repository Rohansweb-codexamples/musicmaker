"use client"

import * as Tone from "tone"
import type { PresetId } from "./instruments"
import { getLoopNotes, LOOP_BY_ID, type NoteEvent } from "./loops"
import { createVoice, type Voice } from "./presets"
import { actions, newId, songEndBar, store, type Region, type Track } from "./store"

interface TrackNodes {
  filter: Tone.Filter
  channel: Tone.Channel
  reverbSend: Tone.Gain
  delaySend: Tone.Gain
  voices: Map<PresetId, Voice>
  bus: "drums" | "music"
}

type Mode = "idle" | "play" | "preview"

const stepIndexCache = new WeakMap<NoteEvent[], Map<number, NoteEvent[]>>()

function indexByStep(notes: NoteEvent[]) {
  let idx = stepIndexCache.get(notes)
  if (!idx) {
    idx = new Map()
    for (const n of notes) {
      const list = idx.get(n.step)
      if (list) list.push(n)
      else idx.set(n.step, [n])
    }
    stepIndexCache.set(notes, idx)
  }
  return idx
}

export function regionNotes(r: Region): NoteEvent[] {
  if (r.notes) return r.notes
  if (r.loopId) return getLoopNotes(r.loopId)
  return []
}

function computePeaks(buffer: Tone.ToneAudioBuffer, offsetSec: number, durationSec: number, points: number) {
  const data = buffer.getChannelData(0)
  const sr = buffer.sampleRate
  const start = Math.floor(offsetSec * sr)
  const total = Math.floor(durationSec * sr)
  const size = Math.max(1, Math.floor(total / points))
  const peaks: number[] = []
  let max = 0.0001
  for (let p = 0; p < points; p++) {
    let peak = 0
    const from = start + p * size
    for (let i = from; i < from + size && i < data.length; i += 16) {
      const v = Math.abs(data[i])
      if (v > peak) peak = v
    }
    peaks.push(peak)
    if (peak > max) max = peak
  }
  return peaks.map((p) => p / max)
}

class Engine {
  private ready: Promise<void> | null = null
  private mode: Mode = "idle"
  private resync = false
  private lastStep = -1
  private tracks = new Map<string, TrackNodes>()
  private players = new Map<string, Tone.Player>()
  private buffers = new Map<string, Tone.ToneAudioBuffer>()
  private previewVoices = new Map<PresetId, Voice>()
  private liveHeld = new Map<number, Voice>()

  private liveChannel!: Tone.Channel
  private liveFilterNode!: Tone.Filter
  private liveWobble!: Tone.LFO
  private liveCutoff!: Tone.Signal<"number">
  private liveVoices = new Map<PresetId, Voice>()
  private liveCells = new Map<string, { loopId: string; startStep: number; stopStep: number | null; col: number; row: number }>()
  private liveQueuedCells = new Map<string, { loopId: string; startStep: number; col: number; row: number }>()

  private masterIn!: Tone.Gain
  private masterVol!: Tone.Volume
  private musicBus!: Tone.Gain
  private drumBus!: Tone.Gain
  private reverb!: Tone.Reverb
  private delay!: Tone.FeedbackDelay
  private previewOut!: Tone.Gain
  private click!: Tone.Synth

  private mic: Tone.UserMedia | null = null
  private recorder: Tone.Recorder | null = null
  private rec: null | {
    trackId: string
    startBar: number
    kind: "audio" | "midi"
    offset: number
    preset: PresetId
    notes: NoteEvent[]
    held: Map<number, { ev: NoteEvent; raw: number }>
  } = null
  private exportTimer: ReturnType<typeof setInterval> | null = null
  private exportRecorder: Tone.Recorder | null = null

  get transport() {
    return Tone.getTransport()
  }

  ensure() {
    if (!this.ready) this.ready = this.init()
    return this.ready
  }

  private async init() {
    await Tone.start()
    const ctx = Tone.getContext()
    ctx.lookAhead = 0.1

    this.masterVol = new Tone.Volume(0).toDestination()
    const limiter = new Tone.Limiter(-1).connect(this.masterVol)
    const comp = new Tone.Compressor({ threshold: -14, ratio: 3, attack: 0.01, release: 0.2 }).connect(limiter)
    this.masterIn = new Tone.Gain(0.9).connect(comp)
    this.musicBus = new Tone.Gain(1).connect(this.masterIn)
    this.drumBus = new Tone.Gain(1).connect(this.masterIn)
    this.reverb = new Tone.Reverb({ decay: 2.8, preDelay: 0.02, wet: 1 }).connect(this.masterIn)
    this.delay = new Tone.FeedbackDelay({ delayTime: "8n.", feedback: 0.35, wet: 1 }).connect(this.masterIn)
    this.previewOut = new Tone.Gain(0.8).connect(this.masterIn)
    this.click = new Tone.Synth({
      oscillator: { type: "square" },
      envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.01 },
    }).connect(this.masterVol)
    this.click.volume.value = -14

    this.liveChannel = new Tone.Channel({ volume: 0 }).connect(this.masterIn)
    this.liveFilterNode = new Tone.Filter({ type: "lowpass", frequency: 20000, Q: 0.7 }).connect(this.liveChannel)
    this.liveWobble = new Tone.LFO({ frequency: 4, min: -5000, max: 5000, type: "sine" })
    // Connecting a signal to filter.frequency overrides it (Tone zeroes it and ramps break),
    // so the base cutoff is its own signal; cutoff + LFO sum at the filter's frequency param.
    this.liveCutoff = new Tone.Signal({ value: 20000, units: "number" })
    this.liveCutoff.connect(this.liveFilterNode.frequency)
    this.liveWobble.connect(this.liveFilterNode.frequency)
    this.liveWobble.amplitude.value = 0

    const tr = this.transport
    tr.bpm.value = store.get().bpm
    tr.scheduleRepeat((time) => this.tick(time), "16n", 0)

    this.sync()
    store.subscribe(() => this.sync())
  }

  // -------------------------------------------------------------------------
  // Graph sync
  // -------------------------------------------------------------------------

  private sync() {
    const s = store.get()
    const tr = this.transport
    if (Math.abs(tr.bpm.value - s.bpm) > 0.01) tr.bpm.value = s.bpm
    this.masterVol.volume.value = Tone.gainToDb(Math.max(0.0001, s.masterVolume))
    this.previewOut.gain.value = s.previewVolume
    if (!s.exporting) {
      tr.loop = s.cycle.on
      tr.loopStart = `${s.cycle.start}:0:0`
      tr.loopEnd = `${s.cycle.end}:0:0`
    }
    if (!s.pump) this.musicBus.gain.value = 1

    const anySolo = s.tracks.some((t) => t.solo)
    const ids = new Set(s.tracks.map((t) => t.id))
    for (const t of s.tracks) {
      const nodes = this.nodesFor(t)
      nodes.channel.volume.value = Tone.gainToDb(Math.max(0.0001, t.volume))
      nodes.channel.pan.value = t.pan
      nodes.channel.mute = t.mute || (anySolo && !t.solo)
      nodes.filter.frequency.value = 80 * Math.pow(250, t.cutoff)
      nodes.filter.Q.value = 0.7 + t.resonance * 14
      nodes.reverbSend.gain.value = t.reverb
      nodes.delaySend.gain.value = t.delay * 0.8
    }
    for (const [id, nodes] of this.tracks) {
      if (ids.has(id)) continue
      nodes.voices.forEach((v) => v.dispose())
      ;[nodes.filter, nodes.channel, nodes.reverbSend, nodes.delaySend].forEach((n) => n.dispose())
      this.tracks.delete(id)
    }
    const regionIds = new Set(s.regions.map((r) => r.id))
    for (const [id, p] of this.players) {
      if (regionIds.has(id)) continue
      p.dispose()
      this.players.delete(id)
    }

    if (this.liveFilterNode) {
      this.liveCutoff.rampTo(80 * Math.pow(250, s.liveFilter.cutoff), 0.05)
      this.liveFilterNode.Q.rampTo(0.7 + s.liveFilter.resonance * 14, 0.05)
    }
    if (this.liveWobble) {
      if (s.liveWobble.on) {
        this.liveWobble.amplitude.rampTo(1, 0.1)
        if (this.liveWobble.state !== "started") this.liveWobble.start()
        this.liveWobble.frequency.rampTo(s.liveWobble.rate, 0.05)
      } else {
        this.liveWobble.amplitude.rampTo(0, 0.1)
      }
    }
  }

  private nodesFor(t: Track): TrackNodes {
    let n = this.tracks.get(t.id)
    if (n) return n
    const bus = t.kind === "drums" ? "drums" : "music"
    const channel = new Tone.Channel().connect(bus === "drums" ? this.drumBus : this.musicBus)
    const filter = new Tone.Filter({ type: "lowpass", frequency: 20000, rolloff: -12 }).connect(channel)
    const reverbSend = new Tone.Gain(0).connect(this.reverb)
    const delaySend = new Tone.Gain(0).connect(this.delay)
    channel.connect(reverbSend)
    channel.connect(delaySend)
    n = { filter, channel, reverbSend, delaySend, voices: new Map(), bus }
    this.tracks.set(t.id, n)
    return n
  }

  private voiceFor(trackId: string, preset: PresetId): Voice | null {
    const t = store.get().tracks.find((x) => x.id === trackId)
    if (!t) return null
    const nodes = this.nodesFor(t)
    let v = nodes.voices.get(preset)
    if (!v) {
      v = createVoice(preset)
      v.output.connect(nodes.filter)
      nodes.voices.set(preset, v)
    }
    return v
  }

  private previewVoice(preset: PresetId) {
    let v = this.previewVoices.get(preset)
    if (!v) {
      v = createVoice(preset)
      v.output.connect(this.previewOut)
      this.previewVoices.set(preset, v)
    }
    return v
  }

  // -------------------------------------------------------------------------
  // Sequencer
  // -------------------------------------------------------------------------

  private tick(time: number) {
    const tr = this.transport
    const step = Math.round(tr.getTicksAtTime(time) / (tr.PPQ / 4))
    const s = store.get()
    const stepSec = 60 / s.bpm / 4

    if (this.mode === "preview") {
      this.playPreview(step, time, stepSec)
      return
    }
    if (this.mode !== "play") return

    if (s.view === "live") {
      this.tickLive(step, time, stepSec)
      return
    }

    if (step < this.lastStep) {
      this.players.forEach((p) => p.state === "started" && p.stop(time))
      this.resync = true
    }
    this.lastStep = step

    if (step % 4 === 0) {
      if (s.metronome && !s.exporting) this.click.triggerAttackRelease(step % 16 === 0 ? 1760 : 1320, 0.03, time)
      if (s.pump) {
        const g = this.musicBus.gain
        g.cancelScheduledValues(time)
        g.setValueAtTime(0.28, time)
        g.linearRampToValueAtTime(1, time + stepSec * 2.6)
      }
    }

    for (const r of s.regions) {
      const startStep = r.start * 16
      const endStep = (r.start + r.length) * 16
      if (step < startStep || step >= endStep) continue
      if (r.audioId) {
        if (step === startStep) this.startPlayer(r, time, 0, stepSec)
        else if (this.resync) this.startPlayer(r, time, (step - startStep) * stepSec, stepSec)
        continue
      }
      const notes = regionNotes(r)
      if (!notes.length) continue
      const local = (step - startStep) % r.loopSteps
      const events = indexByStep(notes).get(local)
      if (!events) continue
      const voice = this.voiceFor(r.trackId, r.preset)
      if (!voice) continue
      const remaining = endStep - step
      for (const ev of events) {
        voice.play(ev.dur > remaining ? { ...ev, dur: remaining } : ev, time, stepSec)
      }
    }
    this.resync = false

    if (s.previewId) this.playPreview(step, time, stepSec)
  }

  private playPreview(step: number, time: number, stepSec: number) {
    const id = store.get().previewId
    if (!id) return
    const loop = LOOP_BY_ID.get(id)
    if (!loop) return
    const events = indexByStep(getLoopNotes(id)).get(step % (loop.bars * 16))
    if (!events) return
    const voice = this.previewVoice(loop.preset)
    for (const ev of events) voice.play(ev, time, stepSec)
  }

  private startPlayer(r: Region, time: number, offsetSec: number, stepSec: number) {
    if (!r.audioId) return
    const buffer = this.buffers.get(r.audioId)
    if (!buffer) return
    let p = this.players.get(r.id)
    if (!p) {
      p = new Tone.Player(buffer)
      const t = store.get().tracks.find((x) => x.id === r.trackId)
      if (!t) return
      p.connect(this.nodesFor(t).filter)
      this.players.set(r.id, p)
    }
    const dur = r.length * 16 * stepSec - offsetSec
    const off = (r.audioOffset ?? 0) + offsetSec
    if (off >= buffer.duration || dur <= 0) return
    if (p.state === "started") p.stop(time)
    p.start(time + 0.0001, off, dur)
  }

  // -------------------------------------------------------------------------
  // Transport controls
  // -------------------------------------------------------------------------

  positionBars() {
    if (this.mode !== "play") return store.get().playhead
    const tr = this.transport
    return Math.max(0, tr.ticks / (tr.PPQ * 4))
  }

  get isPlaying() {
    return this.mode === "play"
  }

  async play() {
    await this.ensure()
    if (this.mode === "play") return this.stop()
    const tr = this.transport
    if (this.mode === "preview") tr.stop()
    const s = store.get()
    this.mode = "play"
    this.resync = true
    this.lastStep = -1
    tr.ticks = Math.round(s.playhead * tr.PPQ * 4)
    tr.start("+0.05")
    store.set({ playing: true })
  }

  async stop() {
    const tr = this.transport
    const wasPlaying = this.mode === "play"
    const pos = this.positionBars()
    tr.stop()
    this.players.forEach((p) => p.state === "started" && p.stop())
    this.mode = "idle"
    const recording = store.get().recording
    store.set({
      playing: false,
      recording: false,
      countingIn: false,
      playhead: wasPlaying ? Math.round(pos * 16) / 16 : store.get().playhead,
    })
    if (recording) await this.finishRecording()
    if (store.get().previewId) this.startPreviewTransport()
    this.liveCells.clear()
    this.liveQueuedCells.clear()
    store.set({ livePlaying: {}, liveQueued: [] })
  }

  setPlayhead(bar: number) {
    const b = Math.max(0, bar)
    store.set({ playhead: b })
    if (this.mode === "play") {
      const tr = this.transport
      this.players.forEach((p) => p.state === "started" && p.stop())
      this.resync = true
      this.lastStep = -1
      tr.ticks = Math.round(b * tr.PPQ * 4)
      if (store.get().view === "live") {
        const stepBase = Math.round(b * 16)
        for (const [, cell] of this.liveCells) cell.startStep = stepBase
      }
    }
  }

  // -------------------------------------------------------------------------
  // Loop preview
  // -------------------------------------------------------------------------

  async togglePreview(id: string) {
    await this.ensure()
    const s = store.get()
    if (s.previewId === id) {
      this.stopPreview()
      return
    }
    store.set({ previewId: id })
    if (this.mode === "idle") this.startPreviewTransport()
  }

  private startPreviewTransport() {
    const tr = this.transport
    this.mode = "preview"
    tr.stop()
    tr.ticks = 0
    tr.start("+0.05")
  }

  stopPreview() {
    store.set({ previewId: null })
    if (this.mode === "preview") {
      this.transport.stop()
      this.mode = "idle"
    }
  }

  // -------------------------------------------------------------------------
  // Live Loops grid
  // -------------------------------------------------------------------------

  private liveVoice(preset: PresetId): Voice {
    let v = this.liveVoices.get(preset)
    if (!v) {
      v = createVoice(preset)
      v.output.connect(this.liveFilterNode)
      this.liveVoices.set(preset, v)
    }
    return v
  }

  private tickLive(step: number, time: number, stepSec: number) {
    for (const [key, q] of this.liveQueuedCells) {
      if (step >= q.startStep) {
        this.liveCells.set(key, {
          loopId: q.loopId,
          startStep: q.startStep,
          stopStep: null,
          col: q.col,
          row: q.row,
        })
        this.liveQueuedCells.delete(key)
        this.syncLiveStore()
      }
    }

    for (const [key, cell] of this.liveCells) {
      if (cell.stopStep !== null && step >= cell.stopStep) {
        this.liveCells.delete(key)
        this.syncLiveStore()
        continue
      }
      const loop = LOOP_BY_ID.get(cell.loopId)
      if (!loop) continue
      const totalSteps = loop.bars * 16
      const localStep = (((step - cell.startStep) % totalSteps) + totalSteps) % totalSteps
      const events = indexByStep(getLoopNotes(cell.loopId)).get(localStep)
      if (!events) continue
      const voice = this.liveVoice(loop.preset)
      // One failing note must not drop the other cells' notes (or the rest of this tick).
      try {
        for (const ev of events) voice.play(ev, time, stepSec)
      } catch (e) {
        console.warn("[live] note skipped", e)
      }
    }
  }

  /** Build a loop's voice when it is queued (a bar ahead) instead of inside the audio-timing callback. */
  private warmLiveVoice(loopId: string) {
    const loop = LOOP_BY_ID.get(loopId)
    if (loop) this.liveVoice(loop.preset)
  }

  async toggleLiveCell(key: string, loopId: string, col: number, row: number) {
    await this.ensure()
    if (this.mode === "idle") {
      await this.play()
    } else if (this.mode === "preview") {
      this.stopPreview()
      await this.play()
    }

    const tr = this.transport
    const currentBar = Math.floor(tr.ticks / (tr.PPQ * 4))
    const nextBarStep = (currentBar + 1) * 16

    if (this.liveCells.has(key)) {
      const cell = this.liveCells.get(key)!
      if (cell.stopStep === null) cell.stopStep = nextBarStep
    } else if (this.liveQueuedCells.has(key)) {
      this.liveQueuedCells.delete(key)
    } else {
      this.warmLiveVoice(loopId)
      this.liveQueuedCells.set(key, { loopId, startStep: nextBarStep, col, row })
    }
    this.syncLiveStore()
  }

  async playLiveColumn(col: number) {
    await this.ensure()
    if (this.mode === "idle") await this.play()
    else if (this.mode === "preview") {
      this.stopPreview()
      await this.play()
    }

    const s = store.get()
    const tr = this.transport
    const currentBar = Math.floor(tr.ticks / (tr.PPQ * 4))
    const nextBarStep = (currentBar + 1) * 16

    for (const [, cell] of this.liveCells) cell.stopStep = nextBarStep
    this.liveQueuedCells.clear()

    for (let row = 0; row < s.grid.length; row++) {
      const loopId = s.grid[row][col]
      if (loopId) {
        const key = `${col}-${row}`
        this.warmLiveVoice(loopId)
        this.liveQueuedCells.set(key, { loopId, startStep: nextBarStep, col, row })
      }
    }
    this.syncLiveStore()
  }

  stopAllLiveCells() {
    const tr = this.transport
    const currentBar = Math.floor(tr.ticks / (tr.PPQ * 4))
    const nextBarStep = (currentBar + 1) * 16
    for (const [, cell] of this.liveCells) cell.stopStep = nextBarStep
    this.liveQueuedCells.clear()
    this.syncLiveStore()
  }

  triggerLiveFx(type: number) {
    this.ensure().then(() => {
      const voice = this.liveVoice("fx")
      voice.noteOn(type, 0.8)
    })
  }

  private syncLiveStore() {
    const playing: Record<string, number> = {}
    for (const [key, cell] of this.liveCells) {
      if (cell.stopStep === null) playing[key] = cell.startStep
    }
    store.set({ livePlaying: playing, liveQueued: Array.from(this.liveQueuedCells.keys()) })
  }

  // -------------------------------------------------------------------------
  // Live playing (musical typing / on-screen keyboard)
  // -------------------------------------------------------------------------

  async noteOn(midi: number, vel: number) {
    await this.ensure()
    const s = store.get()
    const track = s.tracks.find((t) => t.id === s.selectedTrackId)
    const voice =
      track && track.kind !== "audio" ? this.voiceFor(track.id, track.preset) : this.previewVoice("keys-rhodes")
    if (!voice) return
    this.liveHeld.get(midi)?.noteOff(midi)
    voice.noteOn(midi, vel)
    this.liveHeld.set(midi, voice)

    if (this.rec?.kind === "midi" && s.recording && !s.countingIn && this.mode === "play") {
      const tr = this.transport
      const raw = tr.ticks / (tr.PPQ / 4) - this.rec.startBar * 16
      if (raw >= -0.5) {
        const ev: NoteEvent = { step: Math.max(0, Math.round(raw)), dur: 1, midi, vel }
        this.rec.notes.push(ev)
        this.rec.held.set(midi, { ev, raw })
      }
    }
  }

  noteOff(midi: number) {
    const voice = this.liveHeld.get(midi)
    voice?.noteOff(midi)
    this.liveHeld.delete(midi)
    const held = this.rec?.held.get(midi)
    if (held && this.rec) {
      const tr = this.transport
      const raw = tr.ticks / (tr.PPQ / 4) - this.rec.startBar * 16
      held.ev.dur = Math.max(1, Math.round(raw - held.raw))
      this.rec.held.delete(midi)
    }
  }

  // -------------------------------------------------------------------------
  // Recording
  // -------------------------------------------------------------------------

  async record() {
    await this.ensure()
    let s = store.get()
    if (s.recording) return this.stop()
    if (this.mode === "play") await this.stop()
    if (s.previewId) this.stopPreview()
    s = store.get()

    let track = s.tracks.find((t) => t.id === s.selectedTrackId)
    if (!track) track = actions.addTrack("Audio 1", "keys-rhodes", "audio")
    const isAudio = track.kind === "audio"

    if (isAudio) {
      try {
        if (!this.mic) {
          this.mic = new Tone.UserMedia()
          await this.mic.open()
          this.recorder = new Tone.Recorder()
          this.mic.connect(this.recorder)
        }
      } catch {
        this.mic = null
        store.set({
          micError: "Microphone access was blocked. Allow mic access in your browser to record audio.",
        })
        return
      }
    }

    const tr = this.transport
    const barSec = 240 / s.bpm
    const startBar = Math.floor(s.playhead)
    const now = Tone.now()
    const countDur = s.countIn ? barSec : 0
    if (s.countIn) {
      for (let i = 0; i < 4; i++) this.click.triggerAttackRelease(i === 0 ? 1760 : 1320, 0.03, now + (i * barSec) / 4)
      store.set({ countingIn: true })
      setTimeout(() => store.set({ countingIn: false }), countDur * 1000)
    }
    const t0 = now + countDur + 0.05

    let offset = 0
    if (isAudio && this.recorder) {
      if (this.recorder.state === "started") await this.recorder.stop()
      this.recorder.start()
      offset = t0 - Tone.getContext().rawContext.currentTime
    }

    this.rec = {
      trackId: track.id,
      startBar,
      kind: isAudio ? "audio" : "midi",
      offset,
      preset: track.preset,
      notes: [],
      held: new Map(),
    }

    this.mode = "play"
    this.resync = true
    this.lastStep = -1
    tr.stop()
    tr.ticks = Math.round(startBar * tr.PPQ * 4)
    tr.start(t0)
    store.set({ recording: true, playing: true, selectedTrackId: track.id, playhead: startBar, micError: null })
  }

  private async finishRecording() {
    const rec = this.rec
    this.rec = null
    if (!rec) return
    const s = store.get()
    const barSec = 240 / s.bpm

    if (rec.kind === "midi") {
      if (!rec.notes.length) return
      const end = Math.max(...rec.notes.map((n) => n.step + n.dur))
      const length = Math.max(1, Math.ceil(end / 16))
      actions.addRegion({
        id: newId("rgn"),
        trackId: rec.trackId,
        name: "Recording",
        start: rec.startBar,
        length,
        loopSteps: length * 16,
        preset: rec.preset,
        notes: [...rec.notes].sort((a, b) => a.step - b.step),
      })
      return
    }

    if (!this.recorder || this.recorder.state !== "started") return
    const blob = await this.recorder.stop()
    if (!blob.size) return
    const url = URL.createObjectURL(blob)
    try {
      const buffer = await Tone.ToneAudioBuffer.fromUrl(url)
      const usable = buffer.duration - rec.offset
      if (usable < 0.2) return
      const length = Math.max(1, Math.ceil(usable / barSec))
      const audioId = newId("aud")
      this.buffers.set(audioId, buffer)
      actions.addRegion({
        id: newId("rgn"),
        trackId: rec.trackId,
        name: "Audio Recording",
        start: rec.startBar,
        length,
        loopSteps: length * 16,
        preset: rec.preset,
        audioId,
        audioOffset: Math.max(0, rec.offset),
        peaks: computePeaks(buffer, Math.max(0, rec.offset), usable, length * 24),
      })
    } catch (e) {
      console.error("[v0] Failed to decode recording", e)
    }
  }

  // -------------------------------------------------------------------------
  // Export
  // -------------------------------------------------------------------------

  async exportSong() {
    await this.ensure()
    await this.stop()
    this.stopPreview()
    const s = store.get()
    const end = songEndBar(s)
    if (end === 0) return
    const tr = this.transport
    const total = end * (240 / s.bpm) + 2.5

    const recorder = new Tone.Recorder()
    this.exportRecorder = recorder
    this.masterVol.connect(recorder)
    store.set({ exporting: { progress: 0 }, playhead: 0 })
    tr.loop = false
    this.mode = "play"
    this.resync = true
    this.lastStep = -1
    tr.ticks = 0
    recorder.start()
    tr.start("+0.1")
    store.set({ playing: true })

    const startedAt = performance.now()
    await new Promise<void>((resolve) => {
      this.exportTimer = setInterval(() => {
        const elapsed = (performance.now() - startedAt) / 1000
        if (!store.get().exporting) {
          resolve()
          return
        }
        store.set({ exporting: { progress: Math.min(1, elapsed / total) } })
        if (elapsed >= total) resolve()
      }, 100)
    })
    if (this.exportTimer) clearInterval(this.exportTimer)
    this.exportTimer = null

    const cancelled = !store.get().exporting
    tr.stop()
    this.mode = "idle"
    const blob = await recorder.stop()
    this.masterVol.disconnect(recorder)
    recorder.dispose()
    this.exportRecorder = null
    store.set({ exporting: null, playing: false, playhead: 0 })
    if (cancelled || !blob.size) return

    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `house-track-${s.bpm}bpm.webm`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  cancelExport() {
    store.set({ exporting: null })
  }
}

export const engine = new Engine()
