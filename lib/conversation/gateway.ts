import { bus, emitErrorSafely } from "../core/bus"
import { resolveBrand, identityLine, type BrandInput } from "../core/brand"
import type { Repo } from "../core/db/repo"
import type { ImageInput, IncomingMessage } from "../core/chat/events"
import type { ChannelId } from "../core/chat/types"
import { makeDedupeKey, makeSessionKey } from "../core/chat/ids"
import {
  isAdminSurface,
  isChatEnabled,
  type ChatRef,
} from "../core/chat/enabled-chats"
import {
  RESET_KEYWORDS,
  HANDOFF_KEYWORDS,
  HELP_KEYWORDS,
} from "./command-keywords"
import {
  PRIOR_USER_CONTEXT_LIMIT,
  PRIOR_CONTEXT_MAX_CHARS,
  PRIOR_LINE_MAX_CHARS,
  formatPriorContext,
  clipPriorTexts,
} from "./prior-context"
import {
  parseAdminCommand,
  formatDuration,
  BROADCAST_USAGE,
  NOTICE_USAGE,
  DRAFT_USAGE,
  PUBLISH_USAGE,
  MUTE_USAGE,
  type AdminCommand,
} from "./admin-commands"
import type { AnnouncementWriter } from "./announcement-writer"
import { cancelUnban, scheduleUnban } from "./whole-ban"
import {
  broadcastMessage,
  publishNotice,
  setWholeBan,
  qqBroadcastTargets,
  formatOpSummary,
  type GroupOpSummary,
  type QqOps,
} from "../channels/qq/ops"
import { logger } from "../core/logger"
import { errorMessage } from "../core/log-context"

export interface GatewayDeps {
  repo: Repo
  botQQ: number
  /** 额外监听的 QQ:atList 命中其中任一时也当 @bot */
  extraAtQQs?: number[]
  /** 统一生效会话（chat-ref）；由 assemble 从 config 解析后注入 */
  enabledChats: ChatRef[]
  /**
   * 管理命令面 + 转人工通知目标。
   * null = 无管理侧（人工关键词改引导官网）。
   */
  adminSurface: ChatRef | null
  /** 固定支持链接,办不了/人工时附带 */
  supportUrl?: string
  brand?: BrandInput
  qqOps?: () => QqOps | null
  draftAnnouncement?: AnnouncementWriter
  now?: () => number
}

export const DRAFT_TTL_MS = 10 * 60_000

function helpText(supportUrl?: string): string {
  const link = supportUrl ? `\n官网：${supportUrl}` : ""
  return `用法：@我提问；重置：@我 后发「重置」；人工：@我 后发「人工」（单独发「人工」无效）。${link}`
}

function adminHelpText(): string {
  return [
    "本群仅处理管理命令(旗标紧跟指令名):",
    "`/reset <sessionKey>` 重置该会话上下文",
    "`/resume <sessionKey>` 恢复自动答",
    "`/群发 [-all] [-t <时长>] <内容>` 发到全部生效 QQ 群,可附图;-all 同时 @全体成员",
    "`/公告 [-pin] [-t <时长>] <内容>` 发布群公告;-pin 置顶",
    "`/写公告 <要点>` 让机器人按团队风格起草公告",
    "`/发布 [-pin] [-t <时长>]` 发布最近一份草稿",
    "`/禁言 -on|-off [-t <时长>]` 全员禁言/解除",
    "群发/公告/发布/禁言可加 -t <时长>(如 -t 10m)先限时禁言,到期自动解除",
    "以上四条指令可加 -g <群号> 只操作一个群,缺省全部生效群",
    "客服问答请在生效会话内进行。",
    "兼容指令:`!reset <sessionKey>` / `!resume <sessionKey>`。",
  ].join("\n")
}

/**
 * 剥掉开头的 @提及（可多个），返回剩余正文。
 * QQ 富文本里 @ 常以 `@名字 ` / `@12345 ` 形式拼在正文前，不剥掉会让所有
 * 以 ^ 锚定的意图匹配全部失效（实测 “@Eric 介绍一下自己” 整条漏过）。
 */
function stripLeadingMentions(text: string): string {
  return text.replace(/^\s*(?:@\S+\s*)+/, "")
}

/**
 * 身份类问题不交给底层模型自由发挥，避免模型把运行时身份当成业务客服身份。
 * 只匹配明确的自我介绍/身份追问，不拦截普通产品咨询。
 */
