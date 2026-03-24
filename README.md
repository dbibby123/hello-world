# OCPP Platform

Enterprise-grade Charging Station Management System (CSMS) built on **OCPP 2.0.1 / 2.1**, designed to operate **10,000+ EV chargers** at scale. Inspired by ChargePoint, EVGo/Driivz, AMPECO, and Monta.

Multi-tenant SaaS serving three stakeholder types: **Operators (CPOs)**, **Property Owners (site hosts)**, and **Drivers**.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        EV Chargers                              │
│         (OCPP 2.0.1 / 2.1 over WebSocket/TLS)                  │
└────────────────────┬────────────────────────────────────────────┘
                     │  10,000 persistent WS connections
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│              OCPP Gateway Cluster  (ocpp-gateway)               │
│   • Sticky-session load balancer (hash by stationId)            │
│   • Handles BootNotification, Heartbeat, StatusNotification     │
│   • Forwards domain messages to Kafka                           │
└──────────┬──────────────────────────────────────┬──────────────┘
           │ session state                         │ events
           ▼                                       ▼
       ┌────────┐                         ┌─────────────────┐
       │ Redis  │                         │  Apache Kafka   │
       │Cluster │                         │ (event bus)     │
       └────────┘                         └────────┬────────┘
                                                   │
              ┌────────────────────────────────────┤
              │            Topic routing            │
              ▼                 ▼                  ▼
   ┌─────────────────┐  ┌──────────────┐  ┌────────────────┐
   │  auth-service   │  │ transaction- │  │ meter-service  │
   │ (Authorize,     │  │   service    │  │ (MeterValues → │
   │  LocalAuthList) │  │ (TransEvt →  │  │  InfluxDB)     │
   └─────────────────┘  │  CDR → bill) │  └────────────────┘
                        └──────┬───────┘
                               │ billing.cdr
                               ▼
                    ┌─────────────────────┐
                    │  billing-service    │
                    │ (Tariff + Stripe)   │
                    └─────────────────────┘
                               │
              ┌────────────────┴──────────────┐
              ▼                               ▼
   ┌──────────────────┐            ┌──────────────────┐
   │  smart-charging  │            │  ocpi-connector  │
   │ (SiteLoadBal +   │            │ (OCPI 2.2.1 CPO/ │
   │  OpenADR/DR)     │            │  eMSP roaming)   │
   └──────────────────┘            └──────────────────┘
              │
              ▼
   ┌──────────────────────────────────────┐
   │           api-gateway                │
   │  REST API • Multi-tenant • RBAC      │
   │  Operator Portal / Site Host / Mgmt  │
   └──────────────────────────────────────┘
