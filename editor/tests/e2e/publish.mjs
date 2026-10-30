// Сквозная проверка правки и публикации против настоящего backend.
//
// Нужны: backend (uvicorn) и `nuxt dev` с EDITOR_API_TARGET на него, база с миграциями.
// Запуск из каталога editor, переменные описаны в docs/frontend/ARCHITECTURE.md:
//   E2E_EDITOR_URL=http://127.0.0.1:3300 E2E_API_ENV_FILE=... node tests/e2e/publish.mjs
// Ссылку входа печатает backend/scripts/dev_editor_link.py (скрипт зовётся отсюда).
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

// playwright-core в зависимости editor не входит: путь к его package.json задаёт E2E_PLAYWRIGHT_FROM
const require = createRequire(process.env.E2E_PLAYWRIGHT_FROM ?? join(process.cwd(), 'package.json'))
const { chromium } = require('playwright-core')

const EDITOR_URL = process.env.E2E_EDITOR_URL ?? 'http://127.0.0.1:3300'
const SHOT_DIR = process.env.E2E_SHOT_DIR ?? '/tmp/brief-bot-e2e'
const BACKEND_DIR = process.env.E2E_BACKEND_DIR ?? join(process.cwd(), '..', 'backend')
const STEP_TEXT = 'Напишите, что вы хотите разместить на сайте'

mkdirSync(SHOT_DIR, { recursive: true })

function loginLink() {
  const out = execFileSync('uv', ['run', 'python', '-m', 'scripts.dev_editor_link'], {
    cwd: BACKEND_DIR,
    env: { ...process.env, EDITOR_BASE_URL: EDITOR_URL },
    encoding: 'utf8',
  })
  return out.trim().split('\n').pop()
}

