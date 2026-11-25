import { BarcodeDetector, prepareZXingModule } from 'barcode-detector/ponyfill'
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'

// Serve the ZXing WebAssembly file from our own site instead of a CDN.
prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
  },
})

// Record barcodes are EAN-13 / UPC-A (sometimes EAN-8 / UPC-E).
export function createDetector() {
  return new BarcodeDetector({ formats: ['ean_13', 'upc_a', 'ean_8', 'upc_e'] })
}

/** Codes to try on Discogs: the scanned digits, plus the 12-digit UPC form of a US EAN-13 starting with 0. */
export function barcodeVariants(code: string) {
  const digits = code.replace(/\D/g, '')
  const variants = [digits]
  if (digits.length === 13 && digits.startsWith('0')) variants.push(digits.slice(1))
  if (digits.length === 12) variants.push('0' + digits)
  return variants
}
