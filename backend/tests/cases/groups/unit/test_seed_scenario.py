from collections import deque

import pytest

from src.dialog.engine import new_session, render, step
from src.dialog.entities import BRANCH_KEY, Effect, Event, Screen, Session
from src.scenario.entities import Scenario, StepType
from src.scenario.seed import load_seed
from src.scenario.validator import validate_scenario
from tests.utils.walker import play, walk

SEED = load_seed()
PHONE = "+7 999 123-45-67"
START = ["Начать"]
TAIL = ["Анна", PHONE, "WhatsApp", "Продолжить", "Утро (09:00–12:00)"]
# Короткий путь через продвижение: ни одного лишнего вопроса до финала.
PROMO_SHORT = [
    "Продвижение сайта",
    "Пока нет сайта и других каналов",
    "Готово",
    "SEO-продвижение",
    "Готово",
    "Никогда не продвигали, нужна помощь",
    "Готово",
]
GOODS = [
    "Заказать новый сайт",
    "Товары",
    "Да",
    "Да",
    "Да",
    "Да",
    "Поиск",
    "Другое (ввести вручную)",
    "Рассрочка",
    "Готово",
    "Цвет",
    "Готово",
    "< 100",
    "Заполню Excel",
    "Основные страницы",
    "Контакты",
    "Добавить свой вариант",
    "Блог",
    "Готово",
    "Услуги и товары",
    "Товары (если есть каталог)",
    "Готово",
    "Иное",
    "Карта сайта",
    "Готово",
    "Полный индивидуальный дизайн + логотип",
    "Да, есть",
    "https://example.ru нравится меню",
]
SERVICES = [
    "Заказать новый сайт",
    "Услуги",
    "Иное",
    "Клининг",
    "Многостраничный сайт",
    "Нужны уникальные тексты",
    "Готово",
    "Нет",
    "Нет",
    "Да, окна с текстами/ценами",
    "Три окна с ценами",
    "Услуги",
    "Услуги",
    "Готово",
    "Готово",
    "Нет, нужна помощь с примерами",
]
BOTH = [
    "Заказать новый сайт",
    "Товары и услуги",
    "Примерно поровну",
    "Автомобили",
    "Нет",
    "Нет",
    "Нет",
    "Нет",
    "Готово",
    "Нет",
    "Готово",
    "100–1 000",
    "Уже есть файл",
    "Готово",
    "Шаблон подойдет, бюджет ограничен",
    "Да, две разные страницы",
    "Есть подробное ТЗ",
    "file:tz123",
]
OTHER = [
    "Заказать новый сайт",
    "Иное (ввести вручную)",
    "Лендинг для кружка",
    "Одностраничный сайт (лендинг)",
    "Готово",
    "Нет",
    "Нет",
    "Нужна консультация",
    "Готово",
    "Иное",
    "Пример в чате",
]
FIX = [
    "Доработать текущий сайт",
    "WordPress",
    "Исправить баги и нерабочие функции",
    "Готово",
    "Ввести ссылку",
    "example.ru",
    "Да, можно предложить и такой",
    "Нет, пока не продвигаем",
    "Готово",
    "Нет никаких доступов",
]
PROMO = [
    "Продвижение сайта",
    "Сайт",
    "https://example.ru",
    "Готово",
    "SEO-продвижение",
    "Готово",
    "Да, через SEO-продвижение",
    "Готово",
    "Нет, никогда не обращались",
    "Готово",
    "Только разовая настройка",
    "Один город",
    "Заявки",
]
WORKS = ["Примеры наших работ", "Спорт / отдых / тренеры", "Заказать услугу", *PROMO_SHORT]
CONTACT = ["Связаться с нами", "Заказать новый сайт", "Иное (ввести вручную)", "Ремонт ноутбуков"]

BRANCHES = {
    "goods": GOODS + TAIL,
    "services": SERVICES + TAIL,
    "both": BOTH + TAIL,
    "other": OTHER + TAIL,
    "fix": FIX + TAIL,
    "promo": PROMO + TAIL,
    "works": WORKS + TAIL,
    "contact": CONTACT
    + ["Одностраничный сайт (лендинг)", "Готово", "Нет", "Нет", "Нужна консультация", "Готово"]
    + ["Нет, нужна помощь с примерами"]
    + TAIL,
}


def _promo_to_now() -> list[str]:
    return [*START, "Продвижение сайта", "Пока нет сайта и других каналов", "Готово", "Готово"]


