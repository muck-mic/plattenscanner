import { useEffect, useState } from 'react'
import {
  addToCollection,
  DiscogsError,
  detailUrl,
  getCollectionFields,
  getFolders,
  getIdentity,
  getInstances,
  setInstanceField,
  type CollectionField,
  type Folder,
  type ReleaseDetail,
} from '../lib/discogs'
import type { MatrixMatch } from '../lib/matrix'
import { addRecord, MEDIA_CONDITIONS, recordsForRelease, SLEEVE_CONDITIONS } from '../lib/store'
import type { Settings, UpdateSettings } from '../lib/settings'

interface Props {
  settings: Settings
  update: UpdateSettings
  release: ReleaseDetail
  match?: MatrixMatch
}

interface Collection {
  username: string
  folders: Folder[]
  fields: CollectionField[]
  copies: number
}

type Save = { state: 'idle' } | { state: 'saving' } | { state: 'done'; lines: string[]; failed: boolean }

const errorText = (err: unknown) => (err instanceof DiscogsError ? err.message : 'Unbekannter Fehler')
const findField = (fields: CollectionField[], re: RegExp) => fields.find((f) => re.test(f.name))

export default function SavePanel({ settings, update, release, match }: Props) {
  const token = settings.discogsToken
  const [collection, setCollection] = useState<Collection | null>(null)
  const [collectionError, setCollectionError] = useState('')
  const [localCopies, setLocalCopies] = useState(0)
  const [media, setMedia] = useState('')
  const [sleeve, setSleeve] = useState('')
  const [notes, setNotes] = useState('')
  const [save, setSave] = useState<Save>({ state: 'idle' })

  // Collection info: folders, condition fields and whether this release is already in it.
  useEffect(() => {
    if (!token) return
    let cancelled = false
    ;(async () => {
      try {
        const username = settings.discogsUsername || (await getIdentity(token)).username
        const [folders, fields, instances] = await Promise.all([
          getFolders(token, username),
          getCollectionFields(token, username),
          getInstances(token, username, release.id),
        ])
        if (!cancelled) setCollection({ username, folders, fields, copies: instances.length })
      } catch (err) {
        if (!cancelled) setCollectionError(errorText(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, settings.discogsUsername, release.id])

  useEffect(() => {
    let cancelled = false
    recordsForRelease(release.id).then((r) => !cancelled && setLocalCopies(r.length), () => {})
    return () => {
      cancelled = true
    }
  }, [release.id, save])

  const mediaField = collection && findField(collection.fields, /media|tonträger/i)
  const sleeveField = collection && findField(collection.fields, /sleeve|hülle|cover/i)
  const notesField = collection && findField(collection.fields, /note|notiz/i)
  const mediaOptions = mediaField?.options?.length ? mediaField.options : MEDIA_CONDITIONS
  const sleeveOptions = sleeveField?.options?.length ? sleeveField.options : SLEEVE_CONDITIONS

  const toDiscogs = settings.saveDiscogs && !!token
  const toLocal = settings.saveLocal
  const folderId = collection?.folders.some((f) => f.id === settings.discogsFolderId) ? settings.discogsFolderId : 1
  const folderName = collection?.folders.find((f) => f.id === folderId)?.name ?? 'Uncategorized'

  async function onSave() {
    setSave({ state: 'saving' })
    const lines: string[] = []
    let failed = false
    let instanceId: number | null = null

    if (toDiscogs) {
      try {
        if (!collection) throw new DiscogsError(collectionError || 'Die Sammlung ist noch nicht geladen.', 0)
        const { username } = collection
        const added = await addToCollection(token, username, folderId, release.id)
        instanceId = added.instance_id
        const fieldValues: [CollectionField | null | undefined, string][] = [
          [mediaField, media],
          [sleeveField, sleeve],
          [notesField, notes.trim()],
        ]
        for (const [field, value] of fieldValues) {
          if (field && value) await setInstanceField(token, username, folderId, release.id, instanceId, field.id, value)
        }
        setCollection({ ...collection, copies: collection.copies + 1 })
        lines.push(`In deine Discogs-Sammlung gelegt (Ordner „${folderName}“) ✓`)
      } catch (err) {
        failed = true
        lines.push(`Discogs: ${errorText(err)}${instanceId ? ' (Die Platte ist in der Sammlung, aber Zustand/Notiz fehlen.)' : ''}`)
      }
    }

    if (toLocal) {
      try {
        await addRecord({
          releaseId: release.id,
          title: release.title,
          artist: release.artists_sort ?? '',
          label: release.labels?.[0]?.name ?? '',
          catno: release.labels?.[0]?.catno ?? '',
          country: release.country ?? '',
          year: release.year ? String(release.year) : '',
          format: (release.formats ?? []).map((f) => [f.name, ...(f.descriptions ?? []), f.text].filter(Boolean).join(', ')).join(' + '),
          thumb: release.images?.[0]?.uri150 ?? '',
          discogsUrl: detailUrl(release),
          mediaCondition: media,
          sleeveCondition: sleeve,
          notes: notes.trim(),
          matrixRead: match?.best.map((b) => b.read) ?? [],
          matrixScore: match?.score ?? null,
          discogsInstanceId: instanceId,
        })
        lines.push('In deine eigene Liste gespeichert ✓')
      } catch {
        failed = true
        lines.push('Eigene Liste: Speichern auf dem Gerät hat nicht geklappt.')
      }
    }
    setSave({ state: 'done', lines, failed })
  }

  const already = [
    collection?.copies ? `${collection.copies}× in deiner Discogs-Sammlung` : '',
    localCopies ? `${localCopies}× in deiner Liste` : '',
  ].filter(Boolean)

  return (
    <section className="save-panel" aria-label="Speichern">
      <h2 className="group-label">Speichern</h2>
      {already.length > 0 && <p className="notice">Schon vorhanden: {already.join(' · ')}</p>}

      <div className="group">
        <label className="row">
          <span>Discogs-Sammlung</span>
          <input type="checkbox" className="switch" checked={toDiscogs} disabled={!token}
            onChange={(e) => update({ saveDiscogs: e.target.checked })} />
        </label>
        {toDiscogs && collection && collection.folders.length > 1 && (
          <label className="row">
            <span>Ordner</span>
            <select className="row-select" value={folderId} onChange={(e) => update({ discogsFolderId: Number(e.target.value) })}>
              {collection.folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </label>
        )}
        <label className="row">
          <span>Eigene Liste</span>
          <input type="checkbox" className="switch" checked={toLocal} onChange={(e) => update({ saveLocal: e.target.checked })} />
        </label>
        <label className="row">
          <span>Zustand Platte</span>
          <select className="row-select" value={media} onChange={(e) => setMedia(e.target.value)}>
            <option value="">–</option>
            {mediaOptions.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
        <label className="row">
          <span>Zustand Hülle</span>
          <select className="row-select" value={sleeve} onChange={(e) => setSleeve(e.target.value)}>
            <option value="">–</option>
            {sleeveOptions.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
        <label className="row">
          <span>Notiz</span>
          <input className="row-input" value={notes} placeholder="optional" onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>
      {toDiscogs && collectionError && <p className="error">Sammlung: {collectionError}</p>}
      {!token && <p className="hint">Für die Discogs-Sammlung brauchst du ein Token in den Einstellungen.</p>}

      {save.state === 'done' ? (
        <div className={save.failed ? 'notice' : 'saved'} role="status">
          {save.lines.map((l) => <span key={l}>{l}</span>)}
          <button className="link" onClick={() => setSave({ state: 'idle' })}>Noch ein Exemplar speichern</button>
        </div>
      ) : (
        <button className="btn primary" disabled={save.state === 'saving' || (!toDiscogs && !toLocal) || (toDiscogs && !collection && !collectionError)}
          onClick={onSave}>
          {save.state === 'saving' ? 'Speichere …' : !toDiscogs && !toLocal ? 'Ziel auswählen' : 'Speichern'}
        </button>
      )}
    </section>
  )
}
