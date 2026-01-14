import { inngest } from '@/lib/inngest/client'
import { nanoid } from 'nanoid'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const body = await req.json()
  const sessionId = body.sessionId || nanoid()

  const { prompt, templateId } = body

  if (!prompt) {
    return NextResponse.json({ error: 'prompt is required' }, { status: 400 })
  }

  await inngest.send({
    name: 'frontend/generate',
    data: {
      userPrompt: prompt,
      sessionId,
      templateId: templateId || 'nextjs-developer',
      port: body.port || 3000,
    },
  })

  return NextResponse.json({
    status: 'started',
    sessionId,
    message: 'Generation started. Check Inngest dashboard for progress.',
  })
}
