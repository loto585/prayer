import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { GET } from "@/app/api/logs/route"
import { logger } from "@/lib/core/logger"

beforeEach(() => logger.clear())
afterEach(() => logger.clear())

describe("运行日志接口", () => {
  it("每次请求读取新日志，不缓存响应或重复传输相同原文", async () => {
    const first = await GET()
    expect(first.headers.get("Cache-Control")).toBe("no-store")
    expect(await first.json()).toEqual({ ok: true, data: [] })

    logger.emit({ level: "warn", msg: "连接断开", raw: "连接断开" })
    const second = await GET()
    const body = await second.json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0].msg).toBe("连接断开")
    expect(body.data[0]).not.toHaveProperty("raw")
    expect(logger.tail()[0].raw).toBe("连接断开")
  })

  it("保留错误详情及会话信息，供页面展开和搜索", async () => {
    logger.error("模型请求失败", {
      scope: "agent",
      channel: "qq",
      chatId: "123",
      sessionKey: "qq:123:456",
      raw: "request failed\nstack trace",
    })
    const body = await (await GET()).json()
    expect(body.data[0]).toMatchObject({
      level: "error",
      scope: "agent",
      channel: "qq",
      chatId: "123",
      sessionKey: "qq:123:456",
      raw: "request failed\nstack trace",
    })
  })
})
