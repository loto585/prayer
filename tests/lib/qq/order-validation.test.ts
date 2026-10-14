import { describe, expect, it, vi } from "vitest"
import { checkOrderPaid, extractOrderNo } from "@/lib/qq/order-validation"

describe("QQ 加群订单校验", () => {
  it("提取三种订单号格式并拒绝短/纯数字值", () => {
    expect(extractOrderNo("订单 ord-ABC123456" )).toBe("ORD-ABC123456")
    expect(extractOrderNo("订单 ordABC123456" )).toBe("ORD-ABC123456")
    expect(extractOrderNo("订单 ABC123456" )).toBe("ORD-ABC123456")
    expect(extractOrderNo("123456789" )).toBeUndefined()
    expect(extractOrderNo("ABC123" )).toBeUndefined()
  })

  it("只接受 paid 且订单号匹配的响应", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ data: { order: { status: "paid", out_trade_no: "ord-ABC123456" } } }), { status: 200 })
    )
    await expect(checkOrderPaid("ORD-ABC123456", { fetchImpl })).resolves.toBe(true)
    expect(fetchImpl).toHaveBeenCalledOnce()
    const request = (fetchImpl.mock.calls as unknown as Array<[URL]>)[0]?.[0]
    expect(new URL(String(request)).searchParams.get("order")).toBe("ORD-ABC123456")
  })

  it("接口错误、未支付、非 JSON 均失败", async () => {
    const cases = [
      new Response(JSON.stringify({ success: false }), { status: 404 }),
      new Response(JSON.stringify({ order: { status: "pending", out_trade_no: "ORD-X12345678" } }), { status: 200 }),
      new Response("bad", { status: 200 }),
    ]
    for (const response of cases) {
      await expect(checkOrderPaid("ORD-X12345678", { fetchImpl: vi.fn(async () => response) })).resolves.toBe(false)
    }
  })
})
