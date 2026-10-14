import { logger } from "../logger"

export const ORDER_REJECT_REASON = "订单号无效或未支付"
const ORDER_NO_RE = /(?<![A-Za-z0-9])ord-([A-Za-z0-9]+)(?![A-Za-z0-9])/gi
const COMPACT_ORDER_NO_RE = /(?<![A-Za-z0-9])ord([A-Za-z0-9]{9,})(?![A-Za-z0-9])/gi
const BARE_ORDER_NO_RE = /(?<![A-Za-z0-9])([A-Za-z0-9]{9,})(?![A-Za-z0-9])/g

function isBareOrderSuffix(value: string): boolean {
  return (
    value.length >= 9 &&
    /^[A-Za-z0-9]+$/.test(value) &&
    /[A-Za-z]/.test(value) &&
    /[0-9]/.test(value)
  )
}

export function extractOrderNo(text: string): string | undefined {
  ORDER_NO_RE.lastIndex = 0
  const prefixed = ORDER_NO_RE.exec(text)
  if (prefixed) return `ORD-${prefixed[1]}`

  COMPACT_ORDER_NO_RE.lastIndex = 0
  const compact = COMPACT_ORDER_NO_RE.exec(text)
  if (compact && isBareOrderSuffix(compact[1])) return `ORD-${compact[1]}`

  BARE_ORDER_NO_RE.lastIndex = 0
  let bare: RegExpExecArray | null
  while ((bare = BARE_ORDER_NO_RE.exec(text))) {
    if (isBareOrderSuffix(bare[1])) return `ORD-${bare[1]}`
  }
  return undefined
}

interface OrderResponse {
  success?: boolean
  error?: unknown
  data?: { order?: Record<string, unknown>; out_trade_no?: unknown }
  order?: Record<string, unknown>
}

function extractOrder(data: OrderResponse): Record<string, unknown> | undefined {
  if (data.data && typeof data.data === "object") {
    if (data.data.order && typeof data.data.order === "object") return data.data.order
    if ("out_trade_no" in data.data) return data.data as Record<string, unknown>
  }
  return data.order && typeof data.order === "object" ? data.order : undefined
}

export async function checkOrderPaid(
  orderNo: string,
  options: { url?: string; timeoutMs?: number; fetchImpl?: typeof fetch } = {}
): Promise<boolean> {
  const url = options.url ?? "https://rc.cnweb.org/api/bill/query"
  const timeoutMs = options.timeoutMs ?? 10_000
  const fetchImpl = options.fetchImpl ?? fetch
  try {
    const target = new URL(url)
    target.searchParams.set("order", orderNo)
    const response = await fetchImpl(target, {
      headers: { "User-Agent": "curl/8.5.0", Accept: "*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    })
    let data: unknown
    try {
      data = await response.json()
    } catch {
      return false
    }
    if (!response.ok || !data || typeof data !== "object") return false
    const body = data as OrderResponse
    if (body.success === false || body.error) return false
    const order = extractOrder(body)
    return (
      order?.status === "paid" &&
      typeof order.out_trade_no === "string" &&
      order.out_trade_no.toLowerCase() === orderNo.toLowerCase()
    )
  } catch (err) {
    logger.warn("[qq] 订单校验请求失败", { scope: "qq.group-request" , raw: err instanceof Error ? err.message : String(err) })
    return false
  }
}
