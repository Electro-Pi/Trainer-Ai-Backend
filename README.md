# MODRB (AI Trainer) — Backend

Express + TypeScript + Prisma + PostgreSQL backend for MODRB, a manager-driven AI training platform delivered through Microsoft Teams. This repo is the backend only — API, business logic, data model, and the seam to an external AI service. There is no frontend here.

**The one sentence that shapes the whole design:** learners never sign in. They exist only as directory-imported records; their entire experience is a Teams invitation and an emailed PDF report.

---

## Setup

`docker compose up` is the only setup command.

```bash
git clone <repo>
cd Trainer-Ai-Back
cp .env.example .env   # fill in JWT_PRIVATE_KEY/JWT_PUBLIC_KEY/ENCRYPTION_KEY at minimum — see below
docker compose up
```

This boots Postgres (with pgvector), Redis, ClamAV, runs pending migrations (`migrate` service), then starts the API (`:3000`) and the worker. Everything else — Microsoft Graph, the AI service, Azure storage/OCR/embeddings, email — defaults to a **fake** implementation, so the full product runs end-to-end with zero external accounts (see [§ Provider fakes](#provider-fakes-vs-real-integrations) below).

Generate a JWT key pair and encryption key for local dev:

```bash
openssl genrsa -out jwt-private.pem 2048
openssl rsa -in jwt-private.pem -pubout -out jwt-public.pem
# base64-encode each PEM file's contents into JWT_PRIVATE_KEY / JWT_PUBLIC_KEY
openssl rand -base64 32   # → ENCRYPTION_KEY
```

Seed demo data (tracks, a full org, users per role, sample content and a completed session):

```bash
npm run seed
```

### Local development without Docker

```bash
npm install
npm run dev          # API, tsx watch
npm run dev:worker    # worker process, separate terminal
```

Requires a running Postgres (with the `vector` extension) and Redis reachable at the URLs in `.env`.

### Common commands

| Command                              | Does                                              |
| ------------------------------------ | ------------------------------------------------- |
| `npm run dev` / `npm run dev:worker` | API / worker, watch mode                          |
| `npm run build`                      | Compile to `dist/`                                |
| `npm run typecheck`                  | `tsc --noEmit`                                    |
| `npm run lint` / `npm run lint:fix`  | ESLint (architecture-enforcing rules — see below) |
| `npm run test`                       | Vitest (Testcontainers-backed Postgres + Redis)   |
| `npm run seed`                       | Idempotent demo data                              |

---

## Architecture summary

Full detail lives in [`context/ARCHITECTURE.md`](context/ARCHITECTURE.md); decisions and their rationale in [`context/MEMORY.md`](context/MEMORY.md). This is the short version.

**Layering (one-way):** `routes → controllers → services → repositories → Prisma`. Controllers hold no business logic; services never see `req`/`res`; repositories are the only place Prisma appears (`BaseRepository<T>` — CRUD, cursor pagination, tenant scoping). Enforced by ESLint, not convention.

**Module anatomy** — every module follows the same shape: `controllers/ services/ repositories/ dto/ validators/ <name>.routes.ts <name>.module.ts`. Cross-module access only goes through `<name>.module.ts` — no deep imports into another module's internals.

**Multi-tenant from the schema up** — every tenant-scoped table carries `organizationId`; a Prisma client extension (`src/database/tenant.extension.ts`) injects the scope on every query and refuses to run outside `runWithTenant()`. A handful of models (`Level`, `Outcome`, `Assessment`, `MediaAsset`, …) are reached transitively through a parent instead of carrying the column directly — each repository's own doc comments explain the scoping path.

**The differentiator — a deterministic recommendation engine, not an LLM ranker.** Six pure-function signals (outcome relevance, priority, level fit, question-level gap, effectiveness, semantic similarity via pgvector) combine by fixed weights into a `signalBreakdown` that's inspectable, unit-testable, and fast enough for the < 2s in-session remediation path. Every recommendation writes `PROPOSED` only — nothing reaches a learner's plan without manager confirmation.

**Everything slow or external goes through a BullMQ job**, never inline in a request — upload → scan → OCR → embed is a queue pipeline from day one; meetings, reports, emails, the nightly effectiveness recompute and the retention sweep (`cleanup.job`) are all jobs. `src/queue/worker.ts` is a separate process.

**Every external dependency has a fake, and the fake is the dev/test default** — see below.

**No hard deletes.** Deactivate, archive, version. `cleanup.job`'s nightly retention sweep removes only by-products (expired tokens, transcripts past their legal window, quarantined media, orphaned blobs, stale temp files, old audit logs) — it is structurally forbidden from touching `Report`, `Learner`, `ContentItem`, `Session` or `Assessment`, and that boundary is covered by a dedicated test, not just a comment.

**Errors** are localized RFC 9457 `problem+json`, in `en`/`ar`, never leaking Prisma or internal messages to a client.

**Contract-first API surface** — `/api/v1`, cursor pagination, a Zod-generated OpenAPI 3.1 spec at `/api/docs` grouped by module tag. This spec is the published contract for both the frontend and the AI team.

---

## Provider fakes vs. real integrations

Every external dependency is behind an interface with a `<X>_PROVIDER` env flag. All default to a fake/local implementation — the system is fully demoable and CI-testable with **no external accounts**.

| Concern                    | Flag                  | Fake (default)                         | Real                                                                    |
| -------------------------- | --------------------- | -------------------------------------- | ----------------------------------------------------------------------- |
| Microsoft Graph / Entra ID | `GRAPH_PROVIDER`      | `FakeGraphService` / `FakeMsalService` | `real` — needs `GRAPH_CLIENT_ID`/`_SECRET`/`_TENANT_ID`/`_REDIRECT_URI` |
| AI service (see below)     | `AI_SERVICE_PROVIDER` | `FakeLlmService`                       | `real` — needs `AI_SERVICE_BASE_URL`/`_TOKEN`                           |
| File storage               | —                     | —                                      | UploadThing (always) — needs `UPLOADTHING_TOKEN`                        |
| Malware scanning           | `SCANNER_PROVIDER`    | `FakeScanner`                          | `clamav` — needs `CLAMAV_HOST`/`_PORT`                                  |
| Embeddings                 | `EMBEDDING_PROVIDER`  | `FakeEmbeddingService` (deterministic) | `openai` — OpenAI `text-embedding-3-small`                              |
| OCR                        | `OCR_PROVIDER`        | `FakeOcrService`                       | `openai` — GPT-4o vision (PDF/image only, no Word/PowerPoint)           |
| Email                      | `EMAIL_PROVIDER`      | `FakeEmailService` (logs, never sends) | `smtp` or `graph`                                                       |

Full variable list, defaults and required-vs-optional status: [`.env.example`](.env.example) and [`docs/RUNBOOK.md`](docs/RUNBOOK.md#3-environment-variables).

---

## AI-team integration checklist

The AI service is **another team's system** — this backend never runs inference (no LLM calls, no STT, no meeting bot). It's coded against a 3-method interface (`AiServiceClient`: `dispatchSession`, `cancelSession`, `healthCheck` — deliberately capped, see `context/MEMORY.md` **D-18** for why `generateRecommendation`/`evaluateAnswer`/`generateReport` were rejected) with a fully working fake as the default, so the whole plan → session → assessment → carry-over → report chain is demoable before their endpoint exists.

**When their endpoint is ready:**

1. Set `AI_SERVICE_PROVIDER=real`, `AI_SERVICE_BASE_URL`, `AI_SERVICE_TOKEN` — that's the entire code change on our side (`HttpAiServiceClient` is already built against the interface, just unused by default).
2. Confirm the **published contract** at `/api/docs` (OpenAPI 3.1, tag `Agent API`) matches what they expect for the inbound half of the seam — this is the same spec the frontend team gets.
3. Their calls into us authenticate via `x-service-token` (see `src/common/guards/service-token.guard.ts`), rate-limited and Zod-validated exactly like a browser request (their payloads are untrusted input, same as anyone else's). Confirm this auth scheme works for them, or agree on an alternative — **currently unconfirmed, see item 1 below.**

**Open questions to confirm at handoff** (full list with rationale in [`context/MEMORY.md`](context/MEMORY.md#open-questions--to-revisit)):

1. **Auth scheme** for their calls into us — we assume a static service token; confirm they can hold a secret, or switch to mTLS/signed requests.
2. **Push vs. pull** — we assume they _pull_ session context via `GET /agent/sessions/:joinToken/context`. Confirm they don't expect the full context pushed at dispatch instead.
3. **Media access** — we assume time-limited SAS URLs (returned in the context payload) are sufficient. Confirm they don't need raw bytes.
4. **Transcript format and size** — expected shape, and whether it streams or arrives once at completion (`POST /agent/sessions/:id/transcript`).
5. **Remediation latency budget** — we target < 2s for in-session remediation (`RC-07`); confirm that fits their loop.
6. **Who creates the Teams meeting** — we assume _we_ do via Graph and they only join. Confirm they don't create it themselves, which would change who owns `Session.graphEventId`.

**What we own vs. what they own** (non-negotiable — see AGENTS.md §3): they supply answers and per-criterion judgements; **we** compute the weighted rubric score, derive the verdict, update `LearnerOutcome`, and drive carry-over. Their payloads never write directly to a learner's permanent record — every write on our side goes through our own validation and scoring logic first.

---

## Operations

- **Runbook** (services, deploy sequencing, env var reference, health/alerting, troubleshooting): [`docs/RUNBOOK.md`](docs/RUNBOOK.md)
- **BullMQ dashboard**: `/admin/queues`, HTTP Basic Auth (`ADMIN_DASHBOARD_USER`/`_PASSWORD`)
- **Health**: `GET /health` (liveness), `GET /health/ready` (dependency checks — point a load balancer here)
- **API docs**: `/api/docs`

---

## Requirements source

`docs/Ai_trainer_BRD_v3.pdf` is the requirements source of truth — requirement IDs (`AU-01`, `RC-05`, …) throughout the codebase refer to it. Read-only reference; never edit.
