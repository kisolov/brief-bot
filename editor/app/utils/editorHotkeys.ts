/** Что делает горячая клавиша редактора. */
export type HotkeyAction = 'undo' | 'redo' | 'save' | 'escape'

/** Нужные поля `KeyboardEvent`: отдельный тип, чтобы решение проверялось без браузера. */
export interface KeyLike {
  code: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
}

interface Focus {
  /** Фокус в поле ввода: там Ctrl+Z, Ctrl+Y и Esc остаются браузерными. */
  typing: boolean
  /** Открыто меню целей: оно само разбирает клавиши. */
  menuOpen: boolean
}

/**
 * Какое действие вызывает клавиша; `null`, если событие редактору не принадлежит.
 * Клавиша берётся по `code`, поэтому русская раскладка не мешает. Cmd на Mac равен Ctrl.
 */
export function editorHotkey(e: KeyLike, focus: Focus): HotkeyAction | null {
  if (e.altKey) return null
  const mod = e.ctrlKey || e.metaKey
  if (mod && e.code === 'KeyS') return 'save'
  if (focus.typing || focus.menuOpen) return null
  if (e.code === 'Escape' && !mod) return 'escape'
  if (!mod) return null
  if (e.code === 'KeyZ') return e.shiftKey ? 'redo' : 'undo'
  if (e.code === 'KeyY' && !e.shiftKey) return 'redo'
  return null
}
