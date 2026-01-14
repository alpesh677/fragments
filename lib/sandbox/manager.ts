import { Sandbox } from '@e2b/code-interpreter'

const sandboxCache = new Map<string, { sandbox: Sandbox; createdAt: number }>()
const TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes

export async function getOrCreateSandbox(
  sessionId: string,
  templateId: string,
): Promise<Sandbox> {
  const cached = sandboxCache.get(sessionId)

  if (cached && Date.now() - cached.createdAt < TIMEOUT_MS) {
    return cached.sandbox
  }

  const sandbox = await Sandbox.create(templateId, {
    metadata: { sessionId, template: templateId },
    timeoutMs: TIMEOUT_MS,
  })

  sandboxCache.set(sessionId, { sandbox, createdAt: Date.now() })
  return sandbox
}

export async function getSandboxById(sandboxId: string): Promise<Sandbox> {
  return Sandbox.connect(sandboxId)
}

export function cleanupSandbox(sessionId: string) {
  const cached = sandboxCache.get(sessionId)
  if (cached) {
    cached.sandbox.kill().catch(console.error)
    sandboxCache.delete(sessionId)
  }
}
