#!/usr/bin/env node
/**
 * Narrate a sections JSON file to a local MP3 with ElevenLabs.
 *
 * Two execution modes:
 * 1. Assembly mode (`--assemble <manifest.json>`): joins pre-generated local MP3 clips
 *    (for example from Agensi's elevenlabs:text-to-speech tool) into the final MP3 and
 *    writes the timeline JSON. Requires no API key and makes no network requests.
 * 2. Direct BYOK mode (`<sections.json>`): reads process.env.ELEVENLABS_API_KEY only,
 *    sends it as the xi-api-key header to https://api.elevenlabs.io and nowhere else.
 *
 * Helper mode (`--split <sections.json> [--max-chars 5000] [--out <chunked.json>]`):
 *    splits sections exceeding the tool's 5,000-character limit into chunks <= maxChars.
 *
 * Local read: the sections/manifest JSON path (and local MP3 files in --assemble mode).
 * Local write: the MP3, a timeline JSON beside it, and temp audio under os.tmpdir().
 * ffmpeg is optional. When it is on PATH it is started with execFile and an argument list.
 */

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const ELEVENLABS_ORIGIN = 'https://api.elevenlabs.io';
const TTS_MODEL = 'eleven_turbo_v2_5';
const AGENSI_TTS_MODEL = 'eleven_v4';
const OUTPUT_FORMAT = 'mp3_44100_128';
const SFX_PROMPT = 'subtle whoosh chime transition';
const SFX_SECONDS = 2;
const BYTES_PER_SECOND = 16000;
const MAX_SECTION_CHARS = 40000;
const AGENSI_MAX_CHARS = 5000;
const MAX_SECTIONS = 50;
const MAX_JSON_BYTES = 2_000_000;
const REQUEST_TIMEOUT_MS = 90_000;

// Public ElevenLabs premade voice ids for direct BYOK API calls.
const VOICE_MAP = {
  introduction: { name: 'Jessica', voiceId: 'cgSgspJ2msm6clMCkdW9' },
  code: { name: 'Adam', voiceId: 'pNInz6obpgDQGcFmaJgB' },
  warning: { name: 'Antoni', voiceId: 'ErXwobaYiN019PkySvjV' },
  steps: { name: 'Bella', voiceId: 'EXAVITQu4vr4xnSDxMaL' },
};

// Verified catalog voice ids present in Agensi's elevenlabs:voices catalog (no voice cloning).
const AGENSI_VOICE_MAP = {
  introduction: { name: 'Jessica', voiceId: 'cgSgspJ2msm6clMCkdW9' },
  code: { name: 'Adam', voiceId: 'pNInz6obpgDQGcFmaJgB' },
  warning: { name: 'Daniel', voiceId: 'onwK4e9ZLuTAKqWW03F9' },
  steps: { name: 'Bella', voiceId: 'hpp4J3VqNfWAUOO0d1Us' },
};

const SINGLE_VOICE = VOICE_MAP.introduction;
const SECTION_TYPES = new Set(['introduction', 'code', 'warning', 'steps']);

const USAGE = [
  'Usage:',
  '  BYOK mode:     node narrate.mjs <sections.json> [--mode single|multi] [--sfx on|off] [--out podcast.mp3]',
  '  Assemble mode: node narrate.mjs --assemble <manifest.json> [--mode single|multi] [--sfx on|off] [--out podcast.mp3]',
  '  Split helper:  node narrate.mjs --split <sections.json> [--max-chars 5000] [--out chunked.json]',
  '',
  'In BYOK mode, reads ELEVENLABS_API_KEY from the environment and sends it only',
  'as the xi-api-key header to https://api.elevenlabs.io.',
  'In --assemble mode, joins pre-generated local MP3 clips without an API key or network calls.',
  'Writes an MP3 and a timeline JSON beside it. Does not upload the audio.',
].join('\n');

function redact(text, apiKey) {
  const value = String(text ?? '');
  if (!apiKey) return value;
  return value.split(apiKey).join('[redacted]');
}

function readApiKey() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (typeof apiKey !== 'string' || apiKey.trim() === '') {
    throw new Error(
      'ELEVENLABS_API_KEY is not set. Use Agensi tools (--assemble) to pay from your Agensi balance, ' +
        'or add your ElevenLabs API key as ELEVENLABS_API_KEY in the environment and run again. ' +
        'The key is sent only as the xi-api-key header to https://api.elevenlabs.io and is not written to the MP3 or the timeline.'
    );
  }
  return apiKey.trim();
}

