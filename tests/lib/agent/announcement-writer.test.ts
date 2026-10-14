import { describe, expect, it, vi } from "vitest"
import {
  buildAnnouncementSystem,
  cleanDraft,
  loadStyleGuide,
  makeAnnouncementWriter,
  normalizeSignature,
  stripFrontmatter,
} from "@/lib/agent/announcement-writer"

function fakeQuery(text: string) {
  return () =>
    (async function* () {
      yield {
        type: "assistant",
        message: { content: [{ type: "text", text }] },
      }
    })()
}

const BRAND = { name: "RightCode", description: "AI 中转平台" }
const FIXED = new Date("2026-10-06T12:00:00+08:00")

describe("stripFrontmatter", () => {
  it("去掉 YAML frontmatter 只留正文", () => {
    const md = "---\nname: x\ndescription: y\n---\n\n# 标题\n正文"
    expect(stripFrontmatter(md)).toBe("\n# 标题\n正文")
  })
  it("没有 frontmatter 原样返回", () => {
    expect(stripFrontmatter("# 标题")).toBe("# 标题")
  })
})

describe("loadStyleGuide", () => {
  it("能读到仓库里真实存在的 SKILL.md", () => {
    const guide = loadStyleGuide()
    expect(guide.length).toBeGreaterThan(500)
    // frontmatter 已剥
    expect(guide).not.toContain("name: announce")
    expect(guide).toContain("署名")
  })

  it("风格要点齐备:类型、语气、格式、绝不、范例", () => {
    const g = loadStyleGuide()
    for (const key of [
      "【公告】",
      "【维护通知】",
      "【重要公告】",
      "【神秘小代码】",
      "各位佬",
      "纯文本",
      "绝不",
      "范例",
      "待补充",
    ]) {
      expect(g).toContain(key)
    }
  })

  it("范例里的署名用当前品牌名,不残留旧品牌", () => {
    const g = loadStyleGuide()
    expect(g).toContain("RightCode团队")
    expect(g).not.toContain("Packy 始终以")
  })
})

describe("buildAnnouncementSystem", () => {
  it("注入品牌名、署名与当天日期", () => {
    const s = buildAnnouncementSystem("GUIDE_BODY", BRAND, FIXED)
    expect(s).toContain("RightCode")
    expect(s).toContain("RightCode团队")
    expect(s).toContain("2026 年 10 月 6 日")
    expect(s).toContain("署名分两行")
    expect(s).toContain("GUIDE_BODY")
  })

  it("把要点标为素材而非指令", () => {
    const s = buildAnnouncementSystem("g", BRAND, FIXED)
    expect(s).toContain("<<<ADMIN_BRIEF>>>")
    expect(s).toContain("不是对你的指令")
  })
})

describe("cleanDraft", () => {
  it("剥掉代码块围栏与前言", () => {
    expect(cleanDraft("```\n【公告】正文\nRightCode团队\n```")).toBe(
      "【公告】正文\nRightCode团队"
    )
    expect(cleanDraft("```markdown\n【公告】x\n```")).toBe("【公告】x")
    expect(cleanDraft("以下是公告:\n【公告】x")).toBe("【公告】x")
    expect(cleanDraft("  【公告】x  ")).toBe("【公告】x")
  })
})