```

---

## Platform Modules

### Layer 0 — Protocol Core (Infrastructure)
| Module | Description |
|--------|-------------|
| **OCPP Gateway** | WebSocket server; OCPP 2.x session per charger; sticky-session LB |
| **Connection Manager** | Redis-backed charger↔node registry; heartbeat tracking; connector status |
| **Message Router** | Kafka event bus; partitioned by stationId for ordered delivery |
| **PKI / CA Service** | Internal CA for charger TLS certs (Security Profile 3 / mTLS) |

### Layer 1 — Core CSMS (OCPP 2.x Functional Blocks)
| Module | OCPP Block |
|--------|-----------|
| Provisioning & Boot | Provisioning |
| Heartbeat & Availability | Availability |
| Authorization Engine | Authorization |
| Transaction Manager | Transactions |
| Meter Value Processor | Metering |
| Remote Control Service | Remote Control |
| Reservation Service | Reservations |
| Smart Charging Engine | Smart Charging |
| Firmware Manager | Firmware |
| Diagnostics Service | Diagnostics |
| Security Manager | Security |
| Local List Manager | Local Auth List |
| Display & Messaging | Display |
| Tariff & Cost Engine | Tariff/Cost |
| V2G / Bidirectional Control | V2X (OCPP 2.1) |

### Layer 2 — Operator (CPO) Modules
| Module | Purpose |
|--------|---------|
| NOC Dashboard | Real-time map, charger availability, KPI tiles |
| Fleet & Asset Management | Charger inventory, site grouping, lifecycle |
| Fault & Alarm Management | Automated detection, work-order generation |
| Remote Management Console | Remote commands, config, firmware OTA |
| IAM / RBAC | Operator roles, SSO/SAML, API key management |
| Pricing & Tariff Manager | kWh, time, flat, idle fee; TOU; wholesale rates |
| Billing & Invoicing | CDR generation, B2B/B2C invoicing, tax rules |
| Payment Processing | Stripe; credit card, Apple Pay, RFID billing |
| Reporting & Analytics | Revenue, energy, utilization, health dashboards |
| Site Energy Management | Per-site load balancing, demand cap enforcement |
| Demand Response / OpenADR | OpenADR 2.0b VEN; grid curtailment signals |
| Solar & Storage Integration | Optimize charging from on-site renewables |
| Multi-Tenant Administration | Isolated tenants, white-label, operator onboarding |
| Notifications & Alerting | Email/SMS/push/webhook on faults, sessions |
| API Gateway & Developer Portal | REST API, OpenAPI docs, sandbox, rate limiting |

### Layer 3 — Property Owner Modules
| Module | Purpose |
|--------|---------|
| Site Owner Portal | Self-service dashboard, utilization, revenue |
| Access Control Rules | Public / tenant-only / employee / time-restricted |
| Amenity Integration | Parking validation, hotel/retail guest charging |
| Revenue Share Manager | CPO↔site-host splits, monthly payouts |
| Utility Program Enrollment | DR program enrollment, benefit tracking |
| Sustainability Reporting | CO₂ offsets, RECs, ESG dashboards |
| Multi-Site Portfolio | Compare performance across properties |

### Layer 4 — Driver Modules
| Module | Purpose |
|--------|---------|
| Driver Mobile App | Station map, start/stop, payment, history |
| RFID & Card Management | Issue/manage tokens, corporate cards |
| Plug & Charge (ISO 15118) | Auto-auth via vehicle contract certificate |
| Reservations | Book a specific connector in advance |
| Loyalty & Rewards | Points per kWh, tiers, partner rewards |
| In-Session Experience | Live kWh/cost meter, estimated completion |
| Roaming Access | Single account across OCPI-connected networks |
| Route & Range Planning | Trip planner with charging stops |

### Layer 5 — Interoperability & Roaming
| Module | Standard |
|--------|---------|
| OCPI Hub / Connector | OCPI 2.2.1 (Locations, Sessions, CDRs, Tokens, Tariffs, Commands) |
| eMSP Engine | Driver roaming into partner CPO networks |
| OICP Connector | Hubject (European market) |
| eMIP Connector | GIREVE hub (France/EU) |
| Clearing & Settlement | Cross-operator CDR reconciliation |

### Layer 6 — Data & Intelligence
| Module | Technology |
|--------|-----------|
| Real-Time Data Pipeline | Kafka Streams |
| Time-Series DB | InfluxDB / TimescaleDB |
| Data Warehouse | Snowflake / BigQuery |
| AI/ML Engine | Predictive maintenance, demand forecasting |
| Grid Services / VPP | Aggregate EVs as virtual power plant |
| Carbon Accounting | Real-time carbon intensity, ESG tracking |

---

## Repository Structure

```
ocpp-platform/
├── packages/
│   ├── ocpp-gateway/          # OCPP 2.x WebSocket gateway
│   │   ├── src/
│   │   │   ├── gateway.ts            # WebSocket server
│   │   │   ├── connectionManager.ts  # Redis session registry
│   │   │   ├── kafka.ts              # Kafka producer/consumer
│   │   │   ├── health.ts             # /health + /metrics endpoints
│   │   │   ├── handlers/
│   │   │   │   └── sessionHandler.ts # Per-charger OCPP session
│   │   │   └── utils/
│   │   │       ├── ocppMessage.ts    # Parse/build OCPP frames
│   │   │       └── logger.ts
│   │   └── Dockerfile
│   ├── auth-service/          # Authorization engine
│   │   └── src/
│   │       ├── authEngine.ts         # RFID, ISO 15118, App token auth
│   │       ├── cache/
│   │       │   ├── tokenRepository.ts   # Redis L1 + PG L2 cache
│   │       │   └── localAuthListSync.ts # OCPP SendLocalList
│   │       └── providers/
│   │           └── ocspValidator.ts     # ISO 15118 cert revocation
│   ├── transaction-service/   # Session lifecycle + CDR emission
│   │   └── src/processors/
│   │       └── transactionProcessor.ts
│   ├── meter-service/         # MeterValues → InfluxDB
│   │   └── src/processors/
│   │       └── meterValueProcessor.ts
│   ├── smart-charging/        # Load balancing + OpenADR
│   │   └── src/algorithms/
│   │       ├── siteLoadBalancer.ts      # Priority-weighted power distribution
│   │       └── demandResponseHandler.ts # OpenADR 2.0b VEN
│   ├── billing-service/       # Tariff engine + Stripe + CDR storage
│   │   └── src/
│   │       ├── pricing/tariffEngine.ts  # Multi-dim tariff calculation
│   │       ├── payment/stripeProcessor.ts
│   │       └── cdr/cdrService.ts
│   ├── ocpi-connector/        # OCPI 2.2.1 CPO/eMSP
│   │   └── src/
│   │       ├── modules/
│   │       │   ├── locations.ts
│   │       │   └── tokens.ts
│   │       └── routes/credentials.ts
│   └── api-gateway/           # REST API for portals
│       └── src/
│           ├── routes/
│           │   ├── stations.ts
│           │   └── analytics.ts
│           └── middleware/auth.ts
├── shared/
│   └── types/src/
│       ├── ocpp.ts            # Full OCPP 2.0.1 type definitions
│       └── index.ts           # Platform domain types
├── infrastructure/
│   └── db/init.sql            # PostgreSQL schema (12 tables)
├── docker-compose.yml         # Full local stack
└── turbo.json                 # Monorepo build pipeline
```

---

## Technology Stack

| Concern | Choice | Rationale |
|---------|--------|-----------|
| OCPP WebSocket | Node.js / `ws` | High concurrency, async I/O |
| Session State | Redis Cluster | Sub-ms lookup; enables horizontal WS scaling |
| Event Bus | Apache Kafka | Ordered per-charger; 100k+ msg/sec throughput |
| Primary DB | PostgreSQL | ACID transactions; JSONB for flexible config |
| Time-Series | InfluxDB | Optimized for meter readings; retention policies |
| API | Express + TypeScript | Lightweight, typed, well-understood |
| Auth | JWT + Keycloak (OIDC) | Industry standard; supports SSO |
| Payments | Stripe | Best-in-class; supports off-session charging |
| Containers | Docker + Kubernetes | K8s for prod; HPA for gateway pods |
| Observability | Prometheus + Grafana | `/metrics` on every service |
| Monorepo | Turborepo | Fast incremental builds |

---

## Scalability Design (10,000 Chargers)

| Component | Scaling Strategy |
|-----------|-----------------|
| OCPP Gateway | 10–20 pods; sticky sessions via stationId hash; Redis decouples from business logic |
| Kafka | 100+ partitions keyed by stationId; linear throughput scale |
| Auth Service | Stateless; Redis L1 cache → PG L2; scale to N replicas |
| Transaction Service | Consumer group; Kafka partitions = parallelism |
| Meter Service | InfluxDB handles millions of writes/sec; batched writes |
| Smart Charging | Periodic + event-driven; runs once per active site per minute |
| API Gateway | Stateless; rate-limited; scale to N replicas |
| PostgreSQL | Read replicas for analytics queries; connection pooling (PgBouncer) |

**Expected throughput at 10,000 chargers:**
- Idle (1 msg/charger/30s): ~333 msg/sec → trivial for Kafka
- Active peak (1 msg/charger/5s): ~2,000 msg/sec → well within limits
- Meter values during mass charging (every 15s): ~667 writes/sec to InfluxDB

---

## Security

| Layer | Mechanism |
|-------|-----------|
| OCPP transport | TLS 1.3 + optional mTLS (Security Profile 3) |
| Charger identity | X.509 certs issued by internal CA (via PKI service) |
| ISO 15118 (PnC) | Separate PKI: Root CA → MO-CA → contract certs; OCSP revocation |
| API auth | JWT (OAuth 2.0) from Keycloak; short-lived tokens |
| M2M auth | HMAC-signed API keys; scoped permissions |
| Webhook delivery | HMAC-SHA256 signature on payload |
| Data isolation | tenant_id on every row; enforced at service layer |
| Network | Gateway + API publicly exposed; all microservices in private VPC |

---

## Getting Started

### Prerequisites
- Docker + Docker Compose
- Node.js 20+

### Local development

```bash
# Start all infrastructure + services
docker compose up -d

