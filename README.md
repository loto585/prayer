# Prayer

## 多渠道 AI 客服中台

> 把重复问答交给 AI，把复杂问题交给人工，把每一次服务沉淀成下一次更好的答案。

<p align="center">
  <img src="docs/assets/qiyuan-mark.png" alt="Prayer 品牌标志" width="92" />
  <br />
  <strong>Prayer</strong>
</p>

Prayer 面向需要在 QQ、Telegram 等社区场景持续提供产品咨询的团队。它不是一个只能“聊天”的机器人，而是一套围绕客服业务设计的运行系统：接入真实会话，基于知识库回答，必要时调用业务能力或转人工，并把服务过程持续沉淀为可复用的知识资产。

## 产品价值

<p align="center">
  <img src="docs/assets/qiyuan-value.svg" alt="Prayer 产品价值概览" width="100%" />
</p>

<p align="center">
  <a href="#核心能力">核心能力</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#管理后台">管理后台</a> ·
  <a href="#生产部署">生产部署</a>
</p>

## 为什么是 Prayer

传统客服机器人往往停留在“接收消息 → 生成回复”，上线后很快会遇到三个问题：回答缺乏依据、复杂问题没人接、知识无法随着业务变化更新。

Prayer 把这三个问题做成了产品闭环：

| 客服现场                   | Prayer 的处理方式                                 |
| -------------------------- | ------------------------------------------------- |
| 用户在群里提问             | 只在配置的生效会话中响应，支持 @ 触发与会话上下文 |
| 问题需要事实依据           | 自动检索知识库，将相关内容注入回答流程            |
| 需要查价格、状态或业务数据 | 通过插件、Skill 和 MCP 接入业务工具               |
| AI 无法可靠处理            | 转入人工队列，暂停该会话的自动回复                |
| 人工给出了新答案           | 自动提炼为反思条目，整理、去重并可升格为正式知识  |

### 核心能力

- **多渠道接入**：QQ（OneBot / NapCat）与 Telegram 共用一套客服编排、会话、知识和运营能力。
- **有依据的回答**：本地知识库、向量检索和预检索机制协同工作，减少“看起来合理但没有依据”的回答。
- **业务能力扩展**：通过插件、Skill 和 MCP 连接价格、公告、账户等业务工具，不把业务逻辑硬编码在客服主流程里。
- **人机协作**：支持转人工、人工队列、会话挂起与恢复，人工处理完成后可一键恢复自动答。
- **持续学习**：从已沉淀会话中提取 FAQ，自动合并近义内容、清理过时条目，并按需升格为正式知识。
- **谨慎主动补位**：在无人应答时主动识别未处理问题；只有检索到明确依据且足够有把握时才回复，优先避免刷屏和误答。
- **可运营、可审计**：运行状态、会话、人工队列、知识库、问题排行、用量、日志、插件和通道状态集中在管理后台。

### 品牌与业务分离

Prayer 是默认平台品牌，不预设部署方一定经营某个产品。品牌名称、简介和客服回复规则可在 `/admin/config` 的「品牌」页签中修改；主 Agent、意图分类、主动补位、问题归类与后台标题会使用同一份配置。产品事实来自部署方知识库，价格、状态、公告等实时能力由启用的业务插件提供。

「客服回复规则」适合填写称呼、语气、回复格式和自我介绍方式，例如“自我介绍时只称为某某公司官方客服机器人”。底层模型、SDK 和运行环境不会作为对外身份展示；修改身份或规则后，建议对已有会话执行一次 `/reset <sessionKey>`，让下一轮从新的上下文开始。

仓库中的 `packyapi` 是一个可选业务插件示例。启用它时可以查询 PackyAPI 的实时数据；停用或替换它不会改变 Prayer 的平台身份。

## 一次咨询如何被处理

<p align="center">
  <img src="docs/assets/qiyuan-response-flow.svg" alt="Prayer 一次咨询的处理流程" width="100%" />
</p>

Prayer 的关键不是让模型“尽量回答”，而是让每一次回答都经过依据判断：有依据就自动解决，需要业务数据就调用工具，不确定就安全转人工，最终把结果沉淀下来。

## 运行架构

<p align="center">
  <img src="docs/assets/qiyuan-architecture.svg" alt="Prayer 运行架构图" width="100%" />
</p>

### 客服闭环

实际运行时，Prayer 将每条消息纳入统一的会话编排：

