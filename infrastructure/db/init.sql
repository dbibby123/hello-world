-- ─── OCPP Platform — PostgreSQL Schema ──────────────────────────────────────
-- Run automatically by Docker on first start.
-- For production: use a migration tool (Flyway, Liquibase, or node-postgres-migrate).

-- ─── Multi-Tenancy ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenants (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  plan         TEXT NOT NULL DEFAULT 'starter',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Locations & Stations ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS locations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  name          TEXT NOT NULL,
  address       TEXT NOT NULL,
  city          TEXT NOT NULL,
  country       TEXT NOT NULL,
  coordinates   JSONB NOT NULL DEFAULT '{}',
  max_site_kw   NUMERIC(10,2),
  site_host_id  UUID,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS locations_tenant_idx ON locations(tenant_id);

CREATE TABLE IF NOT EXISTS stations (
  id               TEXT PRIMARY KEY,     -- stationId from OCPP (charger serial or configured ID)
  location_id      UUID NOT NULL REFERENCES locations(id),
  tenant_id        UUID NOT NULL REFERENCES tenants(id),
  model            TEXT NOT NULL,
  vendor           TEXT NOT NULL,
  serial_number    TEXT,
  firmware_version TEXT,
  ocpp_version     TEXT NOT NULL DEFAULT '2.0.1',
  status           TEXT NOT NULL DEFAULT 'unknown',
  last_heartbeat   TIMESTAMPTZ,
  max_power_kw     NUMERIC(10,2) NOT NULL DEFAULT 22.0,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS stations_tenant_idx ON stations(tenant_id);
CREATE INDEX IF NOT EXISTS stations_location_idx ON stations(location_id);
CREATE INDEX IF NOT EXISTS stations_status_idx ON stations(status);

CREATE TABLE IF NOT EXISTS evses (
  id           SERIAL,
  uid          TEXT NOT NULL UNIQUE,
  station_id   TEXT NOT NULL REFERENCES stations(id),
  evse_id      INT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'Unknown',
  connectors   JSONB NOT NULL DEFAULT '[]',
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (station_id, evse_id)
);

-- ─── Users & Auth ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id),
  email      TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, email)
);

CREATE TABLE IF NOT EXISTS api_keys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  name        TEXT NOT NULL,
  key_hash    TEXT NOT NULL UNIQUE,
  scopes      TEXT[] NOT NULL DEFAULT '{}',
  revoked     BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Drivers ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS drivers (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                    TEXT NOT NULL UNIQUE,
  stripe_customer_id       TEXT,
  default_payment_method_id TEXT,
  loyalty_points           INT NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS driver_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id   UUID REFERENCES drivers(id),
  type        TEXT NOT NULL,        -- ISO14443, ISO15693, eMAID, APP
  token       TEXT NOT NULL UNIQUE,
  valid       BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS driver_tokens_token_idx ON driver_tokens(token);

-- ─── Charging Sessions ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS charging_sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id          TEXT NOT NULL REFERENCES stations(id),
  evse_id             INT NOT NULL,
  connector_id        INT NOT NULL,
  transaction_id      TEXT NOT NULL UNIQUE,
  id_token            TEXT,
  start_time          TIMESTAMPTZ NOT NULL,
  end_time            TIMESTAMPTZ,
  status              TEXT NOT NULL DEFAULT 'active',
  energy_delivered_wh NUMERIC(15,3) NOT NULL DEFAULT 0,
  meter_start_wh      NUMERIC(15,3),
  charging_state      TEXT,
  stop_reason         TEXT,
  tenant_id           UUID NOT NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sessions_station_idx ON charging_sessions(station_id);
CREATE INDEX IF NOT EXISTS sessions_status_idx ON charging_sessions(status);
CREATE INDEX IF NOT EXISTS sessions_start_time_idx ON charging_sessions(start_time);
CREATE INDEX IF NOT EXISTS sessions_tenant_idx ON charging_sessions(tenant_id);

-- Raw event log for replay/audit (append-only)
CREATE TABLE IF NOT EXISTS transaction_events (
  id             BIGSERIAL PRIMARY KEY,
  station_id     TEXT NOT NULL,
  tenant_id      UUID NOT NULL,
  transaction_id TEXT NOT NULL,
  event_type     TEXT NOT NULL,
  seq_no         INT NOT NULL,
  payload        JSONB NOT NULL,
  timestamp      TIMESTAMPTZ NOT NULL,
  ingested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (transaction_id, seq_no)
);
CREATE INDEX IF NOT EXISTS tx_events_transaction_idx ON transaction_events(transaction_id);

-- ─── Billing ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tariffs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id),
  name       TEXT NOT NULL,
  currency   TEXT NOT NULL DEFAULT 'USD',
  elements   JSONB NOT NULL DEFAULT '[]',
  start_date TIMESTAMPTZ,
  end_date   TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS station_tariff_assignments (
  station_id TEXT NOT NULL REFERENCES stations(id),
  tariff_id  UUID NOT NULL REFERENCES tariffs(id),
  priority   INT NOT NULL DEFAULT 0,
  PRIMARY KEY (station_id, tariff_id)
);

