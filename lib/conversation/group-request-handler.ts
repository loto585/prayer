import { bus } from "../core/bus"
import type { GroupRequest } from "../core/chat/events"
import { logger } from "../core/logger"
import { checkOrderPaid, extractOrderNo, ORDER_REJECT_REASON } from "./order-validation"

export interface GroupRequestHandlerOptions {
  enabledGroupIds: string[]
  requireOrder: boolean
  autoApprove: boolean
  orderQueryUrl?: string
  orderTimeoutMs?: number
  setGroupAddRequest?: (flag: string, approve: boolean, reason?: string) => Promise<unknown>
  checkOrderPaid?: (orderNo: string) => Promise<boolean>
}

export function registerGroupRequestHandler(options: GroupRequestHandlerOptions): () => void {
  const handle = (request: GroupRequest) => {
    void processGroupRequest(request, options).catch((err) => {
      logger.warn("[qq] 加群申请处理失败", {
        scope: "qq.group-request",
        chatId: request.groupId,
        raw: err instanceof Error ? err.message : String(err),
      })
    })
  }
  bus.on("group.requested", handle)
  return () => bus.off("group.requested", handle)
}

async function processGroupRequest(request: GroupRequest, options: GroupRequestHandlerOptions): Promise<void> {
  // 空列表表示没有生效群，不能退化成“所有群”，否则会绕过 enabledChats 的范围控制。
  if (!options.enabledGroupIds.includes(request.groupId)) return
  const orderNo = extractOrderNo(request.comment)
  const valid = orderNo
    ? await (options.checkOrderPaid?.(orderNo) ?? checkOrderPaid(orderNo, { url: options.orderQueryUrl, timeoutMs: options.orderTimeoutMs }))
    : false
  const approve = valid && options.autoApprove
  if (!orderNo && !options.requireOrder) return
  const reason = approve ? undefined : ORDER_REJECT_REASON
  if (options.setGroupAddRequest) {
    await options.setGroupAddRequest(request.flag, approve, reason)
  }
  logger.info(`[qq] 加群申请已${approve ? "同意" : "拒绝"}`, {
    scope: "qq.group-request",
    channel: "qq",
    chatId: request.groupId,
  })
}
