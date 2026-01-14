import { toPrompt } from '@/lib/prompt'
import { Templates } from '@/lib/templates'
import { Sandbox } from '@e2b/code-interpreter'
import {
  createAgent,
  createNetwork,
  createTool,
  gemini,
} from '@inngest/agent-kit'
import { z } from 'zod'

export async function runCodingAgent({
  sandbox,
  userPrompt,
  template,
}: {
  sandbox: Sandbox
  userPrompt: string
  template: Templates
}) {
  // Use existing prompt system from lib/prompt.ts
  const systemPrompt = toPrompt(template)

  const agent = createAgent({
    name: 'Frontend Coding Agent',
    system: systemPrompt,
    model: gemini({ model: 'gemini-2.5-flash' }),
    tools: [
      // Terminal command execution
      createTool({
        name: 'terminal',
        description: 'Run a terminal command in the sandbox',
        parameters: z.object({ command: z.string() }),
        handler: async ({ command }) => {
          const result = await sandbox.commands.run(command)
          return (
            result.stdout + (result.stderr ? `\nSTDERR: ${result.stderr}` : '')
          )
        },
      }),

      // File operations
      createTool({
        name: 'createOrUpdateFiles',
        description: 'Create or update files in the project',
        parameters: z.object({
          files: z.array(z.object({ path: z.string(), content: z.string() })),
        }),
        handler: async ({ files }) => {
          for (const file of files) {
            await sandbox.files.write(file.path, file.content)
          }
          return `Wrote ${files.length} file(s)`
        },
      }),

      // File reading
      createTool({
        name: 'readFile',
        description: "Read a file's contents",
        parameters: z.object({ path: z.string() }),
        handler: async ({ path }) => await sandbox.files.read(path),
      }),

      // Directory listing
      createTool({
        name: 'listFiles',
        description: 'List files in a directory',
        parameters: z.object({ path: z.string() }),
        handler: async ({ path }) => {
          const result = await sandbox.commands.run(
            `find ${path} -type f 2>/dev/null || ls -la ${path}`,
          )
          return result.stdout
        },
      }),

      // Code execution - for Python/Jupyter templates
      createTool({
        name: 'executeCode',
        description:
          'Execute Python code and return results (for code-interpreter template)',
        parameters: z.object({ code: z.string() }),
        handler: async ({ code }) => {
          const { logs, error, results } = await sandbox.runCode(code)
          if (error) {
            return `Error: ${error.name}: ${error.value}\n${error.traceback}`
          }
          return JSON.stringify({
            stdout: logs.stdout,
            stderr: logs.stderr,
            results: results.map((r) => r.text || r.html || '[binary output]'),
          })
        },
      }),
    ],
  })

  const network = createNetwork({
    name: 'frontend-agent-network',
    agents: [agent],
    maxIter: 15,
    defaultRouter: () => agent,
  })

  return network.run(userPrompt)
}
