#!/usr/bin/env bash
# Выкладка на сервер: образы собираются здесь и передаются по ssh, на сервере сборки нет.
# Использование: deploy/deploy.sh user@host
# Файл .env на сервере скрипт не создаёт и не копирует. Исходный код на сервер не попадает.
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Использование: $0 user@host" >&2
  exit 1
fi

target="$1"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
remote_dir="brief-bot"
compose="docker compose -f docker-compose.prod.yml"

cd "$root"

echo "Сборка образов"
docker build -t brief-bot-app:latest backend
docker build -t brief-bot-caddy:latest -f editor/Dockerfile .

echo "Проверка сервера"
ssh "$target" "mkdir -p ~/$remote_dir && test -f ~/$remote_dir/.env" || {
  echo "На сервере нет ~/$remote_dir/.env: создайте его по docs/DEPLOY.md" >&2
  exit 1
}

# Прошлые образы остаются под тегом :previous, чтобы можно было откатиться.
echo "Сохранение прошлых образов как :previous"
ssh "$target" "for i in app caddy; do docker image inspect brief-bot-\$i:latest >/dev/null 2>&1 && docker tag brief-bot-\$i:latest brief-bot-\$i:previous || true; done"

echo "Передача образов"
docker save brief-bot-app:latest brief-bot-caddy:latest | gzip | ssh "$target" "gunzip | docker load"

echo "Передача docker-compose.prod.yml"
rsync -t docker-compose.prod.yml "$target:$remote_dir/"

echo "Запуск"
ssh "$target" "cd ~/$remote_dir && $compose up -d --no-build"
ssh "$target" "cd ~/$remote_dir && $compose ps"
