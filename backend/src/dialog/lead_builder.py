"""Сборка заявки из сессии. Чистая функция: время приходит снаружи."""

from datetime import datetime

from src.dialog.entities import BRANCH_KEY, Session, answer_text
from src.leads.entities import Lead, LeadAnswer, LeadStatus
from src.scenario.entities import Scenario

_LAST_STEP_LIMIT = 100


def build_lead(scenario: Scenario, session: Session, status: LeadStatus, now: datetime) -> Lead:
    # Пустые значения не пропускаем: по ним видно, что человек дошёл до шага.
    answers = tuple(
        LeadAnswer(key=a.key, value=answer_text(a))
        for a in session.answers.values()
        if a.key and a.key != BRANCH_KEY
    )
    branch = ""
    file_id = None
    for answer in session.answers.values():
        if answer.key == BRANCH_KEY and answer.labels:
            branch = answer.labels[-1]
        if answer.file_id is not None:
            file_id = answer.file_id
    current = scenario.steps.get(session.step)
    last_step = current.text.split("\n", 1)[0][:_LAST_STEP_LIMIT] if current else None
    return Lead(
        id=None,
        chat_id=session.chat_id,
        username=session.username,
        branch=branch,
        answers=answers,
        status=status,
        file_id=file_id,
        created_at=now,
        last_step=last_step,
    )
