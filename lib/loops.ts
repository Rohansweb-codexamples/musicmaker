import type { PresetId } from "./instruments"
import {
  chordMidis,
  degreeToMidi,
  foldVoicing,
  hashString,
  keyLabel,
  mulberry32,
  pick,
  type Mode,
  type Rng,
} from "./music"

export type Category =
  | "beats"
  | "kick"
  | "hats"
  | "percussion"
  | "bass"
  | "keys"
  | "synth"
  | "pads"
  | "vocals"
  | "fx"

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: "beats", label: "Beats" },
  { id: "kick", label: "Kick" },
  { id: "hats", label: "Hats" },
  { id: "percussion", label: "Percussion" },
  { id: "bass", label: "Bass" },
  { id: "keys", label: "Keys" },
  { id: "synth", label: "Synth" },
  { id: "pads", label: "Pads" },
  { id: "vocals", label: "Vocals" },
  { id: "fx", label: "FX" },
]

export const DRUM_CATEGORIES: Category[] = ["beats", "kick", "hats", "percussion"]

export const DESCRIPTORS = ["Dark", "Cheerful", "Relaxed", "Intense", "Groovy", "Melodic", "Clean", "Distorted"]

export interface NoteEvent {
  step: number
  dur: number
  midi: number
  vel: number
}

export interface LoopInfo {
  id: string
  name: string
  category: Category
  genre: string
  root: number | null
  mode: Mode | null
  keyText: string
  bars: number
  preset: PresetId
  descriptors: string[]
  drums: boolean
  search: string
}

interface GenCtx {
  root: number
  mode: Mode
  prog: number[]
  variant: number
  rng: Rng
}

interface StyleDef {
  id: string
  name: string
  category: Category
  genre: string
  preset: PresetId
  mode: Mode | null
  descriptors: string[]
  bars: number | ((variant: number) => number)
  variants: number
  keyed: boolean
  gen: (ctx: GenCtx) => NoteEvent[]
}

// ---------------------------------------------------------------------------
// Pattern helpers
// ---------------------------------------------------------------------------

const PROGS: Record<Mode, number[][]> = {
  min: [
    [0, 5, 2, 6],
    [0, 3, 4, 0],
    [0, 6, 5, 6],
    [0, 3, 6, 2],
    [0, 0, 3, 3],
    [5, 6, 0, 0],
    [0, 4, 5, 3],
    [3, 4, 0, 0],
  ],
  maj: [
    [0, 4, 5, 3],
    [3, 4, 2, 5],
    [0, 5, 3, 4],
    [1, 4, 0, 0],
    [0, 3, 0, 4],
    [5, 3, 0, 4],
    [3, 0, 4, 5],
    [0, 2, 3, 4],
  ],
}

const BASS_CHAR: Record<string, number> = { R: 0, O: 7, F: 4, T: 2, S: 6, L: -1, D: -3 }

/** Parse a 16-step melodic pattern string. Uppercase = accent, lowercase = ghost, "-" ties, "." rests. */
function parsePattern(
  pattern: string,
  bar: number,
  toMidis: (ch: string) => number[] | null,
  vel = 0.9,
): NoteEvent[] {
  const out: NoteEvent[] = []
  let last: NoteEvent[] = []
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === "-") {
      for (const n of last) n.dur++
      continue
    }
    if (c === ".") {
      last = []
      continue
    }
    const upper = c.toUpperCase()
    const ghost = c !== upper
    const midis = toMidis(upper)
    if (!midis) {
      last = []
      continue
    }
    last = midis.map((m) => ({ step: bar * 16 + i, dur: 1, midi: m, vel: ghost ? vel * 0.55 : vel }))
    out.push(...last)
  }
  return out
}

function drumHits(pattern: string, midi: number, bar: number, vel = 0.9, rng?: Rng): NoteEvent[] {
  const out: NoteEvent[] = []
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === ".") continue
    let v = c === "X" ? 1 : c === "x" ? vel : vel * 0.45
    if (rng) v *= 0.88 + rng() * 0.12
    out.push({ step: bar * 16 + i, dur: 1, midi, vel: Math.min(1, v) })
  }
  return out
}

function tonic(root: number, cMidi: number) {
  return cMidi + root - (root >= 8 ? 12 : 0)
}

