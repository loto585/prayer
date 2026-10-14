import { describe, expect, it } from "vitest"
import {
  MAX_MUTE_MS,
  MIN_MUTE_MS,
  formatDuration,
  parseAdminCommand,
  parseDuration,
} from "@/lib/agent/admin-commands"

describe("parseDuration / formatDuration", () => {
  it("s/m/h/d 四种单位,不分大小写", () => {
    expect(parseDuration("30s")).toBe(30_000)
    expect(parseDuration("10m")).toBe(600_000)
    expect(parseDuration("2H")).toBe(7_200_000)
    expect(parseDuration("1d")).toBe(86_400_000)
  })

  it("越界、无单位、非整数、带空格 → null", () => {
    expect(parseDuration("5s")).toBeNull() // < MIN
    expect(parseDuration("8d")).toBeNull() // > MAX
    expect(parseDuration("10")).toBeNull()
    expect(parseDuration("1.5h")).toBeNull()
    expect(parseDuration("abc")).toBeNull()
    expect(parseDuration("10 m")).toBeNull()
    expect(parseDuration("")).toBeNull()
  })

  it("边界值刚好可用", () => {
    expect(parseDuration("10s")).toBe(MIN_MUTE_MS)
    expect(parseDuration("7d")).toBe(MAX_MUTE_MS)
  })

  it("格式化取最大整除单位", () => {
    expect(formatDuration(600_000)).toBe("10 分钟")
    expect(formatDuration(3_600_000)).toBe("1 小时")
    expect(formatDuration(86_400_000)).toBe("1 天")
    expect(formatDuration(30_000)).toBe("30 秒")
    expect(formatDuration(90_000)).toBe("90 秒")
  })
})

