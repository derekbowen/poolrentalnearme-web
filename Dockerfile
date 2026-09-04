# Canonical Bun version for this repository: 1.3.11.
# It is pinned identically here, in .github/workflows/*, and by the lockfile
# format. See docs/BUN_AND_LOCKFILE.md — there is one source of truth.
FROM oven/bun:1.3.11-slim AS build

WORKDIR /home/bun/app

COPY package.json bun.lock ./

COPY patches patches

# --frozen-lockfile: the build fails if the lockfile does not exactly satisfy
# package.json. Resolution happens when a human changes dependencies, never
# during a deployment.
RUN bun install --frozen-lockfile

COPY . .

# Build-time public configuration ONLY.
#
# Vite populates import.meta.env.VITE_* exclusively from .env FILES — see
# vite.config.mjs, which calls loadEnv() but never define()s these values, so
# process.env and --build-arg do NOT reach the client bundle. That is precisely
# how release c158 lost `Secure` from every session cookie: no .env file at
# build time meant VITE_SHARETRIBE_USING_SSL compiled to undefined.
#
# So the build stage still needs a .env file — but only the VITE_-prefixed
# public half, which is compiled into the browser bundle and therefore public by
# definition. scripts/deploy.sh writes .env.build as `grep ^VITE_ .env`.
# Secrets never enter this stage, and this stage's layers are not part of the
# published image regardless.
COPY .env.build .env

RUN bun run build

FROM oven/bun:1.3.11-slim AS packaging

WORKDIR /home/bun/app

COPY package.json bun.lock ./

COPY patches patches

RUN bun install --production --frozen-lockfile

# No .env here, deliberately. Runtime secrets are injected when the container
# starts (docker run --env-file), never baked into a layer. `bun run start`
# auto-loads a .env from the working directory if one exists, which is exactly
# the accident this removal ends: the image used to carry every production
# credential to anyone with ECR pull access.
#
# Cookie security no longer depends on this file existing — see
# server/api-util/secureCookies.js.

COPY --from=build /home/bun/app/server server
COPY --from=build /home/bun/app/dist dist

EXPOSE 3000 443

CMD ["bun", "run", "start"]