function mutate(pattern: string, rng: Rng, amount: number, chars: string) {
  return pattern
    .split("")
    .map((c) => (c === "." && rng() < amount ? pick(rng, chars.split("")) : c))
    .join("")
}

// ---------------------------------------------------------------------------
// Bass
// ---------------------------------------------------------------------------

function bassStyle(
  id: string,
  name: string,
  preset: PresetId,
  genre: string,
  mode: Mode,
  descriptors: string[],
  patterns: string[] | null,
): StyleDef {
  return {
    id,
    name,
    category: "bass",
    genre,
    preset,
    mode,
    descriptors,
    bars: 4,
    variants: 8,
    keyed: true,
    gen: ({ root, mode, prog, variant, rng }) => {
      const base = 24 + root + (root < 4 ? 12 : 0)
      const notes: NoteEvent[] = []
      let acid: string | null = null
      if (!patterns) {
        acid = Array.from({ length: 16 }, (_, i) =>
          i === 0 ? "R" : rng() < 0.68 ? pick(rng, ["R", "R", "O", "r", "o", "F", "S", "T", "-"]) : ".",
        ).join("")
      }
      for (let b = 0; b < 4; b++) {
        let pat = acid ?? patterns![(variant + (b === 3 ? 1 : 0)) % patterns!.length]
        if (patterns && variant >= patterns.length && b % 2 === 1) pat = mutate(pat, rng, 0.12, "rof")
        const deg = prog[b]
        notes.push(
          ...parsePattern(pat, b, (ch) => {
            const off = BASS_CHAR[ch]
            if (off === undefined) return null
            return [degreeToMidi(base, mode, deg + off) - (off === 0 && deg >= 5 ? 12 : 0)]
          }),
        )
      }
      return notes
    },
  }
}

const BASS_STYLES: StyleDef[] = [
  bassStyle("bass-deep-night", "Deep Night Bass", "bass-deep", "Deep House", "min", ["Dark", "Relaxed", "Groovy"], [
    "..R-..R-..R-..R-",
    "..R...R...R..OR.",
    "..R-..R-..R-.RO-",
    "R.R-..R-..R-..F-",
  ]),
  bassStyle("bass-rolling-sub", "Rolling Sub", "bass-sub", "Tech House", "min", ["Dark", "Intense"], [
    ".RRR.RRR.RRR.RRR",
    ".RR..RR..RR..RRO",
    ".RRR.RRR.RRO.RRF",
    "..RR.RRR..RR.ROR",
  ]),
  bassStyle("bass-acid-pulse", "Acid Pulse", "bass-acid", "Acid House", "min", ["Intense", "Distorted"], null),
  bassStyle("bass-organ-groove", "Organ Groove Bass", "bass-organ", "Classic House", "maj", ["Cheerful", "Groovy"], [
    "R..R..R...R.R.O.",
    "R-.R..O...R.R-F.",
    "R..R..R-..R..TF.",
    "R-.R.O..R-..F.O.",
  ]),
  bassStyle("bass-reese-low", "Reese Low End", "bass-reese", "Progressive", "min", ["Dark", "Distorted"], [
    "R-------.R------",
    "R-----R-R-------",
    "R-------F-------",
    "R---------R-O---",
  ]),
  bassStyle("bass-disco-octave", "Disco Octaves", "bass-funk", "Nu Disco", "maj", ["Cheerful", "Groovy"], [
    "R.O.R.O.R.O.R.O.",
    "R.O.R.O.RRO.R.OF",
    "R.OrR.O.R.OrR.OF",
  ]),
  bassStyle("bass-garage-wobble", "Garage Wobble", "bass-garage", "UK Garage", "min", ["Groovy", "Intense"], [
    "R-..R..R..R-.R..",
    "R-...R.R.R..R...",
    "R..R...R.R.R..R.",
    "R-.R...RR..R.F..",
  ]),
  bassStyle("bass-funky-slap", "Funky Slap", "bass-funk", "Funky House", "maj", ["Cheerful", "Groovy"], [
    "R..rO.R.r.R.OrF.",
    "R.rR..O.R.r..OF.",
    "R..R.rO..R.rR.O.",
  ]),
]