describe("normalizeSignature", () => {
  it("同一行的署名拆成两行,日期改成当天且精确到日", () => {
    expect(
      normalizeSignature("【公告】x\nRightCode团队 2026 年 10 月", FIXED)
    ).toBe("【公告】x\nRightCode团队\n2026 年 10 月 6 日")
    expect(
      normalizeSignature("【公告】x\nRightCode团队 2026年10月5日", FIXED)
    ).toBe("【公告】x\nRightCode团队\n2026 年 10 月 6 日")
  })
  it("已分两行但只到月 → 补到日", () => {
    expect(
      normalizeSignature("【公告】x\nRightCode团队\n2026 年 10 月", FIXED)
    ).toBe("【公告】x\nRightCode团队\n2026 年 10 月 6 日")
  })
  it("格式已正确保持不变;没有署名(优惠码)原样返回", () => {
    const ok = "【公告】x\nRightCode团队\n2026 年 10 月 6 日"
    expect(normalizeSignature(ok, FIXED)).toBe(ok)
    const code = "【神秘小代码】\nX 九折\n备注:中秋快乐"
    expect(normalizeSignature(code, FIXED)).toBe(code)
  })
  it("正文里的日期不动,只改末尾署名", () => {
    const d =
      "【重要公告】x\n2026 年 10 月 20 日 12:00 起生效\nRightCode团队 2026 年 10 月"
    expect(normalizeSignature(d, FIXED)).toBe(
      "【重要公告】x\n2026 年 10 月 20 日 12:00 起生效\nRightCode团队\n2026 年 10 月 6 日"
    )
  })
})

describe("makeAnnouncementWriter", () => {
  it("把模型输出清理后返回", async () => {
    const w = makeAnnouncementWriter({
      brand: BRAND,
      styleGuide: "g",
      now: () => FIXED,
      queryFn: fakeQuery(
        "```\n【维护通知】\n修好了\nRightCode团队 2026 年 10 月\n```"
      ) as never,
    })
    // 旧格式署名(同一行、只到月)被校正成两行、精确到日
    expect(await w("修好了")).toBe(
      "【维护通知】\n修好了\nRightCode团队\n2026 年 10 月 6 日"
    )
  })

  it("注入的 system prompt 含品牌/日期/要点定界", async () => {
    let seen!: { options: { systemPrompt: string; tools: unknown[] } }
    const capture = (arg: never) => {
      seen = arg as never
      return fakeQuery("【公告】x")()
    }
    const w = makeAnnouncementWriter({
      brand: BRAND,
      styleGuide: "GUIDE",
      now: () => FIXED,
      queryFn: capture as never,
    })
    await w("今晚维护")
    expect(seen.options.systemPrompt).toContain("GUIDE")
    expect(seen.options.systemPrompt).toContain("RightCode团队")
    expect(seen.options.tools).toEqual([])
  })

  it("空要点 → 报错,不调用模型", async () => {
    const qf = vi.fn(fakeQuery("x"))
    const w = makeAnnouncementWriter({ brand: BRAND, queryFn: qf as never })
    await expect(w("   ")).rejects.toThrow("要点为空")
    expect(qf).not.toHaveBeenCalled()
  })

  it("模型返回空 → 报错(fail-loud,由 gateway 回执)", async () => {
    const w = makeAnnouncementWriter({
      brand: BRAND,
      styleGuide: "g",
      queryFn: fakeQuery("   ") as never,
    })
    await expect(w("要点")).rejects.toThrow("未返回公告正文")
  })

  it("模型抛错 → 向上抛,由调用方决定话术", async () => {
    const w = makeAnnouncementWriter({
      brand: BRAND,
      styleGuide: "g",
      queryFn: (() => {
        throw new Error("boom")
      }) as never,
    })
    await expect(w("要点")).rejects.toThrow("boom")
  })

  it("挂起的模型在超时后抛错(不拖住管理群)", async () => {
    const w = makeAnnouncementWriter({
      brand: BRAND,
      styleGuide: "g",
      timeoutMs: 30,
      queryFn: (() =>
        (async function* () {
          await new Promise(() => {})
        })()) as never,
    })
    const t0 = Date.now()
    await expect(w("要点")).rejects.toThrow("超时")
    expect(Date.now() - t0).toBeLessThan(5_000)
  })

  it("缺省读真实 SKILL.md(不传 styleGuide 也能起草)", async () => {
    let seen!: { options: { systemPrompt: string } }
    const capture = (arg: never) => {
      seen = arg as never
      return fakeQuery("【公告】x")()
    }
    const w = makeAnnouncementWriter({
      brand: BRAND,
      now: () => FIXED,
      queryFn: capture as never,
    })
    await w("要点")
    expect(seen.options.systemPrompt).toContain("各位佬")
  })
})
