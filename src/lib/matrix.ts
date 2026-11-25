import { z } from 'zod'
import { askAboutPhoto, type ModelChoice } from './recognize'
import { getRelease, matrixIdentifiers, type ReleaseDetail } from './discogs'

const MatrixReading = z.object({
  sides: z
    .array(
      z.object({
        side: z.string().nullable().describe('Seite, falls erkennbar (z. B. "A", "B", "1"), sonst null'),
        text: z.string().describe('Alle Zeichen dieser Seite in der Auslaufrille, exakt wie eingeritzt oder gestempelt'),
      }),
    )
    .describe('Eine Zeile pro Plattenseite, die auf dem Foto zu sehen ist'),
  notes: z.string().describe('Kurze Hinweise auf Deutsch, z. B. welche Zeichen unsicher sind'),
  confidence: z.enum(['high', 'medium', 'low']),
})
export type MatrixReading = z.infer<typeof MatrixReading>

const PROMPT = `Auf dem Foto ist die Auslaufrille (Run-out, „dead wax“) einer Schallplatte zu sehen: der glatte Ring zwischen der letzten Rille und dem Label.
Dort ist die Matrixnummer eingeritzt oder eingestempelt, oft zusammen mit weiteren Zeichen (Presswerk, Schneide-Ingenieur, Symbole wie △ oder ▽, Unterschriften, Buchstaben wie „STERLING“).
Schreibe alle Zeichen in der Auslaufrille genau so ab, wie sie dort stehen, in Leserichtung entlang des Rings, getrennt durch einzelne Leerzeichen.
Achte auf Zeichen, die leicht zu verwechseln sind (0 und O, 1 und I, 5 und S, 8 und B) und nenne Unsicherheiten in den Hinweisen.
Gib nichts an, was nicht auf dem Foto steht. Der Text auf dem Papier-Label gehört nicht dazu.`

export function readMatrix(apiKey: string, model: ModelChoice, jpegBase64: string) {
  return askAboutPhoto(apiKey, model, jpegBase64, PROMPT, MatrixReading, 'medium')
}

/** Uppercase letters and digits only; letters that look like digits become digits. */
export function normalizeMatrix(s: string) {
  return s
    .normalize('NFKD')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
}

/** Similarity 0..1 based on the longest common subsequence, tolerant of missing or extra characters. */
export function similarity(a: string, b: string) {
  if (!a || !b) return 0
  const prev = new Array<number>(b.length + 1).fill(0)
  for (let i = 1; i <= a.length; i++) {
    let diag = 0
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = a[i - 1] === b[j - 1] ? diag + 1 : Math.max(prev[j], prev[j - 1])
      diag = tmp
    }
  }
  return (2 * prev[b.length]) / (a.length + b.length)
}

export interface MatrixMatch {
  score: number | null // null: Discogs has no matrix for this release
  best: { read: string; discogs: string; description?: string }[]
}

/** How well the read inscriptions match one release's "Matrix / Runout" identifiers. */
export function matchRelease(readSides: string[], release: ReleaseDetail): MatrixMatch {
  const ids = matrixIdentifiers(release)
  if (!ids.length) return { score: null, best: [] }
  const best = readSides
    .filter((t) => normalizeMatrix(t))
    .map((read) => {
      const n = normalizeMatrix(read)
      let top = { score: 0, id: ids[0] }
      for (const id of ids) {
        const sc = similarity(n, normalizeMatrix(id.value))
        if (sc > top.score) top = { score: sc, id }
      }
      return { read, score: top.score, discogs: top.id.value, description: top.id.description }
    })
  if (!best.length) return { score: null, best: [] }
  const score = best.reduce((sum, b) => sum + b.score, 0) / best.length
  return { score, best: best.map(({ read, discogs, description }) => ({ read, discogs, description })) }
}

export const MAX_CANDIDATES = 30

/** Loads details for each candidate (one after another, to respect Discogs' rate limit) and scores them. */
export async function scoreCandidates(
  token: string,
  ids: number[],
  readSides: string[],
  onProgress: (done: number, total: number) => void,
) {
  const list = ids.slice(0, MAX_CANDIDATES)
  const scores = new Map<number, MatrixMatch>()
  for (let i = 0; i < list.length; i++) {
    onProgress(i, list.length)
    const release = await getRelease(token, list[i])
    scores.set(list[i], matchRelease(readSides, release))
  }
  onProgress(list.length, list.length)
  return scores
}

export function matchLabel(score: number | null) {
  if (score === null) return { text: 'Keine Matrix bei Discogs', tone: 'none' as const }
  const pct = Math.round(score * 100)
  if (score >= 0.9) return { text: `Matrix passt (${pct} %)`, tone: 'good' as const }
  if (score >= 0.7) return { text: `Matrix ähnlich (${pct} %)`, tone: 'mid' as const }
  return { text: `Matrix weicht ab (${pct} %)`, tone: 'bad' as const }
}