// ---------------------------------------------------------------------------
// Keys / chords
// ---------------------------------------------------------------------------

function chordStyle(
  id: string,
  name: string,
  preset: PresetId,
  genre: string,
  mode: Mode,
  descriptors: string[],
  size: 3 | 4 | 5,
  patterns: string[],
  range: [number, number] = [52, 74],
  vel = 0.75,
): StyleDef {
  return {
    id,
    name,
    category: "keys",
    genre,
    preset,
    mode,
    descriptors,
    bars: 4,
    variants: 8,
    keyed: true,
    gen: ({ root, mode, prog, variant }) => {
      const notes: NoteEvent[] = []
      const base = tonic(root, 48)
      for (let b = 0; b < 4; b++) {
        const raw = chordMidis(base, mode, prog[b], size)
        const voicing = foldVoicing(size === 5 ? raw.slice(1) : raw, range[0], range[1])
        const pat = patterns[(variant + (b === 3 ? 1 : 0)) % patterns.length]
        notes.push(...parsePattern(pat, b, (ch) => (ch === "X" ? voicing : null), vel))
      }
      return notes
    },
  }
}

const KEYS_STYLES: StyleDef[] = [
  chordStyle("keys-house-piano", "House Piano", "keys-m1", "Classic House", "maj", ["Cheerful", "Intense"], 4, [
    "X..X..X...X.X...",
    "X-.X..X-..X..X..",
    "..X..X..X...X...",
    "X..X..X.X..X..X.",
  ]),
  chordStyle("keys-organ-stab", "Organ Stab", "keys-organ", "Classic House", "min", ["Groovy", "Cheerful"], 3, [
    "..X...X...X...X.",
    "..X...X...X..X-.",
    "X.X...X...X...X.",
    "..X-..X-..X-..X-",
  ]),
  chordStyle("keys-deep-rhodes", "Deep Rhodes", "keys-rhodes", "Deep House", "min", ["Relaxed", "Dark", "Melodic"], 5, [
    "X-----..X--.X---",
    "X-------..X-----",
    "..X-----..X-..X-",
    "X--.X--...X-----",
  ]),
  chordStyle("keys-saw-stab", "Saw Stab", "keys-stab", "Tech House", "min", ["Intense", "Distorted"], 4, [
    "X..X..X...X..X..",
    "...X..X....X..X.",
    "X.....X...X.....",
    "..X..X....X..X..",
  ], [55, 76], 0.7),
  chordStyle("keys-soul-keys", "Soul Keys", "keys-piano", "Soulful", "maj", ["Relaxed", "Melodic", "Cheerful"], 5, [
    "X---..X-..X---..",
    "X-..X-..X-..X-X-",
    "..X-..X-..X-..X-",
    "X---X-..X---..X-",
  ]),
  chordStyle("keys-disco-strings", "Disco Strings", "keys-strings", "Nu Disco", "maj", ["Cheerful", "Melodic"], 4, [
    "X---------------",
    "X-------X-------",
    "X-----X-----X---",
  ], [57, 79], 0.6),
]

// ---------------------------------------------------------------------------
// Synths
// ---------------------------------------------------------------------------

const ARP_MASKS = ["xxxxxxxxxxxxxxxx", "x.xxx.xxx.xxx.xx", "xx.xx.xx.xx.xx.x", "x.x.x.x.x.x.x.x.", "x.xx.x.xx.xx.x.x"]

function arpStyle(
  id: string,
  name: string,
  preset: PresetId,
  genre: string,
  mode: Mode,
  descriptors: string[],
  cMidi: number,
): StyleDef {
  return {
    id,
    name,
    category: "synth",
    genre,
    preset,
    mode,
    descriptors,
    bars: 4,
    variants: 8,
    keyed: true,
    gen: ({ root, mode, prog, variant, rng }) => {
      const notes: NoteEvent[] = []
      const base = tonic(root, cMidi)
      const mask = ARP_MASKS[variant % ARP_MASKS.length]
      const order = ["up", "down", "updown", "random"][Math.floor(variant / 2) % 4]
      const randomOrder = Array.from({ length: 16 }, () => Math.floor(rng() * 5))
      for (let b = 0; b < 4; b++) {
        const chord = foldVoicing(chordMidis(base, mode, prog[b], 4), cMidi, cMidi + 16)
        const tones = [...chord, chord[0] + 12]
        const seq =
          order === "up"
            ? tones
            : order === "down"
              ? [...tones].reverse()
              : order === "updown"
                ? [...tones, ...tones.slice(1, -1).reverse()]
                : randomOrder.map((r) => tones[r % tones.length])
        let k = 0
        for (let i = 0; i < 16; i++) {
          if (mask[i] !== "x") continue
          notes.push({ step: b * 16 + i, dur: 1, midi: seq[k % seq.length], vel: i % 4 === 0 ? 0.85 : 0.65 })
          k++
        }
      }
      return notes
    },
  }
}

