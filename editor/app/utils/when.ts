const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
]

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function dayIndex(d: Date): number {
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86_400_000)
}

/** «Сегодня, 14:12», «Вчера, 18:27», «28 октября, 19:30»; из другого года с годом. Время местное. */
export function formatWhen(iso: string, now: Date = new Date()): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`
  const diff = dayIndex(now) - dayIndex(at)
  if (diff === 0) return `Сегодня, ${time}`
  if (diff === 1) return `Вчера, ${time}`
  const year = at.getFullYear() === now.getFullYear() ? '' : ` ${at.getFullYear()}`
  return `${at.getDate()} ${MONTHS[at.getMonth()]}${year}, ${time}`
}
