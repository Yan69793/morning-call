-- 0001_init.sql — histórico e avaliação.
--
-- Este schema existe antes do primeiro run por um motivo: todo dia rodando sem gravar é um dia
-- de histórico perdido para sempre. É o único ativo do projeto que não dá para comprar depois,
-- e sem ele a Fase 7 (skill of the model over time) não tem o que medir.
--
-- Convenções:
--  - todo instante é ISO-8601 em UTC (sufixo Z). BRT só na renderização.
--  - `trade_date` é o pregão BR de referência, YYYY-MM-DD.
--  - payloads validados vão como JSON, mas o que a avaliação consulta vira coluna.

CREATE TABLE runs (
  id           TEXT PRIMARY KEY,           -- uuid, o run_id que atravessa todos os artefatos
  trade_date   TEXT NOT NULL,
  started_at   TEXT NOT NULL,
  finished_at  TEXT,
  status       TEXT NOT NULL CHECK (status IN ('running', 'ok', 'partial', 'failed')),
  -- 'partial' é resultado legítimo: seções em N/D valem mais que um relatório completo e falso.
  faltantes    TEXT NOT NULL DEFAULT '[]', -- JSON array das chaves que voltaram N/D
  custo_usd    REAL,
  tokens_in    INTEGER,
  tokens_out   INTEGER
);

-- Um run por pregão. O retry de um workflow reaproveita o run_id, então esta constraint é o que
-- transforma "retry não duplica" de promessa em invariante do banco (CLAUDE.md §3, idempotência).
CREATE UNIQUE INDEX idx_runs_trade_date ON runs (trade_date);

-- Snapshot bruto, gravado antes de qualquer LLM tocar nele: é o que torna o relatório de hoje
-- reproduzível amanhã com o mesmo insumo.
CREATE TABLE snapshots (
  run_id     TEXT PRIMARY KEY REFERENCES runs (id) ON DELETE CASCADE,
  taken_at   TEXT NOT NULL,
  points     TEXT NOT NULL               -- JSON: DataPoint[]
);

CREATE TABLE quant_metrics (
  run_id     TEXT PRIMARY KEY REFERENCES runs (id) ON DELETE CASCADE,
  computed_at TEXT NOT NULL,
  metrics    TEXT NOT NULL               -- JSON: QuantMetrics
);

CREATE TABLE theses (
  id                TEXT PRIMARY KEY,
  run_id            TEXT NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
  titulo            TEXT NOT NULL,
  regime            TEXT NOT NULL,
  ja_precificado    INTEGER NOT NULL CHECK (ja_precificado IN (0, 1)),
  conviccao         REAL NOT NULL,
  model             TEXT NOT NULL,        -- proveniência: qual modelo produziu
  prompt_version    TEXT NOT NULL,
  payload           TEXT NOT NULL         -- JSON: Thesis
);
CREATE INDEX idx_theses_run ON theses (run_id);
CREATE INDEX idx_theses_model ON theses (model);

CREATE TABLE trades (
  id                TEXT PRIMARY KEY,
  run_id            TEXT NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
  thesis_id         TEXT REFERENCES theses (id) ON DELETE SET NULL,
  nome              TEXT NOT NULL,
  classe            TEXT NOT NULL,
  categoria         TEXT NOT NULL,
  horizonte         TEXT NOT NULL,
  direcao           TEXT NOT NULL CHECK (direcao IN ('comprar', 'vender')),
  entrada_tipo      TEXT NOT NULL CHECK (entrada_tipo IN ('preco', 'spread', 'premio')),
  entrada_valor     REAL NOT NULL,
  unidade           TEXT NOT NULL,        -- unidade de entrada, alvos e invalidação
  alvo_1            REAL NOT NULL,
  alvo_2            REAL NOT NULL,
  invalidacao_nivel REAL,                 -- null = invalidação por evento, sem preço
  risco_retorno     REAL NOT NULL,        -- derivado em código, nunca declarado pelo LLM
  conviccao         REAL NOT NULL,
  sizing_pct        REAL NOT NULL,
  model             TEXT NOT NULL,
  prompt_version    TEXT NOT NULL,
  -- Trades reprovados também entram, com o motivo: medir o que o comitê barrou é a única forma
  -- de saber, depois, se ele estava barrando o certo (RUNTIME_AGENTS.md §4).
  publicado         INTEGER NOT NULL CHECK (publicado IN (0, 1)),
  motivo_rejeicao   TEXT,
  redteam_veredito  TEXT CHECK (redteam_veredito IN ('aprovar', 'rejeitar', 'revisar')),
  payload           TEXT NOT NULL         -- JSON: TradeCard
);
CREATE INDEX idx_trades_run ON trades (run_id);
CREATE INDEX idx_trades_model ON trades (model);
CREATE INDEX idx_trades_publicado ON trades (publicado);

-- Marcação a mercado. Alimentada pelo cron das 18:30 BRT, não pelo run da manhã.
-- Sem esta tabela o ciclo nunca fecha: o sistema publicaria opinião para sempre sem placar.
CREATE TABLE trade_marks (
  trade_id       TEXT NOT NULL REFERENCES trades (id) ON DELETE CASCADE,
  mark_date      TEXT NOT NULL,           -- pregão marcado
  marked_at      TEXT NOT NULL,
  preco          REAL NOT NULL,           -- na `unidade` do trade
  pnl_pct        REAL NOT NULL,           -- sinal já ajustado pela direção
  mae_pct        REAL NOT NULL,           -- maximum adverse excursion acumulada
  mfe_pct        REAL NOT NULL,           -- maximum favorable excursion acumulada
  status         TEXT NOT NULL CHECK (status IN ('aberto', 'alvo_1', 'alvo_2', 'invalidado', 'expirado')),
  fonte_preco    TEXT NOT NULL,           -- rastreabilidade vale para o placar também
  PRIMARY KEY (trade_id, mark_date)       -- remarcar o mesmo dia é UPSERT, não linha nova
);
CREATE INDEX idx_marks_status ON trade_marks (status);

CREATE TABLE reports (
  run_id       TEXT PRIMARY KEY REFERENCES runs (id) ON DELETE CASCADE,
  generated_at TEXT NOT NULL,
  r2_key       TEXT NOT NULL,             -- artefato em R2; D1 guarda só o ponteiro
  regime       TEXT NOT NULL,
  vies         TEXT NOT NULL,
  conviccao    REAL NOT NULL,
  n_trades     INTEGER NOT NULL,          -- 0 = "NÃO OPERAR É A MELHOR OPERAÇÃO", resultado válido
  aprovado     INTEGER NOT NULL CHECK (aprovado IN (0, 1)),
  payload      TEXT NOT NULL              -- JSON: MorningCall
);

-- Custo por agente por run (RUNTIME_AGENTS.md §5). Serve ao teto de gasto e à pergunta que a
-- Fase 7 precisa responder: o modelo caro paga o próprio preço em acerto?
CREATE TABLE agent_calls (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id         TEXT NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
  agent          TEXT NOT NULL,
  model          TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  started_at     TEXT NOT NULL,
  latency_ms     INTEGER,
  tokens_in      INTEGER,
  tokens_out     INTEGER,
  custo_usd      REAL,
  status         TEXT NOT NULL CHECK (status IN ('ok', 'schema_invalido', 'timeout', 'erro')),
  tentativa      INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_calls_run ON agent_calls (run_id);