const MOTIF_RHYTHMS = [
  "x..x..x...x.x...",
  "x.x...x.x..x....",
  "..x..x..x..x.x..",
  "x...x.x...x..x..",
  "x..x...x..x.x.x.",
  "...x..x...x..x..",
]

function motifStyle(
  id: string,
  name: string,
  preset: PresetId,
  genre: string,
  mode: Mode,
  descriptors: string[],
  cMidi: number,
  category: Category = "synth",
  pool: number[] = [0, 2, 4, 7, 4, 2, 9, 1],
  gate = 2,
): StyleDef {
  return {
    id,
    name,
    category,
    genre,
    preset,
    mode,
    descriptors,
    bars: 4,
    variants: category === "vocals" ? 6 : 8,
    keyed: true,
    gen: ({ root, mode, prog, variant, rng }) => {
      const notes: NoteEvent[] = []
      const base = tonic(root, cMidi)
      const rhythm = MOTIF_RHYTHMS[variant % MOTIF_RHYTHMS.length]
      const degs = Array.from({ length: 16 }, () => pick(rng, pool))
      for (let b = 0; b < 4; b++) {
        const follow = variant % 2 === 0 ? prog[b] : prog[b] % 2 === 0 ? 0 : 2
        for (let i = 0; i < 16; i++) {
          if (rhythm[i] !== "x") continue
          notes.push({
            step: b * 16 + i,
            dur: gate,
            midi: degreeToMidi(base, mode, follow + degs[i]),
            vel: i % 4 === 0 ? 0.85 : 0.7,
          })
        }
      }
      return notes
    },
  }
}

const SYNTH_STYLES: StyleDef[] = [
  arpStyle("synth-pluck-arp", "Pluck Arp", "synth-pluck", "Progressive", "min", ["Melodic", "Intense"], 60),
  arpStyle("synth-night-arp", "Night Arp", "synth-arp", "Deep House", "min", ["Dark", "Melodic"], 57),
  motifStyle("synth-bell-hook", "Bell Hook", "synth-bell", "Melodic House", "maj", ["Cheerful", "Melodic", "Clean"], 72),
  motifStyle("synth-lead-riff", "Lead Riff", "synth-lead", "Tech House", "min", ["Intense", "Distorted"], 60, "synth", [0, 0, 2, 4, 6, 7, -1], 1),
  motifStyle("synth-acid-riff", "Acid Riff", "bass-acid", "Acid House", "min", ["Intense", "Distorted", "Dark"], 48, "synth", [0, 0, 7, 3, 6, 4, -2], 1),
  motifStyle("synth-chime-groove", "Chime Groove", "synth-chime", "Afro House", "min", ["Groovy", "Relaxed", "Clean"], 67, "synth", [0, 2, 4, 7, 9, 11], 1),
]

// ---------------------------------------------------------------------------
// Pads & vocals
// ---------------------------------------------------------------------------

function padStyle(
  id: string,
  name: string,
  preset: PresetId,
  genre: string,
  mode: Mode,
  descriptors: string[],
  category: Category,
  range: [number, number],
  size: 3 | 4 | 5 = 4,
): StyleDef {
  return {
    id,
    name,
    category,
    genre,
    preset,
    mode,
    descriptors,
    bars: 4,
    variants: 6,
    keyed: true,
    gen: ({ root, mode, prog }) => {
      const base = tonic(root, 48)
      const notes: NoteEvent[] = []
      for (let b = 0; b < 4; b++) {
        const v = foldVoicing(chordMidis(base, mode, prog[b], size), range[0], range[1])
        for (const m of v) notes.push({ step: b * 16, dur: 16, midi: m, vel: 0.6 })
      }
      return notes
    },
  }
}

