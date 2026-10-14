import { beforeEach, describe, expect, it, vi } from "vitest"
import { bus } from "@/lib/bus"
import { registerGroupRequestHandler } from "@/lib/qq/group-request-handler"

beforeEach(() => bus.removeAllListeners())

describe("QQ 加群申请处理器", () => {
  it("有效订单自动同意", async () => {
    const action = vi.fn(async () => undefined)
    const cleanup = registerGroupRequestHandler({
      enabledGroupIds: ["100"], requireOrder: true, autoApprove: true,
      checkOrderPaid: async () => true, setGroupAddRequest: action,
    })
    bus.emit("group.requested", { groupId: "100", userId: "2", comment: "ord-ABC123456", flag: "f1", subType: "add" })
    await vi.waitFor(() => expect(action).toHaveBeenCalledWith("f1", true, undefined))
    cleanup()
  })

  it("缺少或无效订单拒绝，非白名单群忽略", async () => {
    const action = vi.fn(async () => undefined)
    const cleanup = registerGroupRequestHandler({
      enabledGroupIds: ["100"], requireOrder: true, autoApprove: true,
      checkOrderPaid: async () => false, setGroupAddRequest: action,
    })
    bus.emit("group.requested", { groupId: "100", userId: "2", comment: "没有订单", flag: "f1", subType: "add" })
    bus.emit("group.requested", { groupId: "200", userId: "2", comment: "ord-ABC123456", flag: "f2", subType: "add" })
    await vi.waitFor(() => expect(action).toHaveBeenCalledWith("f1", false, "订单号无效或未支付"))
    expect(action).toHaveBeenCalledTimes(1)
    cleanup()
  })

  it("没有生效 QQ 群时不处理任何申请", async () => {
    const action = vi.fn(async () => undefined)
    const cleanup = registerGroupRequestHandler({
      enabledGroupIds: [],
      requireOrder: true,
      autoApprove: true,
      checkOrderPaid: async () => true,
      setGroupAddRequest: action,
    })
    bus.emit("group.requested", {
      groupId: "100",
      userId: "2",
      comment: "ord-ABC123456",
      flag: "f1",
      subType: "add",
    })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(action).not.toHaveBeenCalled()
    cleanup()
  })
})