function parseArgs(argv) {
  const args = {
    jsonPath: null,
    assemblePath: null,
    splitPath: null,
    maxChars: AGENSI_MAX_CHARS,
    mode: 'multi',
    sfx: true,
    out: null,
    help: false,
  };
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }
    if (
      arg === '--mode' ||
      arg === '--sfx' ||
      arg === '--out' ||
      arg === '--assemble' ||
      arg === '--split' ||
      arg === '--max-chars'
    ) {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`Expected a value after ${arg}.`);
      }
      i += 1;
      if (arg === '--mode') {
        if (value !== 'single' && value !== 'multi') {
          throw new Error('Expected --mode single or --mode multi.');
        }
        args.mode = value;
      } else if (arg === '--sfx') {
        if (value !== 'on' && value !== 'off') {
          throw new Error('Expected --sfx on or --sfx off.');
        }
        args.sfx = value === 'on';
      } else if (arg === '--assemble') {
        args.assemblePath = value;
      } else if (arg === '--split') {
        args.splitPath = value;
      } else if (arg === '--max-chars') {
        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed < 100 || parsed > MAX_SECTION_CHARS) {
          throw new Error(`Expected --max-chars to be an integer between 100 and ${MAX_SECTION_CHARS}.`);
        }
        args.maxChars = parsed;
      } else {
        args.out = value;
      }
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown argument: ${arg}.`);
    }
    positional.push(arg);
  }

  if (args.assemblePath && args.splitPath) {
    throw new Error('Use either --assemble or --split, not both.');
  }
  if ((args.assemblePath || args.splitPath) && positional.length > 0) {
    throw new Error('Do not pass a positional sections file together with --assemble or --split.');
  }
  if (positional.length > 1) {
    throw new Error('Pass one sections JSON path.');
  }
  args.jsonPath = positional[0] || null;
  if (!args.splitPath && args.out === null) {
    args.out = 'podcast.mp3';
  }
  return args;
}

function voiceFor(type, mode, catalog = 'byok') {
  const map = catalog === 'agensi' ? AGENSI_VOICE_MAP : VOICE_MAP;
  if (mode === 'single') return map.introduction;
  const voice = map[type];
  if (!voice) throw new Error(`Unknown section type: ${type}`);
  return voice;
}

function splitTextIntoChunks(text, maxChars = AGENSI_MAX_CHARS) {
  const clean = String(text ?? '').trim();
  if (!clean) throw new Error('Cannot split empty text.');
  if (!Number.isInteger(maxChars) || maxChars < 1) {
    throw new Error('maxChars must be a positive integer.');
  }
  if (clean.length <= maxChars) return [clean];

  const chunks = [];
  let remaining = clean;

  while (remaining.length > maxChars) {
    const window = remaining.slice(0, maxChars + 1);
    const minBreak = Math.floor(maxChars * 0.4);
    let cut = -1;

    const paraBreak = window.lastIndexOf('\n\n');
    if (paraBreak >= minBreak) {
      cut = paraBreak;
    } else {
      const lineBreak = window.lastIndexOf('\n');
      if (lineBreak >= minBreak) {
        cut = lineBreak;
      } else {
        for (const sep of ['. ', '! ', '? ', '; ']) {
          const idx = window.lastIndexOf(sep);
          if (idx >= minBreak && idx + 1 > cut) {
            cut = idx + 1;
          }
        }
        if (cut < 0) {
          const spaceBreak = window.lastIndexOf(' ');
          if (spaceBreak >= minBreak) cut = spaceBreak;
        }
      }
    }

    if (cut <= 0) cut = maxChars;
    const part = remaining.slice(0, cut).trim();
    if (part) chunks.push(part);
    remaining = remaining.slice(cut).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

function splitDocumentForLimit(document, maxChars = AGENSI_MAX_CHARS) {
  const chunked = [];
  for (const section of document.sections) {
    const parts = splitTextIntoChunks(section.text, maxChars);
    if (parts.length === 1) {
      chunked.push({ ...section, index: chunked.length });
    } else {
      for (let p = 0; p < parts.length; p += 1) {
        const partTitle = p === 0 ? section.title : `${section.title}, part ${p + 1}`;
        chunked.push({
          index: chunked.length,
          title: partTitle,
          type: section.type,
          text: parts[p],
        });
      }
    }
  }
  if (chunked.length > MAX_SECTIONS) {
    throw new Error(
      `Splitting to ${maxChars} characters produced ${chunked.length} sections, exceeding the ${MAX_SECTIONS}-section limit.`
    );
  }
  return {
    title: document.title,
    sections: chunked,
  };
}

function estimateDurationMs(byteLength) {
  return Math.round((byteLength / BYTES_PER_SECOND) * 1000);
}

function normalizeOutPath(outPath) {
  if (typeof outPath !== 'string' || outPath.trim() === '' || /[\\/]$/.test(outPath)) {
    throw new Error('Expected --out to be a .mp3 file path.');
  }
  return outPath.toLowerCase().endsWith('.mp3') ? outPath : `${outPath}.mp3`;
}

function timelinePathFor(mp3Path) {
  const resolved = path.resolve(mp3Path);
  const ext = path.extname(resolved);
  const base = ext ? resolved.slice(0, -ext.length) : resolved;
  return `${base}.timeline.json`;
}

function normalizeSection(entry, i) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error(`Section ${i} is not an object.`);
  }
  if (!SECTION_TYPES.has(entry.type)) {
    throw new Error(
      `Section ${i} has type ${JSON.stringify(entry.type)}. Use introduction, code, warning, or steps.`
    );
  }
  if (typeof entry.text !== 'string' || entry.text.trim() === '') {
    throw new Error(`Section ${i} needs non-empty speakable text.`);
  }
  const text = entry.text.trim();
  if (text.length > MAX_SECTION_CHARS) {
    throw new Error(
      `Section ${i} has ${text.length} characters. The model limit is ${MAX_SECTION_CHARS} per request. Split this section.`
    );
  }
  const title = typeof entry.title === 'string' && entry.title.trim()
    ? entry.title.trim().replace(/\s+/g, ' ')
    : `Section ${i + 1}`;
  const index = Number.isInteger(entry.index) && entry.index >= 0 ? entry.index : i;
  return { index, title, type: entry.type, text };
}

function parseSectionsDocument(parsed) {
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray(parsed.sections)
      ? parsed.sections
      : null;
  if (!list) {
    throw new Error('Sections JSON must be an array, or an object with a sections array.');
  }
  if (list.length === 0) {
    throw new Error('The sections file has no sections.');
  }
  if (list.length > MAX_SECTIONS) {
    throw new Error(`The sections file has ${list.length} sections. Use ${MAX_SECTIONS} or fewer.`);
  }
  const sections = list.map((entry, i) => normalizeSection(entry, i));
  const givenTitle = !Array.isArray(parsed) && parsed && typeof parsed.title === 'string'
    ? parsed.title.trim().replace(/\s+/g, ' ')
    : '';
  return {
    title: givenTitle || sections[0].title,
    sections,
  };
}

async function loadSections(jsonPath) {
  const resolved = path.resolve(jsonPath);
  let stat;
  try {
    stat = await fs.stat(resolved);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      throw new Error(`Sections file not found: ${resolved}`);
    }
    throw err;
  }
  if (!stat.isFile()) {
    throw new Error(`Sections path is not a file: ${resolved}`);
  }
  if (stat.size > MAX_JSON_BYTES) {
    throw new Error('The sections file is larger than 2 MB.');
  }
  let raw = await fs.readFile(resolved, 'utf8');
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Could not parse JSON in ${resolved}.`);
  }
  return { resolved, document: parseSectionsDocument(parsed) };
}