1. **接入**：从 QQ 或 Telegram 收到消息，按生效会话白名单和触发规则筛选。
2. **理解**：恢复会话上下文，识别普通咨询、业务查询、重置或转人工意图。
3. **检索**：从知识库和反思条目中查找相关依据，必要时调用业务工具。
4. **响应**：发送简洁答复；无法可靠处理时进入人工队列，而不是编造答案。
5. **沉淀**：将人工解答和高频问题沉淀为可检索、可治理的知识资产。

## 管理后台

启动服务后访问 `/admin`。后台配置保存后会触发运行时重新装配，通道、定时任务和 Agent 会按新配置重新生效。

| 页面                  | 用途                                                 |
| --------------------- | ---------------------------------------------------- |
| `/admin`              | 运行状态、通道连接、会话数量、人工队列和今日业务结果 |
| `/admin/logs`         | 运行日志与异常排查                                   |
| `/admin/sessions`     | 历史会话、消息记录和会话重开                         |
| `/admin/handoff`      | 待处理人工会话，处理完成后恢复自动答                 |
| `/admin/proactive`    | 主动补位记录与结果                                   |
| `/admin/kb`           | 知识文档管理、编辑和向量摄入                         |
| `/admin/reflection`   | 反思条目、整理进度和知识升格                         |
| `/admin/ranking`      | 高频问题排行，帮助团队发现产品与文档缺口             |
| `/admin/config`       | QQ、Telegram、回复体验、会话、反思、通知和存储配置   |
| `/admin/qq-tools`     | 多群群发消息、@全体成员和批量发布群公告（可选置顶）  |
| `/admin/groups`       | 生效会话、活动量和会话级策略覆盖                     |
| `/admin/capabilities` | 当前 Agent 的插件、Skill、MCP 与工具能力             |
| `/admin/plugins`      | 插件安装、更新、启停和重载                           |

<p align="center">
  <img src="docs/assets/qiyuan-operations.svg" alt="Prayer 管理后台能力图" width="100%" />
</p>

建议在生产环境设置 `ADMIN_TOKEN`，为管理后台和 `/api` 开启口令保护。

## 技术底座

Prayer 以单个 Node.js 进程运行 Next.js 管理后台和客服 Agent。`instrumentation.ts` 在 Node runtime 启动时装配运行时，因此启动一个生产服务进程即可同时获得：

- QQ / Telegram 通道连接与消息分发
- Agent 会话编排、知识检索、工具调用与人工接管
- 反思、整理、知识升格、主动补位和问题排行等后台循环
- 管理后台 API 与实时状态
- SQLite 业务数据与 sqlite-vec 向量索引

核心技术栈：

- **Runtime**：Node.js 24、Next.js 16、React 19
- **Agent**：`@anthropic-ai/claude-agent-sdk`，模型通过 Anthropic-compatible provider 接入
- **知识与存储**：better-sqlite3、sqlite-vec、本地 embedding
- **管理界面**：shadcn/ui、Tailwind CSS
- **进程管理**：PM2 fork 单实例

## 快速开始

### 环境要求

- Node.js `24.16.0` 或兼容的 Node.js 24 版本
- pnpm `11`
- 能够运行 Claude Agent SDK 所需的本地 `claude` 可执行文件
- 至少配置一个消息通道：QQ 或 Telegram

#### 操作系统与 CPU 架构

项目中的 Node 原生依赖会按当前 Node 的架构重新安装。当前锁定的
`onnxruntime-node@1.23.2` 提供 macOS、Windows 和 Linux 的 x64/arm64
binding，因此 macOS Intel、Apple Silicon、Windows x64 以及 Linux 两种架构
均可直接安装运行。`sqlite-vec@0.1.9` 的上游包目前没有 Windows arm64 扩展；
Windows on ARM 请使用 x64 Node（Windows 的 x64 模拟层），或在 Linux/macOS
环境中运行向量检索功能。

Apple Silicon 推荐使用原生 arm64 Node 24。切换 Node 架构后请删除并重新安装
依赖，不要在 x64 与 arm64 Node 之间共用同一个 `node_modules`：

```bash
pnpm install --force --frozen-lockfile
pnpm rebuild onnxruntime-node better-sqlite3 sqlite-vec
```

数据库默认路径为 `./data/agent.db`。程序首次打开数据库时会自动创建 `data/`
父目录，无需手工创建。

### 1. 安装依赖

```bash
pnpm install --frozen-lockfile
cp .env.example .env
```

### 2. 配置模型服务

