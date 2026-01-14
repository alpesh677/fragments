import { runCodingAgent } from '../../agent/codingAgent'
import { getOrCreateSandbox } from '../../sandbox/manager'
import { inngest } from '../client'
import templates, { Templates } from '@/lib/templates'

const MAX_SELF_HEAL_ATTEMPTS = 3

export const generateFrontend = inngest.createFunction(
  { id: 'generate-frontend-with-agent', retries: 5 },
  { event: 'frontend/generate' },

  async ({ event, step }) => {
    const { userPrompt, sessionId, templateId, port } = event.data as {
      userPrompt: string
      sessionId: string
      templateId: keyof typeof templates
      port: number
    }

    // Get template config
    const templateConfig = templates[templateId]
    const template = { [templateId]: templateConfig } as Templates
    const actualPort = port || templateConfig?.port || 3000

    // Step 1: Create sandbox
    const sandboxInfo = await step.run('get-sandbox', async () => {
      const sbx = await getOrCreateSandbox(sessionId, String(templateId))
      return { id: sbx.sandboxId, host: sbx.getHost(Number(actualPort)) }
    })

    // Step 2: Generate code with agent
    await step.run('agent-generate-code', async () => {
      const sbx = await getOrCreateSandbox(sessionId, String(templateId))
      await runCodingAgent({ sandbox: sbx, userPrompt, template })
    })

    // Step 3: Handle execution based on template type
    const isPython = templateId === 'code-interpreter-v1'

    if (isPython) {
      // Python templates: code already executed via executeCode tool
      return {
        sandboxId: sandboxInfo.id,
        success: true,
        templateId,
      }
    }

    // Web templates: start dev server with self-healing loop
    let attempt = 0
    let result = { success: false, error: '', previewUrl: '' }

    while (!result.success && attempt < MAX_SELF_HEAL_ATTEMPTS) {
      attempt++

      result = await step.run(`start-server-attempt-${attempt}`, async () => {
        const sbx = await getOrCreateSandbox(sessionId, String(templateId))
        let stderr = ''
        let stdout = ''

        try {
          const execResult = await sbx.commands.run(
            `npm run dev -- --port ${actualPort}`,
            {
              timeoutMs: 30_000,
              onStderr: (d) => {
                stderr += d
              },
              onStdout: (d) => {
                stdout += d
              },
            },
          )

          const hasError =
            stderr.includes('error') ||
            stdout.includes('Failed to compile') ||
            execResult.exitCode !== 0

          return {
            success: !hasError,
            previewUrl: `https://${sbx.getHost(Number(actualPort))}`,
            error: hasError ? stderr || stdout : '',
          }
        } catch (err: any) {
          return {
            success: false,
            previewUrl: `https://${sbx.getHost(Number(actualPort))}`,
            error: err.message || stderr,
          }
        }
      })

      // Self-heal if error occurred
      if (!result.success && result.error && attempt < MAX_SELF_HEAL_ATTEMPTS) {
        await step.run(`self-heal-attempt-${attempt}`, async () => {
          const sbx = await getOrCreateSandbox(sessionId, String(templateId))
          await runCodingAgent({
            sandbox: sbx,
            userPrompt: `The dev server failed with this error. Please analyze and fix the issue:\n\n${result.error}`,
            template,
          })
        })
      }
    }

    return {
      previewUrl: result.previewUrl,
      success: result.success,
      sandboxId: sandboxInfo.id,
      templateId,
      attempts: attempt,
      lastError: result.success ? undefined : result.error,
    }
  },
)