CREATE TABLE IF NOT EXISTS charge_detail_records (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID NOT NULL,
  station_id          TEXT NOT NULL,
  tenant_id           UUID NOT NULL,
  start_date_time     TIMESTAMPTZ NOT NULL,
  end_date_time       TIMESTAMPTZ NOT NULL,
  auth_method         TEXT NOT NULL,
  id_token            TEXT,
  energy_delivered_wh NUMERIC(15,3) NOT NULL,
  duration_seconds    INT NOT NULL,
  total_cost          NUMERIC(12,4) NOT NULL DEFAULT 0,
  currency            TEXT NOT NULL DEFAULT 'USD',
  tariff_id           UUID REFERENCES tariffs(id),
  meter_start         NUMERIC(15,3),
  meter_stop          NUMERIC(15,3),
  stop_reason         TEXT,
  payment_intent_id   TEXT,
  payment_status      TEXT NOT NULL DEFAULT 'pending',
  payment_error       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cdr_tenant_idx ON charge_detail_records(tenant_id);
CREATE INDEX IF NOT EXISTS cdr_station_idx ON charge_detail_records(station_id);
CREATE INDEX IF NOT EXISTS cdr_created_idx ON charge_detail_records(created_at);

-- ─── Smart Charging ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS charging_profiles (
  id           BIGSERIAL PRIMARY KEY,
  station_id   TEXT NOT NULL REFERENCES stations(id),
  evse_id      INT NOT NULL,
  profile      JSONB NOT NULL,
  purpose      TEXT NOT NULL,
  valid_from   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_to     TIMESTAMPTZ,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Reservations ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reservations (
  id               BIGSERIAL PRIMARY KEY,
  station_id       TEXT NOT NULL REFERENCES stations(id),
  evse_id          INT NOT NULL,
  id_token         TEXT NOT NULL,
  expiry_date_time TIMESTAMPTZ NOT NULL,
  status           TEXT NOT NULL DEFAULT 'active',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Alerts ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS alerts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id  TEXT REFERENCES stations(id),
  tenant_id   UUID NOT NULL,
  type        TEXT NOT NULL,
  severity    TEXT NOT NULL DEFAULT 'info',
  message     TEXT NOT NULL,
  resolved    BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS alerts_tenant_unresolved ON alerts(tenant_id) WHERE resolved = false;

-- ─── Webhooks ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS webhooks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  url         TEXT NOT NULL,
  events      TEXT[] NOT NULL,
  secret_hash TEXT NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── OCPI ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ocpi_credentials (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id     TEXT NOT NULL,
  country_code TEXT NOT NULL,
  token_their  TEXT NOT NULL,
  token_ours   TEXT NOT NULL,
  tenant_id    UUID REFERENCES tenants(id),
  version_url  TEXT NOT NULL,
  roles        JSONB NOT NULL DEFAULT '[]',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (party_id, country_code)
);

CREATE TABLE IF NOT EXISTS ocpi_tokens (
  uid            TEXT PRIMARY KEY,
  type           TEXT NOT NULL,
  contract_id    TEXT NOT NULL,
  visual_number  TEXT,
  issuer         TEXT NOT NULL,
  valid          BOOLEAN NOT NULL DEFAULT TRUE,
  whitelist      TEXT NOT NULL DEFAULT 'ALWAYS',
  country_code   TEXT NOT NULL,
  party_id       TEXT NOT NULL,
  last_updated   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Seed: Default tenant ─────────────────────────────────────────────────────

INSERT INTO tenants (id, name, slug, plan)
VALUES ('00000000-0000-0000-0000-000000000001', 'Demo Operator', 'demo', 'enterprise')
ON CONFLICT DO NOTHING;

INSERT INTO locations (tenant_id, name, address, city, country, coordinates, max_site_kw)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Demo Charging Hub',
  '123 Main St',
  'San Francisco',
  'US',
  '{"lat": 37.7749, "lng": -122.4194}',
  100.0
)
ON CONFLICT DO NOTHING;
