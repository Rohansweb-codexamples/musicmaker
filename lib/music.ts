export const KEY_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]

export type Mode = "min" | "maj"

export const SCALES: Record<Mode, number[]> = {
  min: [0, 2, 3, 5, 7, 8, 10],
  maj: [0, 2, 4, 5, 7, 9, 11],
}

export function keyLabel(root: number | null, mode: Mode | null) {
  if (root === null || mode === null) return "–"
  return `${KEY_NAMES[root]} ${mode === "min" ? "min" : "maj"}`
}

/** MIDI note for a scale degree (0-based, may exceed 6 or be negative). baseMidi is the tonic. */
export function degreeToMidi(baseMidi: number, mode: Mode, degree: number) {
  const scale = SCALES[mode]
  const oct = Math.floor(degree / 7)
  const idx = ((degree % 7) + 7) % 7
  return baseMidi + scale[idx] + oct * 12
}

export function chordMidis(baseMidi: number, mode: Mode, degree: number, size: 3 | 4 | 5) {
  const notes: number[] = []
  for (let i = 0; i < size; i++) notes.push(degreeToMidi(baseMidi, mode, degree + i * 2))
  return notes
}

/** Fold notes into a comfortable range and sort, for smoother voice leading. */
export function foldVoicing(notes: number[], low: number, high: number) {
  return notes
    .map((n) => {
      let x = n
      while (x > high) x -= 12
      while (x < low) x += 12
      return x
    })
    .sort((a, b) => a - b)
    .filter((n, i, arr) => arr.indexOf(n) === i)
}

export function hashString(str: string) {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return h >>> 0
}

export function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type Rng = () => number

export function pick<T>(rng: Rng, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length) % arr.length]
}