function summarizeErrorBody(text, apiKey) {
  let message = text;
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed.detail === 'string') {
      message = parsed.detail;
    } else if (parsed.detail && typeof parsed.detail.message === 'string') {
      message = parsed.detail.message;
    } else if (Array.isArray(parsed.detail) && parsed.detail[0]) {
      message = parsed.detail[0].msg || parsed.detail[0].message || JSON.stringify(parsed.detail[0]);
    } else if (typeof parsed.message === 'string') {
      message = parsed.message;
    }
  } catch {
    message = text;
  }
  return redact(String(message).replace(/\s+/g, ' ').slice(0, 300), apiKey);
}

async function postAudio(apiKey, urlPath, body) {
  const url = new URL(urlPath, ELEVENLABS_ORIGIN);
  url.searchParams.set('output_format', OUTPUT_FORMAT);
  if (url.origin !== ELEVENLABS_ORIGIN) {
    throw new Error('Refusing to call a host other than api.elevenlabs.io.');
  }

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const name = err && err.name;
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new Error(`ElevenLabs request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds.`);
    }
    const message = redact(err && err.message ? err.message : String(err), apiKey);
    throw new Error(`Could not reach https://api.elevenlabs.io (${message}).`);
  }

  if (!response.ok) {
    let detail = '';
    try {
      detail = summarizeErrorBody(await response.text(), apiKey);
    } catch {
      detail = '';
    }
    let hint = '';
    if (response.status === 401) {
      hint = ' The API key was rejected. Check ELEVENLABS_API_KEY.';
    } else if (response.status === 429) {
      hint = ' The account is rate limited or out of credits. The free plan includes 10,000 credits per month.';
    }
    const suffix = detail ? `: ${detail}` : '';
    throw new Error(`ElevenLabs returned HTTP ${response.status}${suffix}.${hint}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('json')) {
    const detail = summarizeErrorBody(await response.text(), apiKey);
    throw new Error(`ElevenLabs returned JSON instead of audio (${detail}).`);
  }

  const audio = Buffer.from(await response.arrayBuffer());
  if (audio.length === 0) {
    throw new Error('ElevenLabs returned an empty audio response.');
  }
  return audio;
}

async function generateSpeech(apiKey, section, mode) {
  const voice = voiceFor(section.type, mode);
  let lastMessage = 'unknown error';
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const audio = await postAudio(
        apiKey,
        `/v1/text-to-speech/${encodeURIComponent(voice.voiceId)}`,
        { text: section.text, model_id: TTS_MODEL }
      );
      return { audio, voice };
    } catch (err) {
      lastMessage = redact(err && err.message ? err.message : String(err), apiKey);
      if (attempt === 1) {
        console.error(`[TTS] Attempt 1 failed for section ${section.index} (voice ${voice.voiceId}): ${lastMessage}`);
      }
    }
  }
  throw new Error(`TTS generation failed for section ${section.index}: ${lastMessage}`);
}

async function generateTransition(apiKey) {
  try {
    return await postAudio(apiKey, '/v1/sound-generation', {
      text: SFX_PROMPT,
      duration_seconds: SFX_SECONDS,
    });
  } catch (err) {
    const message = redact(err && err.message ? err.message : String(err), apiKey);
    console.error(`Transition sound was skipped (${message}).`);
    return null;
  }
}

function buildTimeline({
  title,
  model = TTS_MODEL,
  provider = 'byok',
  mode,
  assembly,
  output,
  characters,
  sfxByteLength,
  sections,
}) {
  let cursor = 0;
  const rows = [];
  for (let i = 0; i < sections.length; i += 1) {
    const section = sections[i];
    const startMs = cursor;
    cursor += estimateDurationMs(section.byteLength);
    rows.push({
      index: section.index,
      title: section.title,
      type: section.type,
      voice: section.voiceName,
      voiceId: section.voiceId,
      startMs,
      endMs: cursor,
    });
    if (sfxByteLength && i < sections.length - 1) {
      cursor += estimateDurationMs(sfxByteLength);
    }
  }
  return {
    title,
    provider,
    model,
    outputFormat: OUTPUT_FORMAT,
    mode,
    sfx: Boolean(sfxByteLength),
    assembly,
    output,
    characters,
    sections: rows,
  };
}

async function writeFileEnsured(outputPath, data) {
  const resolved = path.resolve(outputPath);
  if (resolved === path.parse(resolved).root) {
    throw new Error('Expected --out to be a file path, not the filesystem root.');
  }
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, data);
  return resolved;
}

async function ffmpegAvailable() {
  try {
    await execFileAsync('ffmpeg', ['-version'], { timeout: 5000, encoding: 'utf8' });
    return true;
  } catch {
    return false;
  }
}

function commandError(err) {
  const stderr = err && typeof err.stderr === 'string' ? err.stderr.trim() : '';
  const line = stderr.split('\n').filter(Boolean).pop();
  const message = line || (err && err.message) || 'command failed';
  return String(message).replace(/\s+/g, ' ').slice(0, 300);
}

async function concatWithFfmpeg(parts, outputPath) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'docuvoice-'));
  try {
    const lines = [];
    for (let i = 0; i < parts.length; i += 1) {
      const name = `part-${String(i).padStart(3, '0')}.mp3`;
      await fs.writeFile(path.join(dir, name), parts[i]);
      lines.push(`file '${name}'`);
    }
    await fs.writeFile(path.join(dir, 'list.txt'), `${lines.join('\n')}\n`, 'utf8');
    try {
      // Re-encode to mono: ElevenLabs SFX is stereo; TTS is mono. Stream-copy
      // leaves a channel break that many players stop on at the first SFX.
      await execFileAsync(
        'ffmpeg',
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-y',
          '-f',
          'concat',
          '-safe',
          '0',
          '-i',
          'list.txt',
          '-c:a',
          'libmp3lame',
          '-ar',
          '44100',
          '-ac',
          '1',
          '-b:a',
          '128k',
          'joined.mp3',
        ],
        { cwd: dir, timeout: 120000, encoding: 'utf8', maxBuffer: 1024 * 1024 }
      );
    } catch (err) {
      throw new Error(commandError(err));
    }
    const joined = await fs.readFile(path.join(dir, 'joined.mp3'));
    return writeFileEnsured(outputPath, joined);
  } finally {
    const names = await fs.readdir(dir).catch(() => []);
    for (const name of names) {
      await fs.unlink(path.join(dir, name)).catch(() => {});
    }
    await fs.rmdir(dir).catch(() => {});
  }
}

async function concatMp3Bytes(parts, outputPath) {
  return writeFileEnsured(outputPath, Buffer.concat(parts));
}

async function concatenateMp3(speechParts, outputPath, sfxAudio = null) {
  if (!speechParts.length) throw new Error('No audio to assemble.');
  if (speechParts.length === 1) {
    return {
      assembly: 'single',
      outputPath: await writeFileEnsured(outputPath, speechParts[0]),
      sfxApplied: false,
    };
  }

  const useSfx = Boolean(sfxAudio);
  const ffmpegParts = [];
  for (let i = 0; i < speechParts.length; i += 1) {
    ffmpegParts.push(speechParts[i]);
    if (useSfx && i < speechParts.length - 1) ffmpegParts.push(sfxAudio);
  }

  if (await ffmpegAvailable()) {
    try {
      return {
        assembly: 'ffmpeg',
        outputPath: await concatWithFfmpeg(ffmpegParts, outputPath),
        sfxApplied: useSfx,
      };
    } catch (err) {
      // Stereo SFX + mono TTS breaks many players if we fall back to byte-concat.
      const detail = err && err.message ? err.message : String(err);
      console.error(`ffmpeg join failed (${detail}), skipping transition sounds`);
    }
  } else {
    console.error('ffmpeg is not on PATH. Joining the MP3 bytes directly.');
  }
  return {
    assembly: 'bytes',
    outputPath: await concatMp3Bytes(speechParts, outputPath),
    sfxApplied: false,
  };
}

function formatReport(timeline, timelinePath) {
  const lines = [
    `Wrote: ${timeline.output}`,
    `Timeline: ${timelinePath}`,
    `Mode: ${timeline.mode}`,
    `Assembly: ${timeline.assembly}`,
    `Transitions: ${timeline.sfx ? 'on' : 'off'}`,
    `Characters: ${timeline.characters}`,
    '',
    'Sections:',
  ];
  for (const row of timeline.sections) {
    lines.push(`- ${row.startMs} ms | ${row.type} | ${row.voice} | ${row.title}`);
  }
  return lines.join('\n');
}

async function readLocalMp3(filePath, label) {
  if (typeof filePath !== 'string' || filePath.trim() === '') {
    throw new Error(`${label} requires a local MP3 file path.`);
  }
  const resolved = path.resolve(filePath);
  const data = await fs.readFile(resolved);
  if (data.length === 0) {
    throw new Error(`Audio file is empty: ${resolved}`);
  }
  return data;
}

async function loadAssembleManifest(manifestPath, cliMode) {
  const resolved = path.resolve(manifestPath);
  let stat;
  try {
    stat = await fs.stat(resolved);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      throw new Error(`Manifest file not found: ${resolved}`);
    }
    throw err;
  }
  if (!stat.isFile()) {
    throw new Error(`Manifest path is not a file: ${resolved}`);
  }
  if (stat.size > MAX_JSON_BYTES) {
    throw new Error('The manifest file is larger than 2 MB.');
  }
  let raw = await fs.readFile(resolved, 'utf8');
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Could not parse JSON in ${resolved}.`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Array.isArray(parsed.sections)) {
    throw new Error('Assemble manifest must be a JSON object with a sections array.');
  }
  if (parsed.sections.length === 0) {
    throw new Error('The manifest has no sections.');
  }
  if (parsed.sections.length > MAX_SECTIONS) {
    throw new Error(`The manifest has ${parsed.sections.length} sections. Use ${MAX_SECTIONS} or fewer.`);
  }

  const mode = parsed.mode === 'single' || parsed.mode === 'multi' ? parsed.mode : cliMode;
  const manifestDir = path.dirname(resolved);
  const sections = [];

  for (let i = 0; i < parsed.sections.length; i += 1) {
    const entry = parsed.sections[i];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`Manifest section ${i} is not an object.`);
    }
    if (!SECTION_TYPES.has(entry.type)) {
      throw new Error(
        `Manifest section ${i} has type ${JSON.stringify(entry.type)}. Use introduction, code, warning, or steps.`
      );
    }
    if (typeof entry.audioPath !== 'string' || entry.audioPath.trim() === '') {
      throw new Error(`Manifest section ${i} needs a local audioPath.`);
    }
    const audioResolved = path.isAbsolute(entry.audioPath)
      ? entry.audioPath
      : path.resolve(manifestDir, entry.audioPath);
    const audio = await readLocalMp3(audioResolved, `Manifest section ${i}`);
    const defaultVoice = voiceFor(entry.type, mode, 'agensi');
    const voiceName =
      typeof entry.voice === 'string' && entry.voice.trim() ? entry.voice.trim() : defaultVoice.name;
    const voiceId =
      typeof entry.voiceId === 'string' && entry.voiceId.trim() ? entry.voiceId.trim() : defaultVoice.voiceId;
    const title =
      typeof entry.title === 'string' && entry.title.trim()
        ? entry.title.trim().replace(/\s+/g, ' ')
        : `Section ${i + 1}`;
    const index = Number.isInteger(entry.index) && entry.index >= 0 ? entry.index : i;
    const characters = Number.isInteger(entry.characters) && entry.characters >= 0
      ? entry.characters
      : typeof entry.text === 'string'
        ? entry.text.trim().length
        : 0;
    sections.push({
      index,
      title,
      type: entry.type,
      voice: { name: voiceName, voiceId },
      audio,
      characters,
    });
  }

  const givenTitle =
    typeof parsed.title === 'string' && parsed.title.trim()
      ? parsed.title.trim().replace(/\s+/g, ' ')
      : '';
  const sfxResolved =
    typeof parsed.sfxPath === 'string' && parsed.sfxPath.trim()
      ? path.isAbsolute(parsed.sfxPath)
        ? parsed.sfxPath
        : path.resolve(manifestDir, parsed.sfxPath)
      : null;

  return {
    resolved,
    manifest: {
      title: givenTitle || sections[0].title,
      model: typeof parsed.model === 'string' && parsed.model.trim() ? parsed.model.trim() : AGENSI_TTS_MODEL,
      provider: typeof parsed.provider === 'string' && parsed.provider.trim() ? parsed.provider.trim() : 'agensi',
      mode,
      sfxPath: sfxResolved,
      characters:
        Number.isInteger(parsed.characters) && parsed.characters >= 0
          ? parsed.characters
          : sections.reduce((sum, s) => sum + s.characters, 0),
      sections,
    },
  };
}

