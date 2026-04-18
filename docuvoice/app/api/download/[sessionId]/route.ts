import { NextRequest } from 'next/server'
import { get as storeGet } from '@/lib/sessionStore'
import { deriveFilename } from '@/lib/fileNames'

interface RouteParams {
  params: Promise<{ sessionId: string }>
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { sessionId } = await params
  const timeline = storeGet(sessionId)

  if (!timeline) {
    return new Response(
      JSON.stringify({ error: 'Session not found or expired.', code: 'NOT_FOUND' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const { searchParams } = new URL(req.url)
  const sectionParam = searchParams.get('section')

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

    return new Response(new Uint8Array(timeline.sectionMp3s[sectionIndex]), {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(timeline.sectionMp3s[sectionIndex].length),
      },
    })
  }

  // ── Full audio download ──────────────────────────────────────────────────
  const filename = deriveFilename(timeline.title)

  return new Response(new Uint8Array(timeline.fullMp3), {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(timeline.fullMp3.length),
    },
  })
}
