# Minimal multi-stage build — good enough for `docker compose up` to work.
# Full production hardening (distroless, multi-arch, layer caching tuning,
# non-root filesystem lockdown beyond USER) is P12's job.

FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY src ./src

RUN npx prisma generate
RUN npm run build


FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -S app && adduser -S app -G app

COPY package.json package-lock.json ./

# The build stage's node_modules already has the Prisma client generated
# into it (`prisma generate` writes into node_modules/@prisma/client and
# node_modules/.prisma) — reusing it wholesale, dev deps included, is
# simpler and safer for P0 than re-running `npm ci --omit=dev` and trying
# to reproduce `prisma generate` output selectively. Trimming dev deps from
# the shipped image is P12 hardening.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

USER app

EXPOSE 3000

CMD ["node", "dist/index.js"]
