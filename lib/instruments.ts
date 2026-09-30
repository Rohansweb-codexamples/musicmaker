export type PresetId =
  | "kit-house"
  | "kit-deep"
  | "bass-deep"
  | "bass-sub"
  | "bass-acid"
  | "bass-organ"
  | "bass-reese"
  | "bass-funk"
  | "bass-garage"
  | "keys-m1"
  | "keys-organ"
  | "keys-rhodes"
  | "keys-stab"
  | "keys-piano"
  | "keys-strings"
  | "synth-pluck"
  | "synth-arp"
  | "synth-bell"
  | "synth-lead"
  | "synth-chime"
  | "pad-warm"
  | "pad-air"
  | "pad-dark"
  | "vox-chop"
  | "vox-ooh"
  | "vox-ee"
  | "fx"

export interface InstrumentMeta {
  id: PresetId
  name: string
  group: "Drums" | "Bass" | "Keys" | "Synth" | "Pads" | "Vocals" | "FX"
}

export const INSTRUMENTS: InstrumentMeta[] = [
  { id: "kit-house", name: "909 House Kit", group: "Drums" },
  { id: "kit-deep", name: "Deep Analog Kit", group: "Drums" },
  { id: "bass-deep", name: "Deep House Bass", group: "Bass" },
  { id: "bass-sub", name: "Sub Bass", group: "Bass" },
  { id: "bass-acid", name: "Acid 303", group: "Bass" },
  { id: "bass-organ", name: "Organ Bass", group: "Bass" },
  { id: "bass-reese", name: "Reese Bass", group: "Bass" },
  { id: "bass-funk", name: "Funk Bass", group: "Bass" },
  { id: "bass-garage", name: "Garage FM Bass", group: "Bass" },
  { id: "keys-m1", name: "90s House Piano", group: "Keys" },
  { id: "keys-organ", name: "Classic Organ", group: "Keys" },
  { id: "keys-rhodes", name: "Electric Piano", group: "Keys" },
  { id: "keys-stab", name: "Saw Chord Stab", group: "Keys" },
  { id: "keys-piano", name: "Soul Keys", group: "Keys" },
  { id: "keys-strings", name: "Disco Strings", group: "Keys" },
  { id: "synth-pluck", name: "Super Pluck", group: "Synth" },
  { id: "synth-arp", name: "Night Arp", group: "Synth" },
  { id: "synth-bell", name: "FM Bell", group: "Synth" },
  { id: "synth-lead", name: "Saw Lead", group: "Synth" },
  { id: "synth-chime", name: "Marimba Chime", group: "Synth" },
  { id: "pad-warm", name: "Warm Pad", group: "Pads" },
  { id: "pad-air", name: "Air Pad", group: "Pads" },
  { id: "pad-dark", name: "Dark Pad", group: "Pads" },
  { id: "vox-chop", name: "Vocal Chop", group: "Vocals" },
  { id: "vox-ooh", name: "Ooh Choir", group: "Vocals" },
  { id: "vox-ee", name: "Ee Stabs", group: "Vocals" },
  { id: "fx", name: "FX Generator", group: "FX" },
]

export function instrumentName(id: PresetId) {
  return INSTRUMENTS.find((i) => i.id === id)?.name ?? id
}

export function isDrumPreset(id: PresetId) {
  return id === "kit-house" || id === "kit-deep"
}
