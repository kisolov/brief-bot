import type { GraphView, Issue, Scenario } from '~/types/scenario'
import { blockLabel, viewOfStep } from '~/utils/scenarioGraph'
import { stepLabel } from '~/utils/stepTargets'

/** Строка панели ошибок: номер совпадает с номером на ноде. */
export interface IssueItem {
  number: number
  title: string
  text: string
  issue: Issue
}

/** Куда вести клик по ошибке: вкладка и шаг (для ошибки блока шага нет). */
export interface IssueLocation {
  view: GraphView
  stepId: string | null
}

/**
 * Для ошибки блока `stepId` это имя блока: ведём на его вкладку без выбора шага.
 * Ошибка разбора (`malformed`) и неизвестный шаг без перехода.
 */
export function locateIssue(s: Scenario, issue: Issue): IssueLocation | null {
  if (issue.code === 'malformed') return null
  const step = s.steps[issue.stepId]
  if (step) {
    const view = viewOfStep(s, issue.stepId)
    return view === null ? null : { view, stepId: issue.stepId }
  }
  if (s.blocks?.[issue.stepId] !== undefined) return { view: issue.stepId, stepId: null }
  return null
}

/** Заголовок ошибки: первая строка текста шага или имя блока. */
function titleOf(s: Scenario, issue: Issue): string {
  const step = s.steps[issue.stepId]
  if (step) return stepLabel(step)
  if (s.blocks?.[issue.stepId] !== undefined) return blockLabel(issue.stepId)
  return 'Сценарий'
}

export function issueItems(s: Scenario, issues: Issue[]): IssueItem[] {
  return issues.map((issue, i) => ({ number: i + 1, title: titleOf(s, issue), text: issue.message, issue }))
}

/** Номера ошибок по шагам: ошибка кнопки отмечает шаг, которому кнопка принадлежит. */
export function errorNumbers(issues: Issue[]): Map<string, number[]> {
  const out = new Map<string, number[]>()
  issues.forEach((issue, i) => {
    if (!issue.stepId) return
    out.set(issue.stepId, [...(out.get(issue.stepId) ?? []), i + 1])
  })
  return out
}
