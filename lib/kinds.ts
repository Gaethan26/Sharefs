export const KINDS = {
  livre: { label: 'Livre', plural: 'Livres', todo: 'À lire', done: 'Lu', by: 'Auteur·rice' },
  film: { label: 'Film', plural: 'Films', todo: 'À voir', done: 'Vu', by: 'Réalisation' },
  serie: { label: 'Série', plural: 'Séries', todo: 'À voir', done: 'Vue', by: 'Création' },
  jeu: { label: 'Jeu', plural: 'Jeux', todo: 'À jouer', done: 'Joué', by: 'Studio' },
} as const

export type Kind = keyof typeof KINDS
export const KIND_LIST = Object.keys(KINDS) as Kind[]
export const kindOf = (k: string): (typeof KINDS)[Kind] => KINDS[(k in KINDS ? k : 'livre') as Kind]