模型、Anthropic-compatible endpoint 和鉴权 token 不放在 `.env`，而是写入 `CLAUDE_CONFIG_DIR/settings.json`。默认路径为 `./data/claude-config/settings.json`，也可以通过 `CLAUDE_CONFIG_DIR` 指定其他目录。

示例：

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://your-anthropic-compatible-endpoint",
    "ANTHROPIC_AUTH_TOKEN": "replace-with-your-token",
    "ANTHROPIC_MODEL": "your-model-id"
  }
}
```

该文件包含明文凭证，已被 Git 忽略。不要提交到仓库，也不要把 token 写进 README、日志或截图。

### 3. 准备知识库

将 Markdown 等知识文档放入 `docs/kb/`，然后执行：

```bash
pnpm ingest
```

摄入过程会生成本地 embedding 并写入 sqlite-vec。`docs/kb/` 默认不纳入版本控制，生产环境建议使用受控目录、挂载卷或通过管理后台维护。

### 4. 构建并启动

```bash
pnpm build
pnpm start
```

访问 <http://localhost:3000/admin>，在配置页完成通道、生效会话和管理面设置。

> `pnpm dev` 只适合开发管理后台。生产客服 Agent 依赖真实 Node runtime 和本地 `claude` 可执行文件，生产环境必须使用 `pnpm build && pnpm start` 或 PM2。

## 通道配置

### QQ / OneBot

1. 在 NapCat 中开启“正向 WebSocket 服务器”。
2. 将监听地址填入 `ONEBOT_WS_URL`，默认示例为 `ws://127.0.0.1:3001`。
3. 如启用鉴权，填写 `ONEBOT_ACCESS_TOKEN`。
4. 配置机器人 QQ 号 `BOT_QQ`，并在 `/admin/config` 选择生效群。
5. 需要接收转人工通知时，配置 QQ 管理面；管理面只处理管理命令，不参与客服问答。
6. 在生效群中 @ 机器人发送测试问题。

管理群支持以下指令，前缀半角 `/` 与全角 `／` 均可；旗标紧跟指令名、全部英文：

| 指令                       | 作用                                                             |
| -------------------------- | ---------------------------------------------------------------- |
| `/reset <sessionKey>`      | 重置该会话的对话上下文                                           |
| `/resume <sessionKey>`     | 恢复该会话的自动答复                                             |
| `/群发 <内容>`             | 向全部生效 QQ 群发送消息；同条消息附带的图片一并发出，可只发图   |
| `/群发 -all <内容>`        | 同上，并 @全体成员（用 QQ 自带的「@全体成员」也会被识别为 -all） |
| `/公告 <内容>`             | 在全部生效 QQ 群发布群公告（不置顶）                             |
| `/公告 -pin <内容>`        | 发布群公告并置顶                                                 |
| `/写公告 <要点>`           | 按团队风格起草一条公告，回草稿到管理群（不发布）                 |
| `/发布 [-pin]`             | 发布最近一份草稿，10 分钟内有效；-pin 置顶                       |
| `/禁言 -on` / `/禁言 -off` | 全部生效 QQ 群开启 / 解除全员禁言                                |
| `/禁言 -on -t <时长>`      | 限时禁言，到期自动解除（`-t 30m`）                               |
| `-g <群号>`                | 群发／公告／发布／禁言只操作一个群；群号必须在生效会话里         |
| `-t <时长>`                | 群发／公告／发布上先限时禁言再发送；不带则不禁言                 |

`-t` 的时长写法为 `10s` / `30m` / `2h` / `1d`，取值范围 10 秒到 7 天，超出会回用法提示。到期状态会落库：进程重启后第一个扫描周期（30 秒）会自动补上欠下的解禁，不会把群卡在禁言状态。手动 `/禁言 -off`、或改用不带 `-t` 的永久禁言，都会撤销该群的待解禁记录。

旗标必须整词（`-all` 后接空格或换行），内容可以多行；指令名与内容之间的空格可省略。目标群取自「生效会话」里的 QQ 群，管理群自身始终排除。执行完成后管理群会收到逐群结果回执；同一条指令因重连被重放时不会二次执行。旧的 `!` 前缀不再是指令，发出去会收到用法提示。

