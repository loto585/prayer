#!/usr/bin/env bash

# 宝塔 Linux 一键部署：宿主机 PM2 运行 Prayer，Docker 运行 NapCat。
# 需要在项目根目录执行；脚本可重复运行，不会覆盖已有 settings.json 或数据库。

set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"
umask 077

say() {
  printf '\033[1;36m[Prayer]\033[0m %s\n' "$*"
}

die() {
  printf '\033[1;31m[Prayer] 错误：%s\033[0m\n' "$*" >&2
  exit 1
}

has() {
  command -v "$1" >/dev/null 2>&1
}

require() {
  has "$1" || die "缺少命令：$1。请先在宝塔软件商店安装对应软件。"
}

prompt_value() {
  local var="$1"
  local label="$2"
  local default="${3:-}"
  local current="${!var:-}"
  [[ -n "$current" ]] && return
  [[ -t 0 ]] || die "缺少 $var；非交互执行时请先 export $var=..."
  if [[ -n "$default" ]]; then
    read -r -p "$label [$default]: " current
    current="${current:-$default}"
  else
    read -r -p "$label: " current
  fi
  [[ -n "$current" ]] || die "$var 不能为空"
  printf -v "$var" '%s' "$current"
  export "$var"
}

prompt_secret() {
  local var="$1"
  local label="$2"
  local current="${!var:-}"
  [[ -n "$current" ]] && return
  [[ -t 0 ]] || die "缺少 $var；非交互执行时请先 export $var=..."
  read -r -s -p "$label: " current
  printf '\n'
  [[ -n "$current" ]] || die "$var 不能为空"
  printf -v "$var" '%s' "$current"
  export "$var"
}

generate_token() {
  if has openssl; then
    openssl rand -hex 24
  else
    node -e 'console.log(require("node:crypto").randomBytes(24).toString("hex"))'
  fi
}

upsert_env() {
  local key="$1"
  local value="$2"
  local tmp="${ENV_FILE}.tmp.$$"
  awk -v key="$key" -v value="$value" '
    BEGIN { found = 0 }
    $0 ~ "^[[:space:]]*#?[[:space:]]*" key "=" {
      print key "=" value
      found = 1
      next
    }
    { print }
    END { if (!found) print key "=" value }
  ' "$ENV_FILE" > "$tmp"
  mv "$tmp" "$ENV_FILE"
}

