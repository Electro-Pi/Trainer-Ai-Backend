# Multi-stage build (P12-5 hardening over P0's minimal version):
#   deps     — full node_modules (dev + prod) for building and for the
#              migration stage, which needs `tsx` to load `prisma.config.ts`.
#   build    — compiles TypeScript + generates the Prisma client.
#   migrate  — a small image whose only job is `prisma migrate deploy`; the
#              dedicated `migrate` compose service runs this and exits 0/1,
#              so `api`/`worker` only start once migrations are applied
#              (`depends_on: condition: service_completed_successfully`).
#   runtime  — production dependencies only + compiled `dist/`, no dev deps,
#              no TypeScript source, non-root user.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# `--ignore-scripts` skips `prepare` (husky — git hooks, meaningless with no
# `.git` in the image and no `husky` binary in a prod-only install anyway).
RUN npm ci --ignore-scripts


FROM deps AS build
WORKDIR /app
# `prisma.config.ts` calls `env('DATABASE_URL')`, which throws at *config
# load* time (before `prisma generate` ever touches a real connection) if
# the var is unresolved — a placeholder is enough since `generate` only
# introspects the schema file, never connects to a database.
ARG DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
ENV DATABASE_URL=${DATABASE_URL}
COPY tsconfig.json tsconfig.build.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY src ./src

RUN npx prisma generate
RUN npm run build


FROM deps AS migrate
WORKDIR /app
ENV NODE_ENV=production
ARG DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
ENV DATABASE_URL=${DATABASE_URL}
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate
CMD ["npx", "prisma", "migrate", "deploy"]


FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -S app && adduser -S app -G app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# The build stage's node_modules already has the Prisma client generated
# into it (`prisma generate` writes into node_modules/@prisma/client and
# node_modules/.prisma) — the prod-only install above doesn't run
# `prisma generate` itself, so the generated client is copied over that
# install rather than regenerated, keeping this stage free of `prisma`/`tsx`.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

# `STORAGE_PROVIDER=local` (dev/compose default) writes under `.storage` —
# `WORKDIR /app` itself is root-owned, so the non-root `app` user needs this
# created and chowned ahead of time or every upload/check fails with EACCES.
RUN mkdir -p .storage && chown -R app:app .storage

USER app

EXPOSE 3000

CMD ["node", "dist/index.js"]
