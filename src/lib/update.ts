declare const __BUILD_ID__: string
export const BUILD_ID = __BUILD_ID__

// Checks whether a newer build is deployed and, if so, reloads via a fresh URL so the
// cached index.html is bypassed. Runs at start and whenever the app comes back to the foreground.
async function checkForUpdate() {
  if (import.meta.env.DEV) return
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json?ts=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return
    const { build } = (await res.json()) as { build?: string }
    // Only one reload attempt per new build, so a stubborn cache can't cause a reload loop.
    if (build && build !== BUILD_ID && sessionStorage.getItem('reloadedFor') !== build) {
      sessionStorage.setItem('reloadedFor', build)
      location.replace(`${import.meta.env.BASE_URL}?v=${build}`)
    }
  } catch {
    // offline: keep running the current version
  }
}

export function startUpdateChecks() {
  void checkForUpdate()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkForUpdate()
  })
}
