import { midiToFrequency, midiToName } from "./config.js";
import {
  applyMeasureTimingEvent,
  createMeasureCursor,
  measureDurationQuarters,
} from "./timing.js";

const VOCAL_WORDS = /\b(voice|vocal|singer|soprano|mezzo|alto|contralto|countertenor|tenor|baritone|bass|melody|choir|chorus)\b/i;
const ACCOMPANIMENT_WORDS = /\b(piano|keyboard|organ|guitar|accompaniment|orchestra|strings|violin|cello|flute|clarinet|drum|percussion)\b/i;
const STEP_OFFSETS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function directChild(parent, name) {
  return [...(parent?.children || [])].find((element) => element.localName === name) || null;
}

function directChildren(parent, name) {
  return [...(parent?.children || [])].filter((element) => element.localName === name);
}

function descendants(parent, name) {
  return [...(parent?.getElementsByTagNameNS?.("*", name) || [])];
}

function textOf(parent, name, fallback = "") {
  return directChild(parent, name)?.textContent?.trim() || fallback;
}

function numberOf(parent, name, fallback = 0) {
  const value = Number(textOf(parent, name, ""));
  return Number.isFinite(value) ? value : fallback;
}

function parseXml(text) {
  const documentNode = new DOMParser().parseFromString(text, "application/xml");
  const parserError = documentNode.querySelector("parsererror");
  if (parserError) throw new Error("This file is not valid MusicXML.");
  const root = documentNode.documentElement;
  if (!root || !["score-partwise", "score-timewise"].includes(root.localName)) {
    throw new Error("This XML file does not contain a MusicXML score.");
  }
  if (root.localName === "score-timewise") {
    throw new Error("Timewise MusicXML is not supported by this prototype. Export a partwise MusicXML file instead.");
  }
  return documentNode;
}

async function unzipMxl(file) {
  if (!window.JSZip) throw new Error("Compressed MusicXML support did not load. Try an uncompressed .musicxml file.");
  const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
  let scorePath = null;
  const container = zip.file("META-INF/container.xml");
  if (container) {
    const containerXml = parseContainer(await container.async("string"));
    scorePath = descendants(containerXml, "rootfile")[0]?.getAttribute("full-path") || null;
  }
  if (!scorePath) {
    scorePath = Object.keys(zip.files).find((path) => !zip.files[path].dir && /\.(musicxml|xml)$/i.test(path) && !/META-INF/i.test(path));
  }
  if (!scorePath || !zip.file(scorePath)) throw new Error("No MusicXML score was found inside this MXL file.");
  return zip.file(scorePath).async("string");
}

function parseContainer(text) {
  const documentNode = new DOMParser().parseFromString(text, "application/xml");
  if (documentNode.querySelector("parsererror")) throw new Error("The MXL container is invalid.");
  return documentNode;
}

export async function readScoreFile(file) {
  if (!file) throw new Error("Choose a MusicXML file first.");
  const isCompressed = /\.mxl$/i.test(file.name) || file.type === "application/vnd.recordare.musicxml";
  const xmlText = isCompressed ? await unzipMxl(file) : await file.text();
  return parseMusicXml(xmlText, file.name.replace(/\.(musicxml|xml|mxl)$/i, ""));
}

export async function readScoreUrl(url, fallbackName = "Sample score") {
  const response = await fetch(url);
  if (!response.ok) throw new Error("The sample score could not be loaded.");
  return parseMusicXml(await response.text(), fallbackName);
}

export function parseMusicXml(xmlText, fallbackName = "Untitled score") {
  const documentNode = parseXml(xmlText);
  const root = documentNode.documentElement;
  const title = textOf(directChild(root, "work"), "work-title", "")
    || textOf(root, "movement-title", "")
    || fallbackName;
  const creator = descendants(directChild(root, "identification"), "creator").find((node) => node.getAttribute("type") === "composer")?.textContent?.trim() || "";
  const scoreParts = directChildren(directChild(root, "part-list"), "score-part");
  const partMeta = new Map(scoreParts.map((part, index) => {
    const id = part.getAttribute("id") || `P${index + 1}`;
    const name = textOf(part, "part-name", `Part ${index + 1}`);
    const abbreviation = textOf(part, "part-abbreviation", "");
    return [id, { id, name, abbreviation, order: index }];
  }));

  let originalTempo = findInitialTempo(root) || 120;
  const partElements = directChildren(root, "part");
  const parts = partElements.map((partElement, index) => {
    const id = partElement.getAttribute("id") || `P${index + 1}`;
    const meta = partMeta.get(id) || { id, name: `Part ${index + 1}`, abbreviation: "", order: index };
    return parsePart(partElement, meta, originalTempo);
  });
  const durationQuarters = Math.max(0, ...parts.map((part) => part.durationQuarters));
  return { xmlText, documentNode, title, creator, originalTempo, durationQuarters, parts };
}

function findInitialTempo(root) {
  for (const sound of descendants(root, "sound")) {
    const value = Number(sound.getAttribute("tempo"));
    if (value > 0) return value;
  }
  for (const perMinute of descendants(root, "per-minute")) {
    const value = Number(perMinute.textContent);
    if (value > 0) return value;
  }
  return null;
}

