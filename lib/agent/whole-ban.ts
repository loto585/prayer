import type { Repo } from "../db/repo"
import { logger } from "../logger"
import { errorMessage } from "../log-context"
import { setWholeBan, type QqOps } from "../qq/ops"

/**
 * 限时禁言的到期解禁。
 *
 * NapCat / OneBot 的 set_group_whole_ban 只有 enable,没有时长参数,
 * 所以「禁言 10 分钟」= 立即禁言 + 记下到期时刻,到点再发一次 enable=false。
 *
 * 记录落库(单个 JSON 键),进程重启后第一个扫描周期就会把已到期的群补解禁:
 * 否则重启会丢掉内存定时器,群卡在禁言直到人工发现。
 * 用轮询而不是每群一个 setTimeout:时长上限可到 7 天,且轮询天然处理时钟回拨与重启。
 */

/** 待解禁记录落库键;值为 `{ "<群号>": { at, tries } }` 的 JSON */
export const WHOLE_BAN_PENDING_KEY = "whole_ban_pending"
/** 单群解禁连续失败多少次后放弃并记 error,交给人工 */
export const MAX_UNBAN_TRIES = 5
export const DEFAULT_UNBAN_SCAN_MS = 30_000

export interface PendingBan {
  /** 到期时刻(ms epoch) */
  at: number
  /** 已失败次数 */
  tries: number
}

export type PendingMap = Record<string, PendingBan>

/** 读待解禁表;值损坏/缺失一律当空,不阻断调用方 */
export function readPending(repo: Repo): PendingMap {
  const raw = repo.getConfigRow(WHOLE_BAN_PENDING_KEY)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object") return {}
    const out: PendingMap = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const gid = Number(k)
      if (!Number.isSafeInteger(gid) || gid <= 0) continue
      const o = (v ?? {}) as { at?: unknown; tries?: unknown }
      if (typeof o.at !== "number" || !Number.isFinite(o.at)) continue
      out[String(gid)] = {
        at: o.at,
        tries: typeof o.tries === "number" && o.tries >= 0 ? o.tries : 0,
      }
    }
    return out
  } catch {
    return {}
  }
}

function save(repo: Repo, map: PendingMap): void {
  repo.setConfigRow(WHOLE_BAN_PENDING_KEY, JSON.stringify(map))
}

/** 覆盖写这些群的解禁时刻(已存在的记录被替换,tries 归零) */
export function scheduleUnban(
  repo: Repo,
  groupIds: number[],
  at: number
): void {
  if (groupIds.length === 0) return
  const map = readPending(repo)
  for (const gid of groupIds) map[String(gid)] = { at, tries: 0 }
  save(repo, map)
}

/**
 * 撤销这些群的待解禁记录。
 * 手动 /禁言 -off、或改成不带 -t 的永久禁言时都要调:
 * 否则旧定时器会在到点时把「本该永久」的群悄悄解禁。
 */
export function cancelUnban(repo: Repo, groupIds: number[]): void {
  if (groupIds.length === 0) return
  const map = readPending(repo)
  let changed = false
  for (const gid of groupIds) {
    if (map[String(gid)]) {
      delete map[String(gid)]
      changed = true
    }
  }
  if (changed) save(repo, map)
}

/** 已到期待解禁的群,按到期时刻升序(纯函数,便于单测) */
export function duePending(
  map: PendingMap,
  now: number
): Array<{ groupId: number; ban: PendingBan }> {
  return Object.entries(map)
    .filter(([, ban]) => ban.at <= now)
    .map(([k, ban]) => ({ groupId: Number(k), ban }))
    .sort((a, b) => a.ban.at - b.ban.at)
}

export interface WholeBanExpiryDeps {
  repo: Repo
  /** 惰性取通道:装配发生在通道建立之前 */
  qqOps: () => QqOps | null
  /** 扫描周期 ms;默认 30s */
  scanMs?: number
  /** 时钟;测试注入 */
  now?: () => number
}

/**
 * 注册到期解禁轮询。注册时立即扫一次(补重启前的欠账),之后每 scanMs 一次。
 * 解禁失败保留记录下轮重试,连续失败到 MAX_UNBAN_TRIES 才放弃并记 error。
 */
export function registerWholeBanExpiry(deps: WholeBanExpiryDeps): () => void {
  const scanMs = deps.scanMs ?? DEFAULT_UNBAN_SCAN_MS
  const now = deps.now ?? (() => Date.now())
  let running = false

  const tick = async (): Promise<void> => {
    if (running) return
    running = true
    try {
      const due = duePending(readPending(deps.repo), now())
      if (due.length === 0) return
      const ops = deps.qqOps()
      if (!ops) return // 通道未就绪:记录留着,下轮再试
      const ids = due.map((d) => d.groupId)
      const summary = await setWholeBan(ops, ids, false)

      const map = readPending(deps.repo)
      const giveUp: number[] = []
      for (const r of summary.results) {
        const key = String(r.groupId)
        if (r.ok) {
          delete map[key]
          continue
        }
        const cur = map[key]
        if (!cur) continue
        cur.tries += 1
        if (cur.tries >= MAX_UNBAN_TRIES) {
          delete map[key]
          giveUp.push(r.groupId)
        }
      }
      save(deps.repo, map)

      if (summary.succeeded > 0) {
        logger.info(
          `[whole-ban] 限时禁言到期,已自动解除 ${summary.succeeded}/${ids.length} 个群`,
          { scope: "whole-ban" }
        )
      }
      if (giveUp.length > 0) {
        logger.error(
          `[whole-ban] 自动解除连续失败 ${MAX_UNBAN_TRIES} 次,已放弃:${giveUp.join(",")};请手动 /禁言 -off`,
          { scope: "whole-ban", raw: giveUp.join(",") }
        )
      }
    } catch (err) {
      logger.warn(`[whole-ban] 到期解禁异常:${errorMessage(err)}`, {
        scope: "whole-ban",
      })
    } finally {
      running = false
    }
  }

  void tick()
  const timer = setInterval(() => void tick(), scanMs)
  return () => clearInterval(timer)
}
