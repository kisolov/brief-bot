# Образ backend: бот и API в одном процессе.
FROM python:3.13-slim

COPY --from=ghcr.io/astral-sh/uv:0.12.11 /uv /usr/local/bin/uv

ENV UV_PYTHON_DOWNLOADS=0 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

# Зависимости отдельным слоем: он пересобирается, только когда меняется lock.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# Каталоги целиком: scenario.json лежит в src/scenario/seed и обязан попасть в образ.
# scripts/ не копируется: dev-скрипты в рабочий образ не нужны.
COPY src ./src
COPY migrations ./migrations

RUN useradd --system --uid 10001 --no-create-home app
USER app

EXPOSE 8000

# Один процесс: опрос Telegram не должен запускаться дважды.
CMD ["uvicorn", "src.bootstrap.app:app", "--host", "0.0.0.0", "--port", "8000"]