const PAD_STYLES: StyleDef[] = [
  padStyle("pad-warm", "Warm Pad", "pad-warm", "Deep House", "min", ["Relaxed", "Dark"], "pads", [53, 72]),
  padStyle("pad-air", "Air Pad", "pad-air", "Melodic House", "maj", ["Relaxed", "Melodic", "Clean"], "pads", [60, 81], 5),
  padStyle("pad-dark", "Dark Pad", "pad-dark", "Tech House", "min", ["Dark", "Intense"], "pads", [48, 67]),
  padStyle("pad-strings", "String Pad", "keys-strings", "Progressive", "maj", ["Melodic", "Cheerful"], "pads", [55, 76]),
]

const VOCAL_STYLES: StyleDef[] = [
  motifStyle("vox-chop", "Vox Chop", "vox-chop", "UK Garage", "min", ["Groovy", "Intense"], 67, "vocals", [0, 2, 4, 7, 4, 9], 1),
  padStyle("vox-ooh-choir", "Ooh Choir", "vox-ooh", "Deep House", "maj", ["Relaxed", "Melodic"], "vocals", [57, 74], 3),
  motifStyle("vox-ee-stabs", "Ee Stabs", "vox-ee", "Classic House", "maj", ["Cheerful", "Groovy"], 64, "vocals", [0, 2, 4, 2, 4, 7], 2),
]

// ---------------------------------------------------------------------------
// Drums
// ---------------------------------------------------------------------------

export const DRUM = {
  kick: 36,
  rim: 37,
  snare: 38,
  clap: 39,
  tomLow: 41,
  chh: 42,
  tomMid: 45,
  ohh: 46,
  tomHigh: 48,
  ride: 51,
  congaLow: 62,
  congaMid: 63,
  congaHigh: 64,
  shaker: 70,
}

const KICKS = {
  four: ["x...x...x...x...", "x...x...x...x.o.", "x...x...x..ox...", "x...x..ox...x..."],
  garage: ["x.....x...x.....", "x......x..x.....", "x.....x.x.......", "x......x...x...."],
}
const CLAPS = ["....x.......x...", "....x.......x..o", "....x..o....x...", "....x.......x.o.", "....x...o...x..."]
const CHH = ["..x...x...x...x.", "x.x.x.x.x.x.x.x.", "xoxoxoxoxoxoxoxo", "o.x.o.x.o.x.o.x.", "..x.o.x...x.o.xo", "ooxoooxoooxoooxo"]
const OHH = ["..x...x...x...x.", "......x.......x.", "..x.......x....."]
const SHK = ["xoxoxoxoxoxoxoxo", "oxoooxoooxoooxoo", "xooxxooxxooxxoox"]
const PERC = ["..x..x.x..x...x.", "x..x..x...x.x...", "...x..x..x....x.", ".x..x..x.x..x..."]
const RIDE = ["x.x.x.x.x.x.x.x.", "..x...x...x...x."]
const RIM = ["...x..x....x..x.", "......x..x......", "..x..x....x..x.."]
const FILL = ["............x.xx", "..........x.x.xx", "............xxxx"]

interface BeatCfg {
  kicks: string[]
  snare?: boolean
  hats: number[]
  ohh: number
  shaker: number
  perc: number
  ride: number
  rim: number
}

