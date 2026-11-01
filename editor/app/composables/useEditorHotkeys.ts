import { onBeforeUnmount, onMounted } from 'vue'
import { SessionExpired } from '~/errors/base'
import { useScenarioStore } from '~/stores/scenario.store'
import { editorHotkey } from '~/utils/editorHotkeys'

export const UNDONE_TEXT = 'Отменено'
export const REDONE_TEXT = 'Возвращено'

interface Options {
  /** Открыто меню целей: оно забирает клавиши себе. */
  menuOpen: () => boolean
  /** Esc: закрыть меню, снять выделение шага и стрелки. */
  escape: () => void
  /** Состояние схемы заменено отменой или возвратом: сбросить то, что живёт только на экране (выделенная стрелка). */
  restored: () => void
  /** Подсказка на схеме. */
  notify: (text: string) => void
  /** Конец сессии при сохранении клавишей: уйти на вход. */
  sessionExpired: () => void
}

/** В поле ввода Ctrl+Z, Ctrl+Y и Esc остаются браузерными: они правят текст поля. */
function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
}

/**
 * Сценарий «горячие клавиши схемы»: Ctrl+Z отмена, Ctrl+Shift+Z и Ctrl+Y возврат, Ctrl+S сохранить сразу, Esc снять выделение.
 * Кнопки отмены и возврата на схеме идут через те же `undo` и `redo`.
 */
export function useEditorHotkeys(options: Options) {
  const store = useScenarioStore()

  function undo(): void {
    if (store.undo()) {
      options.restored()
      options.notify(UNDONE_TEXT)
    }
  }

  function redo(): void {
    if (store.redo()) {
      options.restored()
      options.notify(REDONE_TEXT)
    }
  }

  async function save(): Promise<void> {
    try {
      await store.flush()
    } catch (e) {
      // статус в шапке показывает состояние store; здесь только кончившаяся сессия
      if (e instanceof SessionExpired) options.sessionExpired()
    }
  }

  function onKey(event: KeyboardEvent): void {
    const action = editorHotkey(event, { typing: isTyping(event.target), menuOpen: options.menuOpen() })
    if (!action) return
    if (action === 'escape') {
      options.escape()
      return
    }
    // клавиши браузера (Ctrl+S «сохранить страницу») здесь не нужны
    event.preventDefault()
    if (action === 'undo') undo()
    else if (action === 'redo') redo()
    else void save()
  }

  onMounted(() => document.addEventListener('keydown', onKey))
  onBeforeUnmount(() => document.removeEventListener('keydown', onKey))

  return { undo, redo }
}
