import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'

export type ModelChoice = 'claude-opus-5-5' | 'claude-haiku-5-5'

export const MODELS: Record<ModelChoice, { label: string; inputPerM: number; outputPerM: number }> = {
  'claude-opus-5-5': { label: 'Opus 5.5 (genau)', inputPerM: 4, outputPerM: 20 },
  'claude-haiku-5-5': { label: 'Haiku 5.5 (günstig)', inputPerM: 0.1, outputPerM: 0.5 },
}

const RecordInfo = z.object({
  artist: z.string().nullable().describe('Künstler/Band, wie auf Cover oder Label gedruckt'),
  title: z.string().nullable().describe('Albumtitel'),
  label: z.string().nullable().describe('Plattenlabel'),
  catno: z.string().nullable().describe('Katalognummer, exakt wie gedruckt, z. B. "SHVL 804"'),
  barcode: z.string().nullable().describe('Barcode-Ziffern, nur falls lesbar'),
  country: z.string().nullable().describe('Herstellungsland, falls erkennbar (z. B. "Germany")'),
  year: z.string().nullable().describe('Erscheinungsjahr, falls aufgedruckt'),
  notes: z.string().describe('Kurze Hinweise auf Deutsch, z. B. was unsicher ist'),
  confidence: z.enum(['high', 'medium', 'low']),
})
export type RecordInfo = z.infer<typeof RecordInfo>

const PROMPT = `Auf dem Foto ist eine Schallplatte: Cover (Vorder- oder Rückseite) oder das Label in der Mitte der Platte.
Lies die Angaben ab, mit denen sich diese Platte und möglichst die genaue Pressung auf Discogs finden lässt.
Übernimm Text exakt so, wie er gedruckt ist (Schreibweise, Leerzeichen und Bindestriche in Katalognummern).
Setze ein Feld auf null, wenn es auf dem Foto nicht zu sehen ist. Rate keine Katalognummern, Barcodes oder Jahreszahlen.
Wenn du den Künstler und das Album am Coverbild erkennst, obwohl kein Text lesbar ist, gib sie an und setze confidence auf "low" oder "medium".`

export class RecognizeError extends Error {}

export interface Recognition {
  info: RecordInfo
  costUsd: number
}

export async function recognizeRecord(apiKey: string, model: ModelChoice, jpegBase64: string): Promise<Recognition> {
  if (!apiKey) throw new RecognizeError('Kein Claude-Schlüssel hinterlegt. Bitte in den Einstellungen eintragen.')
  // The key is stored only on this device and the app is for personal use, so calling the API from the browser is acceptable.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 })

  let response
  try {
    response = await client.beta.messages.parse({
      model,
      max_tokens: 4000,
      output_config: { effort: 'low', format: betaZodOutputFormat(RecordInfo) },
      // Opus 5.5: if a safety classifier declines, the API retries on a suitable fallback model.
      ...(model === 'claude-opus-5-5' ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpegBase64 } },
            { type: 'text', text: PROMPT },
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

/** Free check whether a key works: looks up the model, which costs no tokens. */
export async function checkApiKey(apiKey: string, model: ModelChoice) {
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

/** Grabs the current video frame as JPEG, long edge at most 1568 px (Claude's useful image size). */
export function captureFrame(video: HTMLVideoElement): string | null {
  const w = video.videoWidth
  const h = video.videoHeight
  if (!w || !h) return null
  const scale = Math.min(1, 1568 / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.85).split(',')[1]
}

/** Same for a photo picked from the library. */
export async function fileToJpegBase64(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1568 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.85).split(',')[1]
}
