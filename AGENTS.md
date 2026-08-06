# AGENTS.md — Operating Guide

You are working on **MODRB (AI Trainer)** — the **backend** (Express + TypeScript + Prisma + PostgreSQL). Follow this file exactly.

---

## 1. Read order at session start

1. **This file.**
2. [`context/ARCHITECTURE.md`](./ARCHITECTURE.md) — scope, stack, module structure, data model, API surface, non-negotiables.
3. [`context/MEMORY.md`](./MEMORY.md) — locked decisions and _why_. Never re-litigate a locked decision; if you disagree, raise it, don't silently deviate.
4. [`context/BUILD_PLAN.md`](./BUILD_PLAN.md) — what to build, in what order.
5. [`context/PROGRESS_TRACKER.md`](./PROGRESS_TRACKER.md) — what is already done.

The requirements source of truth is `docs/Ai_trainer_BRD_v3.pdf`. Requirement IDs (`AU-01`, `RC-05`, …) refer to it. **Where the reference frontend and the BRD disagree, the BRD wins.**

---

## 2. Hard rules — never break these

1. **Learners never get portal credentials.** No auth path may issue a token for a `Learner`. (`AU-04`, `IV-06`)
2. **Types split by meaning** (ARCHITECTURE §4.2): shared contracts in `src/index.d.ts`; request/response/filter DTOs in `modules/<name>/dto/`, one file per shape. _If >1 module imports it, it's shared._
3. **Zod schemas in `modules/<name>/validators/`;** shared field primitives (email, password, cuid, phone) defined **once** in `common/validators/` and composed. Never redefine a field rule.
4. **Every mutating endpoint re-validates server-side** with the same schema, even if a client already validated.
   4b. **No service touches Prisma.** Data access goes through a repository extending `BaseRepository<T>`. Enforced by lint.
   4c. **Every external dependency has a fake**, and the fake is the dev/test default. Never block on a real external service.
   4d. **Domain events publish only AFTER the transaction commits** — never inside it. Handlers enqueue jobs, never block, never throw into the publisher (ARCHITECTURE §4.4).
   4e. **`cleanup` sweeps by-products, never records.** It must never touch `Report`, `Learner`, `ContentItem`, `Session` or `Assessment` (§10.1).
5. **No recommendation is applied without manager confirmation.** Generation writes `PROPOSED` only. (`RC-06`)
6. **Only `PUBLISHED`, malware-clean content is recommendable or deliverable.** (`CM-12`)
7. **Every content item binds to exactly 1 track + 1 level + ≥1 outcome.** Reject otherwise. (`CM-01`)
8. **Every query is tenant-scoped by `organizationId`.** Never bypass the Prisma extension; raw SQL must carry an explicit `organizationId` predicate.
9. **A Manager reaches only their own team.** HR reads org-wide and writes nothing. (`AU-05`)
10. **Every recommendation item carries a reason code and `signalBreakdown`.** (`RC-05`)
11. **Missing outcome coverage is surfaced, never silently skipped.** (`RC-10`)
12. **No secrets in code.** All config via Zod-validated `env.ts`; boot fails loudly on a missing var.
13. **External I/O only through interfaces** — `integrations/`, `ai/`, `storage/`. No service imports the Azure, Graph or AI SDK directly.
14. **Slow or external work goes to a BullMQ job**, never inline in a request.
15. **Every state change writes an `AuditLog` row in the same transaction.**
16. **Errors are localized RFC 9457 `problem+json`.** Never leak Prisma/Graph internals to a client.
17. **Never hard-delete.** Deactivate, archive, version. Historical reports must survive. (`TM-05`, `CM-17`)
18. **Layer direction is one-way:** routes → controllers → services → repositories → Prisma. No upward imports.

---

## 3. ⚠ The AI service is another team's

