import { useEffect, useRef, useState } from 'react'
import { createDetector } from '../lib/barcode'

interface Props {
  active: boolean
  onDetected: (code: string) => void
}

type CamState =
  | { state: 'starting' }
  | { state: 'running' }
  | { state: 'error'; message: string }

const SCAN_INTERVAL_MS = 120
// The same code must be read this many times in a row before we accept it (guards against misreads).
const CONFIRMATIONS = 2

function cameraErrorMessage(err: unknown) {
  const name = err instanceof DOMException ? err.name : ''
  if (name === 'NotAllowedError')
    return 'Kein Kamera-Zugriff. Erlaube die Kamera in den iPhone-Einstellungen unter Apps → Safari → Kamera und öffne die App neu.'
  if (name === 'NotFoundError') return 'Keine Kamera gefunden.'
  if (name === 'NotReadableError') return 'Die Kamera wird gerade von einer anderen App benutzt.'
  return 'Die Kamera konnte nicht gestartet werden.'
}

export default function CameraScanner({ active, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const trackRef = useRef<MediaStreamTrack | null>(null)
  const onDetectedRef = useRef(onDetected)
  useEffect(() => {
    onDetectedRef.current = onDetected
  }, [onDetected])
  const [cam, setCam] = useState<CamState>({ state: 'starting' })
  const [torchAvailable, setTorchAvailable] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [pageVisible, setPageVisible] = useState(document.visibilityState === 'visible')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const onVis = () => setPageVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  const running = active && pageVisible

  useEffect(() => {
    if (!running) return
    const videoEl = videoRef.current
    let cancelled = false
    let timer: number | undefined
    let stream: MediaStream | null = null
    const detector = createDetector()
    let last = ''
    let streak = 0

    async function loop() {
      const video = videoEl
      if (cancelled || !video) return
      if (video.readyState >= 2) {
        try {
          const found = await detector.detect(video)
          const code = found[0]?.rawValue ?? ''
          if (code && code === last) streak++
          else streak = code ? 1 : 0
          last = code
          if (code && streak >= CONFIRMATIONS && !cancelled) {
            navigator.vibrate?.(60)
            onDetectedRef.current(code)
            return // parent switches us off
          }
        } catch {
          // a single failed frame is fine
        }
      }
      timer = window.setTimeout(loop, SCAN_INTERVAL_MS)
    }

    async function start() {
      setCam({ state: 'starting' })
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        })
        if (cancelled) return
        const track = stream.getVideoTracks()[0]
        trackRef.current = track
        const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean }
        setTorchAvailable(!!caps.torch)
        setTorchOn(false)
        if (!videoEl) return
        videoEl.srcObject = stream
        await videoEl.play()
        if (cancelled) return
        setCam({ state: 'running' })
        loop()
      } catch (err) {
        if (!cancelled) setCam({ state: 'error', message: cameraErrorMessage(err) })
      }
    }

    start()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
      trackRef.current = null
      if (videoEl) videoEl.srcObject = null
    }
  }, [running, retry])

  async function toggleTorch() {
    const track = trackRef.current
    if (!track) return
    const next = !torchOn
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] })
      setTorchOn(next)
    } catch {
      setTorchAvailable(false)
    }
  }

  return (
    <div className="camera">
      <video ref={videoRef} className="camera-video" playsInline muted autoPlay />
      {cam.state === 'running' && (
        <>
          <div className="scan-frame" aria-hidden="true"><div className="scan-line" /></div>
          <p className="camera-hint">Barcode in den Rahmen halten</p>
        </>
      )}
      {cam.state === 'starting' && <p className="camera-status">Kamera startet …</p>}
      {cam.state === 'error' && (
        <div className="camera-status">
          <p>{cam.message}</p>
          <button className="btn ghost" onClick={() => setRetry((n) => n + 1)}>Erneut versuchen</button>
        </div>
      )}
      {torchAvailable && cam.state === 'running' && (
        <button className={torchOn ? 'torch on' : 'torch'} aria-label={torchOn ? 'Licht ausschalten' : 'Licht einschalten'} aria-pressed={torchOn} onClick={toggleTorch}>
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></svg>
        </button>
      )}
    </div>
  )
}
