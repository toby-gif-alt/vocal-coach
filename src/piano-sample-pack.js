const SAMPLE_DIRECTORY = new URL("../samples/piano/salamander/", import.meta.url).href;

const ROOTS = Object.freeze([
  ["A0", 21], ["C1", 24], ["Ds1", 27], ["Fs1", 30],
  ["A1", 33], ["C2", 36], ["Ds2", 39], ["Fs2", 42],
  ["A2", 45], ["C3", 48], ["Ds3", 51], ["Fs3", 54],
  ["A3", 57], ["C4", 60], ["Ds4", 63], ["Fs4", 66],
  ["A4", 69], ["C5", 72], ["Ds5", 75], ["Fs5", 78],
  ["A5", 81], ["C6", 84], ["Ds6", 87], ["Fs6", 90],
  ["A6", 93], ["C7", 96], ["Ds7", 99], ["Fs7", 102],
  ["A7", 105], ["C8", 108],
]);

export const SALAMANDER_PIANO_SAMPLES = Object.freeze(ROOTS.map(([note, midi]) => Object.freeze({
  note: note.replace("s", "#"),
  midi,
  url: `${SAMPLE_DIRECTORY}${note}.mp3`,
})));

export const SALAMANDER_PIANO_SOURCE = "https://github.com/Tonejs/audio/tree/master/salamander";
