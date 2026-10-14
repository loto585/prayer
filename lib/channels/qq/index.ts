import type { ActionSend } from "../../events"
import type { Channel, ChannelCapabilities, ChannelStatus } from "../types"
import {
  OneBotClient,
  type OneBotApiResult,
  type OneBotKeepaliveOpts,
  type OneBotStats,
} from "./client"

const QQ_CAPABILITIES: ChannelCapabilities = {
  canNotifyOwnAdminSurface: true,
  supportsAdminCommands: true,
  supportsMemberList: true,
  supportsGroupList: true,
  supportsMediaDownload: true,
  supportsBypassPipeline: true,
}

/**
 * QQ / OneBot 通道适配器。
 * 拥有 start/stop/send/status 生命周期；传输细节在 OneBotClient。
 */
export class QqChannel implements Channel {
  readonly id = "qq" as const
  readonly capabilities = QQ_CAPABILITIES

  private client: OneBotClient
  private lastError?: string
  private detail?: string

  constructor(
    url: string,
    accessToken?: string,
    onStatus?: (connected: boolean) => void,
    opts?: OneBotKeepaliveOpts
  ) {
    this.client = new OneBotClient(url, accessToken, onStatus, opts)
  }

  async start(): Promise<void> {
    this.lastError = undefined
    this.client.start()
  }

  async stop(): Promise<void> {
    this.client.stop()
  }

  isConnected(): boolean {
    return this.client.isConnected()
  }

  status(): ChannelStatus {
    return {
      id: this.id,
      connected: this.isConnected(),
      lastError: this.lastError,
      detail: formatQqDetail(this.client.stats()) ?? this.detail,
    }
  }

  /** registry startAll 失败时写入 */
  setLastError(err: string): void {
    this.lastError = err
  }

  async send(action: ActionSend): Promise<void> {
    // 防御：仅本通道（registry 已过滤，双保险）
    if (action.channel !== "qq") return
    this.client.send(action)
  }

  async listChats(): Promise<{ id: string; name: string }[] | undefined> {
    const raw = await this.client.getGroupList()
    if (!Array.isArray(raw)) return undefined
    return raw.map((g) => {
      const o = g as { group_id?: unknown; group_name?: unknown }
      const id = String(o.group_id ?? "")
      return { id, name: String(o.group_name ?? id) }
    })
  }

  async listMembers(chatId: string): Promise<unknown[] | undefined> {
    return this.client.getGroupMemberList(Number(chatId))
  }

  async setGroupAddRequest(
    flag: string,
    approve: boolean,
    reason?: string
  ): Promise<OneBotApiResult> {
    return this.client.setGroupAddRequest(flag, approve, reason)
  }

  async sendGroupMessage(
    groupId: number,
    text: string,
    mentionAll = false
  ): Promise<OneBotApiResult> {
    return this.client.sendGroupMessage(groupId, text, mentionAll)
  }

  async deleteMessage(messageId: number): Promise<OneBotApiResult> {
    return this.client.deleteMessage(messageId)
  }

  async setGroupNotice(
    groupId: number,
    content: string,
    pinned = false
  ): Promise<OneBotApiResult> {
    return this.client.setGroupNotice(groupId, content, pinned)
  }

  async setGroupWholeBan(
    groupId: number,
    enable: boolean
  ): Promise<OneBotApiResult> {
    return this.client.setGroupWholeBan(groupId, enable)
  }
}

export { OneBotClient } from "./client"

/**
 * 把 OneBotStats 拼成人可读的 detail 串,供状态页展示链路是否新鲜。
 * 两段都缺省时返回 undefined,由调用方回落到既有 detail。
 */
export function formatQqDetail(
  stats: OneBotStats,
  now: number = Date.now()
): string | undefined {
  const parts: string[] = []
  if (stats.lastRxAt != null) {
    parts.push(`rx=${Math.round((now - stats.lastRxAt) / 1000)}s ago`)
  }
  if (stats.staleReconnects > 0) {
    parts.push(`stale-reconnects=${stats.staleReconnects}`)
  }
  return parts.length > 0 ? parts.join(" ") : undefined
}
