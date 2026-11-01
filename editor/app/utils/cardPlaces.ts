import type { CardPlace } from '~/types/scenario'

export type CardPlaces = Record<string, CardPlace[]>

const same = (p: CardPlace, block: string, then: string | undefined) =>
  p.block === block && (p.then || undefined) === (then || undefined)

const entry = (block: string, then: string | undefined, pos: [number, number]): CardPlace =>
  then ? { block, then, pos } : { block, pos }

function withView(all: CardPlaces, view: string, list: CardPlace[]): CardPlaces {
  const { [view]: _old, ...rest } = all
  return list.length ? { ...rest, [view]: list } : rest
}

export function isPlaced(all: CardPlaces, view: string, block: string, then?: string): boolean {
  return (all[view] ?? []).some((p) => same(p, block, then))
}

export function putCard(all: CardPlaces, view: string, block: string, then: string | undefined, pos: [number, number]): CardPlaces {
  const others = (all[view] ?? []).filter((p) => !same(p, block, then))
  return withView(all, view, [...others, entry(block, then, pos)])
}

export function dropCard(all: CardPlaces, view: string, block: string, then?: string): CardPlaces {
  return withView(all, view, (all[view] ?? []).filter((p) => !same(p, block, then)))
}

/** Карточка сменила «куда вернуться»: место переезжает с ней, чужое место на той же паре уступает. */
export function retargetCard(all: CardPlaces, view: string, block: string, from: string | undefined, to: string | undefined): CardPlaces {
  const moving = (all[view] ?? []).find((p) => same(p, block, from))
  return moving ? putCard(dropCard(all, view, block, from), view, block, to, moving.pos) : all
}

export function renameCards(all: CardPlaces, old: string, name: string): CardPlaces {
  return Object.fromEntries(
    Object.entries(all).map(([view, list]) => [
      view === old ? name : view,
      list.map((p) => (p.block === old ? { ...p, block: name } : p)),
    ]),
  )
}

/** Блок удалён: его вкладка и все его карточки. */
export function dropBlockCards(all: CardPlaces, block: string): CardPlaces {
  return Object.entries(all).reduce<CardPlaces>(
    (out, [view, list]) => (view === block ? out : withView(out, view, list.filter((p) => p.block !== block))),
    {},
  )
}

/** Шаги удалены: как и у переходов, у карточки остаётся блок без `then`. */
export function clearThen(all: CardPlaces, gone: ReadonlySet<string>): CardPlaces {
  return Object.fromEntries(
    Object.entries(all).map(([view, list]) => {
      let out: CardPlaces = { [view]: [] }
      for (const p of list) out = putCard(out, view, p.block, p.then && gone.has(p.then) ? undefined : p.then, p.pos)
      return [view, out[view]!]
    }),
  )
}