function beatStyle(
  id: string,
  name: string,
  preset: PresetId,
  genre: string,
  descriptors: string[],
  cfg: BeatCfg,
): StyleDef {
  return {
    id,
    name,
    category: "beats",
    genre,
    preset,
    mode: null,
    descriptors,
    bars: 2,
    variants: 40,
    keyed: false,
    gen: ({ variant, rng }) => {
      const notes: NoteEvent[] = []
      const kick = cfg.kicks[variant % cfg.kicks.length]
      const clap = CLAPS[Math.floor(variant / 2) % CLAPS.length]
      const hat = CHH[cfg.hats[Math.floor(variant / 3) % cfg.hats.length]]
      const useOhh = rng() < cfg.ohh
      const useShk = rng() < cfg.shaker
      const usePerc = rng() < cfg.perc
      const useRide = rng() < cfg.ride
      const useRim = rng() < cfg.rim
      const ohh = pick(rng, OHH)
      const shk = pick(rng, SHK)
      const perc = pick(rng, PERC)
      const rim = pick(rng, RIM)
      const fill = variant % 4 === 3 ? pick(rng, FILL) : null
      for (let b = 0; b < 2; b++) {
        notes.push(...drumHits(kick, DRUM.kick, b, 1))
        notes.push(...drumHits(clap, cfg.snare ? DRUM.snare : DRUM.clap, b, 0.85))
        notes.push(...drumHits(hat, DRUM.chh, b, 0.7, rng))
        if (useOhh) notes.push(...drumHits(ohh, DRUM.ohh, b, 0.6))
        if (useShk) notes.push(...drumHits(shk, DRUM.shaker, b, 0.5, rng))
        if (usePerc) notes.push(...drumHits(perc, b % 2 ? DRUM.congaHigh : DRUM.congaMid, b, 0.6, rng))
        if (useRide) notes.push(...drumHits(RIDE[variant % 2], DRUM.ride, b, 0.45))
        if (useRim) notes.push(...drumHits(rim, DRUM.rim, b, 0.6))
        if (fill && b === 1) notes.push(...drumHits(fill, DRUM.tomMid, b, 0.75))
      }
      return notes
    },
  }
}

function simpleDrumStyle(
  id: string,
  name: string,
  category: Category,
  preset: PresetId,
  genre: string,
  descriptors: string[],
  variants: number,
  layers: (variant: number, rng: Rng) => [string[], number, number][],
): StyleDef {
  return {
    id,
    name,
    category,
    genre,
    preset,
    mode: null,
    descriptors,
    bars: 2,
    variants,
    keyed: false,
    gen: ({ variant, rng }) => {
      const notes: NoteEvent[] = []
      for (const [pool, midi, vel] of layers(variant, rng)) {
        const pat = pool[variant % pool.length]
        for (let b = 0; b < 2; b++) {
          const p = b === 1 && variant >= pool.length ? mutate(pat, rng, 0.1, "o") : pat
          notes.push(...drumHits(p, midi, b, vel, rng))
        }
      }
      return notes
    },
  }
}

