#!/usr/bin/env node
/**
 * Narrate a sections JSON file to a local MP3 with ElevenLabs.
 *
 * API key: process.env.ELEVENLABS_API_KEY only. It is sent as the xi-api-key
 * header to https://api.elevenlabs.io and nowhere else.
 * Local read: the sections JSON path given on the command line.
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
const OUTPUT_FORMAT = 'mp3_44100_128';
const SFX_PROMPT = 'subtle whoosh chime transition';
const SFX_SECONDS = 2;
const BYTES_PER_SECOND = 16000;
const MAX_SECTION_CHARS = 40000;
const MAX_SECTIONS = 50;
const MAX_JSON_BYTES = 2_000_000;
const REQUEST_TIMEOUT_MS = 90_000;

// Public ElevenLabs premade voice ids. Catalog identifiers, not account keys.
const VOICE_MAP = {
  introduction: { name: 'Jessica', voiceId: 'cgSgspJ2msm6clMCkdW9' },
  code: { name: 'Adam', voiceId: 'pNInz6obpgDQGcFmaJgB' },
  warning: { name: 'Antoni', voiceId: 'ErXwobaYiN019PkySvjV' },
  steps: { name: 'Bella', voiceId: 'EXAVITQu4vr4xnSDxMaL' },
};

const SINGLE_VOICE = VOICE_MAP.introduction;
const SECTION_TYPES = new Set(['introduction', 'code', 'warning', 'steps']);

const USAGE = [
  'Usage: node narrate.mjs <sections.json> [--mode single|multi] [--sfx on|off] [--out podcast.mp3]',
  '',
  'Reads ELEVENLABS_API_KEY from the environment and sends it only as the',
  'xi-api-key header to https://api.elevenlabs.io.',
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
      'ELEVENLABS_API_KEY is not set. Add your ElevenLabs API key to the environment and run again. ' +
        'The key is sent only as the xi-api-key header to https://api.elevenlabs.io and is not written to the MP3 or the timeline.'
    );
  }
  return apiKey.trim();
}

function parseArgs(argv) {
  const args = {
    jsonPath: null,
    mode: 'multi',
    sfx: true,
    out: 'podcast.mp3',
    help: false,
  };
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }
    if (arg === '--mode' || arg === '--sfx' || arg === '--out') {
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

  if (positional.length > 1) {
    throw new Error('Pass one sections JSON path.');
  }
  args.jsonPath = positional[0] || null;
  return args;
}

function voiceFor(type, mode) {
  if (mode === 'single') return SINGLE_VOICE;
  const voice = VOICE_MAP[type];
  if (!voice) throw new Error(`Unknown section type: ${type}`);
  return voice;
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

function buildTimeline({ title, mode, assembly, output, characters, sfxByteLength, sections }) {
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
    model: TTS_MODEL,
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

async function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(USAGE);
    return;
  }
  if (!args.jsonPath) {
    throw new Error(`Pass the path to a sections JSON file.\n\n${USAGE}`);
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
    const voice = voiceFor(section.type, args.mode);
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
  estimateDurationMs,
  parseSectionsDocument,
  loadSections,
  buildTimeline,
  timelinePathFor,
  normalizeOutPath,
  concatWithFfmpeg,
  concatMp3Bytes,
  VOICE_MAP,
  SINGLE_VOICE,
  TTS_MODEL,
  OUTPUT_FORMAT,
  SFX_PROMPT,
};
