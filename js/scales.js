// Scales and snapping. "bird" uses the preset's most-sung notes.
export const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const SCALES = {
  bird: { label: "Bird's own scale" },
  chromatic: { label: 'Chromatic (off)', pcs: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  major: { label: 'Major', pcs: [0, 2, 4, 5, 7, 9, 11] },
  minor: { label: 'Minor', pcs: [0, 2, 3, 5, 7, 8, 10] },
  pentatonic: { label: 'Major pentatonic', pcs: [0, 2, 4, 7, 9] },
  minpent: { label: 'Minor pentatonic', pcs: [0, 3, 5, 7, 10] },
  dorian: { label: 'Dorian', pcs: [0, 2, 3, 5, 7, 9, 10] },
  wholetone: { label: 'Whole tone', pcs: [0, 2, 4, 6, 8, 10] },
};
export const noteName = (m) => NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

/** Pitch classes of the active scale. bird scale = classes of the bird's notes. */
export function scalePCs(scale, bird) {
  if (scale.type === 'bird') {
    const notes = (bird && bird.scale && bird.scale.length) ? bird.scale : null;
    if (!notes) return SCALES.chromatic.pcs;
    return [...new Set(notes.map((n) => ((n % 12) + 12) % 12))].sort((a, b) => a - b);
  }
  const s = SCALES[scale.type] || SCALES.chromatic;
  return s.pcs.map((p) => (p + scale.root) % 12).sort((a, b) => a - b);
}
export function inScale(note, pcs) { return pcs.includes(((note % 12) + 12) % 12); }
/** Nearest note in the scale (ties go up). */
export function snap(note, pcs) {
  if (pcs.length >= 12) return note;
  for (let d = 0; d < 12; d++) {
    if (inScale(note + d, pcs)) return note + d;
    if (inScale(note - d, pcs)) return note - d;
  }
  return note;
}
/** i-th degree (0-based) of the scale counting up from `base`. Used by NeoKeys. */
export function degree(i, base, pcs) {
  let n = base; while (!inScale(n, pcs)) n++;
  let k = 0; while (k < i) { n++; if (inScale(n, pcs)) k++; }
  return n;
}
/** Home note: the bird's most-sung note, else the scale root near the call. */
export function homeNote(scale, bird) {
  if (scale.type === 'bird' && bird && bird.scale && bird.scale.length) return bird.scale[Math.floor(bird.scale.length / 2)];
  return 60 + scale.root;
}