export const DRUM_STYLES: StyleDef[] = [
  beatStyle("beat-deep-groove", "Deep Groove Beat", "kit-deep", "Deep House", ["Relaxed", "Groovy"], {
    kicks: KICKS.four, hats: [0, 3, 5], ohh: 0.5, shaker: 0.7, perc: 0.3, ride: 0.1, rim: 0.4,
  }),
  beatStyle("beat-tech-drive", "Tech Drive Beat", "kit-house", "Tech House", ["Intense", "Groovy"], {
    kicks: KICKS.four, hats: [2, 4, 1], ohh: 0.8, shaker: 0.4, perc: 0.5, ride: 0.3, rim: 0.5,
  }),
  beatStyle("beat-classic-909", "Classic 909 Beat", "kit-house", "Classic House", ["Cheerful", "Intense"], {
    kicks: KICKS.four, hats: [1, 2, 0], ohh: 0.9, shaker: 0.2, perc: 0.1, ride: 0.5, rim: 0.2,
  }),
  beatStyle("beat-garage-shuffle", "Garage Shuffle", "kit-house", "UK Garage", ["Groovy", "Intense"], {
    kicks: KICKS.garage, snare: true, hats: [4, 5, 3], ohh: 0.4, shaker: 0.7, perc: 0.3, ride: 0.1, rim: 0.6,
  }),
  beatStyle("beat-disco", "Disco Beat", "kit-deep", "Nu Disco", ["Cheerful", "Groovy"], {
    kicks: KICKS.four, snare: true, hats: [1, 2], ohh: 1, shaker: 0.5, perc: 0.3, ride: 0, rim: 0,
  }),
  beatStyle("beat-afro-groove", "Afro Groove", "kit-deep", "Afro House", ["Groovy", "Relaxed"], {
    kicks: KICKS.four, hats: [3, 5], ohh: 0.2, shaker: 1, perc: 1, ride: 0.1, rim: 0.7,
  }),
  beatStyle("beat-big-room", "Big Room Beat", "kit-house", "Progressive", ["Intense"], {
    kicks: [KICKS.four[0]], hats: [0, 1], ohh: 0.9, shaker: 0.2, perc: 0.1, ride: 0.6, rim: 0,
  }),
  beatStyle("beat-minimal-tick", "Minimal Tick", "kit-deep", "Minimal", ["Dark", "Clean"], {
    kicks: KICKS.four, hats: [3, 4, 5], ohh: 0.3, shaker: 0.3, perc: 0.4, ride: 0.2, rim: 0.9,
  }),
  simpleDrumStyle("kick-four", "Four On The Floor", "kick", "kit-house", "Tech House", ["Intense", "Clean"], 10, () => [
    [KICKS.four, DRUM.kick, 1],
  ]),
  simpleDrumStyle("kick-deep", "Deep Kick", "kick", "kit-deep", "Deep House", ["Relaxed", "Clean"], 10, () => [
    [KICKS.four, DRUM.kick, 1],
  ]),
  simpleDrumStyle("kick-garage", "2-Step Kick", "kick", "kit-house", "UK Garage", ["Groovy"], 10, () => [
    [KICKS.garage, DRUM.kick, 1],
  ]),
  simpleDrumStyle("hats-offbeat", "Offbeat Hats", "hats", "kit-house", "Classic House", ["Groovy", "Clean"], 16, (v) => [
    [OHH, DRUM.ohh, 0.7],
    ...(v % 2 ? [[CHH.slice(1, 3), DRUM.chh, 0.5] as [string[], number, number]] : []),
  ]),
  simpleDrumStyle("hats-shuffle", "Shuffle Hats", "hats", "kit-house", "UK Garage", ["Groovy"], 16, () => [
    [[CHH[4], CHH[5], CHH[3]], DRUM.chh, 0.75],
  ]),
  simpleDrumStyle("hats-sixteenth", "16th Hats", "hats", "kit-house", "Tech House", ["Intense"], 16, (v) => [
    [[CHH[2], CHH[5]], DRUM.chh, 0.7],
    ...(v % 3 === 0 ? [[OHH, DRUM.ohh, 0.55] as [string[], number, number]] : []),
  ]),
  simpleDrumStyle("hats-open", "Open Hat Groove", "hats", "kit-deep", "Deep House", ["Relaxed", "Groovy"], 16, () => [
    [OHH, DRUM.ohh, 0.65],
    [[CHH[0], CHH[3]], DRUM.chh, 0.45],
  ]),
  simpleDrumStyle("hats-ride", "Ride Groove", "hats", "kit-house", "Progressive", ["Intense"], 16, () => [[RIDE, DRUM.ride, 0.55]]),
  simpleDrumStyle("perc-conga", "Conga Groove", "percussion", "kit-deep", "Afro House", ["Groovy", "Relaxed"], 16, () => [
    [PERC, DRUM.congaMid, 0.7],
    [[PERC[2], PERC[3]], DRUM.congaHigh, 0.6],
    [[PERC[1]], DRUM.congaLow, 0.6],
  ]),
  simpleDrumStyle("perc-shaker", "Shaker Loop", "percussion", "kit-deep", "Deep House", ["Relaxed"], 16, () => [
    [SHK, DRUM.shaker, 0.6],
  ]),
  simpleDrumStyle("perc-rim", "Rim Shots", "percussion", "kit-house", "Minimal", ["Clean", "Groovy"], 16, () => [
    [RIM, DRUM.rim, 0.7],
  ]),
  simpleDrumStyle("perc-tops", "Tops Loop", "percussion", "kit-house", "Tech House", ["Intense", "Groovy"], 16, () => [
    [CHH, DRUM.chh, 0.6],
    [SHK, DRUM.shaker, 0.45],
    [OHH, DRUM.ohh, 0.5],
  ]),
  simpleDrumStyle("perc-clap", "Clap Pattern", "percussion", "kit-house", "Classic House", ["Cheerful"], 16, () => [
    [CLAPS, DRUM.clap, 0.85],
  ]),
  simpleDrumStyle("perc-tom-fill", "Tom Fill", "percussion", "kit-deep", "Progressive", ["Intense"], 16, () => [
    [FILL, DRUM.tomMid, 0.8],
    [["..............x.", "...........x..x."], DRUM.tomLow, 0.8],
  ]),
]

