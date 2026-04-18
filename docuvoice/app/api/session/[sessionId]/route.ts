import { NextRequest } from 'next/server'
import { get as storeGet } from '@/lib/sessionStore'

interface RouteParams {
  params: Promise<{ sessionId: string }>
}

/**
 * GET /api/session/[sessionId]
 * Returns lightweight session metadata (sections + title) for the frontend.
 * Does NOT return audio buffers.
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { sessionId } = await params
  const timeline = storeGet(sessionId)

  if (!timeline) {
    return new Response(
      JSON.stringify({ error: 'Session not found or expired.', code: 'NOT_FOUND' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const responseData = {
    sessionId: timeline.sessionId,
    title: timeline.title,
    sections: timeline.sections.map((s) => ({
      index: s.index,
      title: s.title,
      type: s.type,
      text: s.text,
      startTimestamp: s.startTimestamp,
      endTimestamp: s.endTimestamp,
    })),
  };

  console.log('API Session Response:', JSON.stringify(responseData.sections.map(s => ({ i: s.index, start: s.startTimestamp })), null, 2));

  return Response.json(responseData)
}