`/写公告` 只起草、不发布：机器人把草稿连同 `/发布` 提示回到管理群，管理员看过之后回复 `/发布` 才真正发布；草稿 10 分钟内有效，过期或用过一次即失效。公告风格由 `plugins/announce/skills/announce/SKILL.md` 定义：那是 markdown，改格式、语气、范例不用改代码。风格文件在每次起草时现读，本地直接编辑即生效；Docker 部署下 `plugins/` 是随镜像构建的（`compose.yaml` 未挂载该目录），改完要重新构建镜像，仅重启容器不会更新。该风格文件按相对仓库根的路径解析，进程工作目录须是仓库根（与 `docs/kb` 同一约定）。

QQ 运营工具位于 `/admin/qq-tools`，与上述指令共用同一套发送逻辑。页面中选择多个群后，可以分别执行群发消息或发布群公告（勾选「置顶」才置顶，与 `/公告 -pin` 一致）；群发的「@全体成员」使用 OneBot 的 `at=all` 消息段。执行账号必须具备对应群的管理员权限。

群公告针对 NapCat 使用其 Go-CQHTTP 扩展动作 `_send_group_notice`（而不是标准动作 `send_group_notice`），群号和置顶标志会按 NapCat 的协议自动转换；`POST /api/qq/notice` 可传 `pinned: true` 置顶，缺省不置顶。

链接白名单在 `/admin/config` 的 QQ 通道设置中开启。匹配忽略顶级域：白名单填 `rightapi.ai` 时，`rightapi.com`、`rightapi.cn`、`rightapi.org` 等同名后缀一并放行，`www.` 前缀与子域名同样自动放行。裸域名（不带 `https://`，如 `360.com`）也算链接，会被一并检查，但 `index.js`、`1.5`、`a@b.com` 这类文件名、版本号与邮箱不会被误判。开启后，群成员发送的不在列表中的链接会先调用 OneBot `delete_msg` 撤回，并不会进入客服处理链路。机器人自身发送的消息不会被撤回。

### Telegram

1. 通过 BotFather 创建 Bot，并获取 `TELEGRAM_BOT_TOKEN`。
2. 将 Bot 加入目标群或超级群，在 `/admin/config` 中填写生效 chat id。
3. 如需反思和主动补位读取完整群消息，关闭 BotFather 的 Group Privacy Mode。
4. Telegram 使用 long polling，同一个 Bot token 只能由一个生产进程消费；不要运行多个副本。

Telegram chat id 必须按字符串保存，尤其是超级群的负数 id，不要在外部配置流程中转成 JavaScript `Number`。

## 配置分层

环境变量用于首次启动时提供种子值；保存后的业务配置持久化在 SQLite 中，并可在管理后台修改。模型凭证始终由 `settings.json` 管理。

常用环境变量：

| 变量                        | 作用                                                   |
| --------------------------- | ------------------------------------------------------ |
| `BRAND_NAME`                | 首次启动时的品牌名称，默认 `Prayer`                    |
| `BRAND_DESCRIPTION`         | 首次启动时的品牌/业务简介                              |
| `REPLY_RULES`               | 首次启动时的客服表达规则，可在后台继续编辑             |
| `CLAUDE_CONFIG_DIR`         | Agent SDK 配置目录，默认 `./data/claude-config`        |
| `DB_PATH`                   | SQLite 数据库路径，默认 `./data/agent.db`              |
| `ONEBOT_WS_URL`             | QQ / OneBot 正向 WebSocket 地址                        |
| `ONEBOT_ACCESS_TOKEN`       | OneBot 鉴权 token，可选                                |
| `BOT_QQ`                    | QQ 机器人账号                                          |
| `QQ_LINK_WHITELIST_ENABLED` | 首次启动时是否开启 QQ 链接白名单，默认关闭             |
| `QQ_LINK_WHITELIST`         | 首次启动时的允许域名列表，逗号或空格分隔               |
| `TELEGRAM_BOT_TOKEN`        | Telegram Bot token                                     |
| `TELEGRAM_ENABLED_CHATS`    | 首次启动时种子的 Telegram chat id 列表，逗号或空格分隔 |
| `ADMIN_GROUP_ID`            | 首次启动时种子的 QQ 管理面                             |
| `ADMIN_TOKEN`               | 管理后台和 API 的访问口令，可选但建议生产开启          |
| `HANDOFF_TIMEOUT_MIN`       | 转人工超时后恢复自动答的分钟数                         |
| `RESUME_TTL_MS`             | 会话续接空闲时间，设为 `0` 关闭过期                    |
| `KB_PREFETCH_ENABLED`       | 是否在每轮消息前自动预检索，默认开启                   |
| `PROACTIVE_ENABLED`         | 是否开启无人应答主动补位，默认关闭                     |
| `SUPPORT_URL`               | 无法处理业务时展示的支持链接                           |
| `MAX_REPLY_CHARS`           | 单条回复拆分上限，`0` 表示不拆分                       |
| `USAGE_BUDGET_USD`          | 日用量预算，`0` 表示不告警                             |

