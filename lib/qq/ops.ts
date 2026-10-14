import type { OneBotApiResult } from "../channels/qq/client"
import type { ChatRef } from "../channels/types"

/**
 * 群发消息 / 群公告所需的最小 QQ 通道能力。
 * QqChannel 实现它;后台 API 路由与管理面指令共用同一套执行逻辑,
 * 避免两处各写一份发送循环后行为漂移。
 */
export interface QqOps {
  sendGroupMessage(
    groupId: number,
    text: string,
    mentionAll?: boolean
  ): Promise<OneBotApiResult>
  setGroupNotice(
    groupId: number,
    content: string,
    pinned?: boolean
  ): Promise<OneBotApiResult>
  /** 全员禁言开/关;bot 须为该群管理员 */
  setGroupWholeBan(groupId: number, enable: boolean): Promise<OneBotApiResult>
}

export interface GroupOpResult {
  groupId: number
  ok: boolean
  error?: string
}

export interface GroupOpSummary {
  results: GroupOpResult[]
  succeeded: number
  failed: number
}

/** 运行时拿到的通道是 Channel 基类型;按鸭子类型窄化成 QqOps,缺方法视为不可用 */
export function resolveQqOps(channel: unknown): QqOps | null {
  const c = channel as Partial<QqOps> | null | undefined
  return c &&
    typeof c.sendGroupMessage === "function" &&
    typeof c.setGroupNotice === "function" &&
    typeof c.setGroupWholeBan === "function"
    ? (c as QqOps)
    : null
}

/** 群号归一化:转整数、去非法、去重,保持输入顺序 */
export function normalizeGroupIds(values: Array<string | number>): number[] {
  const seen = new Set<number>()
  const result: number[] = []
  for (const value of values) {
    const groupId = Number(String(value).trim())
    if (!Number.isSafeInteger(groupId) || groupId <= 0 || seen.has(groupId))
      continue
    seen.add(groupId)
    result.push(groupId)
  }
  return result
}

/**
 * 管理面指令的默认目标:生效会话里的 QQ 群,剔除管理群自身。
 * 管理群与生效会话的互斥只在迁移路径(migrate.ts)剔除过一次,
 * 写路径不再校验,所以这里必须再滤一遍,否则群发会回灌管理群。
 */
export function qqBroadcastTargets(
  enabledChats: ChatRef[],
  adminSurface: ChatRef | null
): number[] {
  const ids = enabledChats
    .filter((c) => c.channel === "qq")
    .filter(
      (c) =>
        !(
          adminSurface &&
          adminSurface.channel === c.channel &&
          adminSurface.chatId === c.chatId
        )
    )
    .map((c) => c.chatId)
  return normalizeGroupIds(ids)
}

async function runPerGroup(
  groupIds: number[],
  op: (groupId: number) => Promise<OneBotApiResult>,
  failText: string
): Promise<GroupOpSummary> {
  const results: GroupOpResult[] = []
  // 逐群串行:与后台页面行为一致;并发会撞 NapCat 的频率限制并放大失败面
  for (const groupId of groupIds) {
    try {
      const r = await op(groupId)
      results.push({
        groupId,
        ok: r.ok,
        ...(r.ok ? {} : { error: r.message ?? failText }),
      })
    } catch (error) {
      results.push({
        groupId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  const succeeded = results.filter((r) => r.ok).length
  return { results, succeeded, failed: results.length - succeeded }
}

export function broadcastMessage(
  ops: QqOps,
  groupIds: number[],
  text: string,
  mentionAll = false
): Promise<GroupOpSummary> {
  return runPerGroup(
    groupIds,
    (gid) => ops.sendGroupMessage(gid, text, mentionAll),
    "发送失败"
  )
}

export function publishNotice(
  ops: QqOps,
  groupIds: number[],
  content: string,
  pinned = false
): Promise<GroupOpSummary> {
  return runPerGroup(
    groupIds,
    (gid) => ops.setGroupNotice(gid, content, pinned),
    "发布失败"
  )
}

export function setWholeBan(
  ops: QqOps,
  groupIds: number[],
  enable: boolean
): Promise<GroupOpSummary> {
  return runPerGroup(
    groupIds,
    (gid) => ops.setGroupWholeBan(gid, enable),
    enable ? "禁言失败" : "解禁失败"
  )
}

/** 管理群回执:一行总览;有失败时逐群列出原因 */
export function formatOpSummary(label: string, s: GroupOpSummary): string {
  const head = `${label}完成:成功 ${s.succeeded} / 共 ${s.results.length}`
  if (s.failed === 0) return head
  const lines = s.results
    .filter((r) => !r.ok)
    .map((r) => `- ${r.groupId}:${r.error ?? "失败"}`)
  return `${head}\n失败 ${s.failed} 个:\n${lines.join("\n")}`
}
