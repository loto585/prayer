import { describe, it, expect, beforeEach, vi } from "vitest"
import { openDb } from "@/lib/db/index"
import { Repo } from "@/lib/db/repo"
import { bus } from "@/lib/bus"
import {
  registerGateway,
  isAtTrigger,
  isIdentityQuestion,
  identityReply,
} from "@/lib/agent/gateway"
import { readPending } from "@/lib/agent/whole-ban"
import type { OneBotApiResult } from "@/lib/channels/qq/client"
import type {
  ActionSend,
  ErrorOccurred,
  HandoffRequested,
  HandoffResumed,
  IncomingMessage,
  QualifiedMessage,
} from "@/lib/events"

let repo: Repo
const BOT = "555"
const ADMIN = "888"
const SK = "qq:1:2"

function qqMsg(
  over: Partial<IncomingMessage> &
    Pick<IncomingMessage, "messageId" | "rawText">
): IncomingMessage {
  return {
    channel: "qq" as const,
    chatId: "1",
    userId: "2",
    atList: [BOT],
    ...over,
  }
}

beforeEach(() => {
  bus.removeAllListeners()
  repo = new Repo(openDb(":memory:"))
  registerGateway({
    repo,
    botQQ: 555,
    extraAtQQs: [888],
    adminSurface: { channel: "qq" as const, chatId: "999" },
    enabledChats: [{ channel: "qq" as const, chatId: "1" }],
    supportUrl: "https://example.com",
  })
})

function collectQualified(): Promise<QualifiedMessage> {
  return new Promise((res) => bus.once("message.qualified", res))
}

describe("isAtTrigger", () => {
  it("命中 botQQ", () => {
    expect(isAtTrigger([BOT], BOT, [])).toBe(true)
  })
  it("命中 extraAtQQs", () => {
    expect(isAtTrigger([ADMIN], BOT, [ADMIN])).toBe(true)
  })
  it("都不命中", () => {
    expect(isAtTrigger(["123"], BOT, [ADMIN])).toBe(false)
  })
  it("忽略 0 / 负数", () => {
    expect(isAtTrigger(["0"], BOT, ["0", "-1"])).toBe(false)
  })
})

describe("identity reply", () => {
  it("识别自我介绍和底层身份追问", () => {
    expect(isIdentityQuestion("介绍一下你自己")).toBe(true)
    expect(isIdentityQuestion("为什么你自称 Codex，不是客服")).toBe(true)
    expect(isIdentityQuestion("怎么配置价格")).toBe(false)
  })

  it("剥掉 @ 前缀后仍能识别(QQ 富文本常态)", () => {
    expect(isIdentityQuestion("@Eric 介绍一下自己")).toBe(true)
    expect(isIdentityQuestion("@Eric 你是谁")).toBe(true)
    expect(isIdentityQuestion("@12345  你是什么模型")).toBe(true)
  })

  it("覆盖常见口语变体", () => {
    expect(isIdentityQuestion("介绍一下自己")).toBe(true)
    expect(isIdentityQuestion("介绍下你自己")).toBe(true)
    expect(isIdentityQuestion("自我介绍一下")).toBe(true)
    expect(isIdentityQuestion("你是干嘛的")).toBe(true)
    expect(isIdentityQuestion("你是机器人吗")).toBe(true)
  })

  it("不误伤真实业务咨询", () => {
    expect(isIdentityQuestion("你们支持哪些模型")).toBe(false)
    expect(isIdentityQuestion("你能做什么价格查询")).toBe(false)
    expect(isIdentityQuestion("你是谁开发的模型怎么计费")).toBe(false)
    expect(isIdentityQuestion("介绍一下你们的套餐价格")).toBe(false)
  })

  it("使用品牌配置生成固定客服身份", () => {
    expect(
      identityReply({ name: "Acme", description: "Acme 产品支持平台" })
    ).toContain("Acme 官方客服机器人")
    expect(
      identityReply({ name: "Acme", description: "Acme 产品支持平台" })
    ).not.toContain("Codex")
  })
})