反思、整理、知识升格、主动补位和主题排行的完整参数见 [`.env.example`](.env.example)，也可以在 `/admin/config` 中调整。

## 生产部署

### PM2

项目已提供单实例 fork 配置 `ecosystem.config.cjs`：

```bash
pnpm pm:start     # 构建并启动
pnpm pm:status    # 查看状态
pnpm pm:logs      # 查看实时日志
pnpm pm:restart   # 停止、重新构建并启动
pnpm pm:stop      # 停止但保留进程配置
pnpm pm:delete    # 从 PM2 移除
```

<p align="center">
  <img src="docs/assets/qiyuan-deployment.svg" alt="Prayer 生产部署拓扑" width="100%" />
</p>

Linux 上可使用 systemd 配置开机自启：

```bash
pnpm pm:enable
pnpm pm:disable
```

### 宝塔面板一键部署

推荐在宝塔服务器上使用宿主机 PM2 运行 Prayer，再用 Docker 运行 NapCat。这样
Prayer 可以直接连接 `ws://127.0.0.1:3001`，数据库、模型配置和知识库也都在项目
目录中，便于宝塔计划任务和备份管理。

在宝塔软件商店安装 Node.js 24、Docker 管理器，并确认 Docker Compose v2 可用。
然后在「终端」执行：

```bash
cd /www/wwwroot/prayer
chmod +x deploy-baota.sh
./deploy-baota.sh
```

也可以在宝塔计划任务或 CI 中非交互执行（首次执行前请确认服务器已准备好
`data/claude-config/settings.json`，或同时提供下面的模型参数）：

```bash
BOT_QQ=123456 \
NAPCAT_ACCOUNT=123456 \
ADMIN_GROUP_ID=654321 \
DEPLOY_BASE_URL=https://your-anthropic-compatible-endpoint \
DEPLOY_AUTH_TOKEN='your-token' \
DEPLOY_MODEL=your-model-id \
./deploy-baota.sh
```

将 `deploy-baota.sh` 放到公开 Git 仓库后，也可以在宝塔终端先下载再执行；不要把
包含真实 token 的命令保存到公开脚本或工单记录中：

```bash
curl -fsSL https://raw.githubusercontent.com/你的账号/prayer/main/deploy-baota.sh -o deploy-baota.sh
chmod +x deploy-baota.sh
./deploy-baota.sh
```

脚本会自动完成以下步骤：

- 读取或创建 `.env`，交互式填写机器人 QQ、管理群、模型接口、模型 token 和模型名；
- 自动生成 `ADMIN_TOKEN`，已有 `data/claude-config/settings.json` 和数据库不会覆盖；
- 安装锁定版本依赖、摄入 `docs/kb/`、构建生产版本；
- 启动主 NapCat 容器；
- 启动或重启唯一的 PM2 进程 `prayer`，并保存 PM2 进程列表。

如果服务器通过宝塔 Node.js 版本管理器安装 Node，脚本会自动查找
`/www/server/nodejs/*/bin/node`。也可以在执行前手动选择 Node 版本并确保 `node`、
`docker`、`docker compose` 在 PATH 中。

脚本完成后，在宝塔「网站」中新建站点，将反向代理目标设为：

```text
http://127.0.0.1:3000
```

然后在宝塔申请并开启 HTTPS。不要把 3000、3001 或 6099 直接暴露到公网；NapCat
面板只在本机监听，首次登录可用 SSH 隧道访问：

```bash
ssh -N -L 6099:127.0.0.1:6099 root@服务器IP
```

浏览器打开 `http://127.0.0.1:6099/webui`，扫码登录 NapCat，并在 WebUI 开启
「正向 WebSocket 服务器」，监听 `0.0.0.0:3001`。如果启用了 OneBot token，需让
NapCat 的 token 与 `.env` 中的 `ONEBOT_ACCESS_TOKEN` 完全一致；未启用鉴权则两边都留空。

登录管理后台时使用脚本输出的 `ADMIN_TOKEN`。部署后常用检查命令：

