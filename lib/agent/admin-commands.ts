/**
 * 管理面指令解析(纯函数,不碰 bus / repo)。
 *
 * 语法:`/指令 [-旗标…] <正文>`。旗标紧跟指令名、全部英文;正文可多行:
 *   /reset <sessionKey>
 *   /resume <sessionKey>
 *   /群发 [-all] [-t <时长>] <内容>        -all = @全体;-t = 先限时禁言再发;同条消息带的图一并群发
 *   /公告 [-pin] [-t <时长>] <内容>        -pin = 置顶(缺省不置顶)
 *   /写公告 <要点>                          让模型按风格起草,回草稿到管理群
 *   /发布 [-pin] [-t <时长>]                发布最近一份草稿
 *   /禁言 -on|-off [-t <时长>]              全员禁言 / 解除;-on 带 -t 则到期自动解除
 * 全部指令都可用 `-g <群号>` 只操作一个群(缺省全部生效群)。
 *
 * 前缀同时接受半角 `/` 与全角 `／`。旧的 `!` 前缀按未知指令处理(回总用法),便于迁移。
 * 用 QQ 自带的「@全体成员」等价于 -all:解析层把 at=all 段标成 atAll 传进来。
 * 图片不进解析结果(本模块只看文本),由 gateway 从入站消息取;解析层只需知道「带没带图」。
 */
export type UsageCommand = "群发" | "公告" | "写公告" | "发布" | "禁言"

/** 群/限时禁言两个可选参数,四类指令共用 */
export interface TargetOptions {
  /** -g:只操作该群;缺省 = 全部生效群 */
  groupId?: number
  /** -t:先限时禁言该时长(ms),到期自动解除;缺省 = 不禁言 */
  muteMs?: number
}

export type AdminCommand =
  | { kind: "reset"; sessionKey: string }
  | { kind: "resume"; sessionKey: string }
  /** text 可为空:此时消息必带图(纯图群发) */
  | ({ kind: "broadcast"; text: string; mentionAll: boolean } & TargetOptions)
  | ({ kind: "notice"; content: string; pinned: boolean } & TargetOptions)
  | { kind: "draft"; brief: string }
  | ({ kind: "publish"; pinned: boolean } & TargetOptions)
  | ({ kind: "mute"; enable: boolean } & TargetOptions)
  /** 指令名对、参数不对 → 回该指令的用法 */
  | { kind: "usage"; command: UsageCommand }
  /** 以 / 开头但不认识 → 回总用法 */
  | { kind: "unknown" }

export interface ParseAdminCommandOptions {
  /** 消息里带 QQ 原生「@全体成员」段 */
  atAll?: boolean
  /** 消息带图;/群发 据此允许正文为空(纯图) */
  hasImages?: boolean
}

/** -t 取值范围:太短没意义,太长既无意义又逼近 Node setTimeout 上限 */
export const MIN_MUTE_MS = 10_000
export const MAX_MUTE_MS = 7 * 24 * 60 * 60_000

const DURATION_RE = /^(\d+)([smhd])$/i

/**
 * 解析 `-t` 的时长:`10s` / `30m` / `2h` / `1d`。
 * 超出 [MIN,MAX]、单位缺失、非整数一律返回 null(由调用方回用法,不猜)。
 */
export function parseDuration(raw: string): number | null {
  const m = DURATION_RE.exec(raw.trim())
  if (!m) return null
  const n = Number(m[1])
  const unit = m[2]!.toLowerCase()
  const mult =
    unit === "s"
      ? 1000
      : unit === "m"
        ? 60_000
        : unit === "h"
          ? 3_600_000
          : 86_400_000
  const ms = n * mult
  if (!Number.isFinite(ms) || ms < MIN_MUTE_MS || ms > MAX_MUTE_MS) return null
  return ms
}

/** 时长的中文表述,用于回执:600000 → `10 分钟` */
export function formatDuration(ms: number): string {
  if (ms % 86_400_000 === 0) return `${ms / 86_400_000} 天`
  if (ms % 3_600_000 === 0) return `${ms / 3_600_000} 小时`
  if (ms % 60_000 === 0) return `${ms / 60_000} 分钟`
  return `${Math.round(ms / 1000)} 秒`
}

export const BROADCAST_USAGE =
  "用法:`/群发 [-all] [-t <时长>] <内容>` 发到全部生效群;同一条消息里附带的图片会一并发出(可只发图);-all 同时 @全体成员;-t 先限时禁言再发(如 -t 10m),到期自动解除。"
export const NOTICE_USAGE =
  "用法:`/公告 [-pin] [-t <时长>] <内容>` 在全部生效群发布群公告;-pin 置顶;-t 先限时禁言再发。"
export const DRAFT_USAGE =
  "用法:`/写公告 <要点>` 让机器人按团队风格起草公告;看过草稿后回复 `/发布` 发到全部生效群(`/发布 -pin` 置顶)。"
export const PUBLISH_USAGE =
  "用法:`/发布 [-pin] [-t <时长>]` 发布最近一份草稿;-pin 置顶;-t 先限时禁言再发。先用 `/写公告 <要点>` 起草。"
export const MUTE_USAGE =
  "用法:`/禁言 -on [-t <时长>]` 开启全员禁言(-t 到期自动解除);`/禁言 -off` 解除。加 `-g <群号>` 只操作一个群。"

interface FlagSpec {
  /** 无值旗标 */
  bool?: readonly string[]
  /** 带一个值的旗标 */
  valued?: readonly string[]
}

