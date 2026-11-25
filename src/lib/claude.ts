import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import type { z } from 'zod'
import { MODELS, RecognizeError, type ModelChoice } from './recognize'

// Loaded on demand from recognize.ts; holds everything that needs the Claude SDK.

export async function callClaude<S extends z.ZodType>(
  apiKey: string,
  model: ModelChoice,
  jpegBase64: string,
  prompt: string,
  schema: S,
  effort: 'low' | 'medium',
): Promise<{ info: z.infer<S>; costUsd: number }> {
  // The key is stored only on this device and the app is for personal use, so calling the API from the browser is acceptable.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 })

  let response
  try {
    response = await client.beta.messages.parse({
      model,
      max_tokens: 4000,
      output_config: { effort, format: betaZodOutputFormat(schema) },
      // Opus 5.5: if a safety classifier declines, the API retries on a suitable fallback model.
      ...(model === 'claude-opus-5-5' ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpegBase64 } },
            { type: 'text', text: prompt },
          ],
        },
      ],
    })
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new RecognizeError('Claude lehnt den Schlüssel ab. Bitte in den Einstellungen prüfen.')
    if (err instanceof Anthropic.PermissionDeniedError) throw new RecognizeError('Der Schlüssel hat keinen Zugriff auf dieses Modell.')
    if (err instanceof Anthropic.RateLimitError) throw new RecognizeError('Zu viele Anfragen an Claude. Bitte kurz warten.')
    if (err instanceof Anthropic.BadRequestError) throw new RecognizeError(`Claude konnte die Anfrage nicht verarbeiten: ${err.message}`)
    if (err instanceof Anthropic.APIConnectionError) throw new RecognizeError('Keine Verbindung zu Claude. Bist du online?')
    if (err instanceof Anthropic.APIError) throw new RecognizeError(`Claude-Fehler ${err.status ?? ''}. Bitte erneut versuchen.`)
    throw err
  }

  const price = MODELS[model]
  const u = response.usage
  const inputTokens = u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0)
  const costUsd = (inputTokens * price.inputPerM + u.output_tokens * price.outputPerM) / 1_000_000

  if (response.stop_reason === 'refusal') throw new RecognizeError('Claude hat die Erkennung dieses Fotos abgelehnt.')
  if (response.stop_reason === 'max_tokens' || !response.parsed_output)
    throw new RecognizeError('Die Antwort von Claude war unvollständig. Bitte erneut versuchen.')
  return { info: response.parsed_output, costUsd }
}


export async function checkKey(apiKey: string, model: ModelChoice) {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 0 })
  try {
    await client.models.retrieve(model)
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new RecognizeError('Claude lehnt den Schlüssel ab.')
    if (err instanceof Anthropic.APIConnectionError) throw new RecognizeError('Keine Verbindung zu Claude.')
    if (err instanceof Anthropic.APIError) throw new RecognizeError(`Prüfung fehlgeschlagen (Fehler ${err.status ?? ''}).`)
    throw err
  }
}

