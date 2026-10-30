# Образ редактора: статика nuxt generate под Caddy. Контекст сборки — корень репозитория.
FROM node:26-alpine AS build

WORKDIR /editor

COPY editor/package.json editor/package-lock.json ./
RUN npm ci

# Без NUXT_PUBLIC_EDITOR_MOCK: мок-адаптеры и сид в рабочую сборку не попадают.
COPY editor/ ./
RUN npx nuxt generate

FROM caddy:2-alpine

COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /editor/.output/public /srv