export function isIdentityQuestion(text: string): boolean {
  const normalized = stripLeadingMentions(text)
    .trim()
    .toLowerCase()
    .replace(/[\s，。！？、,.!?：:]+/g, "")
  if (!normalized) return false
  // 上限防误伤：长文里偶然出现这些词不算身份追问（本类问句极短）
  if (normalized.length > 40) return false
  // 整句匹配身份问法（标点/空白/@ 已剥），只容忍句尾语气词。
  // 用整句而非「包含」：否则 “你能做什么价格查询” 这类真实咨询会被误拦。
  if (
    /^(你是谁|你叫什么(名字)?|介绍一下你?自己|自我介绍(一下)?|介绍下你?自己|你是(做什么|干什么|干嘛)的|你能做什么|你的身份(是什么)?|你是什么(模型|ai|助手|东西|机器人|平台)|你是哪个(模型|ai|助手|平台)|你是(机器人|客服)吗)(呢|吗|啊|呀|吧|哦|的)?$/.test(
      normalized
    )
  ) {
    return true
  }
  // 质疑式追问：用户已经看到过错误身份，来问“为什么你自称 X 不是客服”
  return (
    /为什么.*(自称|说自己是|不是).*?(codex|claude|chatgpt|gpt|编程助手|ai|助手)/.test(
      normalized
    ) && /客服|身份/.test(normalized)
  )
}

export function identityReply(brandInput?: BrandInput): string {
  const brand = resolveBrand(brandInput)
  return `${identityLine(brand)}我主要为大家提供产品咨询、使用指导和问题排查；如果问题需要人工处理，请 @我 后发送「人工」。`
}

/** atList 是否命中 bot 或任一额外监听 QQ(字符串 id) */
export function isAtTrigger(
  atList: string[],
  botQQ: string,
  extraAtQQs: string[] = []
): boolean {
  if (atList.includes(botQQ)) return true
  for (const qq of extraAtQQs) {
    if (Number(qq) > 0 && atList.includes(qq)) return true
  }
  return false
}

function sendText(
  channel: ChannelId,
  chatId: string,
  text: string,
  replyToId?: string
): void {
  bus.emit("action.send", { channel, chatId, text, replyToId })
}

