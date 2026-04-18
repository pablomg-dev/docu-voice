import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'
import ffprobeInstaller from '@ffprobe-installer/ffprobe'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { createSessionId } from '@/lib/sessionStore'
import type { AudioSegment, AudioTimeline, Section } from '@/types'

// Point fluent-ffmpeg at the bundled binaries
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic)
}
ffmpeg.setFfprobePath(ffprobeInstaller.path)

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function writeTempFile(buffer: Buffer, ext = 'mp3'): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'docuvoice-'))
  const filePath = path.join(tmpDir, `segment.${ext}`)
  await fs.writeFile(filePath, buffer)
  return filePath
}

async function cleanupFiles(files: string[]): Promise<void> {
  for (const f of files) {
    try {
      await fs.unlink(f)
      await fs.rmdir(path.dirname(f)).catch(() => {/* ignore if not empty */})
    } catch {
      // Best-effort cleanup
    }
  }
}

/**
 * Concatenate an ordered list of MP3 file paths into a single MP3 buffer.
 */
function concatMp3Files(inputPaths: string[], outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg()
    for (const p of inputPaths) cmd.input(p)

    cmd
      .on('error', reject)
      .on('end', () => resolve())
      .mergeToFile(outputPath, os.tmpdir())
  })
}

/**
 * Mix a background music track under the main audio at ≤20% volume.
 */
function mixWithBackground(
  mainPath: string,
  bgPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(mainPath)
      .input(bgPath)
      .complexFilter([
        '[1:a]volume=0.2[bg]',
        '[0:a][bg]amix=inputs=2:duration=first[out]',
      ])
      .outputOptions(['-map [out]', '-codec:a libmp3lame', '-q:a 4'])
      .output(outputPath)
      .on('error', reject)
      .on('end', () => resolve())
      .run()
  })
}

// ─── Main assembler ───────────────────────────────────────────────────────────

export interface AssembleInput {
  sections: Section[]
  segments: AudioSegment[]
  transitions: AudioSegment[]
  backgroundMusic?: AudioSegment
  title?: string
}

/**
 * Assembles an AudioTimeline from section segments and transition effects.
 *
 * Order: [seg0, sfx0, seg1, sfx1, ..., segN]
 *
 * Records startTimestamp and endTimestamp (ms) for each section.
 */
export async function assemble(input: AssembleInput): Promise<AudioTimeline> {
  const { sections, segments, transitions, backgroundMusic, title = 'DocuVoice Audio' } = input

  if (segments.length === 0) {
    throw new Error('Cannot assemble an empty segment list')
  }

  const tempFiles: string[] = []

  try {
    // Write all segment and transition buffers to temp files
    const segPaths: string[] = []
    for (const seg of segments) {
      const p = await writeTempFile(seg.buffer)
      segPaths.push(p)
      tempFiles.push(p)
    }

    const sfxPaths: string[] = []
    for (const sfx of transitions) {
      const p = await writeTempFile(sfx.buffer)
      sfxPaths.push(p)
      tempFiles.push(p)
    }

    // Build interleaved file list and compute timestamps
    const orderedPaths: string[] = []
    const timestampedSections: Array<Section & { startTimestamp: number; endTimestamp: number }> = []
    let cursor = 0

    for (let i = 0; i < segments.length; i++) {
      const startTimestamp = cursor
      orderedPaths.push(segPaths[i])
      cursor += segments[i].durationMs
      const endTimestamp = cursor

      timestampedSections.push({
        ...sections[i],
        startTimestamp,
        endTimestamp,
      })

      // Add transition after each section except the last
      if (i < transitions.length) {
        orderedPaths.push(sfxPaths[i])
        cursor += transitions[i].durationMs
      }
    }

    // Concatenate all into a single MP3
    const concatTmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'docuvoice-out-'))
    const concatPath = path.join(concatTmpDir, 'full.mp3')
    tempFiles.push(concatPath)

    await concatMp3Files(orderedPaths, concatPath)

    // Optionally mix background music
    let finalPath = concatPath
    if (backgroundMusic) {
      const bgPath = await writeTempFile(backgroundMusic.buffer)
      tempFiles.push(bgPath)

      const mixedTmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'docuvoice-mix-'))
      const mixedPath = path.join(mixedTmpDir, 'mixed.mp3')
      tempFiles.push(mixedPath)

      await mixWithBackground(concatPath, bgPath, mixedPath)
      finalPath = mixedPath
    }

    const fullMp3 = await fs.readFile(finalPath)

    // Build individual section MP3 buffers
    const sectionMp3s = segments.map((s) => s.buffer)

    const sessionId = createSessionId()

    return {
      sessionId,
      fullMp3,
      sectionMp3s,
      sections: timestampedSections,
      createdAt: new Date(),
      title,
    }
  } finally {
    await cleanupFiles(tempFiles)
  }
}