function check(ok, what) {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${what}`)
  if (!ok) process.exitCode = 1
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
// Запросы идут из страницы: cookie сессии Secure, а на http его отдаёт только сама страница
const api = (path, method = 'GET') =>
  page.evaluate(async ([url, verb]) => {
    const res = await fetch(url, { method: verb })
    return { ok: res.ok, status: res.status, body: res.status === 204 ? null : await res.json() }
  }, [`/api${path}`, method])

try {
  await page.goto(loginLink())
  await page.waitForSelector('.step-node')
  // чистый старт: версия 1 (сид) становится активной и копируется в черновик, остатки прежнего прогона уходят
  await api('/scenario/versions/1/activate', 'POST')
  await page.reload()
  await page.waitForSelector('.step-node')
  const header = () => page.locator('.live').innerText()
  const versions = async () => {
    const res = await api('/scenario/versions')
    if (!res.ok) throw new Error(`GET /api/scenario/versions: ${res.status}`)
    return res.body
  }
  const active = async () => (await versions()).find((v) => v.active).number

  const before = await active()
  // номер новой версии: после предыдущих запусков активна может быть не последняя
  const published = Math.max(...(await versions()).map((v) => v.number)) + 1
  check((await header()).includes(`версия ${before}`), `шапка показывает активную версию ${before}`)

  // Сценарий 1: поменять текст шага и опубликовать
  const node = page.locator('.step-node', { hasText: STEP_TEXT }).first()
  // нода может лежать за краем экрана (схема большая): клик отправляется ей напрямую
  await node.dispatchEvent('click')
  const stamp = `Проверка ${Date.now()}`
  await page.fill('#step-text', `${stamp}\nвторая строка`)
  await page.waitForSelector('.status:has-text("Черновик сохранён в")')
  check(/Черновик сохранён в \d\d:\d\d/.test(await page.locator('.status').innerText()), 'статус автосохранения в шапке')
  await page.click('button.publish')
  await page.waitForSelector(`.live:has-text("версия ${published}")`)
  check((await active()) === published, `GET /api/scenario/versions: активна версия ${published}`)
  check(await page.locator('.errors-panel').count() === 0, 'панели ошибок нет после успешной публикации')
  await page.screenshot({ path: join(SHOT_DIR, 'e2e-published.png') })

  // Сценарий 2: убрать переход, увидеть ошибки и прежнюю версию
  await page.locator('.step-node', { hasText: stamp }).first().dispatchEvent('click')
  await page.selectOption('#step-next', '')
  await page.waitForSelector('.status:has-text("Черновик сохранён в")')
  await page.click('button.publish')
  await page.waitForSelector('.errors-panel, .step-panel .problems')
  await page.click('.scenario-graph .vue-flow__pane', { position: { x: 5, y: 5 } })
  await page.waitForSelector('.errors-panel')
  check((await page.locator('.errors-panel').innerText()).includes('Публикация остановлена'), 'панель "Публикация остановлена"')
  check((await page.locator('.errors-panel').innerText()).includes(`на версии ${published}`), 'панель называет прежнюю версию')
  check((await page.locator('.step-node .badge').count()) >= 1, 'на ноде номер ошибки')
  check((await active()) === published, 'версия бота не изменилась')
  await page.screenshot({ path: join(SHOT_DIR, 'e2e-errors.png') })

  // Клик по ошибке ведёт на шаг
  await page.locator('.errors-panel .issue').first().click()
  await page.waitForSelector('.step-panel .problems')
  check((await page.inputValue('#step-text')).startsWith(stamp), 'клик по ошибке открывает шаг с ошибкой')
  await page.screenshot({ path: join(SHOT_DIR, 'e2e-step-error.png') })

  // Схема прокручена к шагу, а "Ко всем ошибкам" возвращает панель со списком
  // прокрутка к шагу идёт с анимацией: ждём, пока номер ошибки окажется на экране
  const onScreen = await page
    .waitForFunction(() => {
      const r = document.querySelector('.step-node .badge')?.getBoundingClientRect()
      return Boolean(r) && r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight
    }, null, { timeout: 5000 })
    .then(() => true, () => false)
  check(onScreen, 'нода с номером ошибки видна на экране')
  await page.click('.step-panel .problems .link')
  await page.waitForSelector('.errors-panel')
  await page.screenshot({ path: join(SHOT_DIR, 'e2e-errors-visible.png') })

  // Палитра: клик добавляет шаг в видимой части, удаление его убирает
  const count = await page.locator('.step-node').count()
  await page.click('.palette .item.type-text')
  await page.waitForSelector('#step-text')
  check((await page.locator('.step-node').count()) === count + 1, 'шаг из палитры появился на схеме')
  await page.click('.step-panel .remove')
  await page.waitForFunction((n) => document.querySelectorAll('.step-node').length === n, count)
  check(true, 'удаление шага убрало его со схемы')

  // Палитра: бросок создаёт шаг там, где отпустили; перетаскивание ноды сохраняет позицию
  const target = { x: 600, y: 300 }
  await page.locator('.palette .item.type-file').dragTo(page.locator('.scenario-graph'), { targetPosition: target })
  await page.waitForFunction((n) => document.querySelectorAll('.step-node').length === n + 1, count)
  const dropped = await page.locator('.step-node.selected').boundingBox()
  const canvas = await page.locator('.scenario-graph').boundingBox()
  const near = Math.abs(dropped.x + dropped.width / 2 - (canvas.x + target.x)) < 80
  check(near, 'шаг из палитры лёг в месте броска')
  await page.waitForSelector('.status:has-text("Черновик сохранён в")')
  const draft = (await api('/scenario/draft')).body
  const fresh = Object.values(draft.data.steps).find((st) => st.type === 'file' && st.pos)
  check(Boolean(fresh), 'позиция нового шага записана в черновик (pos)')

  // Защита от поломок: подпись бота, пустая ссылка, смена типа
  // шаг с подписью name лежит в блоке "Финальные вопросы"
  await page.click('.graph-tabs .tab:has-text("Финальные вопросы")')
  await page.locator('.step-node', { hasText: 'Остался последний шаг' }).first().dispatchEvent('click')
  await page.waitForSelector('#step-key')
  check((await page.getAttribute('#step-key', 'readonly')) !== null, 'подпись бота только для чтения')
  check((await page.inputValue('#step-key')) === 'Имя', 'подпись бота показана по-человечески')
  check(await page.getByText('Эту подпись использует бот, её нельзя изменить.').isVisible(), 'подсказка про подпись бота')

  await page.click('.graph-tabs .tab.main')
  await page.locator('.step-node', { hasText: 'Перед началом' }).first().dispatchEvent('click')
  const address = page.getByPlaceholder('https://').first()
  await address.waitFor()
  await address.fill('')
  check(await address.isVisible(), 'поле адреса ссылки не исчезает после стирания')

  await page.locator('.step-node', { hasText: 'Нужно ли подключать оплату' }).first().dispatchEvent('click')
  await page.waitForSelector('#step-type')
  let asked = ''
  page.once('dialog', async (d) => {
    asked = d.message()
    await d.dismiss()
  })
  await page.selectOption('#step-type', 'text')
  check(asked.includes('2'), 'при потере кнопок спрашивает с числом кнопок')
  check((await page.inputValue('#step-type')) === 'choice', 'отказ оставил прежний тип')
  page.once('dialog', (d) => d.accept())
  await page.selectOption('#step-type', 'text')
  await page.waitForFunction(() => document.querySelector('#step-type')?.value === 'text')
  check((await page.getByText('Добавить кнопку').count()) === 0, 'после согласия кнопок у текстового шага нет')

} finally {
  // версия 1 снова активна, черновик равен ей: следующий запуск начнётся с того же места
  await api('/scenario/versions/1/activate', 'POST').catch(() => undefined)
  await browser.close()
}
