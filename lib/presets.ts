import * as Tone from "tone"
import type { PresetId } from "./instruments"
import { DRUM, FX_TYPE, type NoteEvent } from "./loops"

export interface Voice {
  output: Tone.Gain
  play(ev: NoteEvent, time: number, stepSec: number): void
  noteOn(midi: number, vel: number): void
  noteOff(midi: number): void
  dispose(): void
}

const hz = (midi: number) => Tone.Frequency(midi, "midi").toFrequency()

/** Tone sources throw if restarted at an identical time; nudge forward when needed. */
function monotonic() {
  let last = 0
  return (t: number) => {
    const next = t <= last ? last + 0.0005 : t
    last = next
    return next
  }
}

type AnySynth = Tone.PolySynth | Tone.MonoSynth | Tone.FMSynth

function melodic(synth: AnySynth, nodes: Tone.ToneAudioNode[], levelDb: number, gate = 0.95): Voice {
  const output = new Tone.Gain(Tone.dbToGain(levelDb))
  const chain = [...nodes, output]
  synth.chain(...chain)
  const mono = !(synth instanceof Tone.PolySynth)
  const t = monotonic()
  let held: number | null = null
  return {
    output,
    play(ev, time, stepSec) {
      synth.triggerAttackRelease(hz(ev.midi), Math.max(0.03, ev.dur * stepSec * gate), t(time), ev.vel)
    },
    noteOn(midi, vel) {
      held = midi
      synth.triggerAttack(hz(midi), t(Tone.now()), vel)
    },
    noteOff(midi) {
      if (mono) {
        if (held === midi) (synth as Tone.MonoSynth).triggerRelease(t(Tone.now()))
      } else {
        ;(synth as Tone.PolySynth).triggerRelease(hz(midi), t(Tone.now()))
      }
    },
    dispose() {
      synth.dispose()
      nodes.forEach((n) => n.dispose())
      output.dispose()
    },
  }
}

function formantBank(freqs: number[]) {
  const input = new Tone.Gain(1)
  const sum = new Tone.Gain(1.6)
  const filters = freqs.map((f, i) => {
    const bp = new Tone.Filter({ type: "bandpass", frequency: f, Q: 8 - i * 1.5 })
    const g = new Tone.Gain(i === 0 ? 1 : 0.6 - i * 0.15)
    input.connect(bp)
    bp.connect(g)
    g.connect(sum)
    return [bp, g]
  })
  return { input, sum, dispose: () => [input, sum, ...filters.flat()].forEach((n) => n.dispose()) }
}

function vox(freqs: number[], env: Partial<Tone.EnvelopeOptions>, levelDb: number): Voice {
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "fatsawtooth", count: 2, spread: 12 },
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.2, ...env },
  })
  synth.maxPolyphony = 8
  const bank = formantBank(freqs)
  const vib = new Tone.Vibrato(5, 0.08)
  synth.connect(vib)
  vib.connect(bank.input)
  const output = new Tone.Gain(Tone.dbToGain(levelDb))
  bank.sum.connect(output)
  const t = monotonic()
  return {
    output,
    play(ev, time, stepSec) {
      synth.triggerAttackRelease(hz(ev.midi), Math.max(0.05, ev.dur * stepSec * 0.9), t(time), ev.vel)
    },
    noteOn(midi, vel) {
      synth.triggerAttack(hz(midi), t(Tone.now()), vel)
    },
    noteOff(midi) {
      synth.triggerRelease(hz(midi), t(Tone.now()))
    },
    dispose() {
      synth.dispose()
      vib.dispose()
      bank.dispose()
      output.dispose()
    },
  }
}

