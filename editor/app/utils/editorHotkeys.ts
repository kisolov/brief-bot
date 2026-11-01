/** Что делает горячая клавиша редактора. */
export type HotkeyAction = 'undo' | 'redo' | 'save' | 'escape'

/** Нужные поля `KeyboardEvent`: отдельный тип, чтобы решение проверялось без браузера. */
export interface KeyLike {
  code: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
  /** Клавиша удерживается: автоповтор. */
  repeat?: boolean
}

interface Focus {
  /** Фокус в текстовом поле (`isTextField`): там Ctrl+Z, Ctrl+Y и Esc остаются браузерными. */
  typing: boolean
  /** Открыто меню целей: отмена ему не нужна, Esc закрывает его. */
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
  if (focus.typing) return null
  if (e.code === 'Escape' && !mod) return 'escape'
  if (!mod || focus.menuOpen || e.repeat) return null
  if (e.code === 'KeyZ') return e.shiftKey ? 'redo' : 'undo'
  if (e.code === 'KeyY' && !e.shiftKey) return 'redo'
  return null
}

/** Элемент, где Ctrl+Z правит текст: текстовые `input`, `textarea`, `contenteditable`. Список, флажок и кнопка не в счёт. */
export function isTextField(t: { tagName: string; type?: string; isContentEditable?: boolean } | null): boolean {
  if (!t) return false
  if (t.isContentEditable || t.tagName === 'TEXTAREA') return true
  return t.tagName === 'INPUT' && !NON_TEXT_INPUTS.has((t.type ?? 'text').toLowerCase())
}

const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'image', 'file', 'range', 'color', 'hidden'])
