import { inngest } from '@/lib/inngest/client'
import { generateFrontend } from '@/lib/inngest/functions/generate-frontend'
import { serve } from 'inngest/next'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [generateFrontend],
})
