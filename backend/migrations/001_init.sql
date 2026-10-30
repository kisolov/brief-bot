-- Версии сценария неизменяемы; активна ровно одна (или ни одной, пока таблица пуста).
CREATE TABLE scenario_versions (
    number       integer     PRIMARY KEY,
    data         jsonb       NOT NULL,
    published_at timestamptz NOT NULL DEFAULT now(),
    active       boolean     NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX scenario_versions_one_active ON scenario_versions ((true)) WHERE active;

-- Черновик один (id = 1), может быть невалидным. revision растёт на каждое сохранение.
CREATE TABLE scenario_draft (
    id         integer     PRIMARY KEY CHECK (id = 1),
    data       jsonb       NOT NULL,
    revision   integer     NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE leads (
    id         bigserial   PRIMARY KEY,
    chat_id    bigint      NOT NULL,
    username   text,
    branch     text        NOT NULL DEFAULT '',
    answers    jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status     text        NOT NULL,
    file_id    text,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_step  text
);

-- У чата не больше одной незавершённой заявки.
CREATE UNIQUE INDEX leads_one_partial_per_chat ON leads (chat_id) WHERE status = 'partial';

CREATE TABLE admins (
    telegram_id bigint      PRIMARY KEY,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE editor_tokens (
    token_hash text        PRIMARY KEY,
    kind       text        NOT NULL,
    expires_at timestamptz NOT NULL,
    used_at    timestamptz
);

CREATE TABLE settings (
    key   text  PRIMARY KEY,
    value jsonb NOT NULL
);
