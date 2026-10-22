import { describe, expect, it, vi } from "vitest"
import { openDb } from "@/lib/core/db/index"
import { Repo } from "@/lib/core/db/repo"
import {
  MAX_UNBAN_TRIES,
  WHOLE_BAN_PENDING_KEY,
  cancelUnban,
  duePending,
  readPending,
  registerWholeBanExpiry,
  scheduleUnban,
} from "@/lib/conversation/whole-ban"
import type { QqOps } from "@/lib/channels/qq/ops"

function memRepo(): Repo {
  return new Repo(openDb(":memory:"))
}

function fakeOps(failIds: number[] = []) {
  const calls: Array<{ groupId: number; enable: boolean }> = []
  const ops: QqOps = {
    sendGroupMessage: async () => ({ ok: true, retcode: 0 }),
    setGroupNotice: async () => ({ ok: true, retcode: 0 }),
    setGroupWholeBan: async (groupId, enable) => {
      calls.push({ groupId, enable })
      return failIds.includes(groupId)
        ? { ok: false, message: "无权限" }
        : { ok: true, retcode: 0 }
    },
  }
  return { ops, calls }
}

describe("待解禁记录读写", () => {
  it("schedule → read 往返,写入到期时刻", () => {
    const repo = memRepo()
    scheduleUnban(repo, [1, 2], 5_000)
    expect(readPending(repo)).toEqual({
      "1": { at: 5_000, tries: 0 },
      "2": { at: 5_000, tries: 0 },
    })
  })

  it("空群列表不写库(不留下空 JSON 噪音)", () => {
    const repo = memRepo()
    scheduleUnban(repo, [], 5_000)
    expect(repo.getConfigRow(WHOLE_BAN_PENDING_KEY)).toBeUndefined()
  })

  it("重复登记覆盖旧时刻并清零重试计数", () => {
    const repo = memRepo()
    scheduleUnban(repo, [1], 1_000)
    const map = readPending(repo)
    map["1"]!.tries = 3
    repo.setConfigRow(WHOLE_BAN_PENDING_KEY, JSON.stringify(map))
    scheduleUnban(repo, [1], 9_000)
    expect(readPending(repo)["1"]).toEqual({ at: 9_000, tries: 0 })
  })

  it("cancelUnban 只删指定群,其余保留", () => {
    const repo = memRepo()
    scheduleUnban(repo, [1, 2], 5_000)
    cancelUnban(repo, [1])
    expect(Object.keys(readPending(repo))).toEqual(["2"])
  })

  it("cancelUnban 无匹配时不写库", () => {
    const repo = memRepo()
    scheduleUnban(repo, [1], 5_000)
    const before = repo.getConfigRow(WHOLE_BAN_PENDING_KEY)
    cancelUnban(repo, [42])
    expect(repo.getConfigRow(WHOLE_BAN_PENDING_KEY)).toBe(before)
  })

  it("值损坏/非法群号一律当空,不抛", () => {
    const repo = memRepo()
    for (const bad of [
      "not json",
      "[]",
      '"str"',
      '{"abc":{"at":1}}',
      '{"0":{"at":1}}',
      '{"1":{}}',
      '{"1":{"at":"soon"}}',
    ]) {
      repo.setConfigRow(WHOLE_BAN_PENDING_KEY, bad)
      expect(readPending(repo), bad).toEqual({})
    }
  })

  it("tries 非法值归零而不是丢记录", () => {
    const repo = memRepo()
    repo.setConfigRow(
      WHOLE_BAN_PENDING_KEY,
      JSON.stringify({ "7": { at: 100, tries: -1 } })
    )
    expect(readPending(repo)["7"]).toEqual({ at: 100, tries: 0 })
  })
})

describe("duePending", () => {
  it("只取已到期,按到期时刻升序", () => {
    const map = {
      "3": { at: 300, tries: 0 },
      "1": { at: 100, tries: 0 },
      "2": { at: 900, tries: 0 },
    }
    expect(duePending(map, 300).map((d) => d.groupId)).toEqual([1, 3])
    expect(duePending(map, 0)).toEqual([])
    expect(duePending(map, 1_000).map((d) => d.groupId)).toEqual([1, 3, 2])
  })

  it("空表 → 空", () => {
    expect(duePending({}, 1)).toEqual([])
  })
})

describe("registerWholeBanExpiry", () => {
  it("注册时立即扫一次:补上重启前欠下的解禁", async () => {
    const repo = memRepo()
    scheduleUnban(repo, [1, 2], 1_000)
    const { ops, calls } = fakeOps()
    const stop = registerWholeBanExpiry({
      repo,
      qqOps: () => ops,
      now: () => 2_000,
    })
    await vi.waitFor(() => expect(calls.length).toBe(2))
    stop()
    expect(calls).toEqual([
      { groupId: 1, enable: false },
      { groupId: 2, enable: false },
    ])
    // 成功解禁后记录清空
    expect(readPending(repo)).toEqual({})
  })

  it("未到期不解禁", async () => {
    const repo = memRepo()
    scheduleUnban(repo, [1], 10_000)
    const { ops, calls } = fakeOps()
    const stop = registerWholeBanExpiry({
      repo,
      qqOps: () => ops,
      now: () => 1_000,
    })
    await new Promise((r) => setTimeout(r, 30))
    stop()
    expect(calls).toEqual([])
    expect(Object.keys(readPending(repo))).toEqual(["1"])
  })

  it("通道未就绪时保留记录,下轮再试", async () => {
    const repo = memRepo()
    scheduleUnban(repo, [1], 1_000)
    const stop = registerWholeBanExpiry({
      repo,
      qqOps: () => null,
      now: () => 2_000,
    })
    await new Promise((r) => setTimeout(r, 30))
    stop()
    expect(Object.keys(readPending(repo))).toEqual(["1"])
  })

  it("解禁失败累加 tries 并保留记录", async () => {
    const repo = memRepo()
    scheduleUnban(repo, [1], 1_000)
    const { ops } = fakeOps([1])
    const stop = registerWholeBanExpiry({
      repo,
      qqOps: () => ops,
      now: () => 2_000,
    })
    await vi.waitFor(() => expect(readPending(repo)["1"]?.tries).toBe(1))
    stop()
    expect(readPending(repo)["1"]!.at).toBe(1_000)
  })

  it("连续失败到上限后放弃,不再无限重试", async () => {
    const repo = memRepo()
    const { ops, calls } = fakeOps([1])
    // 直接把计数推到「再失败一次就放弃」
    repo.setConfigRow(
      WHOLE_BAN_PENDING_KEY,
      JSON.stringify({ "1": { at: 1_000, tries: MAX_UNBAN_TRIES - 1 } })
    )
    const stop = registerWholeBanExpiry({
      repo,
      qqOps: () => ops,
      now: () => 2_000,
    })
    await vi.waitFor(() => expect(readPending(repo)["1"]).toBeUndefined())
    stop()
    expect(calls).toEqual([{ groupId: 1, enable: false }])
  })

  it("teardown 后不再扫描", async () => {
    const repo = memRepo()
    const { ops, calls } = fakeOps()
    const stop = registerWholeBanExpiry({
      repo,
      qqOps: () => ops,
      now: () => 2_000,
      scanMs: 10,
    })
    stop()
    scheduleUnban(repo, [1], 1_000)
    await new Promise((r) => setTimeout(r, 60))
    expect(calls).toEqual([])
  })
})