describe("parseAdminCommand", () => {
  it("非 / 开头 → null(管理群普通聊天静默)", () => {
    expect(parseAdminCommand("订单在哪")).toBeNull()
    expect(parseAdminCommand("人工")).toBeNull()
    expect(parseAdminCommand("")).toBeNull()
    // 句中出现 / 不算指令
    expect(parseAdminCommand("看看 /群发 这个")).toBeNull()
  })

  it("旧的 ! 前缀 → unknown(回总用法,便于迁移)", () => {
    expect(parseAdminCommand("!群发 x")).toEqual({ kind: "unknown" })
    expect(parseAdminCommand("！公告 x")).toEqual({ kind: "unknown" })
  })

  it("reset / resume 取 sessionKey;全角 ／ 也认;缺 key 按未知", () => {
    expect(parseAdminCommand("/reset qq:1:2")).toEqual({
      kind: "reset",
      sessionKey: "qq:1:2",
    })
    expect(parseAdminCommand("  ／resume tg:-100:9  ")).toEqual({
      kind: "resume",
      sessionKey: "tg:-100:9",
    })
    expect(parseAdminCommand("/reset")).toEqual({ kind: "unknown" })
  })

  it("群发:无旗标", () => {
    expect(parseAdminCommand("/群发 今晚 22:00 维护")).toEqual({
      kind: "broadcast",
      text: "今晚 22:00 维护",
      mentionAll: false,
    })
  })

  it("群发:-all 旗标(不分大小写),只认内容前的", () => {
    for (const sw of ["-all", "-ALL"]) {
      expect(parseAdminCommand(`/群发 ${sw} 维护`)).toEqual({
        kind: "broadcast",
        text: "维护",
        mentionAll: true,
      })
    }
    // 内容后面的 -all 是正文,不是旗标
    expect(parseAdminCommand("/群发 维护 -all")).toEqual({
      kind: "broadcast",
      text: "维护 -all",
      mentionAll: false,
    })
  })

  it("群发:正文以 - 开头但不是整词旗标 → 当正文", () => {
    expect(parseAdminCommand("/群发 -v2 上线")).toEqual({
      kind: "broadcast",
      text: "-v2 上线",
      mentionAll: false,
    })
    expect(parseAdminCommand("/群发 -5折 限时")).toEqual({
      kind: "broadcast",
      text: "-5折 限时",
      mentionAll: false,
    })
  })

  it("群发:未知旗标 → usage(打错了不猜)", () => {
    expect(parseAdminCommand("/群发 -al 维护")).toEqual({
      kind: "usage",
      command: "群发",
    })
  })

  it("群发:QQ 原生 @全体成员 段经 atAll 传入", () => {
    expect(parseAdminCommand("/群发  维护", { atAll: true })).toEqual({
      kind: "broadcast",
      text: "维护",
      mentionAll: true,
    })
  })

  it("群发:指令名后不加空格、旗标后换行、多行正文", () => {
    expect(parseAdminCommand("/群发今晚维护")).toEqual({
      kind: "broadcast",
      text: "今晚维护",
      mentionAll: false,
    })
    expect(parseAdminCommand("/群发 -all\n第一行\n第二行")).toEqual({
      kind: "broadcast",
      text: "第一行\n第二行",
      mentionAll: true,
    })
  })

  it("群发:带图时正文可空(纯图群发);不带图仍回 usage", () => {
    expect(parseAdminCommand("/群发", { hasImages: true })).toEqual({
      kind: "broadcast",
      text: "",
      mentionAll: false,
    })
    expect(parseAdminCommand("/群发 -all", { hasImages: true })).toEqual({
      kind: "broadcast",
      text: "",
      mentionAll: true,
    })
    expect(parseAdminCommand("/群发 -all")).toEqual({
      kind: "usage",
      command: "群发",
    })
    // 旗标写错时即便带图也不猜
    expect(parseAdminCommand("/群发 -al", { hasImages: true })).toEqual({
      kind: "usage",
      command: "群发",
    })
  })

  it("群发:只有旗标没正文 → usage", () => {
    expect(parseAdminCommand("/群发")).toEqual({
      kind: "usage",
      command: "群发",
    })
    expect(parseAdminCommand("/群发 -all")).toEqual({
      kind: "usage",
      command: "群发",
    })
  })

  it("公告:缺省不置顶;-pin 置顶", () => {
    expect(parseAdminCommand("/公告 请勿发外链")).toEqual({
      kind: "notice",
      content: "请勿发外链",
      pinned: false,
    })
    expect(parseAdminCommand("/公告 -pin 请勿发外链")).toEqual({
      kind: "notice",
      content: "请勿发外链",
      pinned: true,
    })
  })

  it("公告:缺正文或未知旗标 → usage", () => {
    expect(parseAdminCommand("/公告")).toEqual({
      kind: "usage",
      command: "公告",
    })
    expect(parseAdminCommand("/公告 -pin")).toEqual({
      kind: "usage",
      command: "公告",
    })
    expect(parseAdminCommand("/公告 -nopin 内容")).toEqual({
      kind: "usage",
      command: "公告",
    })
  })

  it("写公告:取要点,支持多行与不加空格;空白 → usage", () => {
    expect(parseAdminCommand("/写公告 今晚凌晨 2 点升级服务器")).toEqual({
      kind: "draft",
      brief: "今晚凌晨 2 点升级服务器",
    })
    expect(parseAdminCommand("／写公告第一行\n第二行")).toEqual({
      kind: "draft",
      brief: "第一行\n第二行",
    })
    expect(parseAdminCommand("/写公告   ")).toEqual({
      kind: "usage",
      command: "写公告",
    })
  })

  it("/写公告 不会被 /公告 抢走", () => {
    expect(parseAdminCommand("/写公告 维护通知")?.kind).toBe("draft")
  })

  it("发布:缺省不置顶,-pin 置顶", () => {
    expect(parseAdminCommand("/发布")).toEqual({
      kind: "publish",
      pinned: false,
    })
    expect(parseAdminCommand("/发布 -pin")).toEqual({
      kind: "publish",
      pinned: true,
    })
  })

  it("发布:粘了正文 / 未知旗标 → usage;没分隔的 /发布xxx 不是指令", () => {
    expect(parseAdminCommand("/发布 【公告】正文贴进来了")).toEqual({
      kind: "usage",
      command: "发布",
    })
    expect(parseAdminCommand("/发布 -nopin")).toEqual({
      kind: "usage",
      command: "发布",
    })
    expect(parseAdminCommand("/发布xxx")).toEqual({ kind: "unknown" })
  })

  it("禁言:-on / -off,缺省不带群号", () => {
    expect(parseAdminCommand("/禁言 -on")).toEqual({
      kind: "mute",
      enable: true,
    })
    expect(parseAdminCommand("/禁言 -off")).toEqual({
      kind: "mute",
      enable: false,
    })
  })

  it("禁言:-g 指定单群,旗标顺序无关", () => {
    expect(parseAdminCommand("/禁言 -on -g 1126497791")).toEqual({
      kind: "mute",
      enable: true,
      groupId: 1126497791,
    })
    expect(parseAdminCommand("/禁言 -g 1126497791 -off")).toEqual({
      kind: "mute",
      enable: false,
      groupId: 1126497791,
    })
  })

  it("禁言:缺方向、两个都给、-g 缺值或非法、带正文 → usage", () => {
    for (const t of [
      "/禁言",
      "/禁言 -on -off",
      "/禁言 -g 1",
      "/禁言 -on -g",
      "/禁言 -on -g abc",
      "/禁言 -on -g -1",
      "/禁言 -on 全体",
    ]) {
      expect(parseAdminCommand(t), t).toEqual({
        kind: "usage",
        command: "禁言",
      })
    }
  })

  it("-t:群发/公告/发布/禁言都接受,换算成 muteMs,旗标顺序无关", () => {
    expect(parseAdminCommand("/群发 -t 10m 维护")).toEqual({
      kind: "broadcast",
      text: "维护",
      mentionAll: false,
      muteMs: 600_000,
    })
    expect(parseAdminCommand("/群发 -t 10m -all 维护")).toEqual({
      kind: "broadcast",
      text: "维护",
      mentionAll: true,
      muteMs: 600_000,
    })
    expect(parseAdminCommand("/群发 -all -t 10m 维护")).toEqual({
      kind: "broadcast",
      text: "维护",
      mentionAll: true,
      muteMs: 600_000,
    })
    expect(parseAdminCommand("/公告 -pin -t 1h 注意")).toEqual({
      kind: "notice",
      content: "注意",
      pinned: true,
      muteMs: 3_600_000,
    })
    expect(parseAdminCommand("/发布 -t 30s")).toEqual({
      kind: "publish",
      pinned: false,
      muteMs: 30_000,
    })
    expect(parseAdminCommand("/禁言 -on -t 2h")).toEqual({
      kind: "mute",
      enable: true,
      muteMs: 7_200_000,
    })
  })

  it("-g:群发/公告/发布也接受,与 -t 可同时用", () => {
    expect(parseAdminCommand("/群发 -g 1126497791 -t 10m 维护")).toEqual({
      kind: "broadcast",
      text: "维护",
      mentionAll: false,
      groupId: 1126497791,
      muteMs: 600_000,
    })
    expect(parseAdminCommand("/公告 -g 1126497791 注意")).toEqual({
      kind: "notice",
      content: "注意",
      pinned: false,
      groupId: 1126497791,
    })
    expect(parseAdminCommand("/发布 -g 1126497791")).toEqual({
      kind: "publish",
      pinned: false,
      groupId: 1126497791,
    })
  })

  it("-t 非法(越界/无单位/缺值/粘连)→ usage", () => {
    const cases: Array<[string, "群发" | "公告" | "发布" | "禁言"]> = [
      ["/群发 -t 5s 维护", "群发"],
      ["/群发 -t 8d 维护", "群发"],
      ["/群发 -t 10 维护", "群发"],
      ["/群发 -t 维护", "群发"],
      ["/群发 -t10m 维护", "群发"],
      ["/公告 -t abc 注意", "公告"],
      ["/发布 -t", "发布"],
      ["/禁言 -on -t 1x", "禁言"],
    ]
    for (const [t, command] of cases) {
      expect(parseAdminCommand(t), t).toEqual({ kind: "usage", command })
    }
  })

  it("-t 配 -off 是笔误 → usage", () => {
    expect(parseAdminCommand("/禁言 -off -t 10m")).toEqual({
      kind: "usage",
      command: "禁言",
    })
  })

  it("未知 / 命令 → unknown", () => {
    expect(parseAdminCommand("/foo bar")).toEqual({ kind: "unknown" })
    expect(parseAdminCommand("／help")).toEqual({ kind: "unknown" })
  })
})