# Stream logs from the OCPP gateway
docker compose logs -f gateway

# Access services:
# API Gateway:      http://localhost:3001
# OCPI Connector:   http://localhost:3002
# Kafka UI:         http://localhost:8080
# InfluxDB:         http://localhost:8086
```

### Build all packages

```bash
npm install
npm run build
```

---

## Standards Compliance

| Standard | Version | Status |
|----------|---------|--------|
| OCPP | 2.0.1 | Core + Smart Charging + Security + Firmware |
| OCPP | 2.1 | V2X / Bidirectional (architecture-ready) |
| OCPI | 2.2.1 | Locations, Sessions, CDRs, Tokens, Tariffs, Commands |
| ISO 15118 | 2 + 20 | Plug & Charge PKI (V2G-ready) |
| OpenADR | 2.0b | VEN client for demand response |
| ISO 14443 | A/B | RFID card support |

---

## Open Source Reference Projects

- [CitrineOS](https://github.com/citrineos) (LF Energy) — modular OCPP 2.0.1 CSMS
- [SteVe](https://github.com/steve-community/steve) — mature Java OCPP server
- [EVerest](https://github.com/EVerest/everest-core) (LF Energy) — open charger firmware
- [OCPI spec](https://github.com/ocpi/ocpi) — official OCPI 2.2.1 specification
- [MaEVe](https://github.com/thoughtworks/maeve-csms) — modern Go CSMS reference

---

## Phased Roadmap

| Phase | Timeline | Deliverables |
|-------|----------|-------------|
| **1 — MVP** | Months 1–6 | Gateway, Auth, Transactions, Billing, Basic API, Driver app (find/start/pay) |
| **2 — Growth** | Months 7–12 | Smart Charging, OCPI roaming, Site Host Portal, Reservations, Analytics |
| **3 — Enterprise** | Months 13–18 | ISO 15118 PnC, OpenADR, Multi-tenant admin, AI/ML, V2G, Carbon Accounting |