async function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(USAGE);
    return;
  }

  if (args.splitPath) {
    const loaded = await loadSections(args.splitPath);
    const splitDoc = splitDocumentForLimit(loaded.document, args.maxChars);
    const jsonText = `${JSON.stringify(splitDoc, null, 2)}\n`;
    if (args.out) {
      const written = await writeFileEnsured(args.out, jsonText);
      console.log(`Wrote: ${written}`);
      console.log(`Sections: ${splitDoc.sections.length}`);
    } else {
      process.stdout.write(jsonText);
    }
    return;
  }

  if (args.assemblePath) {
    const outPath = normalizeOutPath(args.out);
    const loaded = await loadAssembleManifest(args.assemblePath, args.mode);
    const timelinePath = timelinePathFor(outPath);
    if (loaded.resolved === path.resolve(outPath) || loaded.resolved === timelinePath) {
      throw new Error('Choose an --out path that does not overwrite the manifest file.');
    }

    const { manifest } = loaded;
    let sfxAudio = null;
    const wantSfx = args.sfx && manifest.sections.length > 1 && Boolean(manifest.sfxPath);
    if (wantSfx) {
      if (await ffmpegAvailable()) {
        sfxAudio = await readLocalMp3(manifest.sfxPath, 'Transition SFX');
      } else {
        console.error('ffmpeg not found, skipping transition sounds');
      }
    }

    const speechParts = manifest.sections.map((section) => section.audio);
    const assembled = await concatenateMp3(speechParts, outPath, sfxAudio);
    const timeline = buildTimeline({
      title: manifest.title,
      model: manifest.model,
      provider: manifest.provider,
      mode: manifest.mode,
      assembly: assembled.assembly,
      output: assembled.outputPath,
      characters: manifest.characters,
      sfxByteLength: assembled.sfxApplied && sfxAudio ? sfxAudio.length : 0,
      sections: manifest.sections.map((section) => ({
        index: section.index,
        title: section.title,
        type: section.type,
        voiceName: section.voice.name,
        voiceId: section.voice.voiceId,
        byteLength: section.audio.length,
      })),
    });
    const writtenTimeline = await writeFileEnsured(timelinePath, `${JSON.stringify(timeline, null, 2)}\n`);
    console.log(formatReport(timeline, writtenTimeline));
    return;
  }

  if (!args.jsonPath) {
    throw new Error(`Pass the path to a sections JSON file, or use --assemble / --split.\n\n${USAGE}`);
  }

  const apiKey = readApiKey();
  const outPath = normalizeOutPath(args.out);
  const loaded = await loadSections(args.jsonPath);
  const timelinePath = timelinePathFor(outPath);
  if (loaded.resolved === path.resolve(outPath) || loaded.resolved === timelinePath) {
    throw new Error('Choose an --out path that does not overwrite the sections file.');
  }

  const { document } = loaded;
  const spoken = [];
  for (let i = 0; i < document.sections.length; i += 1) {
    const section = document.sections[i];
    const voice = voiceFor(section.type, args.mode, 'byok');
    console.error(`Speaking ${i + 1}/${document.sections.length}: ${section.title} (${voice.name})`);
    const result = await generateSpeech(apiKey, section, args.mode);
    spoken.push({ ...section, voice: result.voice, audio: result.audio });
  }

  let sfxAudio = null;
  let wantSfx = args.sfx && spoken.length > 1;
  if (wantSfx && !(await ffmpegAvailable())) {
    // Byte-concat cannot normalize stereo SFX onto mono TTS.
    console.error('ffmpeg not found, skipping transition sounds');
    wantSfx = false;
  }
  if (wantSfx) {
    console.error('Requesting a transition sound.');
    sfxAudio = await generateTransition(apiKey);
  }

  const speechParts = spoken.map((section) => section.audio);
  const assembled = await concatenateMp3(speechParts, outPath, sfxAudio);
  const characters = document.sections.reduce((sum, section) => sum + section.text.length, 0);
  const timeline = buildTimeline({
    title: document.title,
    model: TTS_MODEL,
    provider: 'byok',
    mode: args.mode,
    assembly: assembled.assembly,
    output: assembled.outputPath,
    characters,
    sfxByteLength: assembled.sfxApplied && sfxAudio ? sfxAudio.length : 0,
    sections: spoken.map((section) => ({
      index: section.index,
      title: section.title,
      type: section.type,
      voiceName: section.voice.name,
      voiceId: section.voice.voiceId,
      byteLength: section.audio.length,
    })),
  });
  const writtenTimeline = await writeFileEnsured(timelinePath, `${JSON.stringify(timeline, null, 2)}\n`);
  console.log(formatReport(timeline, writtenTimeline));
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(path.resolve(entry)).href;
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err && err.message ? err.message : String(err));
    process.exit(1);
  });
}

export {
  parseArgs,
  voiceFor,
  splitTextIntoChunks,
  splitDocumentForLimit,
  loadAssembleManifest,
  estimateDurationMs,
  parseSectionsDocument,
  loadSections,
  buildTimeline,
  timelinePathFor,
  normalizeOutPath,
  concatWithFfmpeg,
  concatMp3Bytes,
  VOICE_MAP,
  AGENSI_VOICE_MAP,
  SINGLE_VOICE,
  TTS_MODEL,
  AGENSI_TTS_MODEL,
  AGENSI_MAX_CHARS,
  OUTPUT_FORMAT,
  SFX_PROMPT,
};