function drumKit(deep: boolean): Voice {
  const output = new Tone.Gain(Tone.dbToGain(deep ? -2 : -3))

  const kick = new Tone.MembraneSynth({
    pitchDecay: deep ? 0.06 : 0.04,
    octaves: deep ? 6 : 7,
    oscillator: { type: "sine" },
    envelope: { attack: 0.001, decay: deep ? 0.55 : 0.38, sustain: 0, release: 0.05 },
  }).connect(output)
  kick.volume.value = 2

  const clapFilter = new Tone.Filter({ type: "bandpass", frequency: deep ? 1100 : 1400, Q: 0.9 }).connect(output)
  const clap = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.16, sustain: 0 } })
  clap.connect(clapFilter)
  clap.volume.value = 4

  const snareHp = new Tone.Filter({ type: "highpass", frequency: 1600 }).connect(output)
  const snareNoise = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.18, sustain: 0 } })
  snareNoise.connect(snareHp)
  const snareBody = new Tone.MembraneSynth({
    pitchDecay: 0.01,
    octaves: 2,
    envelope: { attack: 0.001, decay: 0.12, sustain: 0 },
  }).connect(output)
  snareBody.volume.value = -8

  const hatHp = new Tone.Filter({ type: "highpass", frequency: deep ? 7000 : 8500 }).connect(output)
  const chh = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.045, sustain: 0 } })
  chh.connect(hatHp)
  chh.volume.value = -6
  const ohh = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.002, decay: 0.32, sustain: 0 } })
  ohh.connect(hatHp)
  ohh.volume.value = -9

  const ride = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 1.1, release: 0.3 },
    harmonicity: 5.1,
    modulationIndex: 28,
    resonance: 5500,
    octaves: 1.2,
  }).connect(output)
  ride.volume.value = -26

  const shakerBp = new Tone.Filter({ type: "bandpass", frequency: 6500, Q: 1.2 }).connect(output)
  const shaker = new Tone.NoiseSynth({ noise: { type: "pink" }, envelope: { attack: 0.004, decay: 0.06, sustain: 0 } })
  shaker.connect(shakerBp)
  shaker.volume.value = -4

  const conga = new Tone.MembraneSynth({
    pitchDecay: 0.008,
    octaves: 1.5,
    envelope: { attack: 0.001, decay: 0.22, sustain: 0 },
  }).connect(output)
  conga.volume.value = -6

  const rim = new Tone.MembraneSynth({
    pitchDecay: 0.002,
    octaves: 1,
    envelope: { attack: 0.001, decay: 0.04, sustain: 0 },
  }).connect(output)
  rim.volume.value = -6

  const tom = new Tone.MembraneSynth({
    pitchDecay: 0.05,
    octaves: 3,
    envelope: { attack: 0.001, decay: 0.35, sustain: 0 },
  }).connect(output)
  tom.volume.value = -4

  const times = new Map<object, (t: number) => number>()
  const tm = (src: object, t: number) => {
    let f = times.get(src)
    if (!f) {
      f = monotonic()
      times.set(src, f)
    }
    return f(t)
  }

  const hit = (midi: number, time: number, vel: number) => {
    if (midi === DRUM.kick || midi === 35) {
      kick.triggerAttackRelease(deep ? 44 : 50, 0.3, tm(kick, time), vel)
    } else if (midi === DRUM.clap || midi === 40) {
      const t0 = tm(clap, time)
      clap.triggerAttackRelease(0.01, t0, vel * 0.7)
      clap.triggerAttackRelease(0.01, tm(clap, t0 + 0.011), vel * 0.7)
      clap.triggerAttackRelease(0.15, tm(clap, t0 + 0.022), vel)
    } else if (midi === DRUM.snare) {
      snareNoise.triggerAttackRelease(0.15, tm(snareNoise, time), vel)
      snareBody.triggerAttackRelease(190, 0.1, tm(snareBody, time), vel)
    } else if (midi === DRUM.chh || midi === 44) {
      chh.triggerAttackRelease(0.04, tm(chh, time), vel)
    } else if (midi === DRUM.ohh) {
      ohh.triggerAttackRelease(0.3, tm(ohh, time), vel)
    } else if (midi === DRUM.ride || midi === 49 || midi === 53) {
      ride.triggerAttackRelease(320, 0.5, tm(ride, time), vel)
    } else if (midi === DRUM.shaker || midi === 69) {
      shaker.triggerAttackRelease(0.05, tm(shaker, time), vel)
    } else if (midi >= 60 && midi <= 68) {
      conga.triggerAttackRelease(hz(midi - 12), 0.2, tm(conga, time), vel)
    } else if (midi === DRUM.rim) {
      rim.triggerAttackRelease(1700, 0.03, tm(rim, time), vel)
    } else {
      const f = midi <= 41 ? 90 : midi <= 45 ? 130 : 180
      tom.triggerAttackRelease(f, 0.3, tm(tom, time), vel)
    }
  }

  const nodes = [kick, clap, clapFilter, snareHp, snareNoise, snareBody, hatHp, chh, ohh, ride, shakerBp, shaker, conga, rim, tom]
  return {
    output,
    play(ev, time) {
      hit(ev.midi, time, ev.vel)
    },
    noteOn(midi, vel) {
      hit(midi, Tone.now(), vel)
    },
    noteOff() {},
    dispose() {
      nodes.forEach((n) => n.dispose())
      output.dispose()
    },
  }
}

