FROM oven/bun:1.2.4-slim AS build

WORKDIR /home/bun/app

COPY package.json bun.lockb ./

COPY patches patches

RUN bun install

COPY . .

RUN bun run build

FROM oven/bun:1.2.4-slim AS packaging

WORKDIR /home/bun/app

COPY package.json bun.lockb ./

COPY patches patches

RUN bun install --production

COPY .env .env

COPY --from=build /home/bun/app/server server
COPY --from=build /home/bun/app/dist dist

EXPOSE 3000 443

CMD ["bun", "run", "start"]