describe("管理面群发/公告指令", () => {
  type Call = {
    op: "msg" | "notice" | "ban"
    groupId: number
    text: string
    flag: boolean
  }

  function fakeOps(failIds: number[] = []) {
    const calls: Call[] = []
    // 显式标注返回类型:否则 TS 只按首个 return 分支推断,失败分支的 message 会被判为多余
    type Res = Promise<OneBotApiResult>
    const ok = (): OneBotApiResult => ({ ok: true, retcode: 0 })
    return {
      calls,
      sendGroupMessage: vi.fn(
        async (groupId: number, text: string, mentionAll = false): Res => {
          calls.push({ op: "msg", groupId, text, flag: mentionAll })
          return failIds.includes(groupId)
            ? { ok: false, message: "无权限" }
            : ok()
        }
      ),
      setGroupNotice: vi.fn(
        async (groupId: number, content: string, pinned = true): Res => {
          calls.push({ op: "notice", groupId, text: content, flag: pinned })
          return ok()
        }
      ),
      setGroupWholeBan: vi.fn(async (groupId: number, enable: boolean): Res => {
        calls.push({ op: "ban", groupId, text: "", flag: enable })
        return ok()
      }),
    }
  }

  function setup(ops: ReturnType<typeof fakeOps> | null) {
    bus.removeAllListeners("message.received")
    registerGateway({
      repo,
      botQQ: 555,
      adminSurface: { channel: "qq" as const, chatId: "999" },
      enabledChats: [
        { channel: "qq" as const, chatId: "1" },
        { channel: "qq" as const, chatId: "2" },
        { channel: "tg" as const, chatId: "-100" },
        // 管理群残留在白名单里(写路径不校验互斥)也必须被剔除
        { channel: "qq" as const, chatId: "999" },
      ],
      qqOps: () => ops,
    })
  }

  function adminMsg(
    rawText: string,
    messageId: string,
    extra: Partial<IncomingMessage> = {}
  ): IncomingMessage {
    return {
      channel: "qq" as const,
      chatId: "999",
      userId: "7",
      messageId,
      rawText,
      atList: [],
      ...extra,
    }
  }

  const nextSend = () =>
    new Promise<ActionSend>((res) => bus.once("action.send", res))

  it("/群发 -all → 只发 QQ 生效群(跳过 TG 与管理群),带 @全体,回执到管理群", async () => {
    const ops = fakeOps()
    setup(ops)
    const p = nextSend()
    bus.emit("message.received", adminMsg("/群发 -all 今晚维护", "b1"))
    const a = await p
    expect(ops.calls).toEqual([
      { op: "msg", groupId: 1, text: "今晚维护", flag: true },
      { op: "msg", groupId: 2, text: "今晚维护", flag: true },
    ])
    expect(a.channel).toBe("qq")
    expect(a.chatId).toBe("999")
    expect(a.replyToId).toBe("b1")
    expect(a.text).toContain("群发完成:成功 2 / 共 2")
  })

  it("无旗标 → 不 @全体;QQ 原生 @全体成员 段(atAll)等价于 -all", async () => {
    const ops = fakeOps()
    setup(ops)
    let p = nextSend()
    bus.emit("message.received", adminMsg("/群发 普通通知", "b2"))
    await p
    expect(ops.calls.map((c) => c.flag)).toEqual([false, false])

    ops.calls.length = 0
    p = nextSend()
    bus.emit(
      "message.received",
      adminMsg("/群发  原生艾特", "b3", { atAll: true })
    )
    await p
    expect(ops.calls.map((c) => c.flag)).toEqual([true, true])
    expect(ops.calls[0]!.text).toBe("原生艾特")
  })

  it("/公告 缺省不置顶;/公告 -pin → 置顶", async () => {
    const ops = fakeOps()
    setup(ops)
    let p = nextSend()
    bus.emit("message.received", adminMsg("/公告 请勿发外链", "n1"))
    let a = await p
    expect(ops.calls).toEqual([
      { op: "notice", groupId: 1, text: "请勿发外链", flag: false },
      { op: "notice", groupId: 2, text: "请勿发外链", flag: false },
    ])
    expect(a.text).toContain("公告完成:成功 2 / 共 2")

    ops.calls.length = 0
    p = nextSend()
    bus.emit("message.received", adminMsg("/公告 -pin 置顶通知", "n2"))
    a = await p
    expect(ops.calls.map((c) => c.flag)).toEqual([true, true])
    expect(ops.calls[0]!.text).toBe("置顶通知")
  })

  it("逐群失败写进回执,不影响其它群", async () => {
    const ops = fakeOps([2])
    setup(ops)
    const p = nextSend()
    bus.emit("message.received", adminMsg("/群发 x", "f1"))
    const a = await p
    expect(ops.calls).toHaveLength(2)
    expect(a.text).toContain("群发完成:成功 1 / 共 2")
    expect(a.text).toContain("失败 1 个")
    expect(a.text).toContain("- 2:无权限")
  })

  it("同一 messageId 重放(WS 重连)只群发一次", async () => {
    const ops = fakeOps()
    setup(ops)
    const p = nextSend()
    const m = adminMsg("/群发 别重复", "dup")
    bus.emit("message.received", m)
    bus.emit("message.received", m)
    await p
    await new Promise((r) => setTimeout(r, 30))
    // 2 个目标群 × 1 次 = 2;重放若未去重会是 4
    expect(ops.sendGroupMessage).toHaveBeenCalledTimes(2)
  })

  it("只有指令名没正文 → 回该指令用法,不发送", async () => {
    const ops = fakeOps()
    setup(ops)
    const p = nextSend()
    bus.emit("message.received", adminMsg("/群发", "u1"))
    const a = await p
    expect(a.text).toContain("用法")
    expect(a.text).toContain("/群发")
    expect(ops.sendGroupMessage).not.toHaveBeenCalled()
  })

  it("QQ 通道未连接 → 回提示,不抛", async () => {
    setup(null)
    const p = nextSend()
    bus.emit("message.received", adminMsg("/公告 x", "nc1"))
    const a = await p
    expect(a.text).toContain("未连接")
  })

  it("全角 ／ 前缀也识别", async () => {
    const ops = fakeOps()
    setup(ops)
    const p = nextSend()
    bus.emit("message.received", adminMsg("／群发 全角也行", "fw1"))
    await p
    expect(ops.calls.map((c) => c.text)).toEqual(["全角也行", "全角也行"])
  })

  it("管理面指令绝不进 message.qualified", async () => {
    const ops = fakeOps()
    setup(ops)
    const qualified = vi.fn()
    bus.on("message.qualified", qualified)
    const p = nextSend()
    bus.emit("message.received", adminMsg("/群发 x", "q1"))
    await p
    expect(qualified).not.toHaveBeenCalled()
  })

  it("/禁言 -on → 全部生效 QQ 群开全员禁言;/禁言 -off 解除", async () => {
    const ops = fakeOps()
    setup(ops)
    let p = nextSend()
    bus.emit("message.received", adminMsg("/禁言 -on", "m1"))
    let a = await p
    expect(ops.calls).toEqual([
      { op: "ban", groupId: 1, text: "", flag: true },
      { op: "ban", groupId: 2, text: "", flag: true },
    ])
    expect(a.text).toContain("禁言完成:成功 2 / 共 2")

    ops.calls.length = 0
    p = nextSend()
    bus.emit("message.received", adminMsg("/禁言 -off", "m2"))
    a = await p
    expect(ops.calls.map((c) => c.flag)).toEqual([false, false])
    expect(a.text).toContain("解禁完成:成功 2 / 共 2")
  })

  it("/禁言 -g <群号> 只操作该群;群号不在生效会话 → 拒绝", async () => {
    const ops = fakeOps()
    setup(ops)
    let p = nextSend()
    bus.emit("message.received", adminMsg("/禁言 -on -g 2", "m3"))
    let a = await p
    expect(ops.calls).toEqual([{ op: "ban", groupId: 2, text: "", flag: true }])
    expect(a.text).toContain("成功 1 / 共 1")

    ops.calls.length = 0
    p = nextSend()
    // 管理群自身与白名单外的群都不能被 -g 选中
    bus.emit("message.received", adminMsg("/禁言 -on -g 999", "m4"))
    a = await p
    expect(a.text).toContain("不在生效会话")
    expect(ops.calls).toEqual([])
  })

  it("/禁言 缺 -on/-off、两个都给、-g 没跟方向 → 回用法,不执行", async () => {
    const ops = fakeOps()
    setup(ops)
    for (const [text, id] of [
      ["/禁言", "m5"],
      ["/禁言 -on -off", "m6"],
      ["/禁言 -g 1", "m7"],
    ] as const) {
      const p = nextSend()
      bus.emit("message.received", adminMsg(text, id))
      const a = await p
      expect(a.text).toContain("用法")
    }
    expect(ops.setGroupWholeBan).not.toHaveBeenCalled()
  })

  it("旧的 ! 前缀 → 回管理用法(迁移提示),不执行", async () => {
    const ops = fakeOps()
    setup(ops)
    const p = nextSend()
    bus.emit("message.received", adminMsg("!群发 旧写法", "old1"))
    const a = await p
    expect(a.text).toContain("/群发")
    expect(ops.sendGroupMessage).not.toHaveBeenCalled()
  })

  describe("-t 限时禁言", () => {
    const NOW = 1_700_000_000_000

    /** 同 setup,但钉死时钟,便于断言到期时刻;并可让指定群的禁言失败 */
    function setupT(opts: { banFailIds?: number[] } = {}) {
      const ops = fakeOps()
      const base = ops.setGroupWholeBan.getMockImplementation()!
      ops.setGroupWholeBan.mockImplementation(
        async (groupId: number, enable: boolean) => {
          const r = await base(groupId, enable)
          return opts.banFailIds?.includes(groupId)
            ? { ok: false, message: "无权限" }
            : r
        }
      )
      bus.removeAllListeners("message.received")
      registerGateway({
        repo,
        botQQ: 555,
        adminSurface: { channel: "qq" as const, chatId: "999" },
        enabledChats: [
          { channel: "qq" as const, chatId: "1" },
          { channel: "qq" as const, chatId: "2" },
        ],
        qqOps: () => ops,
        now: () => NOW,
      })
      return ops
    }

    it("/群发 -t 10m → 先禁言再发,登记到期,回执两行", async () => {
      const ops = setupT()
      const p = nextSend()
      bus.emit("message.received", adminMsg("/群发 -t 10m 今晚维护", "t1"))
      const a = await p
      expect(ops.calls).toEqual([
        { op: "ban", groupId: 1, text: "", flag: true },
        { op: "ban", groupId: 2, text: "", flag: true },
        { op: "msg", groupId: 1, text: "今晚维护", flag: false },
        { op: "msg", groupId: 2, text: "今晚维护", flag: false },
      ])
      expect(a.text).toContain("群发完成:成功 2 / 共 2")
      expect(a.text).toContain("禁言完成:成功 2 / 共 2")
      expect(a.text).toContain("10 分钟")
      expect(readPending(repo)).toEqual({
        "1": { at: NOW + 600_000, tries: 0 },
        "2": { at: NOW + 600_000, tries: 0 },
      })
    })

    it("不带 -t → 不禁言、不登记", async () => {
      const ops = setupT()
      const p = nextSend()
      bus.emit("message.received", adminMsg("/群发 今晚维护", "t2"))
      const a = await p
      expect(ops.setGroupWholeBan).not.toHaveBeenCalled()
      expect(a.text).not.toContain("禁言")
      expect(readPending(repo)).toEqual({})
    })

    it("/公告 -pin -t 1h → 禁言在前,公告置顶", async () => {
      const ops = setupT()
      const p = nextSend()
      bus.emit("message.received", adminMsg("/公告 -pin -t 1h 注意", "t3"))
      await p
      expect(ops.calls.map((c) => c.op)).toEqual([
        "ban",
        "ban",
        "notice",
        "notice",
      ])
      expect(ops.calls[2]).toEqual({
        op: "notice",
        groupId: 1,
        text: "注意",
        flag: true,
      })
      expect(readPending(repo)["1"]!.at).toBe(NOW + 3_600_000)
    })

    it("-g 与 -t 同用 → 只禁、只发、只登记那一个群", async () => {
      const ops = setupT()
      const p = nextSend()
      bus.emit("message.received", adminMsg("/群发 -g 2 -t 30s x", "t4"))
      await p
      expect(ops.calls).toEqual([
        { op: "ban", groupId: 2, text: "", flag: true },
        { op: "msg", groupId: 2, text: "x", flag: false },
      ])
      expect(Object.keys(readPending(repo))).toEqual(["2"])
    })

    it("/禁言 -on -t 2h → 只调一次禁言,登记到期,回执单行", async () => {
      const ops = setupT()
      const p = nextSend()
      bus.emit("message.received", adminMsg("/禁言 -on -t 2h", "t5"))
      const a = await p
      expect(ops.setGroupWholeBan).toHaveBeenCalledTimes(2) // 两个群各一次
      expect(a.text.split("禁言完成").length - 1).toBe(1)
      expect(readPending(repo)["2"]!.at).toBe(NOW + 7_200_000)
    })

    it("永久禁言 / 手动解禁 都会撤销待解禁记录", async () => {
      setupT()
      let p = nextSend()
      bus.emit("message.received", adminMsg("/禁言 -on -t 2h", "t6"))
      await p
      expect(Object.keys(readPending(repo))).toEqual(["1", "2"])

      p = nextSend()
      bus.emit("message.received", adminMsg("/禁言 -on -g 1", "t7"))
      await p
      expect(Object.keys(readPending(repo))).toEqual(["2"])

      p = nextSend()
      bus.emit("message.received", adminMsg("/禁言 -off", "t8"))
      await p
      expect(readPending(repo)).toEqual({})
    })

    it("禁言失败的群不登记到期,消息照发", async () => {
      const ops = setupT({ banFailIds: [1] })
      const p = nextSend()
      bus.emit("message.received", adminMsg("/群发 -t 10m x", "t9"))
      const a = await p
      expect(ops.calls.filter((c) => c.op === "msg")).toHaveLength(2)
      expect(a.text).toContain("群发完成:成功 2 / 共 2")
      expect(a.text).toContain("禁言完成:成功 1 / 共 2")
      expect(a.text).toContain("- 1:无权限")
      expect(Object.keys(readPending(repo))).toEqual(["2"])
    })

    it("-t 非法 → 回用法,不禁言不发送", async () => {
      const ops = setupT()
      const p = nextSend()
      bus.emit("message.received", adminMsg("/群发 -t 5s x", "t10"))
      const a = await p
      expect(a.text).toContain("用法")
      expect(ops.calls).toEqual([])
    })
  })
})