function fxVoice(): Voice {
  const output = new Tone.Gain(Tone.dbToGain(-8))
  const filter = new Tone.Filter({ type: "bandpass", frequency: 400, Q: 1.5 }).connect(output)
  const amp = new Tone.Gain(0).connect(filter)
  const noise = new Tone.Noise("white").connect(amp)
  noise.start()
  const tonalAmp = new Tone.Gain(0).connect(output)
  const tonal = new Tone.Oscillator({ type: "sawtooth", frequency: 200 }).connect(tonalAmp)
  tonal.start()
  const boom = new Tone.MembraneSynth({
    pitchDecay: 0.2,
    octaves: 5,
    envelope: { attack: 0.001, decay: 1.6, sustain: 0 },
  }).connect(output)
  boom.volume.value = 8
  const tb = monotonic()

  const run = (ev: NoteEvent, time: number, dur: number) => {
    const bright = ev.vel
    const f = filter.frequency
    const g = amp.gain
    f.cancelScheduledValues(time)
    g.cancelScheduledValues(time)
    if (ev.midi === FX_TYPE.riser) {
      f.setValueAtTime(300, time)
      f.exponentialRampToValueAtTime(3000 + bright * 9000, time + dur)
      g.setValueAtTime(0.0001, time)
      g.exponentialRampToValueAtTime(0.9, time + dur)
      g.setValueAtTime(0, time + dur + 0.01)
    } else if (ev.midi === FX_TYPE.downlifter) {
      f.setValueAtTime(3000 + bright * 8000, time)
      f.exponentialRampToValueAtTime(200, time + dur)
      g.setValueAtTime(0.9, time)
      g.exponentialRampToValueAtTime(0.001, time + dur)
    } else if (ev.midi === FX_TYPE.sweep) {
      f.setValueAtTime(250, time)
      f.exponentialRampToValueAtTime(4000 + bright * 6000, time + dur / 2)
      f.exponentialRampToValueAtTime(250, time + dur)
      g.setValueAtTime(0.0001, time)
      g.linearRampToValueAtTime(0.5, time + dur / 2)
      g.linearRampToValueAtTime(0, time + dur)
    } else if (ev.midi === FX_TYPE.impact) {
      boom.triggerAttackRelease(38 + bright * 12, 1.5, tb(time), 1)
      f.setValueAtTime(5000, time)
      f.exponentialRampToValueAtTime(300, time + 1.2)
      g.setValueAtTime(0.9, time)
      g.exponentialRampToValueAtTime(0.001, time + 1.4)
    } else if (ev.midi === FX_TYPE.tonalRiser) {
      const tg = tonalAmp.gain
      tg.cancelScheduledValues(time)
      tonal.frequency.cancelScheduledValues(time)
      tonal.frequency.setValueAtTime(110 + bright * 60, time)
      tonal.frequency.exponentialRampToValueAtTime(1200 + bright * 800, time + dur)
      tg.setValueAtTime(0.0001, time)
      tg.exponentialRampToValueAtTime(0.25, time + dur)
      tg.setValueAtTime(0, time + dur + 0.01)
      f.setValueAtTime(400, time)
      f.exponentialRampToValueAtTime(8000, time + dur)
      g.setValueAtTime(0.0001, time)
      g.exponentialRampToValueAtTime(0.4, time + dur)
      g.setValueAtTime(0, time + dur + 0.01)
    }
  }

  return {
    output,
    play(ev, time, stepSec) {
      run(ev, time, ev.dur * stepSec)
    },
    noteOn(midi) {
      const code = (midi % 5) + 1
      run({ step: 0, dur: 16, midi: code, vel: 0.7 }, Tone.now(), code === FX_TYPE.impact ? 1.5 : 1.2)
    },
    noteOff() {},
    dispose() {
      ;[filter, amp, noise, tonalAmp, tonal, boom, output].forEach((n) => n.dispose())
    },
  }
}

