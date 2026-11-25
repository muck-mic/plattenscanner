import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Unique id per build. The app compares it with /version.json to notice new deployments,
// because iOS home-screen apps otherwise keep showing a cached old version.
const BUILD_ID = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12)

function versionFile(): Plugin {
  return {
    name: 'version-file',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) })
    },
  }
}

// GitHub Pages serves the app under /plattenscanner/
export default defineConfig({
  base: '/plattenscanner/',
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [react(), versionFile()],
})
