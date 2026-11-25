import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages serves the app under /plattenscanner/
export default defineConfig({
  base: '/plattenscanner/',
  plugins: [react()],
})