def test_seed_is_valid():
    assert validate_scenario(SEED) == []


@pytest.mark.parametrize("branch", BRANCHES)
def test_branch_reaches_thanks(branch):
    result = play(SEED, START + BRANCHES[branch])
    assert result.session.finished
    assert Effect.FINISHED in result.effects
    assert result.screen.text.startswith("Спасибо за заявку, Анна!")


def test_menu_has_branch_key():
    assert SEED.steps["menu"].key == BRANCH_KEY
    assert SEED.steps["menu"].no_back and SEED.steps["privacy"].no_back
    assert SEED.entry == "privacy"
    assert SEED.steps["fin_name"].key == "name"


def test_answers_collected_for_lead():
    session = walk(SEED, START + BRANCHES["goods"])
    keys = {a.key for a in session.answers.values()}
    assert {BRANCH_KEY, "name", "Телефон", "Мессенджер", "Удобное время"} <= keys
    assert session.answers["fin_phone"].texts["value"] == PHONE


def test_every_step_with_answer_has_key():
    keyless = {
        sid for sid, s in SEED.steps.items() if s.type not in (StepType.INFO,) and s.key is None
    }
    # Служебные шаги, ответ которых менеджеру не нужен: согласие и хаб разделов.
    assert keyless == {"privacy", "sec_hub"}


def test_phone_and_url_steps_validate():
    assert SEED.steps["fin_phone"].validate == "phone"
    assert SEED.steps["promo_link"].validate == "url"
    assert SEED.steps["fix_link"].validate == "url"


def test_promo_helpers_shown_only_when_promoting():
    for option, label in [("seo", "Да, через SEO-продвижение"), ("before", None)]:
        script = [
            *START,
            "Продвижение сайта",
            "Пока нет сайта и других каналов",
            "Готово",
            "Готово",
        ]
        if label:
            script += [label, "Готово"]
        else:
            script += ["Продвигали раньше, но сейчас нет", "Как-то продвигали", "Готово"]
        result = play(SEED, script)
        assert result.session.step == "promo_helpers", option
        assert result.screen.text.startswith("Вам кто-то уже помогал с продвижением?")

    for label in ("Никогда не продвигали, нужна помощь", "Затрудняюсь, нужна консультация"):
        result = play(SEED, [*_promo_to_now(), label, "Готово"])
        assert result.session.step == "fin_name", label


def test_promo_link_not_asked_when_site_entered_or_absent():
    site = [
        *START,
        "Продвижение сайта",
        "Сайт",
        "example.ru",
        "Готово",
        "SEO-продвижение",
        "Готово",
    ]
    tail = ["Да, через соцсети", "Готово", "Нет, никогда не обращались", "Готово"]
    tail += ["Нужна консультация", "Один город", "Заявки"]
    assert play(SEED, site + tail).session.step == "fin_name"

    social = [*START, "Продвижение сайта", "Соцсети", "vk.com/club", "Готово", "SEO-продвижение"]
    result = play(SEED, [*social, "Готово", *tail])
    assert result.session.step == "promo_link"


def test_sport_examples_text():
    sport = [s for s in SEED.steps.values() if "спорта и отдыха" in s.text]
    assert len(sport) == 1
    assert "еды" not in sport[0].text


def test_no_first_person_feminine():
    texts = []
    for s in SEED.steps.values():
        texts.append(s.text)
        texts.extend(o.label for o in s.options)
        texts.extend(o.input or "" for o in s.options)
    assert not [t for t in texts if "проанализировала" in t or "я пришлю" in t]


def _hub_labels(kind_script: list[str]) -> tuple[list[str], list[str]]:
    hub = play(SEED, [*START, "Заказать новый сайт", *kind_script])
    assert hub.session.step == "sec_hub"
    labels = [b.label for b in hub.screen.buttons]
    category = play(SEED, [*START, "Заказать новый сайт", *kind_script, labels[1]])
    return labels, [b.label for b in category.screen.buttons]


def test_site_sections_differ():
    goods = [
        "Товары",
        *["Нет"] * 4,
        "Готово",
        "Нет",
        "Готово",
        "< 100",
        "Заполню Excel",
    ]
    services = ["Услуги", "Строительство / благоустройство", "Одностраничный сайт (лендинг)"]
    services += ["Готово", "Нет", "Нет", "Нужна консультация"]
    _, goods_hub = _hub_labels(goods)
    _, services_hub = _hub_labels(services)
    assert any("Товары (если есть каталог)" in label for label in goods_hub)
    assert not any("Товары" in label for label in services_hub)