function parsePart(partElement, meta, tempo) {
  let divisions = 1;
  let beatType = 4;
  let transposition = 0;
  let partQuarter = 0;
  const rawNotes = [];
  const measureStarts = [];

  directChildren(partElement, "measure").forEach((measureElement, measureIndex) => {
    const measureNumberText = measureElement.getAttribute("number") || String(measureIndex + 1);
    const measureNumber = Number.parseInt(measureNumberText, 10) || measureIndex + 1;
    measureStarts.push({ measureNumber, onsetQuarters: partQuarter });
    const measureTiming = createMeasureCursor();

    for (const element of measureElement.children) {
      if (element.localName === "attributes") {
        divisions = numberOf(element, "divisions", divisions) || divisions;
        const time = directChild(element, "time");
        beatType = numberOf(time, "beat-type", beatType) || beatType;
        const transpose = directChild(element, "transpose");
        transposition = numberOf(transpose, "chromatic", transposition);
        continue;
      }
      if (element.localName === "backup") {
        applyMeasureTimingEvent(measureTiming, {
          type: "backup",
          durationQuarters: numberOf(element, "duration", 0) / divisions,
        });
        continue;
      }
      if (element.localName === "forward") {
        applyMeasureTimingEvent(measureTiming, {
          type: "forward",
          durationQuarters: numberOf(element, "duration", 0) / divisions,
        });
        continue;
      }
      if (element.localName !== "note") continue;

      const durationQuarters = numberOf(element, "duration", 0) / divisions;
      const isChord = Boolean(directChild(element, "chord"));
      const onsetInMeasure = applyMeasureTimingEvent(measureTiming, {
        type: "note",
        durationQuarters,
        isChord,
      });
      if (directChild(element, "rest") || directChild(element, "unpitched")) continue;
      const pitch = directChild(element, "pitch");
      if (!pitch) continue;
      const step = textOf(pitch, "step", "C");
      const alter = numberOf(pitch, "alter", 0);
      const octave = numberOf(pitch, "octave", 4);
      const midi = (octave + 1) * 12 + (STEP_OFFSETS[step] ?? 0) + alter + transposition;
      const ties = directChildren(element, "tie").map((tie) => tie.getAttribute("type")).filter(Boolean);
      const onsetQuarters = partQuarter + onsetInMeasure;
      rawNotes.push({
        id: `${meta.id}-${rawNotes.length}`,
        partId: meta.id,
        writtenPitch: `${step}${alter === 1 ? "♯" : alter === -1 ? "♭" : ""}${octave}`,
        displayPitch: midiToName(midi),
        midi,
        frequency: midiToFrequency(midi),
        onsetQuarters,
        durationQuarters,
        onsetTime: onsetQuarters * 60 / tempo,
        durationSeconds: durationQuarters * 60 / tempo,
        measureNumber,
        beatPosition: 1 + onsetInMeasure * beatType / 4,
        voice: textOf(element, "voice", "1"),
        staff: textOf(element, "staff", "1"),
        ties,
        tied: ties.length > 0,
      });
    }
    // MusicXML cursor duration is authoritative. Padding to the nominal time
    // signature length adds false silence to pickups and incomplete measures.
    partQuarter += measureDurationQuarters(measureTiming);
  });

  const notes = mergeTies(rawNotes, tempo);
  const voiceCounts = new Map();
  notes.forEach((note) => voiceCounts.set(note.voice, (voiceCounts.get(note.voice) || 0) + 1));
  const primaryVoice = [...voiceCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "1";
  const vocalTimeline = collapseSimultaneous(notes.filter((note) => note.voice === primaryVoice));
  const vocalScore = (VOCAL_WORDS.test(meta.name) ? 3 : 0) + (ACCOMPANIMENT_WORDS.test(meta.name) ? -2 : 0) + (vocalTimeline.length > 0 ? 1 : 0);
  return { ...meta, notes, vocalTimeline, primaryVoice, measureStarts, durationQuarters: partQuarter, vocalScore };
}

function mergeTies(notes, tempo) {
  const result = [];
  const openTies = new Map();
  for (const note of notes) {
    const key = `${note.voice}:${note.staff}:${note.midi}`;
    const hasStop = note.ties.includes("stop");
    if (hasStop && openTies.has(key)) {
      const target = openTies.get(key);
      target.durationQuarters = Math.max(target.durationQuarters, note.onsetQuarters + note.durationQuarters - target.onsetQuarters);
      target.durationSeconds = target.durationQuarters * 60 / tempo;
      target.ties = [...new Set([...target.ties, ...note.ties])];
      target.tied = true;
      if (!note.ties.includes("start")) openTies.delete(key);
      continue;
    }
    const clone = { ...note };
    result.push(clone);
    if (clone.ties.includes("start")) openTies.set(key, clone);
  }
  return result;
}

function collapseSimultaneous(notes) {
  const byOnset = new Map();
  for (const note of notes) {
    const key = note.onsetQuarters.toFixed(5);
    const existing = byOnset.get(key);
    if (!existing || note.midi > existing.midi) byOnset.set(key, note);
  }
  return [...byOnset.values()].sort((a, b) => a.onsetQuarters - b.onsetQuarters);
}

export function suggestVocalPart(parts) {
  const sorted = [...parts].sort((a, b) => b.vocalScore - a.vocalScore);
  if (!sorted.length || sorted[0].vocalScore < 3) return null;
  if (sorted[1] && sorted[1].vocalScore === sorted[0].vocalScore) return null;
  return sorted[0].id;
}

export function noteAtQuarter(timeline, quarter) {
  return timeline.find((note) => quarter >= note.onsetQuarters && quarter < note.onsetQuarters + note.durationQuarters) || null;
}

export function measureAtQuarter(part, quarter) {
  let current = part.measureStarts[0]?.measureNumber || 1;
  for (const measure of part.measureStarts) {
    if (measure.onsetQuarters > quarter) break;
    current = measure.measureNumber;
  }
  return current;
}