describe("管理面公告起草(/写公告 / /发布)", () => {
  function opsStub() {
    const calls: Array<{ groupId: number; content: string; pinned: boolean }> =
      []
    return {
      calls,
      setGroupNotice: vi.fn(
        async (groupId: number, content: string, pinned = true) => {
          calls.push({ groupId, content, pinned })
          return { ok: true, retcode: 0 }
        }
      ),
      sendGroupMessage: vi.fn(async () => ({ ok: true, retcode: 0 })),
      setGroupWholeBan: vi.fn(async () => ({ ok: true, retcode: 0 })),
    }
  }

  function setup(opts: {
    ops?: ReturnType<typeof opsStub> | null
    writer?: ((b: string) => Promise<string>) | null
    now?: () => number
  }) {
    bus.removeAllListeners()
    registerGateway({
      repo,
      botQQ: 555,
      adminSurface: { channel: "qq" as const, chatId: "999" },
      enabledChats: [
        { channel: "qq" as const, chatId: "1" },
        { channel: "qq" as const, chatId: "2" },
      ],
      qqOps: () => opts.ops ?? null,
      ...(opts.writer === null
        ? {}
        : { draftAnnouncement: opts.writer ?? (async () => "【公告】x") }),
      ...(opts.now ? { now: opts.now } : {}),
    })
  }

  function adminMsg(rawText: string, messageId: string): IncomingMessage {
    return {
      channel: "qq" as const,
      chatId: "999",
      userId: "7",
      messageId,
      rawText,
      atList: [],
    }
  }

  /** 收集接下来 n 条 action.send(起草会先 ACK 再回草稿) */
  function collect(n: number): Promise<ActionSend[]> {
    return new Promise((res) => {
      const out: ActionSend[] = []
      const on = (a: ActionSend) => {
        out.push(a)
        if (out.length >= n) {
          bus.off("action.send", on)
          res(out)
        }
      }
      bus.on("action.send", on)
    })
  }

  it("/写公告 → 先 ACK 再回草稿,且不发布", async () => {
    const ops = opsStub()
    const writer = vi.fn(
      async () => "【维护通知】\n今晚维护\nRightCode团队 2026 年 10 月"
    )
    setup({ ops, writer })
    const p = collect(2)
    bus.emit("message.received", adminMsg("/写公告 今晚维护", "d1"))
    const [ack, draft] = await p
    expect(ack!.text).toContain("起草中")
    expect(draft!.chatId).toBe("999")
    expect(draft!.replyToId).toBe("d1")
    expect(draft!.text).toContain("【维护通知】")
    expect(draft!.text).toContain("RightCode团队 2026 年 10 月")
    expect(draft!.text).toContain("/发布")
    expect(writer).toHaveBeenCalledWith("今晚维护")
    // 起草绝不发送
    expect(ops.setGroupNotice).not.toHaveBeenCalled()
  })

  it("/发布 → 发布草稿(缺省不置顶),且草稿只能用一次", async () => {
    const ops = opsStub()
    setup({ ops, writer: async () => "【公告】正文" })
    let p = collect(2)
    bus.emit("message.received", adminMsg("/写公告 要点", "d1"))
    await p

    p = collect(1)
    bus.emit("message.received", adminMsg("/发布", "p1"))
    const [receipt] = await p
    expect(ops.calls).toEqual([
      { groupId: 1, content: "【公告】正文", pinned: false },
      { groupId: 2, content: "【公告】正文", pinned: false },
    ])
    expect(receipt!.text).toContain("公告完成:成功 2 / 共 2")

    // 二次发布:草稿已消费 → 回用法,不再发
    ops.calls.length = 0
    p = collect(1)
    bus.emit("message.received", adminMsg("/发布", "p2"))
    const [again] = await p
    expect(again!.text).toContain("用法")
    expect(ops.calls).toEqual([])
  })

  it("/发布 -pin → pinned=true", async () => {
    const ops = opsStub()
    setup({ ops, writer: async () => "【公告】临时" })
    let p = collect(2)
    bus.emit("message.received", adminMsg("/写公告 要点", "d1"))
    await p

    p = collect(1)
    bus.emit("message.received", adminMsg("/发布 -pin", "p1"))
    await p
    expect(ops.calls.map((c) => c.pinned)).toEqual([true, true])
  })

  it("/发布 -t 10m → 先禁言再发布草稿,登记到期", async () => {
    const ops = opsStub()
    const order: string[] = []
    ops.setGroupWholeBan.mockImplementation(async () => {
      order.push("ban")
      return { ok: true, retcode: 0 }
    })
    ops.setGroupNotice.mockImplementation(async (groupId, content, pinned) => {
      order.push("notice")
      ops.calls.push({ groupId, content, pinned })
      return { ok: true, retcode: 0 }
    })
    setup({ ops, writer: async () => "【公告】限时" })
    let p = collect(2)
    bus.emit("message.received", adminMsg("/写公告 要点", "d1"))
    await p

    p = collect(1)
    bus.emit("message.received", adminMsg("/发布 -pin -t 10m", "p1"))
    const [a] = await p
    expect(order).toEqual(["ban", "ban", "notice", "notice"])
    expect(ops.calls.map((c) => c.pinned)).toEqual([true, true])
    expect(a!.text).toContain("公告完成:成功 2 / 共 2")
    expect(a!.text).toContain("禁言完成:成功 2 / 共 2")
    expect(Object.keys(readPending(repo))).toEqual(["1", "2"])
  })

  it("没有草稿时 /发布 → 回用法,不发送", async () => {
    const ops = opsStub()
    setup({ ops })
    const p = collect(1)
    bus.emit("message.received", adminMsg("/发布", "p1"))
    const [a] = await p
    expect(a!.text).toContain("用法")
    expect(ops.setGroupNotice).not.toHaveBeenCalled()
  })

  it("草稿过期(>10 分钟)→ 提示重新起草,不发送", async () => {
    const ops = opsStub()
    let clock = 1_000_000
    setup({ ops, writer: async () => "【公告】旧草稿", now: () => clock })
    const p = collect(2)
    bus.emit("message.received", adminMsg("/写公告 要点", "d1"))
    await p

    clock += 11 * 60_000
    const q = collect(1)
    bus.emit("message.received", adminMsg("/发布", "p1"))
    const [a] = await q
    expect(a!.text).toContain("重新起草")
    expect(ops.setGroupNotice).not.toHaveBeenCalled()
  })

  it("起草抛错 → 回执失败原因,不抛出", async () => {
    setup({
      ops: opsStub(),
      writer: async () => {
        throw new Error("模型超时")
      },
    })
    const p = collect(2)
    bus.emit("message.received", adminMsg("/写公告 要点", "d1"))
    const [, a] = await p
    expect(a!.text).toContain("起草失败")
    expect(a!.text).toContain("模型超时")
  })

  it("未注入 writer → 回提示,不抛出", async () => {
    setup({ ops: opsStub(), writer: null })
    const p = collect(1)
    bus.emit("message.received", adminMsg("/写公告 要点", "d1"))
    const [a] = await p
    expect(a!.text).toContain("起草功能未启用")
  })

  it("/写公告 缺要点 → 回用法,不调模型", async () => {
    const writer = vi.fn(async () => "x")
    setup({ ops: opsStub(), writer })
    const p = collect(1)
    bus.emit("message.received", adminMsg("/写公告", "d1"))
    const [a] = await p
    expect(a!.text).toContain("用法")
    expect(writer).not.toHaveBeenCalled()
  })

  it("重放同一条 /写公告 只起草一次", async () => {
    const writer = vi.fn(async () => "【公告】x")
    setup({ ops: opsStub(), writer })
    const p = collect(2)
    const m = adminMsg("/写公告 要点", "dup")
    bus.emit("message.received", m)
    bus.emit("message.received", m)
    await p
    await new Promise((r) => setTimeout(r, 30))
    expect(writer).toHaveBeenCalledTimes(1)
  })

  it("管理面不用 qqOps 也能起草(只回草稿)", async () => {
    const writer = vi.fn(async () => "【公告】x")
    setup({ ops: null, writer })
    const p = collect(2)
    bus.emit("message.received", adminMsg("/写公告 要点", "d1"))
    const [, draft] = await p
    expect(draft!.text).toContain("【公告】x")
  })
})