interface ParsedFlags {
  flags: Map<string, string | true>
  body: string
}

/**
 * 取出指令名后面连续的旗标,剩下的是正文。
 * 旗标必须整词(`-all` 后接空白或结尾):正文里 `-v2 上线`、`-5折` 这类不算旗标。
 * 遇到表外的 `-xxx` 整词或带值旗标缺值 → null,由调用方回用法而不是猜。
 */
function takeFlags(rest: string, spec: FlagSpec): ParsedFlags | null {
  const flags = new Map<string, string | true>()
  let s = rest
  for (;;) {
    const m = /^\s*(-[a-z]+)(?=\s|$)/i.exec(s)
    if (!m) break
    const name = m[1]!.toLowerCase()
    if (spec.bool?.includes(name)) {
      flags.set(name, true)
      s = s.slice(m[0].length)
      continue
    }
    if (spec.valued?.includes(name)) {
      const v = /^\s*-[a-z]+\s+(\S+)/i.exec(s)
      if (!v) return null
      flags.set(name, v[1]!)
      s = s.slice(v[0].length)
      continue
    }
    return null
  }
  const body = s.trim()
  // 旗标与值粘连(`-t10m` / `-g123`)时不当正文:那是打错了,回用法比照发出去强
  if (/^-(?:t|g)\d/i.test(body)) return null
  return { flags, body }
}

/** -g / -t 两个共用旗标 → TargetOptions;非法返回 null */
function targetOptions(
  flags: Map<string, string | true>
): TargetOptions | null {
  const out: TargetOptions = {}
  const g = flags.get("-g")
  if (g !== undefined) {
    const groupId = Number(g)
    if (!Number.isSafeInteger(groupId) || groupId <= 0) return null
    out.groupId = groupId
  }
  const t = flags.get("-t")
  if (t !== undefined) {
    const muteMs = parseDuration(String(t))
    if (muteMs === null) return null
    out.muteMs = muteMs
  }
  return out
}

function usage(command: UsageCommand): AdminCommand {
  return { kind: "usage", command }
}

/** 非指令返回 null;调用方据此静默 */
export function parseAdminCommand(
  rawText: string,
  opts: ParseAdminCommandOptions = {}
): AdminCommand | null {
  const text = rawText.trim().replace(/^／/, "/")
  // 旧前缀:已不是指令,但回总用法比静默友好——管理员一眼看出前缀改了
  if (/^[!！]/.test(text)) return { kind: "unknown" }
  if (!text.startsWith("/")) return null

  const mReset = /^\/reset\s+(\S+)/.exec(text)
  if (mReset) return { kind: "reset", sessionKey: mReset[1]! }
  const mResume = /^\/resume\s+(\S+)/.exec(text)
  if (mResume) return { kind: "resume", sessionKey: mResume[1]! }

  // 指令名与正文之间的空格可省:中文输入下 `/群发今晚维护` 很常见
  const mBroadcast = /^\/群发([\s\S]*)$/.exec(text)
  if (mBroadcast) {
    const p = takeFlags(mBroadcast[1]!, {
      bool: ["-all"],
      valued: ["-t", "-g"],
    })
    const to = p ? targetOptions(p.flags) : null
    if (!p || !to || (!p.body && !opts.hasImages)) return usage("群发")
    return {
      kind: "broadcast",
      text: p.body,
      mentionAll: p.flags.has("-all") || !!opts.atAll,
      ...to,
    }
  }

  // 先匹配 /写公告,再匹配 /公告:后者的正则不会吃到前者,但顺序写明更清楚
  const mDraft = /^\/写公告([\s\S]*)$/.exec(text)
  if (mDraft) {
    const brief = mDraft[1]!.trim()
    if (!brief) return usage("写公告")
    return { kind: "draft", brief }
  }

  const mNotice = /^\/公告([\s\S]*)$/.exec(text)
  if (mNotice) {
    const p = takeFlags(mNotice[1]!, {
      bool: ["-pin"],
      valued: ["-t", "-g"],
    })
    const to = p ? targetOptions(p.flags) : null
    if (!p || !to || !p.body) return usage("公告")
    return {
      kind: "notice",
      content: p.body,
      pinned: p.flags.has("-pin"),
      ...to,
    }
  }

  const mPublish = /^\/发布(?=\s|$)([\s\S]*)$/.exec(text)
  if (mPublish) {
    const p = takeFlags(mPublish[1]!, {
      bool: ["-pin"],
      valued: ["-t", "-g"],
    })
    const to = p ? targetOptions(p.flags) : null
    // 发布不接正文:带了多半是把草稿贴上来了,回用法而不是猜
    if (!p || !to || p.body) return usage("发布")
    return { kind: "publish", pinned: p.flags.has("-pin"), ...to }
  }

  const mMute = /^\/禁言(?=\s|$)([\s\S]*)$/.exec(text)
  if (mMute) {
    const p = takeFlags(mMute[1]!, {
      bool: ["-on", "-off"],
      valued: ["-t", "-g"],
    })
    const to = p ? targetOptions(p.flags) : null
    if (!p || !to || p.body) return usage("禁言")
    const on = p.flags.has("-on")
    const off = p.flags.has("-off")
    // 没给方向、或两个都给,都不猜
    if (on === off) return usage("禁言")
    // -t 只对「开」有意义:关闭时带时长是笔误
    if (!on && to.muteMs !== undefined) return usage("禁言")
    return { kind: "mute", enable: on, ...to }
  }

  return { kind: "unknown" }
}