export function createVoice(id: PresetId): Voice {
  switch (id) {
    case "kit-house":
      return drumKit(false)
    case "kit-deep":
      return drumKit(true)
    case "fx":
      return fxVoice()

    case "bass-deep":
      return melodic(
        new Tone.MonoSynth({
          oscillator: { type: "sawtooth" },
          filter: { Q: 2, type: "lowpass", rolloff: -24 },
          filterEnvelope: { attack: 0.004, decay: 0.2, sustain: 0.25, release: 0.2, baseFrequency: 110, octaves: 2.6 },
          envelope: { attack: 0.004, decay: 0.3, sustain: 0.7, release: 0.08 },
        }),
        [],
        -6,
      )
    case "bass-sub":
      return melodic(
        new Tone.MonoSynth({
          oscillator: { type: "sine" },
          filter: { Q: 0.5, type: "lowpass" },
          filterEnvelope: { attack: 0.001, decay: 0.1, sustain: 1, release: 0.1, baseFrequency: 400, octaves: 1 },
          envelope: { attack: 0.004, decay: 0.15, sustain: 0.8, release: 0.05 },
        }),
        [],
        -3,
        0.85,
      )
    case "bass-acid": {
      const dist = new Tone.Distortion(0.35)
      return melodic(
        new Tone.MonoSynth({
          oscillator: { type: "sawtooth" },
          filter: { Q: 14, type: "lowpass", rolloff: -24 },
          filterEnvelope: { attack: 0.001, decay: 0.16, sustain: 0.05, release: 0.1, baseFrequency: 180, octaves: 4.2 },
          envelope: { attack: 0.002, decay: 0.2, sustain: 0.5, release: 0.05 },
          portamento: 0.02,
        }),
        [dist],
        -13,
      )
    }
    case "bass-organ":
      return melodic(
        new Tone.MonoSynth({
          oscillator: { type: "custom", partials: [1, 0.7, 0.35, 0.2, 0.1] },
          filter: { Q: 1, type: "lowpass" },
          filterEnvelope: { attack: 0.001, decay: 0.12, sustain: 0.4, release: 0.1, baseFrequency: 250, octaves: 2 },
          envelope: { attack: 0.003, decay: 0.2, sustain: 0.6, release: 0.06 },
        }),
        [],
        -5,
      )
    case "bass-reese":
      return melodic(
        new Tone.MonoSynth({
          oscillator: { type: "fatsawtooth", count: 3, spread: 28 },
          filter: { Q: 2, type: "lowpass", rolloff: -24 },
          filterEnvelope: { attack: 0.05, decay: 0.5, sustain: 0.6, release: 0.3, baseFrequency: 180, octaves: 1.6 },
          envelope: { attack: 0.02, decay: 0.3, sustain: 0.85, release: 0.2 },
        }),
        [],
        -9,
      )
    case "bass-funk":
      return melodic(
        new Tone.MonoSynth({
          oscillator: { type: "pulse", width: 0.35 } as Tone.MonoSynthOptions["oscillator"],
          filter: { Q: 3, type: "lowpass" },
          filterEnvelope: { attack: 0.001, decay: 0.12, sustain: 0.15, release: 0.1, baseFrequency: 160, octaves: 3.2 },
          envelope: { attack: 0.002, decay: 0.18, sustain: 0.4, release: 0.05 },
        }),
        [],
        -7,
        0.8,
      )
    case "bass-garage":
      return melodic(
        new Tone.FMSynth({
          harmonicity: 1,
          modulationIndex: 4,
          envelope: { attack: 0.005, decay: 0.3, sustain: 0.6, release: 0.1 },
          modulationEnvelope: { attack: 0.01, decay: 0.25, sustain: 0.3, release: 0.1 },
        }),
        [new Tone.Filter(900, "lowpass")],
        -5,
      )

    case "keys-m1": {
      const s = new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 2,
        modulationIndex: 7,
        oscillator: { type: "sine" },
        envelope: { attack: 0.002, decay: 0.9, sustain: 0.05, release: 0.5 },
        modulation: { type: "square" },
        modulationEnvelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.3 },
      })
      s.maxPolyphony = 16
      return melodic(s, [new Tone.Filter(5200, "lowpass")], -14)
    }
    case "keys-organ": {
      const s = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "custom", partials: [1, 0.55, 0.35, 0, 0.25, 0, 0, 0.18] },
        envelope: { attack: 0.004, decay: 0.08, sustain: 0.75, release: 0.07 },
      })
      s.maxPolyphony = 16
      return melodic(s, [new Tone.Filter(4200, "lowpass")], -16, 0.8)
    }
    case "keys-rhodes": {
      const s = new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 1,
        modulationIndex: 2.2,
        oscillator: { type: "sine" },
        envelope: { attack: 0.004, decay: 1.6, sustain: 0.25, release: 0.9 },
        modulation: { type: "sine" },
        modulationEnvelope: { attack: 0.002, decay: 0.6, sustain: 0.1, release: 0.4 },
      })
      s.maxPolyphony = 16
      return melodic(s, [new Tone.Tremolo(4, 0.25).start()], -12)
    }
    case "keys-stab": {
      const s = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "fatsawtooth", count: 3, spread: 22 },
        envelope: { attack: 0.002, decay: 0.22, sustain: 0.05, release: 0.12 },
      })
      s.maxPolyphony = 16
      return melodic(s, [new Tone.Filter({ frequency: 2600, type: "lowpass", Q: 2 })], -19)
    }
    case "keys-piano": {
      const s = new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 3,
        modulationIndex: 1.6,
        oscillator: { type: "triangle" },
        envelope: { attack: 0.002, decay: 1.4, sustain: 0.12, release: 0.8 },
        modulationEnvelope: { attack: 0.002, decay: 0.4, sustain: 0.05, release: 0.3 },
      })
      s.maxPolyphony = 16
      return melodic(s, [], -12)
    }
    case "keys-strings": {
      const s = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "fatsawtooth", count: 3, spread: 30 },
        envelope: { attack: 0.25, decay: 0.3, sustain: 0.8, release: 1.1 },
      })
      s.maxPolyphony = 16
      return melodic(s, [new Tone.Filter(3200, "lowpass"), new Tone.Chorus(3, 2.5, 0.4).start()], -20)
    }

    case "synth-pluck": {
      const s = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "fatsquare", count: 2, spread: 16 },
        envelope: { attack: 0.002, decay: 0.18, sustain: 0, release: 0.2 },
      })
      s.maxPolyphony = 10
      return melodic(s, [new Tone.Filter({ frequency: 3000, type: "lowpass", Q: 1 })], -16)
    }
    case "synth-arp": {
      const s = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "sawtooth" },
        envelope: { attack: 0.003, decay: 0.14, sustain: 0.1, release: 0.15 },
      })
      s.maxPolyphony = 10
      return melodic(s, [new Tone.Filter({ frequency: 1800, type: "lowpass", Q: 3 })], -12)
    }
    case "synth-bell": {
      const s = new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 3.01,
        modulationIndex: 12,
        envelope: { attack: 0.001, decay: 1.1, sustain: 0, release: 0.8 },
        modulationEnvelope: { attack: 0.001, decay: 0.5, sustain: 0, release: 0.5 },
      })
      s.maxPolyphony = 10
      return melodic(s, [], -18)
    }
    case "synth-lead":
      return melodic(
        new Tone.MonoSynth({
          oscillator: { type: "fatsawtooth", count: 3, spread: 18 },
          filter: { Q: 2, type: "lowpass" },
          filterEnvelope: { attack: 0.005, decay: 0.2, sustain: 0.4, release: 0.2, baseFrequency: 600, octaves: 3 },
          envelope: { attack: 0.004, decay: 0.2, sustain: 0.6, release: 0.1 },
          portamento: 0.03,
        }),
        [],
        -15,
      )
    case "synth-chime": {
      const s = new Tone.PolySynth(Tone.AMSynth, {
        harmonicity: 2.5,
        oscillator: { type: "sine" },
        envelope: { attack: 0.001, decay: 0.45, sustain: 0, release: 0.3 },
        modulationEnvelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.2 },
      })
      s.maxPolyphony = 10
      return melodic(s, [], -10)
    }

    case "pad-warm": {
      const s = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "fatsawtooth", count: 3, spread: 35 },
        envelope: { attack: 0.7, decay: 0.5, sustain: 0.8, release: 2 },
      })
      s.maxPolyphony = 14
      return melodic(s, [new Tone.Filter(1100, "lowpass")], -19)
    }
    case "pad-air": {
      const s = new Tone.PolySynth(Tone.AMSynth, {
        harmonicity: 2,
        oscillator: { type: "sine" },
        envelope: { attack: 1, decay: 0.5, sustain: 0.8, release: 2.5 },
      })
      s.maxPolyphony = 14
      return melodic(s, [new Tone.Chorus(1.5, 3, 0.5).start()], -14)
    }
    case "pad-dark": {
      const s = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "fattriangle", count: 3, spread: 25 },
        envelope: { attack: 0.6, decay: 0.4, sustain: 0.85, release: 1.8 },
      })
      s.maxPolyphony = 14
      return melodic(s, [new Tone.Filter(700, "lowpass")], -12)
    }

    case "vox-chop":
      return vox([800, 1150, 2900], { attack: 0.005, decay: 0.12, sustain: 0.3, release: 0.08 }, -8)
    case "vox-ooh":
      return vox([320, 800, 2240], { attack: 0.35, decay: 0.3, sustain: 0.8, release: 1.2 }, -8)
    case "vox-ee":
      return vox([280, 2250, 2900], { attack: 0.005, decay: 0.2, sustain: 0.35, release: 0.12 }, -8)
  }
}
