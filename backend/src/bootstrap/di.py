"""DI-контейнер: настройки, порты, адаптеры, сервисы, usecase. Порядок секций важен."""

from collections.abc import AsyncIterator
from datetime import UTC, datetime

from aiogram import Bot, Dispatcher, Router
from aiogram.client.default import DefaultBotProperties
from dependency_injector import containers, providers

from src.bootstrap.settings import TelegramSettings
from src.bootstrap.telegram.gateway import TelegramChatGateway
from src.bootstrap.telegram.router import build_router
from src.dialog.adapters.asyncpg import AsyncpgSettingsRepository
from src.dialog.adapters.memory import (
    InMemoryReminderQueue,
    InMemorySessionRepository,
    InMemorySettingsRepository,
)
from src.dialog.adapters.redis import RedisReminderQueue, RedisSessionRepository
from src.dialog.ports import ChatGateway, ReminderQueue, SessionRepository, SettingsRepository
from src.dialog.services import DialogService
from src.dialog.usecases.handle_event import HandleEvent
from src.dialog.usecases.resume_or_restart import ResumeOrRestart
from src.dialog.usecases.send_reminders import SendReminders
from src.leads.adapters.asyncpg import AsyncpgLeadRepository
from src.leads.adapters.memory import InMemoryLeadRepository, MockManagerNotifier
from src.leads.adapters.telegram import TelegramManagerNotifier
from src.leads.ports import LeadRepository, ManagerNotifier
from src.leads.services import LeadService
from src.scenario.adapters.asyncpg import AsyncpgScenarioRepository
from src.scenario.adapters.memory import InMemoryScenarioRepository
from src.scenario.ports import ScenarioRepository
from src.scenario.services import ScenarioService
from src.scenario.usecases.ensure_seeded import EnsureSeeded
from src.shared import redis_client
from src.shared.asyncpg_db import AsyncpgDatabase, PostgresSettings
from src.shared.redis_client import RedisSettings


def _utc_now() -> datetime:
    return datetime.now(UTC)


async def _init_bot(settings: TelegramSettings) -> AsyncIterator[Bot]:
    """Бот без разметки по умолчанию: тексты сценария могут содержать < и _."""
    bot = Bot(
        token=settings.token.get_secret_value(),
        default=DefaultBotProperties(parse_mode=None),
    )
    try:
        yield bot
    finally:
        await bot.session.close()


def _build_dispatcher(router: Router) -> Dispatcher:
    dispatcher = Dispatcher()
    dispatcher.include_router(router)
    return dispatcher


class Container(containers.DeclarativeContainer):
    # 1. настройки
    postgres_settings = providers.Singleton(PostgresSettings)
    redis_settings = providers.Singleton(RedisSettings)
    telegram_settings = providers.Singleton(TelegramSettings)

    # 2. порты
    scenario_repository = providers.AbstractSingleton(ScenarioRepository)
    session_repository = providers.AbstractSingleton(SessionRepository)
    reminder_queue = providers.AbstractSingleton(ReminderQueue)
    settings_repository = providers.AbstractSingleton(SettingsRepository)
    chat_gateway = providers.AbstractSingleton(ChatGateway)
    lead_repository = providers.AbstractSingleton(LeadRepository)
    manager_notifier = providers.AbstractSingleton(ManagerNotifier)

    # 3. инфраструктура и адаптеры
    asyncpg_db = providers.Resource(AsyncpgDatabase.initialize, postgres_settings)
    redis = providers.Resource(redis_client.initialize, redis_settings)
    bot = providers.Resource(_init_bot, telegram_settings)
    clock = providers.Object(_utc_now)

    asyncpg_scenario_repository = providers.Singleton(AsyncpgScenarioRepository, asyncpg_db)
    asyncpg_lead_repository = providers.Singleton(AsyncpgLeadRepository, asyncpg_db)
    asyncpg_settings_repository = providers.Singleton(AsyncpgSettingsRepository, asyncpg_db)
    telegram_chat_gateway = providers.Singleton(TelegramChatGateway, bot)
    redis_session_repository = providers.Singleton(RedisSessionRepository, redis)
    redis_reminder_queue = providers.Singleton(RedisReminderQueue, redis)
    telegram_manager_notifier = providers.Singleton(
        TelegramManagerNotifier, bot, telegram_settings.provided.manager_chat_id
    )
    # Для тестов: переопределение портов именованными провайдерами, не готовыми объектами.
    memory_scenario_repository = providers.Singleton(InMemoryScenarioRepository)
    memory_lead_repository = providers.Singleton(InMemoryLeadRepository)
    memory_session_repository = providers.Singleton(InMemorySessionRepository)
    memory_reminder_queue = providers.Singleton(InMemoryReminderQueue)
    memory_settings_repository = providers.Singleton(InMemorySettingsRepository)
    mock_manager_notifier = providers.Singleton(MockManagerNotifier)

    # 4. сервисы
    scenario_service = providers.Singleton(ScenarioService, scenario_repository)
    lead_service = providers.Singleton(LeadService, lead_repository, manager_notifier)
    dialog_service = providers.Singleton(
        DialogService, session_repository, reminder_queue, scenario_service, settings_repository
    )

    # 5. связка портов с адаптерами
    scenario_repository.override(asyncpg_scenario_repository)
    session_repository.override(redis_session_repository)
    reminder_queue.override(redis_reminder_queue)
    settings_repository.override(asyncpg_settings_repository)
    chat_gateway.override(telegram_chat_gateway)
    lead_repository.override(asyncpg_lead_repository)
    manager_notifier.override(telegram_manager_notifier)

    # 6. usecase и точки входа
    ensure_seeded = providers.Singleton(EnsureSeeded, scenario_service)
    handle_event = providers.Singleton(HandleEvent, dialog_service, lead_service, clock)
    resume_or_restart = providers.Singleton(ResumeOrRestart, dialog_service)
    send_reminders = providers.Singleton(SendReminders, dialog_service, lead_service, chat_gateway)
    telegram_router = providers.Singleton(build_router, handle_event, resume_or_restart)
    dispatcher = providers.Singleton(_build_dispatcher, telegram_router)


container = Container()