def test_hub_category_label_follows_first_answer():
    goods = ["Товары", *["Нет"] * 4, "Готово", "Нет", "Готово", "< 100", "Заполню Excel"]
    services = ["Услуги", "Строительство / благоустройство", "Одностраничный сайт (лендинг)"]
    services += ["Готово", "Нет", "Нет", "Нужна консультация"]
    goods_labels, _ = _hub_labels(goods)
    services_labels, _ = _hub_labels(services)
    assert any(label.endswith("Услуги и товары") for label in goods_labels)
    assert not any(label.endswith("Услуги и товары") for label in services_labels)
    assert any(label.endswith("Услуги") for label in services_labels)


def test_services_branch_has_no_design_question():
    result = play(SEED, [*START, *SERVICES[:-1]])
    assert result.session.step == "ref_site"
    assert "design" not in result.session.answers


def test_thanks_has_no_buttons_and_fills_name():
    result = play(SEED, START + BRANCHES["promo"] + [])
    assert result.screen.buttons == ()
    assert "{name}" not in result.screen.text


def test_walker_rejects_unknown_label():
    with pytest.raises(AssertionError):
        walk(SEED, [*START, "Несуществующая кнопка"])


def test_all_labels_fit_telegram():
    for s in SEED.steps.values():
        for o in s.options:
            assert len(o.label) <= 40, o.label


# --- обход всех достижимых состояний ---

_NO_BACK_STEPS = {"privacy", "menu"}


def _conditions(scenario: Scenario) -> list[tuple[str, tuple[str, ...]]]:
    found = set()
    for s in scenario.steps.values():
        if s.when:
            found.add((s.when.step, s.when.any))
        for o in s.options:
            if o.when:
                found.add((o.when.step, o.when.any))
    return sorted(found)


def _state_key(session: Session, conditions) -> tuple:
    met = tuple(
        step_id in session.answers and any(i in session.answers[step_id].ids for i in ids)
        for step_id, ids in conditions
    )
    return session.step, session.pending_input, session.returns, session.finished, met


def _events(scenario: Scenario, session: Session, screen: Screen) -> list[Event]:
    current = scenario.steps[session.step]
    events = [Event("button", step=screen.step, value=b.id) for b in screen.buttons if not b.url]
    if screen.can_done:
        events.append(Event("done", step=screen.step))
    if screen.expects == "text":
        value = "тест"
        if session.pending_input is None and current.validate == "phone":
            value = PHONE
        elif session.pending_input is None and current.validate == "url":
            value = "example.ru"
        events.append(Event("text", step=screen.step, value=value))
    if screen.expects == "file":
        events.append(Event("file", step=screen.step, value="abc"))
    return events


def _explore(scenario: Scenario):
    """BFS по всем кнопкам; отдаёт (состояние до события, результат)."""
    conditions = _conditions(scenario)
    first = new_session(scenario, chat_id=1)
    queue = deque([first])
    seen = {_state_key(first, conditions)}
    while queue:
        session = queue.popleft()
        screen = render(scenario, session)
        if session.finished:
            continue
        for event in _events(scenario, session, screen):
            result = step(scenario, session, event)
            yield session, result
            key = _state_key(result.session, conditions)
            if key not in seen:
                seen.add(key)
                queue.append(result.session)
        assert len(seen) < 50_000, "обход не сходится"


def test_every_step_can_go_back():
    reached = set()
    for before, result in _explore(SEED):
        reached.add(before.step)
        reached.add(result.session.step)
        after = result.session
        if after.finished or after.step in _NO_BACK_STEPS:
            continue
        assert result.screen.can_back, f"нет кнопки Назад на шаге {after.step}"

    assert reached == set(SEED.steps), f"недостижимы: {set(SEED.steps) - reached}"


def test_back_works_on_every_reached_state():
    checked = 0
    for before, _ in _explore(SEED):
        screen = render(SEED, before)
        if not screen.can_back:
            continue
        back = step(SEED, before, Event("back", step=screen.step))
        assert back.session != before, f"Назад не сработала на шаге {before.step}"
        checked += 1
    assert checked > 100


def test_thanks_is_the_only_terminal_step():
    terminals = [
        sid
        for sid, s in SEED.steps.items()
        if s.type == StepType.INFO and not s.options and s.next is None
    ]
    assert terminals == ["fin_thanks"]
