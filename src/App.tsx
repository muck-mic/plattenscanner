export default function App() {
  return (
    <main style={{ padding: '48px 0', textAlign: 'center' }}>
      <h1>Plattenscanner</h1>
      <p>Phase 0: Die App ist online. Scannen folgt in den nächsten Phasen.</p>
      <p style={{ opacity: 0.6, fontSize: 14 }}>
        Kamera verfügbar: {'mediaDevices' in navigator ? 'ja' : 'nein'} ·
        HTTPS: {window.isSecureContext ? 'ja' : 'nein'}
      </p>
    </main>
  )
}
