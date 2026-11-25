import { useState } from 'react'
import { getIdentity, DiscogsError } from '../lib/discogs'
import type { Settings } from '../lib/settings'

interface Props {
  settings: Settings
  update: (patch: Partial<Settings>) => void
}

type Check = { state: 'idle' } | { state: 'checking' } | { state: 'error'; message: string }

export default function SettingsScreen({ settings, update }: Props) {
  const [token, setToken] = useState(settings.discogsToken)
  const [check, setCheck] = useState<Check>({ state: 'idle' })
  const dirty = token.trim() !== settings.discogsToken

  async function saveAndCheck() {
    const t = token.trim()
    setCheck({ state: 'checking' })
    try {
      const me = await getIdentity(t)
      update({ discogsToken: t, discogsUsername: me.username })
      setCheck({ state: 'idle' })
    } catch (e) {
      update({ discogsToken: t, discogsUsername: '' })
      setCheck({ state: 'error', message: e instanceof DiscogsError ? e.message : 'Unbekannter Fehler' })
    }
  }

  function removeToken() {
    setToken('')
    update({ discogsToken: '', discogsUsername: '' })
    setCheck({ state: 'idle' })
  }

  return (
    <div className="screen">
      <h1 className="title">Einstellungen</h1>

      <h2 className="group-label">Discogs</h2>
      <div className="group">
        <label className="row">
          <span>Token</span>
          <input
            className="row-input"
            type="password"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="einfügen"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </label>
        <div className="row">
          <span>Benutzer</span>
          {settings.discogsUsername ? (
            <span className="ok">{settings.discogsUsername} ✓</span>
          ) : (
            <span className="muted">nicht verbunden</span>
          )}
        </div>
      </div>

      {check.state === 'error' && <p className="error" role="alert">{check.message}</p>}

      <div className="stack-8">
        <button
          className="btn primary"
          disabled={!token.trim() || check.state === 'checking'}
          onClick={saveAndCheck}
        >
          {check.state === 'checking' ? 'Prüfe …' : dirty || !settings.discogsUsername ? 'Speichern & prüfen' : 'Verbindung erneut prüfen'}
        </button>
        {settings.discogsToken && (
          <button className="btn ghost danger" onClick={removeToken}>Token entfernen</button>
        )}
      </div>

      <p className="hint">
        Das Token erzeugst du auf discogs.com unter Einstellungen → Entwickler → „Generate new token“.
        Es bleibt nur auf diesem Gerät gespeichert.
      </p>

      <h2 className="group-label">KI-Erkennung</h2>
      <div className="group">
        <div className="row"><span>Claude-Schlüssel</span><span className="muted">folgt in Phase 3</span></div>
      </div>
    </div>
  )
}