// ---------------------------------------------------------------------------
// FX
// ---------------------------------------------------------------------------

export const FX_TYPE = { riser: 1, downlifter: 2, impact: 3, sweep: 4, tonalRiser: 5 }

function fxStyle(id: string, name: string, code: number, descriptors: string[], fixedBars?: number): StyleDef {
  const lengths = [1, 2, 4, 8]
  return {
    id,
    name,
    category: "fx",
    genre: "Transitions",
    preset: "fx",
    mode: null,
    descriptors,
    bars: (v) => fixedBars ?? lengths[v % 4],
    variants: 16,
    keyed: false,
    gen: ({ variant }) => {
      const bars = fixedBars ?? lengths[variant % 4]
      return [{ step: 0, dur: bars * 16, midi: code, vel: 0.45 + Math.floor(variant / 4) * 0.17 }]
    },
  }
}

const FX_STYLES: StyleDef[] = [
  fxStyle("fx-noise-riser", "Noise Riser", FX_TYPE.riser, ["Intense"]),
  fxStyle("fx-downlifter", "Downlifter", FX_TYPE.downlifter, ["Dark"]),
  fxStyle("fx-impact", "Impact Hit", FX_TYPE.impact, ["Intense", "Distorted"], 1),
  fxStyle("fx-sweep", "Filter Sweep", FX_TYPE.sweep, ["Relaxed"]),
  fxStyle("fx-tonal-riser", "Tonal Riser", FX_TYPE.tonalRiser, ["Intense", "Melodic"]),
]

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

const ALL_STYLES = [
  ...DRUM_STYLES,
  ...BASS_STYLES,
  ...KEYS_STYLES,
  ...SYNTH_STYLES,
  ...PAD_STYLES,
  ...VOCAL_STYLES,
  ...FX_STYLES,
]

const STYLE_BY_ID = new Map(ALL_STYLES.map((s) => [s.id, s]))
const loopMeta = new Map<string, { style: StyleDef; root: number; variant: number }>()

function buildLibrary(): LoopInfo[] {
  const loops: LoopInfo[] = []
  for (const style of ALL_STYLES) {
    const roots = style.keyed ? Array.from({ length: 12 }, (_, i) => i) : [0]
    for (const root of roots) {
      for (let v = 0; v < style.variants; v++) {
        const id = loopId(style.id, style.keyed ? root : null, v)
        const bars = typeof style.bars === "function" ? style.bars(v) : style.bars
        const r = style.keyed ? root : null
        const keyText = keyLabel(r, style.mode)
        const name = `${style.name} ${String(v + 1).padStart(2, "0")}`
        loops.push({
          id,
          name,
          category: style.category,
          genre: style.genre,
          root: r,
          mode: style.keyed ? style.mode : null,
          keyText,
          bars,
          preset: style.preset,
          descriptors: style.descriptors,
          drums: DRUM_CATEGORIES.includes(style.category),
          search: `${name} ${style.genre} ${style.category} ${keyText} ${style.descriptors.join(" ")}`.toLowerCase(),
        })
        loopMeta.set(id, { style, root, variant: v })
      }
    }
  }
  return loops
}

export function loopId(styleId: string, root: number | null, variant: number) {
  return `${styleId}.${root ?? "x"}.${variant}`
}

export const LOOPS: LoopInfo[] = buildLibrary()
export const LOOP_BY_ID = new Map(LOOPS.map((l) => [l.id, l]))
export const GENRES = Array.from(new Set(ALL_STYLES.map((s) => s.genre))).sort()

const notesCache = new Map<string, NoteEvent[]>()

export function getLoopNotes(id: string): NoteEvent[] {
  const cached = notesCache.get(id)
  if (cached) return cached
  const meta = loopMeta.get(id)
  if (!meta) return []
  const { style, root, variant } = meta
  const mode = style.mode ?? "min"
  const rng = mulberry32(hashString(id))
  const prog = PROGS[mode][variant % PROGS[mode].length]
  const notes = style.gen({ root, mode, prog, variant, rng })
  notesCache.set(id, notes)
  return notes
}

export function styleExists(id: string) {
  return STYLE_BY_ID.has(id)
}
