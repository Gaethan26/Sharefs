'use client'

import { createContext, useContext, useEffect } from 'react'
import type { Palette } from '@/lib/palettes'

/* Le fond de la page suit l'image principale affichée */
export const TintCtx = createContext<(p: Palette | null) => void>(() => {})

export function usePageTint(p: Palette | null) {
  const set = useContext(TintCtx)
  const key = p ? `${p.deep}|${p.soft}|${p.mid}` : ''
  useEffect(() => {
    set(p)
    return () => set(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, set])
}