export function registerGateway(deps: GatewayDeps): () => void {
  const { repo, botQQ, supportUrl, enabledChats, adminSurface } = deps
  const extraAtQQs = (deps.extraAtQQs ?? []).map(String)
  const botQQStr = String(botQQ)
  const enabledCfg = { enabledChats }
  const now = deps.now ?? (() => Date.now())
  let pendingDraft: { content: string; createdAt: number } | null = null

  const runDraft = async (brief: string, admin: ChatRef, replyToId: string) => {
    const reply = (text: string) =>
      sendText(admin.channel, admin.chatId, text, replyToId)
    if (!deps.draftAnnouncement) {
      reply("起草功能未启用。")
      return
    }
    reply("起草中,稍等。")
    try {
      const content = await deps.draftAnnouncement(brief)
      pendingDraft = { content, createdAt: now() }
      reply(
        `${content}\n\n——确认发布回复 /发布(置顶:/发布 -pin),${DRAFT_TTL_MS / 60_000} 分钟内有效;要改就直接 /公告 <内容>。`
      )
    } catch (err) {
      bus.emit("error.occurred", {
        scope: "gateway.announce",
        err,
        channel: admin.channel,
        chatId: admin.chatId,
        userVisible: false,
      })
      reply(`起草失败:${errorMessage(err)}`)
    }
  }

  const runGroupOp = async (
    cmd: Extract<AdminCommand, { kind: "broadcast" | "notice" | "mute" }>,
    admin: ChatRef,
    replyToId: string,
    images: ImageInput[] = []
  ) => {
    const label =
      cmd.kind === "broadcast"
        ? images.length
          ? `群发(含 ${images.length} 张图)`
          : "群发"
        : cmd.kind === "notice"
          ? "公告"
          : cmd.enable
            ? "禁言"
            : "解禁"
    const reply = (text: string) =>
      sendText(admin.channel, admin.chatId, text, replyToId)
    const ops = deps.qqOps?.() ?? null
    if (!ops) {
      reply(`${label}未执行:QQ 通道未连接。`)
      return
    }
    const all = qqBroadcastTargets(enabledChats, admin)
    let targets = all
    if (cmd.groupId !== undefined) {
      if (!all.includes(cmd.groupId)) {
        reply(`${label}未执行:群 ${cmd.groupId} 不在生效会话里。`)
        return
      }
      targets = [cmd.groupId]
    }
    if (!targets.length) {
      reply(`${label}未执行:没有可操作的生效 QQ 群。`)
      return
    }
    const banMs =
      cmd.kind === "mute" ? (cmd.enable ? cmd.muteMs : undefined) : cmd.muteMs
    try {
      let banSummary: GroupOpSummary | undefined
      if (banMs !== undefined) {
        banSummary = await setWholeBan(ops, targets, true)
        scheduleUnban(
          repo,
          banSummary.results.filter((r) => r.ok).map((r) => r.groupId),
          now() + banMs
        )
      } else if (cmd.kind === "mute") {
        cancelUnban(repo, targets)
      }
      const summary =
        cmd.kind === "broadcast"
          ? await broadcastMessage(
              ops,
              targets,
              cmd.text,
              cmd.mentionAll,
              images
            )
          : cmd.kind === "notice"
            ? await publishNotice(ops, targets, cmd.content, cmd.pinned)
            : (banSummary ?? (await setWholeBan(ops, targets, cmd.enable)))
      logger.info(
        `[gateway] 管理面${label}:成功 ${summary.succeeded}/${summary.results.length}`,
        {
          scope: "gateway.admin-op",
          channel: admin.channel,
          chatId: admin.chatId,
        }
      )
      const parts = [formatOpSummary(label, summary)]
      if (banSummary && cmd.kind !== "mute" && banMs !== undefined) {
        parts.push(
          `${formatOpSummary("禁言", banSummary)}(到期 ${formatDuration(banMs)} 后自动解除)`
        )
      }
      reply(parts.join("\n"))
    } catch (err) {
      bus.emit("error.occurred", {
        scope: "gateway.admin-op",
        err,
        channel: admin.channel,
        chatId: admin.chatId,
        userVisible: false,
      })
      reply(`${label}失败:${errorMessage(err)}`)
    }
  }

  const onReceived = (msg: IncomingMessage) => {
    const { channel, chatId, userId, messageId } = msg
    const onAdmin = isAdminSurface(adminSurface, channel, chatId)

    // 管理面只负责管理:仅吃管理指令,绝不进客服流程
    // （不建 session、不答话、不转人工、不吃「重置/人工/帮助」关键词）
    if (onAdmin && adminSurface) {
      const legacyReset = /^!reset\s+(\S+)/.exec(msg.rawText.trim())
      const legacyResume = /^!resume\s+(\S+)/.exec(msg.rawText.trim())
      if (legacyReset) {
        repo.clearResumeId(legacyReset[1]!)
        sendText(
          channel,
          chatId,
          `已重置会话 ${legacyReset[1]} 的对话上下文。`,
          messageId
        )
        return
      }
      if (legacyResume) {
        bus.emit("handoff.resumed", {
          sessionKey: legacyResume[1]!,
          by: "admin",
        })
        return
      }
      const cmd = parseAdminCommand(msg.rawText, {
        atAll: msg.atAll,
        hasImages: !!msg.images?.length,
      })
      if (!cmd) return
      const dedupeKey = makeDedupeKey(channel, chatId, messageId)
      switch (cmd.kind) {
        case "reset":
          repo.clearResumeId(cmd.sessionKey)
          sendText(
            adminSurface.channel,
            adminSurface.chatId,
            `已重置会话 ${cmd.sessionKey} 的对话上下文。`
          )
          return
        case "resume":
          bus.emit("handoff.resumed", {
            sessionKey: cmd.sessionKey,
            by: "admin",
          })
          return
        case "broadcast":
          if (repo.seenMessage(dedupeKey)) return
          void runGroupOp(cmd, adminSurface, messageId, msg.images)
          return
        case "notice":
        case "mute":
          if (repo.seenMessage(dedupeKey)) return
          void runGroupOp(cmd, adminSurface, messageId)
          return
        case "draft":
          if (repo.seenMessage(dedupeKey)) return
          void runDraft(cmd.brief, adminSurface, messageId)
          return
        case "publish": {
          if (repo.seenMessage(dedupeKey)) return
          const draft = pendingDraft
          if (!draft) {
            sendText(channel, chatId, PUBLISH_USAGE, messageId)
            return
          }
          if (now() - draft.createdAt > DRAFT_TTL_MS) {
            pendingDraft = null
            sendText(
              channel,
              chatId,
              `草稿已超过 ${DRAFT_TTL_MS / 60_000} 分钟,请用 /写公告 重新起草。`,
              messageId
            )
            return
          }
          pendingDraft = null
          void runGroupOp(
            {
              kind: "notice",
              content: draft.content,
              pinned: cmd.pinned,
              ...(cmd.groupId !== undefined ? { groupId: cmd.groupId } : {}),
              ...(cmd.muteMs !== undefined ? { muteMs: cmd.muteMs } : {}),
            },
            adminSurface,
            messageId
          )
          return
        }
        case "usage": {
          if (repo.seenMessage(dedupeKey)) return
          const usage: Record<typeof cmd.command, string> = {
            群发: BROADCAST_USAGE,
            公告: NOTICE_USAGE,
            写公告: DRAFT_USAGE,
            发布: PUBLISH_USAGE,
            禁言: MUTE_USAGE,
          }
          sendText(channel, chatId, usage[cmd.command], messageId)
          return
        }
        case "unknown":
          if (repo.seenMessage(dedupeKey)) return
          sendText(channel, chatId, adminHelpText(), messageId)
          return
      }
      return
    }

    // 生效会话门:非白名单 → 完全忽略
    if (!isChatEnabled(enabledCfg, channel, chatId)) return

    const triggered =
      msg.botMentioned ?? isAtTrigger(msg.atList, botQQStr, extraAtQQs)
    if (!triggered) return
    if (repo.seenMessage(makeDedupeKey(channel, chatId, messageId))) return
    const sessionKey = makeSessionKey(channel, chatId, userId)

    const body = (msg.rawText ?? "").trim()
    const hasBody = body.length > 0
    const hasImages = !!msg.images?.length

    // human-mode:已转人工 → 丢弃(不抢答)
    if (repo.isHumanMode(sessionKey)) {
      // 允许用户在人工模式发「重置」清上下文,但不自动答
      if (RESET_KEYWORDS.test(body)) {
        repo.clearResumeId(sessionKey)
        sendText(
          channel,
          chatId,
          "已重置对话上下文。当前仍在人工接待中;管理恢复后我会再自动答。",
          messageId
        )
      }
      return
    }

    // 用户自助重置:清 resumeId,不转 Agent
    if (RESET_KEYWORDS.test(body)) {
      repo.clearResumeId(sessionKey)
      sendText(channel, chatId, "对话已重置。", messageId)
      bus.emit("resolution.recorded", {
        kind: "reset",
        sessionKey,
        channel,
        chatId,
        userId,
      })
      return
    }

    // 用法说明
    if (HELP_KEYWORDS.test(body)) {
      sendText(channel, chatId, helpText(supportUrl), messageId)
      return
    }

    // 转人工：有管理面 → handoff 事件（通知走 adminSurface）；无管理面 → 引导官网
    if (HANDOFF_KEYWORDS.test(body)) {
      if (!adminSurface) {
        const link = supportUrl ? ` 也可访问 ${supportUrl} 联系支持。` : ""
        sendText(
          channel,
          chatId,
          `未配置管理侧转人工通道。请通过官网联系客服。${link}`.trim(),
          messageId
        )
        return
      }
      const lastQ = repo.lastQuestion(sessionKey) ?? body
      bus.emit("handoff.requested", {
        channel,
        sessionKey,
        chatId,
        userId,
        lastQuestion: lastQ || "用户请求转人工",
        reason: "user",
      })
      return
    }

    // 身份问题走本地固定文案，避免底层模型把 Codex/Claude 等运行时身份发给群友。
    if (hasBody && !hasImages && isIdentityQuestion(body)) {
      sendText(channel, chatId, identityReply(deps.brand), messageId)
      bus.emit("resolution.recorded", {
        kind: "auto",
        sessionKey,
        channel,
        chatId,
        userId,
        detail: "identity-reply",
      })
      return
    }

    // 加载 @ 前用户近期发言,拼入 qualified text
    let priorTexts: string[] = []
    try {
      const since = repo.priorSince(sessionKey)
      const rows = repo.recentUserGroupMessages(
        channel,
        chatId,
        userId,
        PRIOR_USER_CONTEXT_LIMIT,
        {
          excludeMessageId: messageId,
          sinceTs: since,
        }
      )
      priorTexts = clipPriorTexts(
        rows.map((r) => r.text),
        PRIOR_CONTEXT_MAX_CHARS,
        PRIOR_LINE_MAX_CHARS
      )
    } catch (err) {
      emitErrorSafely({
        scope: "gateway.prior-context",
        err,
        sessionKey,
        channel,
        chatId,
        userVisible: false,
      })
      priorTexts = []
    }

    // 纯 @ 无正文/图/prior：回用法说明（常见「@ 了但无回复」）
    if (!hasBody && !hasImages && priorTexts.length === 0) {
      sendText(channel, chatId, helpText(supportUrl), messageId)
      bus.emit("resolution.recorded", {
        kind: "ack",
        sessionKey,
        channel,
        chatId,
        userId,
        detail: "empty-after-mention",
      })
      return
    }

    const text = formatPriorContext(priorTexts, body)
    // 记录最近问题,供列表预览 / 转人工摘要
    const lastQ = body || priorTexts[priorTexts.length - 1] || ""
    if (lastQ) repo.setLastQuestion(sessionKey, lastQ)

    bus.emit("message.qualified", {
      channel,
      sessionKey,
      chatId,
      userId,
      messageId,
      text,
      images: msg.images,
      quoted: msg.quoted,
      forwarded: msg.forwarded,
    })
  }

  bus.on("message.received", onReceived)
  return () => bus.off("message.received", onReceived)
}