- **We do not build AI inference here.** No LLM calls, no STT, no meeting bot. (See MEMORY **D-02**, ARCHITECTURE §9.11.)
- Code against the **`AiServiceClient`** interface. `FakeLlmService` is the default and must keep every flow demoable end-to-end.
- **Never block a task waiting for their endpoint.** If a task seems to need it, you are meant to build the stub side.
- **We own scoring, verdicts, outcome status and carry-over** — they only supply answers and judgements. (**D-03**)
- **Their payloads are untrusted input:** Zod-validated, service-token authenticated, rate-limited, exactly like a browser request.
- ⛔ **`AiServiceClient` is capped at three methods** — `dispatchSession`, `cancelSession`, `healthCheck`. **Never add `generateRecommendation()`, `evaluateAnswer()` or `generateReport()`** — each was rejected with reasoning in **D-18**. _They supply inference; we own judgement and record._ Anything that writes to a learner's permanent record stays in this codebase.

---

## 4. Workflow per task

1. **Pick the next unblocked task** from `BUILD_PLAN.md`, respecting phase order. Don't skip ahead.
2. Mark it `IN PROGRESS` in `PROGRESS_TRACKER.md`.
3. **Build it.** SOLID, clear separation of concerns, small focused modules. Match the surrounding code's style.
4. **Check unfamiliar library APIs against current docs** (`ctx7` CLI / `find-docs` skill) before writing — Express 5, Prisma 6, Zod, MSAL and Graph have all changed recently. Do not code library APIs from memory.
5. **Verify it actually runs.** Boot the server, hit the endpoint, check the DB. Do not report a task done on the strength of it compiling.
6. **Update `PROGRESS_TRACKER.md`** → `DONE` + note, **and tick the box in `BUILD_PLAN.md`**. Both, every time.
7. **Log any decision, deviation or surprise in `MEMORY.md`** — new decisions in the table with rationale, surprises under _Technical Discoveries_.
8. Only move to the next task once the current one is genuinely complete.

**At a phase boundary:** confirm the phase's **Exit criterion** is observably met before starting the next phase.

---

## 5. Conventions

- **Every new module follows the same anatomy** (ARCHITECTURE §4.1): `controllers/ services/ repositories/ dto/ validators/ <name>.routes.ts <name>.module.ts`. No exceptions, no ad-hoc layouts.
- **Layer direction:** controllers hold no business logic; services never see `req`/`res`; repositories are the only place Prisma appears.
- **Cross-module imports go through `<name>.module.ts`** — never deep-import another module's internals.
- **IDs:** CUID v2. **Dates:** ISO 8601 UTC. **Keys:** `camelCase`.
- **Collections** return `{ data, pageInfo }` — always, even when empty (`data: []`, never `null`).
- **Enums** go over the wire as raw values plus a localized `*Label` sibling where the UI needs display text.
- **Cursor pagination only.** No offset.
- **Config only via `src/config/`.** `process.env` appears nowhere else.
- **Every new endpoint** registers in the OpenAPI registry **under its module's tag** — the spec is the published contract for the frontend _and_ the AI team.
- **Every new user-facing string** gets both `en` and `ar` entries in `src/i18n/`.
- **Report/email templates:** design tokens only (no hardcoded hex), logical CSS properties only (`margin-inline-start`, never `left`/`right`), embedded fonts (no CDN), status never encoded by color alone (label + glyph), numbers isolated with `<bdi>` inside Arabic text. Report language follows the **recipient** — one session can produce two PDFs.
- **Tests come in Phase 11** by design — but never write code that is untestable to get there (pure functions for scoring, everything behind interfaces, no hidden globals).

---

## 6. When you're unsure

- **Requirement ambiguity** → check the BRD by requirement ID; if still unclear, ask rather than guess. Note the question in `MEMORY.md` _Open Questions_.
- **A locked decision looks wrong** → raise it with your reasoning. Do not quietly deviate.
- **The reference frontend contradicts the BRD** → BRD wins (**D-11**).
- **A task seems to need the AI service** → build the stub side (§3).
- **Never edit** `docs/Ai_trainer_BRD_v3.pdf` or anything in `C:\Users\Yousif M_Helal\Downloads\Trainer-Ai`. Both are read-only reference.
