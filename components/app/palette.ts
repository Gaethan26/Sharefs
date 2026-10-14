'use client'

import { useEffect, useState } from 'react'
import { NEUTRAL, type Palette } from '@/lib/palettes'

/* Couleur dominante d'une image, calculée dans le navigateur (canvas). Mise en cache par URL. */
const cache = new Map<string, Palette | null>()
const pending = new Map<string, Promise<Palette | null>>()

const hsl = (h: number, s: number, l: number) => `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`

function extract(src: string): Promise<Palette | null> {
  if (pending.has(src)) return pending.get(src)!
  const p = new Promise<Palette | null>(resolve => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => {
      try {
        const size = 32, c = document.createElement('canvas')
        c.width = size; c.height = size
        const ctx = c.getContext('2d', { willReadFrequently: true })!
        ctx.drawImage(img, 0, 0, size, size)
        const d = ctx.getImageData(0, 0, size, size).data
        let x = 0, y = 0, sw = 0, wsum = 0, ssum = 0
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255
          const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2
          if (l < 0.07 || l > 0.96) continue
          const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1))
          let h = 0
          if (max !== min) h = max === r ? ((g - b) / (max - min)) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4
          const rad = (h * 60) * Math.PI / 180
          const w = s * (1 - Math.abs(l - 0.5))
          x += Math.cos(rad) * w; y += Math.sin(rad) * w; sw += w; wsum += 1; ssum += s
        }
        if (!wsum) return resolve(null)
        const hue = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
        const sat = Math.min(ssum / wsum, 0.6)
        if (sat < 0.08) return resolve({ deep: hsl(hue, 0.04, 0.14), soft: hsl(hue, 0.04, 0.93), mid: hsl(hue, 0.05, 0.45) })
        resolve({ deep: hsl(hue, sat * 0.75, 0.15), soft: hsl(hue, Math.min(sat, 0.4), 0.92), mid: hsl(hue, sat, 0.4) })
      } catch { resolve(null) }  // image sans autorisation CORS : couleur neutre
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
  pending.set(src, p)
  p.then(v => cache.set(src, v))
  return p
}

export function usePalette(src?: string | null, fallback: Palette = NEUTRAL): Palette {
  const [p, setP] = useState<Palette | null>(() => (src ? cache.get(src) ?? null : null))
  useEffect(() => {
    if (!src) { setP(null); return }
    if (cache.has(src)) { setP(cache.get(src) ?? null); return }
    let alive = true
    extract(src).then(v => { if (alive) setP(v) })
    return () => { alive = false }
  }, [src])
  return p ?? fallback
}
