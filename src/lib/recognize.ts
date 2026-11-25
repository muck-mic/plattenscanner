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

function loadClaude() {
  return import('./claude').catch(() => {
    // After a new version was published the old file is gone; a reload fetches the current one.
    throw new RecognizeError('Die App wurde aktualisiert. Bitte schließe sie und öffne sie neu.')
  })
}

export interface Recognition {
  info: RecordInfo
  costUsd: number
}

export async function recognizeRecord(apiKey: string, model: ModelChoice, jpegBase64: string): Promise<Recognition> {
  return askAboutPhoto(apiKey, model, jpegBase64, PROMPT, RecordInfo, 'low')
}

/** Sends one photo plus instructions to Claude and returns the structured answer and its estimated cost. */
export async function askAboutPhoto<S extends z.ZodType>(
  apiKey: string,
  model: ModelChoice,
  jpegBase64: string,
  prompt: string,
  schema: S,
  effort: 'low' | 'medium',
): Promise<{ info: z.infer<S>; costUsd: number }> {
  if (!apiKey) throw new RecognizeError('Kein Claude-Schlüssel hinterlegt. Bitte in den Einstellungen eintragen.')
  // The Claude SDK is loaded only when it's first needed, so the app starts faster.
  const { callClaude } = await loadClaude()
  return callClaude(apiKey, model, jpegBase64, prompt, schema, effort)
}

/** Free check whether a key works: looks up the model, which costs no tokens. */
export async function checkApiKey(apiKey: string, model: ModelChoice) {
  const { checkKey } = await loadClaude()
  return checkKey(apiKey, model)
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