read_env_value() {
  local key="$1"
  local value
  value="$(awk -v key="$key" '
    $0 ~ "^[[:space:]]*" key "[[:space:]]*=" {
      sub("^[[:space:]]*" key "[[:space:]]*=", "")
      print
      exit
    }
  ' "$ENV_FILE")"
  if [[ "$value" == \"*\" && "$value" == *\" ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
    value="${value:1:${#value}-2}"
  fi
  printf '%s' "$value"
}

load_env_var() {
  local var="$1"
  local value="${!var:-}"
  if [[ -z "$value" ]]; then
    value="$(read_env_value "$var")"
    [[ -n "$value" ]] && printf -v "$var" '%s' "$value"
  fi
  export "$var"
}

validate_number() {
  local name="$1"
  local value="$2"
  [[ "$value" =~ ^[0-9]+$ ]] || die "$name 必须是纯数字"
}

say "检查运行环境"
if ! has node && [[ -d /www/server/nodejs ]]; then
  while IFS= read -r candidate; do
    if [[ -x "$candidate/bin/node" ]]; then
      export PATH="$candidate/bin:$PATH"
      break
    fi
  done < <(find /www/server/nodejs -mindepth 1 -maxdepth 1 -type d | sort -V -r)
fi
require node
require docker
docker compose version >/dev/null 2>&1 || die "当前 Docker 未启用 Compose v2"

node_major="$(node -p 'Number(process.versions.node.split(".")[0])')"
(( node_major >= 20 )) || die "Node.js 版本过低：需要 Node.js 20 或更高版本，推荐宝塔 Node.js 24"

if has pnpm; then
  PNPM=(pnpm)
else
  require corepack
  corepack enable >/dev/null 2>&1 || true
  PNPM=(corepack pnpm)
fi

if [[ ! -f package.json || ! -f pnpm-lock.yaml ]]; then
  die "当前目录不是 Prayer 项目根目录"
fi

ENV_FILE="$ROOT_DIR/.env"
SETTINGS_FILE="$ROOT_DIR/data/claude-config/settings.json"
mkdir -p "$ROOT_DIR/data/claude-config" "$ROOT_DIR/docs/kb" "$ROOT_DIR/logs"

if [[ ! -f "$ENV_FILE" ]]; then
  cp .env.example "$ENV_FILE"
  say "已创建 .env"
fi

# 读取已有 .env，让脚本重复执行时只询问缺失项。
# 不直接 source：dotenv 文件允许未加引号的空格和中文，不能当 shell 脚本执行。
for env_key in BOT_QQ NAPCAT_ACCOUNT ADMIN_GROUP_ID ONEBOT_ACCESS_TOKEN ADMIN_TOKEN; do
  load_env_var "$env_key"
done

say "收集首次部署配置（已有值会自动保留）"
# .env.example 中的示例数字不能被当成真实部署配置。
[[ "${BOT_QQ:-}" == "10000" ]] && unset BOT_QQ
[[ "${ADMIN_GROUP_ID:-}" == "20000" ]] && unset ADMIN_GROUP_ID
prompt_value BOT_QQ "机器人 QQ 号"
prompt_value NAPCAT_ACCOUNT "NapCat 登录 QQ 号" "$BOT_QQ"
prompt_value ADMIN_GROUP_ID "管理群 QQ 群号"

if [[ ! -s "$SETTINGS_FILE" ]]; then
  prompt_value DEPLOY_BASE_URL "Anthropic 兼容接口地址"
  prompt_secret DEPLOY_AUTH_TOKEN "模型服务 token"
  prompt_value DEPLOY_MODEL "模型名称"
fi

validate_number BOT_QQ "$BOT_QQ"
validate_number NAPCAT_ACCOUNT "$NAPCAT_ACCOUNT"
validate_number ADMIN_GROUP_ID "$ADMIN_GROUP_ID"

ADMIN_TOKEN="${ADMIN_TOKEN:-}"
if [[ -z "$ADMIN_TOKEN" ]]; then
  ADMIN_TOKEN="$(generate_token)"
  say "已自动生成 ADMIN_TOKEN（部署完成后请保存它）"
fi

upsert_env "NODE_ENV" "production"
upsert_env "PRAYER_PORT" "3000"
upsert_env "ONEBOT_WS_URL" "ws://127.0.0.1:3001"
upsert_env "ONEBOT_ACCESS_TOKEN" "${ONEBOT_ACCESS_TOKEN:-}"
upsert_env "BOT_QQ" "$BOT_QQ"
upsert_env "ADMIN_GROUP_ID" "$ADMIN_GROUP_ID"
upsert_env "ADMIN_TOKEN" "$ADMIN_TOKEN"
upsert_env "GROUP_REQUEST_ENABLED" "true"
upsert_env "GROUP_REQUEST_REQUIRE_ORDER" "true"
upsert_env "GROUP_REQUEST_AUTO_APPROVE" "true"
upsert_env "DB_PATH" "./data/agent.db"
upsert_env "CLAUDE_CONFIG_DIR" "./data/claude-config"
upsert_env "NAPCAT_ACCOUNT" "$NAPCAT_ACCOUNT"
chmod 600 "$ENV_FILE"

if [[ ! -s "$SETTINGS_FILE" ]]; then
  DEPLOY_SETTINGS_FILE="$SETTINGS_FILE" \
    DEPLOY_BASE_URL="$DEPLOY_BASE_URL" \
    DEPLOY_AUTH_TOKEN="$DEPLOY_AUTH_TOKEN" \
    DEPLOY_MODEL="$DEPLOY_MODEL" \
    node <<'NODE'
const fs = require("node:fs")
const path = require("node:path")
const file = process.env.DEPLOY_SETTINGS_FILE
const payload = {
  env: {
    ANTHROPIC_BASE_URL: process.env.DEPLOY_BASE_URL,
    ANTHROPIC_AUTH_TOKEN: process.env.DEPLOY_AUTH_TOKEN,
    ANTHROPIC_MODEL: process.env.DEPLOY_MODEL,
  },
}
fs.mkdirSync(path.dirname(file), { recursive: true })
fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 })
NODE
  chmod 600 "$SETTINGS_FILE"
  say "已创建 data/claude-config/settings.json"
else
  say "保留已有 data/claude-config/settings.json"
fi

say "安装锁定依赖"
"${PNPM[@]}" install --frozen-lockfile

say "摄入 docs/kb/ 知识库"
"${PNPM[@]}" ingest

say "构建生产版本"
"${PNPM[@]}" build

say "启动 NapCat"
docker compose -f compose.napcat.yaml up -d

say "启动或重启 Prayer PM2 实例"
if "${PNPM[@]}" exec pm2 describe prayer >/dev/null 2>&1; then
  "${PNPM[@]}" exec pm2 restart prayer --update-env
else
  "${PNPM[@]}" exec pm2 start ecosystem.config.cjs --update-env
fi
"${PNPM[@]}" exec pm2 save

say "部署完成"
printf '\n访问地址：  http://服务器IP:3000\n'
printf '管理口令：  %s\n' "$ADMIN_TOKEN"
printf 'NapCat 面板：127.0.0.1:6099/webui（建议用 SSH 隧道访问）\n'
printf '\n下一步：\n'
printf '  1. 扫码登录 NapCat，并在 WebUI 开启正向 WebSocket（端口 3001）。\n'
printf '  2. 打开 /admin/config，选择 QQ 生效群和管理面。\n'
printf '  3. 宝塔网站反向代理到 127.0.0.1:3000，并为站点配置 HTTPS。\n'
printf '  4. 查看状态：%s exec pm2 status prayer\n' "${PNPM[*]}"