```bash
cd /www/wwwroot/prayer
pnpm exec pm2 status prayer
pnpm exec pm2 logs prayer
docker compose -f compose.napcat.yaml ps
pnpm db:check
```

更新代码时重新执行 `./deploy-baota.sh` 即可；脚本会保留已有数据库、模型配置和
`.env`。更新前建议在宝塔计划任务中执行 `pnpm db:backup`，并备份 `data/` 与
`docs/kb/`。

### Docker（隔离项目运行环境）

仓库提供了 [Dockerfile](Dockerfile) 和 [compose.yaml](compose.yaml)。Docker 会在
容器内单独安装 Node 24、pnpm 和原生依赖，不会改动宿主机 Node、pnpm 或其他项目
的 `node_modules`。首次使用前准备配置文件：

```bash
cp .env.example .env
mkdir -p data/claude-config
# 编辑 data/claude-config/settings.json，填入模型服务地址、token 和模型名
docker compose up -d --build
```

`data/` 和 `docs/kb/` 使用项目目录挂载，数据库、Claude 配置和知识库会保留在
宿主机；程序仍会在首次打开 SQLite 时自动创建 `data/`。查看或停止服务：

```bash
docker compose logs -f prayer
docker compose down
```

默认按 Docker 当前主机架构构建。Apple Silicon 使用 Linux arm64，Intel Mac、
Windows x64 使用 Linux amd64。需要显式构建某个架构时使用 Buildx：

```bash
docker buildx build --platform linux/arm64 -t prayer:local --load .
docker buildx build --platform linux/amd64 -t prayer:local --load .
```

也可以在 Compose 构建时指定目标架构：

```bash
DOCKER_DEFAULT_PLATFORM=linux/arm64 docker compose up -d --build
DOCKER_DEFAULT_PLATFORM=linux/amd64 docker compose up -d --build
```

Windows ARM64 建议构建 Linux arm64 镜像，以避开 Windows ARM64 上游没有
`sqlite-vec` 原生扩展的问题。容器访问宿主机上的 NapCat/OneBot 时，将
`.env` 中的地址改为：

```env
ONEBOT_WS_URL=ws://host.docker.internal:3001
```

### 部署边界

- 必须使用标准 Node.js server runtime，不支持 Vercel、Edge Function 或其他 serverless 运行方式。
- PM2 必须保持 `instances: 1` 和 `fork` 模式：better-sqlite3 是 native 依赖，通道包含长连接 / long polling。
- Telegram 同一 Bot token 不支持多实例消费。
- 发布前应备份 SQLite 数据库；可使用 `pnpm db:check` 和 `pnpm db:backup`。
- 外部访问管理后台时，建议同时配置 `ADMIN_TOKEN`、HTTPS、反向代理访问控制和最小化开放端口。

## 开发与验证

```bash
pnpm dev          # 开发管理后台
pnpm typecheck    # TypeScript 检查
pnpm lint         # ESLint
pnpm test         # Vitest
pnpm check        # typecheck + lint + test
```

涉及页面、路由或生产边界时，使用独立构建目录，避免覆盖正在运行的 `.next`：

```bash
NEXT_DIST_DIR=.next-verify pnpm build
```

更完整的模块边界、测试约定、数据库迁移与备份流程见：

- [开发与代码质量](docs/development.md)
- [数据访问层](docs/data-access.md)
- [数据库迁移与备份](docs/database-operations.md)

## 项目结构

```text
app/                    管理后台页面与 API 路由
components/             管理后台与通用 UI 组件
lib/agent/              Agent、会话编排、人工接管与后台循环
lib/channels/           QQ / Telegram 通道抽象与适配器
lib/db/                 SQLite 数据访问、迁移与领域仓储
lib/plugins/            插件生命周期管理
plugins/                本地插件、Skill 与 MCP server
scripts/                知识库摄入、数据库维护脚本
docs/kb/                业务知识源文件（默认不入 Git）
docs/assets/            README 与产品文档视觉素材
data/                   运行时数据库与 SDK 配置（默认不入 Git）
logs/                   PM2 与运行日志（默认不入 Git）
```

## 当前边界

Prayer 的设计目标是可控、可解释、可运营的社区客服，不是无限制的通用聊天机器人。生产上线前请至少完成：知识库审核、人工接管演练、通道权限检查、数据库备份恢复演练、管理后台鉴权和用量预算设置。

当前正式支持 QQ / OneBot 和 Telegram；Discord 仅预留通道类型，尚未提供生产适配器。
