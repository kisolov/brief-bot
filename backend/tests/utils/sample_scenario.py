"""Маленький сценарий для тестов движка: все типы шагов, блок и условия."""

from src.scenario.entities import RETURN, Call, Option, Scenario, Step, StepType, When


def sample_scenario() -> Scenario:
    steps = [
        Step(
            id="privacy",
            type=StepType.CHOICE,
            text="Согласны с политикой?",
            options=(
                Option(id="policy", label="Политика", url="https://example.ru/policy"),
                Option(id="ok", label="Согласен", next="name"),
            ),
        ),
        Step(id="name", type=StepType.TEXT, text="Как вас зовут?", key="name", next="branch"),
        Step(
            id="branch",
            type=StepType.CHOICE,
            text="Что нужно?",
            key="Направление",
            options=(
                Option(id="new", label="Новый сайт", next="hub"),
                Option(id="old", label="Продвижение", next="promo_now"),
            ),
        ),
        Step(
            id="hub",
            type=StepType.CHOICE,
            text="Выберите раздел",
            options=(
                Option(id="cat", label="Каталог", next="cat"),
                Option(id="catb", label="Акции", next="cat_b"),
                Option(id="go", label="Дальше", next="contact"),
            ),
        ),
        Step(
            id="cat_b",
            type=StepType.MULTI,
            text="Что в акциях?",
            key="Акции",
            options=(Option(id="b1", label="Скидки"), Option(id="b2", label="Подарки")),
            next="hub",
        ),
        Step(
            id="cat",
            type=StepType.MULTI,
            text="Что в каталоге?",
            key="Каталог",
            options=(
                Option(id="a1", label="Товары"),
                Option(id="a2", label="Услуги"),
                Option(id="none", label="Ничего", exclusive=True),
            ),
            next="hub",
        ),
        Step(
            id="promo_now",
            type=StepType.CHOICE,
            text="Продвигаете сейчас?",
            key="Продвижение",
            options=(
                Option(id="paid", label="Платно", next=Call("sphere", then="extras")),
                Option(id="seo", label="SEO", next=Call("sphere", then="extras")),
                Option(id="never", label="Нет", next=Call("sphere", then="extras")),
            ),
        ),
        Step(
            id="sphere",
            type=StepType.CHOICE,
            text="Ваша сфера?",
            key="Сфера",
            options=(
                Option(id="shop", label="Магазин", next=RETURN),
                Option(id="svc", label="Услуги", next=RETURN),
            ),
        ),
        Step(
            id="extras",
            type=StepType.MULTI_INPUT,
            text="Что ещё нужно?",
            key="Дополнительно",
            options=(
                Option(id="logo", label="Логотип"),
                Option(id="other", label="Другое", input="Напишите, что именно"),
                Option(id="paid_only", label="Реклама", when=When("promo_now", ("paid",))),
                Option(id="nothing", label="Ничего", exclusive=True),
            ),
            next="promo_link",
        ),
        Step(
            id="promo_link",
            type=StepType.TEXT,
            text="Оставьте ссылку на сайт",
            key="Ссылка",
            validate="url",
            when=When("promo_now", ("paid", "seo")),
            next="contact",
        ),
        Step(
            id="contact",
            type=StepType.TEXT,
            text="Ваш телефон?",
            key="Телефон",
            validate="phone",
            next="docs",
        ),
        Step(id="docs", type=StepType.FILE, text="Пришлите файл", key="Файл", next="ready"),
        Step(id="ready", type=StepType.INFO, text="Всё записали.", next=Call("final")),
        Step(id="fin", type=StepType.INFO, text="Спасибо за заявку, {name}!", finish=True),
    ]
    return Scenario(
        version=3,
        entry="privacy",
        blocks={"sphere": "sphere", "final": "fin"},
        steps={s.id: s for s in steps},
    )
