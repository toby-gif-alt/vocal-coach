#!/usr/bin/env node

import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIRECTORY, "..");
const SUPPORTED_SCORES = /\.(?:musicxml|xml|mxl)$/i;
const PITCH_CLASSES = Object.freeze({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 });

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function parsePitchFilename(filename) {
  const stem = path.basename(filename, path.extname(filename));
  const match = /^([A-Ga-g])((?:s|#|b)?)(-?\d+)$/.exec(stem);
  if (!match) return null;
  const step = match[1].toUpperCase();
  const accidental = match[2];
  const octave = Number(match[3]);
  const offset = accidental === "s" || accidental === "#" ? 1 : accidental === "b" ? -1 : 0;
  const midi = (octave + 1) * 12 + PITCH_CLASSES[step] + offset;
  if (!Number.isInteger(midi) || midi < 0 || midi > 127) return null;
  return {
    note: `${step}${accidental === "s" ? "#" : accidental}${octave}`,
    midi,
  };
}

function decodeXmlText(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanScoreFilename(filename) {
  return path.basename(filename, path.extname(filename))
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function titleFromMusicXml(xml, filename) {
  for (const tag of ["work-title", "movement-title"]) {
    const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i").exec(xml);
    const title = decodeXmlText(match?.[1]);
    if (title) return title;
  }
  return cleanScoreFilename(filename);
}

async function directoryFiles(directory, filter) {
  try {
    return (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && filter(entry.name))
      .map((entry) => entry.name);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export async function buildVoiceManifest(root = DEFAULT_ROOT) {
  const entries = [];
  for (const bank of ["male", "female"]) {
    const directory = path.join(root, "samples", "vocal-guide", bank);
    const files = await directoryFiles(directory, (name) => /\.mp3$/i.test(name));
    for (const filename of files) {
      const pitch = parsePitchFilename(filename);
      if (!pitch) throw new Error(`Unsupported vocal sample filename: ${bank}/${filename}`);
      entries.push({
        file: `./samples/vocal-guide/${bank}/${filename}`,
        note: pitch.note,
        rootMidi: pitch.midi,
        bank,
      });
    }
  }
  return entries.sort((left, right) => (
    left.bank.localeCompare(right.bank)
    || left.rootMidi - right.rootMidi
    || left.file.localeCompare(right.file)
  ));
}

export async function buildRepertoireManifest(root = DEFAULT_ROOT) {
  const directory = path.join(root, "repertoire");
  const files = await directoryFiles(directory, (name) => SUPPORTED_SCORES.test(name));
  const entries = await Promise.all(files.map(async (filename) => {
    const isCompressed = /\.mxl$/i.test(filename);
    const title = isCompressed
      ? cleanScoreFilename(filename)
      : titleFromMusicXml(await readFile(path.join(directory, filename), "utf8"), filename);
    return { title, file: `./repertoire/${filename}` };
  }));
  return entries.sort((left, right) => (
    left.title.localeCompare(right.title, undefined, { sensitivity: "base" })
    || left.file.localeCompare(right.file)
  ));
}

async function verifyOrWrite(file, contents, check) {
  const expected = json(contents);
  if (!check) {
    await writeFile(file, expected, "utf8");
    return;
  }
  let actual = "";
  try {
    actual = await readFile(file, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (actual !== expected) throw new Error(`${path.relative(DEFAULT_ROOT, file)} is missing or out of date. Run npm run generate.`);
}

export async function generateManifests({ root = DEFAULT_ROOT, voice = true, repertoire = true, check = false } = {}) {
  const generated = {};
  if (voice) {
    generated.voice = await buildVoiceManifest(root);
    await verifyOrWrite(path.join(root, "samples", "vocal-guide", "index.json"), generated.voice, check);
  }
  if (repertoire) {
    generated.repertoire = await buildRepertoireManifest(root);
    await verifyOrWrite(path.join(root, "repertoire", "index.json"), generated.repertoire, check);
  }
  return generated;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const flags = new Set(process.argv.slice(2));
  const onlyVoice = flags.has("--voice");
  const onlyRepertoire = flags.has("--repertoire");
  await generateManifests({
    voice: onlyVoice || !onlyRepertoire,
    repertoire: onlyRepertoire || !onlyVoice,
    check: flags.has("--check"),
  });
}
