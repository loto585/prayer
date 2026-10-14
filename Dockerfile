# syntax=docker/dockerfile:1

# 只在镜像内安装 Node/pnpm 和原生依赖；不会修改宿主机的 Node 或 node_modules。
FROM node:24-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}
WORKDIR /app

RUN corepack enable \
  && corepack prepare pnpm@11.17.0 --activate

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build

COPY . .
RUN pnpm build

FROM base AS runtime

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV DB_PATH=/app/data/agent.db
ENV CLAUDE_CONFIG_DIR=/app/data/claude-config

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/.claude-plugin ./.claude-plugin
COPY --from=build /app/plugins ./plugins

# Claude Agent SDK 将 native CLI 放在平台可选依赖中；PluginManager 还需要
# 通过 PATH 调用 `claude`，所以在镜像内创建一个稳定的入口。
RUN set -eux; \
  claude_bin="$$(find node_modules/.pnpm -type f -path '*/claude-agent-sdk-linux-*/claude' -print -quit)"; \
  test -n "$${claude_bin}"; \
  ln -s "/app/$${claude_bin#./}" /usr/local/bin/claude; \
  chmod +x "/app/$${claude_bin#./}"

RUN mkdir -p /app/data /app/logs /app/docs/kb

EXPOSE 3000
CMD ["pnpm", "start"]