describe("gateway", () => {
  it("@bot 的群消息 → emit message.qualified,含 sessionKey 与文本", async () => {
    const p = collectQualified()
    bus.emit(
      "message.received",
      qqMsg({ messageId: "10", rawText: "订单在哪", atList: [BOT] })
    )
    const q = await p
    expect(q.sessionKey).toBe(SK)
    expect(q.channel).toBe("qq")
    expect(q.chatId).toBe("1")
    expect(q.userId).toBe("2")
    expect(q.text).toBe("订单在哪")
    expect(q.messageId).toBe("10")
  })

  it("身份问题直接回复客服身份,不进入模型编排", async () => {
    const qualified = vi.fn()
    const send = new Promise<ActionSend>((res) => bus.once("action.send", res))
    bus.on("message.qualified", qualified)
    bus.removeAllListeners("message.received")
    registerGateway({
      repo,
      botQQ: 555,
      adminSurface: { channel: "qq" as const, chatId: "999" },
      enabledChats: [{ channel: "qq" as const, chatId: "1" }],
      brand: { name: "Acme", description: "Acme 产品支持平台" },
    })
    bus.emit(
      "message.received",
      qqMsg({ messageId: "identity-1", rawText: "介绍一下你自己" })
    )
    const a = await send
    expect(a.text).toContain("Acme 官方客服机器人")
    expect(a.text).not.toContain("Codex")
    expect(qualified).not.toHaveBeenCalled()
  })

  it("@额外监听 QQ(群管理)也当作 bot 触发", async () => {
    const p = collectQualified()
    bus.emit(
      "message.received",
      qqMsg({ messageId: "102", rawText: "帮我看看", atList: [ADMIN] })
    )
    const q = await p
    expect(q.sessionKey).toBe(SK)
    expect(q.text).toBe("帮我看看")
  })

  it("写入 lastQuestion 供会话列表预览", async () => {
    const p = collectQualified()
    bus.emit(
      "message.received",
      qqMsg({ messageId: "101", rawText: "多少钱", atList: [BOT] })
    )
    await p
    const s = repo.listSessions().find((x) => x.key === SK)
    expect(s?.lastQuestion).toBe("多少钱")
  })

  it("纯图消息(无文本)@bot 也放行,并透传 images/quoted/forwarded", async () => {
    const p = collectQualified()
    bus.emit(
      "message.received",
      qqMsg({
        messageId: "40",
        rawText: "",
        atList: [BOT],
        images: [{ data: "AAAA", mediaType: "image/png" }],
        quoted: "张三: 原问题",
        forwarded: "A: x",
      })
    )
    const q = await p
    expect(q.text).toBe("")
    expect(q.images).toEqual([{ data: "AAAA", mediaType: "image/png" }])
    expect(q.quoted).toBe("张三: 原问题")
    expect(q.forwarded).toBe("A: x")
  })

  it("未 @bot 不触发", async () => {
    const spy = vi.fn()
    bus.on("message.qualified", spy)
    bus.emit(
      "message.received",
      qqMsg({ messageId: "11", rawText: "闲聊", atList: [] })
    )
    await new Promise((r) => setTimeout(r, 50))
    expect(spy).not.toHaveBeenCalled()
  })

  it("重复 message_id 只触发一次", async () => {
    const spy = vi.fn()
    bus.on("message.qualified", spy)
    const msg = qqMsg({ messageId: "12", rawText: "x", atList: [BOT] })
    bus.emit("message.received", msg)
    bus.emit("message.received", msg)
    await new Promise((r) => setTimeout(r, 50))
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it("用户自助重置:@bot 发关键词 → 清 resumeId、回确认、不转 Agent", async () => {
    repo.setSessionId(SK, "sid-old")
    const qualified = vi.fn()
    bus.on("message.qualified", qualified)
    const p = new Promise<ActionSend>((res) => bus.once("action.send", res))
    bus.emit(
      "message.received",
      qqMsg({ messageId: "20", rawText: "重新开始", atList: [BOT] })
    )
    const a = await p
    expect(a.channel).toBe("qq")
    expect(a.chatId).toBe("1")
    expect(a.text).toContain("重置")
    expect(a.replyToId).toBe("20")
    expect(repo.getResumeId(SK)).toBeUndefined()
    expect(repo.getSessionId(SK)).toBe("sid-old")
    expect(qualified).not.toHaveBeenCalled()
  })

  it("普通问题不被重置关键词误伤", async () => {
    const p = collectQualified()
    bus.emit(
      "message.received",
      qqMsg({ messageId: "21", rawText: "怎么重置密码", atList: [BOT] })
    )
    const q = await p
    expect(q.text).toBe("怎么重置密码")
  })

  it("@bot 人工 → handoff.requested(含 channel)", async () => {
    const p = new Promise<HandoffRequested>((res) =>
      bus.once("handoff.requested", res)
    )
    bus.emit(
      "message.received",
      qqMsg({ messageId: "50", rawText: "人工", atList: [BOT] })
    )
    const h = await p
    expect(h.sessionKey).toBe(SK)
    expect(h.channel).toBe("qq")
    expect(h.chatId).toBe("1")
  })

  it("TG 人工关键词 + 有 adminSurface → emit handoff.requested", async () => {
    bus.removeAllListeners()
    registerGateway({
      repo,
      botQQ: 555,
      adminSurface: { channel: "qq" as const, chatId: "999" },
      enabledChats: [
        { channel: "qq" as const, chatId: "1" },
        { channel: "tg" as const, chatId: "-1001" },
      ],
      supportUrl: "https://example.com",
    })
    const p = new Promise<HandoffRequested>((res) =>
      bus.once("handoff.requested", res)
    )
    bus.emit("message.received", {
      channel: "tg" as const,
      chatId: "-1001",
      userId: "42",
      messageId: "9",
      rawText: "人工",
      atList: [],
      botMentioned: true,
    })
    const h = await p
    expect(h.channel).toBe("tg")
    expect(h.chatId).toBe("-1001")
    expect(h.sessionKey).toBe("tg:-1001:42")
  })

  it("无 adminSurface 时人工关键词 → 引导官网,不 emit handoff", async () => {
    bus.removeAllListeners()
    registerGateway({
      repo,
      botQQ: 555,
      adminSurface: null,
      enabledChats: [{ channel: "tg" as const, chatId: "-1001" }],
      supportUrl: "https://example.com",
    })
    const handoff = vi.fn()
    bus.on("handoff.requested", handoff)
    const p = new Promise<ActionSend>((res) => bus.once("action.send", res))
    bus.emit("message.received", {
      channel: "tg" as const,
      chatId: "-1001",
      userId: "42",
      messageId: "10",
      rawText: "人工",
      atList: [],
      botMentioned: true,
    })
    const a = await p
    expect(a.channel).toBe("tg")
    expect(a.chatId).toBe("-1001")
    expect(a.text).toMatch(/支持|客服|example\.com/)
    expect(handoff).not.toHaveBeenCalled()
  })

  it("human-mode 会话丢弃 qualified", async () => {
    repo.setHumanMode(SK, true)
    const spy = vi.fn()
    bus.on("message.qualified", spy)
    bus.emit(
      "message.received",
      qqMsg({ messageId: "51", rawText: "还在吗", atList: [BOT] })
    )
    await new Promise((r) => setTimeout(r, 30))
    expect(spy).not.toHaveBeenCalled()
  })

  it("管理群 /reset <key> → 清 resumeId 并回确认", async () => {
    repo.setSessionId(SK, "sid-old")
    const p = new Promise<ActionSend>((res) => bus.once("action.send", res))
    bus.emit("message.received", {
      channel: "qq" as const,
      chatId: "999",
      userId: "7",
      messageId: "22",
      rawText: `/reset ${SK}`,
      atList: [BOT],
    })
    const a = await p
    expect(a.channel).toBe("qq")
    expect(a.chatId).toBe("999")
    expect(a.text).toContain(SK)
    expect(repo.getResumeId(SK)).toBeUndefined()
    expect(repo.getSessionId(SK)).toBe("sid-old")
  })

  it("管理群 /resume <key> → handoff.resumed", async () => {
    const p = new Promise<HandoffResumed>((res) =>
      bus.once("handoff.resumed", res)
    )
    bus.emit("message.received", {
      channel: "qq" as const,
      chatId: "999",
      userId: "7",
      messageId: "23",
      rawText: `/resume ${SK}`,
      atList: [BOT],
    })
    const h = await p
    expect(h.sessionKey).toBe(SK)
    expect(h.by).toBe("admin")
  })

  it("非生效群 @bot 不触发", async () => {
    const spy = vi.fn()
    bus.on("message.qualified", spy)
    bus.emit("message.received", {
      channel: "qq" as const,
      chatId: "777",
      userId: "2",
      messageId: "30",
      rawText: "订单在哪",
      atList: [BOT],
    })
    await new Promise((r) => setTimeout(r, 50))
    expect(spy).not.toHaveBeenCalled()
  })

  it("非生效群不影响管理群命令(adminGroup 豁免)", async () => {
    repo.setSessionId(SK, "sid-old")
    const p = new Promise<ActionSend>((res) => bus.once("action.send", res))
    bus.emit("message.received", {
      channel: "qq" as const,
      chatId: "999",
      userId: "7",
      messageId: "31",
      rawText: `/reset ${SK}`,
      atList: [BOT],
    })
    const a = await p
    expect(a.chatId).toBe("999")
    expect(repo.getResumeId(SK)).toBeUndefined()
  })

  it("管理群 @bot 提问 → 不进客服流程(无 qualified / 无 session)", async () => {
    const spy = vi.fn()
    bus.on("message.qualified", spy)
    const send = vi.fn()
    bus.on("action.send", send)
    bus.emit("message.received", {
      channel: "qq" as const,
      chatId: "999",
      userId: "7",
      messageId: "24",
      rawText: "订单在哪",
      atList: [BOT],
    })
    await new Promise((r) => setTimeout(r, 50))
    expect(spy).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
    expect(repo.listSessions().some((s) => s.key.includes("999"))).toBe(false)
  })

  it("管理群「人工」关键词 → 不 emit handoff", async () => {
    const spy = vi.fn()
    bus.on("handoff.requested", spy)
    bus.emit("message.received", {
      channel: "qq" as const,
      chatId: "999",
      userId: "7",
      messageId: "25",
      rawText: "人工",
      atList: [BOT],
    })
    await new Promise((r) => setTimeout(r, 50))
    expect(spy).not.toHaveBeenCalled()
  })

  it("管理群未识别的 / 命令 → 回管理用法,且同 messageId 不重复回", async () => {
    const send = vi.fn()
    bus.on("action.send", send)
    const msg = {
      channel: "qq" as const,
      chatId: "999",
      userId: "7",
      messageId: "26",
      rawText: "/foo bar",
      atList: [BOT],
    }
    bus.emit("message.received", msg)
    bus.emit("message.received", msg)
    await new Promise((r) => setTimeout(r, 50))
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0].text).toContain("/reset")
  })

  it("帮助关键词回用法", async () => {
    const p = new Promise<ActionSend>((res) => bus.once("action.send", res))
    bus.emit(
      "message.received",
      qqMsg({ messageId: "60", rawText: "帮助", atList: [BOT] })
    )
    const a = await p
    expect(a.text).toContain("@我")
    expect(a.text).toContain("example.com")
  })

  it("botMentioned=true 时不依赖 atList", async () => {
    const p = collectQualified()
    bus.emit(
      "message.received",
      qqMsg({
        messageId: "70",
        rawText: "你好",
        atList: [],
        botMentioned: true,
      })
    )
    const q = await p
    expect(q.text).toBe("你好")
  })

  it("TG 管理面 /reset <key> → 清 resumeId 并回 TG", async () => {
    bus.removeAllListeners()
    registerGateway({
      repo,
      botQQ: 555,
      adminSurface: { channel: "tg" as const, chatId: "-100999" },
      enabledChats: [{ channel: "qq" as const, chatId: "1" }],
      supportUrl: "https://example.com",
    })
    const sk = "qq:1:2"
    repo.setSessionId(sk, "sid-tg-admin")
    const p = new Promise<ActionSend>((res) => bus.once("action.send", res))
    bus.emit("message.received", {
      channel: "tg" as const,
      chatId: "-100999",
      userId: "7",
      messageId: "tg-reset-1",
      rawText: `/reset ${sk}`,
      atList: [],
    })
    const a = await p
    expect(a.channel).toBe("tg")
    expect(a.chatId).toBe("-100999")
    expect(a.text).toContain(sk)
    expect(repo.getResumeId(sk)).toBeUndefined()
  })

  it("TG 管理面 /resume <key> → handoff.resumed", async () => {
    bus.removeAllListeners()
    registerGateway({
      repo,
      botQQ: 555,
      adminSurface: { channel: "tg" as const, chatId: "-100999" },
      enabledChats: [{ channel: "qq" as const, chatId: "1" }],
      supportUrl: "https://example.com",
    })
    const sk = "qq:1:2"
    const p = new Promise<HandoffResumed>((res) =>
      bus.once("handoff.resumed", res)
    )
    bus.emit("message.received", {
      channel: "tg" as const,
      chatId: "-100999",
      userId: "7",
      messageId: "tg-resume-1",
      rawText: `/resume ${sk}`,
      atList: [],
    })
    const h = await p
    expect(h.sessionKey).toBe(sk)
    expect(h.by).toBe("admin")
  })

  function seedPrior(texts: string[]) {
    for (let i = 0; i < texts.length; i++) {
      repo.bufferGroupMessage("qq", "1", "2", "member", texts[i], `p${i}`)
    }
  }

  it("纯 @ 有 prior → qualified 含历史,不发用法说明", async () => {
    seedPrior(["刚才的订单号是 ABC"])
    const qualified = collectQualified()
    const send = vi.fn()
    bus.on("action.send", send)
    bus.emit(
      "message.received",
      qqMsg({ messageId: "p-empty", rawText: "", atList: [BOT] })
    )
    const q = await qualified
    expect(q.text).toContain("刚才的订单号是 ABC")
    expect(q.text).toContain("【用户近期发言")
    expect(send).not.toHaveBeenCalled()
  })

  it("空白 @ 无 prior → 用法说明", async () => {
    const qualified = vi.fn()
    bus.on("message.qualified", qualified)
    const p = new Promise<ActionSend>((res) => bus.once("action.send", res))
    bus.emit(
      "message.received",
      qqMsg({ messageId: "p-blank", rawText: "  \n\t", atList: [BOT] })
    )
    const a = await p
    expect(a.text).toContain("@我")
    expect(qualified).not.toHaveBeenCalled()
  })

  it("有 prior + 短正文 → text 含历史与正文", async () => {
    seedPrior(["背景信息"])
    const p = collectQualified()
    bus.emit(
      "message.received",
      qqMsg({ messageId: "p-body", rawText: "帮我看看", atList: [BOT] })
    )
    const q = await p
    expect(q.text).toContain("背景信息")
    expect(q.text).toContain("帮我看看")
    expect(q.text).toContain("【当前消息】")
  })

  it("重置后 prior 隔离:纯 @ 回用法说明,不 qualified", async () => {
    seedPrior(["旧问题"])
    // 先重置推进 prior_since
    const resetP = new Promise<ActionSend>((res) =>
      bus.once("action.send", res)
    )
    bus.emit(
      "message.received",
      qqMsg({ messageId: "p-reset", rawText: "重置", atList: [BOT] })
    )
    await resetP

    const qualified = vi.fn()
    bus.on("message.qualified", qualified)
    const helpP = new Promise<ActionSend>((res) => bus.once("action.send", res))
    bus.emit(
      "message.received",
      qqMsg({ messageId: "p-after-reset", rawText: "", atList: [BOT] })
    )
    const a = await helpP
    expect(a.text).toContain("@我")
    expect(qualified).not.toHaveBeenCalled()
  })

  it("recentUserGroupMessages 抛错 → 有正文仍 qualified,并 error.occurred", async () => {
    vi.spyOn(repo, "recentUserGroupMessages").mockImplementation(() => {
      throw new Error("db down")
    })
    const errP = new Promise<ErrorOccurred>((res) =>
      bus.once("error.occurred", res)
    )
    const qP = collectQualified()
    bus.emit(
      "message.received",
      qqMsg({ messageId: "p-err", rawText: "还在吗", atList: [BOT] })
    )
    const [err, q] = await Promise.all([errP, qP])
    expect(q.text).toBe("还在吗")
    expect(err.scope).toBe("gateway.prior-context")
    expect(err.sessionKey).toBe(SK)
    expect(err.channel).toBe("qq")
    expect(err.chatId).toBe("1")
  })

  it("纯 @ 有 prior → lastQuestion 用 prior 末条", async () => {
    seedPrior(["第一条", "末条问题"])
    const p = collectQualified()
    bus.emit(
      "message.received",
      qqMsg({ messageId: "p-lq", rawText: "", atList: [BOT] })
    )
    await p
    const s = repo.listSessions().find((x) => x.key === SK)
    expect(s?.lastQuestion).toBe("末条问题")
  })
})
