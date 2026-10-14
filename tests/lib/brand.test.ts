import { describe, expect, it } from "vitest"
import { DEFAULT_BRAND, resolveBrand, identityLine } from "@/lib/brand"
import { appConfigSchema } from "@/lib/config/schema"
import { buildDefaultSystem } from "@/lib/agent/agent"
import { buildIntentSystem } from "@/lib/agent/intent"
import { buildAnswerabilitySystem } from "@/lib/agent/answerability"

describe("Prayer 品牌配置", () => {
  it("默认配置使用 Prayer，且不绑定 PackyAPI 支持链接", () => {
    const cfg = appConfigSchema.parse({})
    expect(DEFAULT_BRAND.name).toBe("Prayer")
    expect(cfg.brandName).toBe("Prayer")
    expect(cfg.brandDescription).toBe("多渠道 AI 客服中台")
    expect(cfg.supportUrl).toBe("")
  })

  it("空白白标输入回退默认品牌，非空输入保留自定义值", () => {
    expect(resolveBrand({ name: "  ", description: " " })).toEqual(
      DEFAULT_BRAND
    )
    expect(
      resolveBrand({ name: " Acme ", description: " Acme 客服平台 " })
    ).toEqual({ name: "Acme", description: "Acme 客服平台" })
  })

  it("主 Agent 与旁路判定器都使用同一品牌身份", () => {
    const brand = { name: "Acme", description: "Acme 支持平台" }
    expect(buildDefaultSystem({ brand })).toContain("你是 Acme 的官方在线客服")
    expect(buildDefaultSystem({ brand })).toContain("Acme 官方客服机器人")
    expect(buildIntentSystem(brand)).toContain("Acme 客服系统")
    expect(buildAnswerabilitySystem(brand)).toContain("Acme 客服系统")
  })

  it("身份段只用正向陈述,不枚举被禁的模型名", () => {
    const s = buildDefaultSystem({
      brand: { name: "Acme", description: "Acme 支持平台" },
    })
    // 逐字首句必须与拦截话术同源
    expect(s).toContain(
      identityLine({ name: "Acme", description: "Acme 支持平台" })
    )
    // 负向枚举会把 Codex/Claude 这些 token 每轮送进上下文,等于反向提示
    expect(s).not.toContain("Codex")
    expect(s).not.toContain("Claude")
    expect(s).not.toContain("ChatGPT")
    expect(s).not.toContain("不得自称")
  })

  it("支持部署方配置客服回复规则", () => {
    expect(
      buildDefaultSystem({
        brand: { name: "Acme", description: "Acme 支持平台" },
        replyRules: "使用简体中文;自我介绍时称为 Acme 官方客服机器人",
      })
    ).toContain("使用简体中文;自我介绍时称为 Acme 官方客服机器人")
  })
})
