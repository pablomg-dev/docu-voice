import { NextRequest } from 'next/server'
import { get as storeGet } from '@/lib/sessionStore'
import { deriveFilename } from '@/lib/fileNames'

interface RouteParams {
  params: Promise<{ sessionId: string }>
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { sessionId } = await params
  const timeline = await storeGet(sessionId)

  if (!timeline) {
    return new Response(
      JSON.stringify({ error: 'Session not found or expired.', code: 'NOT_FOUND' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const { searchParams } = new URL(req.url)
  const sectionParam = searchParams.get('section')
  const isStream = searchParams.has('stream')

  // ── Individual section download ──────────────────────────────────────────
  if (sectionParam !== null) {
    const sectionIndex = parseInt(sectionParam, 10)

    if (
      isNaN(sectionIndex) ||
      sectionIndex < 0 ||
      sectionIndex >= timeline.sectionMp3s.length
    ) {
      return new Response(
        JSON.stringify({ error: `Section index ${sectionParam} is out of range.`, code: 'BAD_REQUEST' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const section = timeline.sections[sectionIndex]
    const filename = deriveFilename(
      timeline.title,
      `section-${sectionIndex}-${section.type}`
    )

    const headers: Record<string, string> = {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(timeline.sectionMp3s[sectionIndex].length),
    }
    if (!isStream) {
      headers['Content-Disposition'] = `attachment; filename="${filename}"`
    }

    return new Response(new Uint8Array(timeline.sectionMp3s[sectionIndex]), {
      headers,
    })
  }

  // ── Full audio ───────────────────────────────────────────────────────────
  const filename = deriveFilename(timeline.title)
  const fullMp3 = timeline.fullMp3
  const fileSize = fullMp3.length
  const range = req.headers.get('range')

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-")
    const start = parseInt(parts[0], 10)
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
    const chunksize = (end - start) + 1
    const file = fullMp3.subarray(start, end + 1)

    const headers: Record<string, string> = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(chunksize),
    }
    if (!isStream) {
      headers['Content-Disposition'] = `attachment; filename="${filename}"`
    }

    return new Response(new Uint8Array(file), {
      status: 206,
      headers,
    })
  }

  const headers: Record<string, string> = {
    'Content-Type': 'audio/mpeg',
    'Content-Length': String(fileSize),
    'Accept-Ranges': 'bytes',
  }
  if (!isStream) {
    headers['Content-Disposition'] = `attachment; filename="${filename}"`
  }

  return new Response(new Uint8Array(fullMp3), {
    headers,
  })
}
