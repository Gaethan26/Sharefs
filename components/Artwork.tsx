import { ART, artSrc, type ArtKey } from '@/lib/art'

/** Un tableau et son cartel, comme dans une salle de musée */
export async function Artwork({ k, width = 1280, className = '', caption = true, eager = false }: {
  k: ArtKey; width?: number; className?: string; caption?: boolean; eager?: boolean
}) {
  const a = ART[k]
  const src = await artSrc(k, width)
  return (
    <figure className={`art ${className}`}>
      <div className="art-canvas">
        {src
          ? <img src={src} alt={`${a.title}, ${a.artist}`} loading={eager ? 'eager' : 'lazy'} decoding="async" />
          : <div className="art-ph" aria-hidden />}
      </div>
      {caption && <Cartel k={k} />}
    </figure>
  )
}

export function Cartel({ k, className = '' }: { k: ArtKey; className?: string }) {
  const a = ART[k]
  return (
    <figcaption className={`cartel ${className}`}>
      <span className="cartel-artist">{a.artist}</span>
      <span className="cartel-title">{a.title}</span>
      <span className="cartel-meta">{a.date}, {a.place}</span>
    </figcaption>
  )
}

/** Variante fond plein cadre (bandeaux, accueil) */
export async function ArtBackdrop({ k, width = 1920, position = 'center' }: { k: ArtKey; width?: number; position?: string }) {
  const src = await artSrc(k, width)
  return src ? <img className="backdrop-img" src={src} alt="" aria-hidden style={{ objectPosition: position }} /> : null
}
