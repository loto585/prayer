import { describe, expect, it, vi } from "vitest"
import {
  broadcastMessage,
  formatOpSummary,
  normalizeGroupIds,
  publishNotice,
  qqBroadcastTargets,
  resolveQqOps,
  setWholeBan,
  type QqOps,
} from "@/lib/channels/qq/ops"

function fakeOps(failIds: number[] = [], throwIds: number[] = []) {
  const calls: Array<{ op: string; groupId: number; args: unknown[] }> = []
  const ops: QqOps = {
    async sendGroupMessage(groupId, text, mentionAll) {
      calls.push({ op: "msg", groupId, args: [text, mentionAll] })
      if (throwIds.includes(groupId)) throw new Error("boom")
      return failIds.includes(groupId)
        ? { ok: false, message: "no perm" }
        : { ok: true, retcode: 0 }
    },
    async setGroupNotice(groupId, content, pinned) {
      calls.push({ op: "notice", groupId, args: [content, pinned] })
      return { ok: true, retcode: 0 }
    },
    async setGroupWholeBan(groupId, enable) {
      calls.push({ op: "ban", groupId, args: [enable] })
      return failIds.includes(groupId)
        ? { ok: false, message: "no perm" }
        : { ok: true, retcode: 0 }
    },
  }
  return { ops, calls }
}

describe("normalizeGroupIds", () => {
  it("转整数、去非法、去重,保持顺序", () => {
    expect(normalizeGroupIds(["2", 1, " 2 ", "x", "-1", "0", "3.5"])).toEqual([
      2, 1,
    ])
  })
})

describe("qqBroadcastTargets", () => {
  it("只取 QQ 生效群,剔除管理群,去重", () => {
    const targets = qqBroadcastTargets(
      [
        { channel: "qq", chatId: "1" },
        { channel: "tg", chatId: "-100" },
        { channel: "qq", chatId: "999" },
        { channel: "qq", chatId: "1" },
        { channel: "qq", chatId: "2" },
      ],
      { channel: "qq", chatId: "999" }
    )
    expect(targets).toEqual([1, 2])
  })

  it("无管理面时不剔除", () => {
    expect(
      qqBroadcastTargets([{ channel: "qq", chatId: "999" }], null)
    ).toEqual([999])
  })
})

describe("broadcastMessage / publishNotice", () => {
  it("逐群串行调用,透传 mentionAll,汇总成功数", async () => {
    const { ops, calls } = fakeOps()
    const s = await broadcastMessage(ops, [1, 2], "hi", true)
    expect(calls).toEqual([
      { op: "msg", groupId: 1, args: ["hi", true] },
      { op: "msg", groupId: 2, args: ["hi", true] },
    ])
    expect(s).toEqual({
      results: [
        { groupId: 1, ok: true },
        { groupId: 2, ok: true },
      ],
      succeeded: 2,
      failed: 0,
    })
  })

  it("图片透传到每个群", async () => {
    const send = vi.fn(async () => ({ ok: true, retcode: 0 }))
    const ops: QqOps = {
      sendGroupMessage: send,
      setGroupNotice: vi.fn(),
      setGroupWholeBan: vi.fn(),
    }
    const img = { data: "AAAA", mediaType: "image/png" }
    await broadcastMessage(ops, [1, 2], "", false, [img])
    expect(send.mock.calls).toEqual([
      [1, "", false, [img]],
      [2, "", false, [img]],
    ])
  })

  it("单群失败/抛错都收进结果,不中断后续群", async () => {
    const { ops } = fakeOps([2], [3])
    const s = await broadcastMessage(ops, [1, 2, 3, 4], "x")
    expect(s.succeeded).toBe(2)
    expect(s.failed).toBe(2)
    expect(s.results[1]).toEqual({ groupId: 2, ok: false, error: "no perm" })
    expect(s.results[2]).toEqual({ groupId: 3, ok: false, error: "boom" })
    expect(s.results[3]).toEqual({ groupId: 4, ok: true })
  })

  it("公告透传 pinned,缺省不置顶", async () => {
    const { ops, calls } = fakeOps()
    await publishNotice(ops, [9], "n")
    await publishNotice(ops, [9], "n", true)
    expect(calls.map((c) => c.args[1])).toEqual([false, true])
  })

  it("全员禁言透传 enable,失败文案区分禁言/解禁", async () => {
    const { ops, calls } = fakeOps([2])
    const on = await setWholeBan(ops, [1, 2], true)
    expect(calls).toEqual([
      { op: "ban", groupId: 1, args: [true] },
      { op: "ban", groupId: 2, args: [true] },
    ])
    expect(on.results[1]).toEqual({ groupId: 2, ok: false, error: "no perm" })

    const { ops: ops2 } = fakeOps()
    const off = await setWholeBan(ops2, [1], false)
    expect(off).toEqual({
      results: [{ groupId: 1, ok: true }],
      succeeded: 1,
      failed: 0,
    })
  })
})

describe("formatOpSummary", () => {
  it("全部成功一行总览", () => {
    expect(
      formatOpSummary("群发", {
        results: [{ groupId: 1, ok: true }],
        succeeded: 1,
        failed: 0,
      })
    ).toBe("群发完成:成功 1 / 共 1")
  })

  it("有失败时逐群列原因", () => {
    const text = formatOpSummary("公告", {
      results: [
        { groupId: 1, ok: true },
        { groupId: 2, ok: false, error: "no perm" },
      ],
      succeeded: 1,
      failed: 1,
    })
    expect(text).toContain("公告完成:成功 1 / 共 2")
    expect(text).toContain("失败 1 个")
    expect(text).toContain("- 2:no perm")
  })
})

describe("resolveQqOps", () => {
  it("三个方法齐全才视为可用", () => {
    expect(resolveQqOps(undefined)).toBeNull()
    expect(resolveQqOps(null)).toBeNull()
    expect(resolveQqOps({ sendGroupMessage: vi.fn() })).toBeNull()
    expect(
      resolveQqOps({ sendGroupMessage: vi.fn(), setGroupNotice: vi.fn() })
    ).toBeNull()
    const full = {
      sendGroupMessage: vi.fn(),
      setGroupNotice: vi.fn(),
      setGroupWholeBan: vi.fn(),
    }
    expect(resolveQqOps(full)).toBe(full)
  })
})
