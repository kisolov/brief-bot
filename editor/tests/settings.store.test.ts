import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { __setContainer } from '~/container'
import { MockSettingsRepository } from '~/repositories/adapters/settings.mock'
import { useSettingsStore } from '~/stores/settings.store'

function useStore() {
  const repo = new MockSettingsRepository({ hours: 3, text: 'Продолжим?' })
  const save = vi.spyOn(repo, 'saveReminder')
  __setContainer({ settingsRepository: repo })
  setActivePinia(createPinia())
  return { store: useSettingsStore(), save }
}

describe('settings store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('load кладёт сохранённые настройки', async () => {
    const { store } = useStore()
    await store.load()
    expect(store.reminder).toEqual({ hours: 3, text: 'Продолжим?' })
  })

  it('test_save_reminder_rejects_zero_hours', async () => {
    const { store, save } = useStore()
    expect(await store.save({ hours: 0, text: 'Текст' })).toBe(false)
    expect(store.errors.hours).toBe('Укажите целое число часов от 1 до 168.')
    expect(store.errors.text).toBeUndefined()
    expect(save).not.toHaveBeenCalled()
    expect(store.saved).toBe(false)
  })

  it.each([169, 1.5, Number.NaN, -2])('часы %s не уходят на сервер', async (hours) => {
    const { store, save } = useStore()
    expect(await store.save({ hours, text: 'Текст' })).toBe(false)
    expect(store.errors.hours).toBeDefined()
    expect(save).not.toHaveBeenCalled()
  })

  it('пустой после trim текст не уходит', async () => {
    const { store, save } = useStore()
    expect(await store.save({ hours: 2, text: '   \n ' })).toBe(false)
    expect(store.errors.text).toBe('Напишите текст напоминания.')
    expect(save).not.toHaveBeenCalled()
  })

  it('текст длиннее 1024 знаков не уходит, ровно 1024 уходит', async () => {
    const { store, save } = useStore()
    expect(await store.save({ hours: 2, text: 'а'.repeat(1025) })).toBe(false)
    expect(store.errors.text).toBe('Не больше 1024 знаков.')
    expect(save).not.toHaveBeenCalled()
    expect(await store.save({ hours: 2, text: 'а'.repeat(1024) })).toBe(true)
  })

  it('обе ошибки показываются сразу', async () => {
    const { store } = useStore()
    await store.save({ hours: 0, text: '' })
    expect(Object.keys(store.errors).sort()).toEqual(['hours', 'text'])
  })

  it('успех: сохранённое значение с обрезанными краями текста и флаг saved', async () => {
    const { store, save } = useStore()
    expect(await store.save({ hours: 24, text: '  Вернитесь  ' })).toBe(true)
    expect(save).toHaveBeenCalledWith({ hours: 24, text: 'Вернитесь' })
    expect(store.reminder).toEqual({ hours: 24, text: 'Вернитесь' })
    expect(store.errors).toEqual({})
    expect(store.saved).toBe(true)
  })

  it('следующая попытка снимает «Сохранено» и прежние ошибки', async () => {
    const { store } = useStore()
    await store.save({ hours: 2, text: 'ок' })
    await store.save({ hours: 0, text: 'ок' })
    expect(store.saved).toBe(false)
  })
})
