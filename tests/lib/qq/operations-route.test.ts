import { describe, expect, it } from "vitest"
import { NextRequest } from "next/server"
import { POST as broadcast } from "@/app/api/qq/broadcast/route"
import { POST as notice } from "@/app/api/qq/notice/route"

function request(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("QQ 运维 API", () => {
  it("拒绝没有群号或内容的群发请求", async () => {
    const response = await broadcast(
      request("/api/qq/broadcast", { text: "x" })
    )
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ ok: false })
  })

  it("QQ 通道未启动时返回 503", async () => {
    const response = await broadcast(
      request("/api/qq/broadcast", {
        groupIds: ["123"],
        text: "x",
        mentionAll: true,
      })
    )
    expect(response.status).toBe(503)
  })

  it("拒绝没有群号或内容的公告请求", async () => {
    const response = await notice(request("/api/qq/notice", { content: "x" }))
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ ok: false })
  })
})
