import { describe, expect, it } from "vitest"
import {
  extractHttpLinks,
  findBlockedLink,
  isLinkAllowed,
  normalizeLinkWhitelist,
} from "@/lib/channels/qq/link-whitelist"

describe("QQ 链接白名单", () => {
  it("提取链接并去掉常见标点", () => {
    expect(
      extractHttpLinks("看 https://example.com/a?q=1，和 www.foo.cn。")
    ).toEqual(["https://example.com/a?q=1", "www.foo.cn"])
  })

  it("允许精确域名和子域名，不允许相似后缀域名", () => {
    const whitelist = normalizeLinkWhitelist([
      "https://Example.com/path",
      "*.trusted.cn",
    ])
    expect(whitelist).toEqual(["example.com", "trusted.cn"])
    expect(isLinkAllowed("https://example.com/x", whitelist)).toBe(true)
    expect(isLinkAllowed("https://sub.example.com/x", whitelist)).toBe(true)
    expect(isLinkAllowed("https://example.com.evil.test/x", whitelist)).toBe(
      false
    )
  })

  it("返回首个被拦截链接", () => {
    expect(
      findBlockedLink("https://ok.example.com https://bad.test/x", [
        "example.com",
      ])
    ).toBe("https://bad.test/x")
    expect(findBlockedLink("没有链接", ["example.com"])).toBeUndefined()
  })

  it("裸域名同样算链接", () => {
    expect(extractHttpLinks("看 360.com 这个站")).toEqual(["360.com"])
    expect(findBlockedLink("去 rightapi.ai 看看", ["other.com"])).toBe(
      "rightapi.ai"
    )
    // 无协议但带路径/查询串：裸域名只取 host（路径不参与白名单判定，
    // 少抓一段也避免把后续中文正文吞进日志）
    expect(extractHttpLinks("example.com/path?q=1")).toEqual(["example.com"])
  })

  it("裸域名不误判文件名、版本号与邮箱", () => {
    expect(extractHttpLinks("改一下 index.js 和 README.md")).toEqual([])
    expect(extractHttpLinks("版本 1.5 到 2.10 之间")).toEqual([])
    expect(extractHttpLinks("联系 a@b.com 或 user@mail.example.com")).toEqual(
      []
    )
    expect(extractHttpLinks("文件名 foo.bar")).toEqual([])
  })

  it("白名单忽略顶级域：rightapi.ai 放行同名的其它后缀", () => {
    const whitelist = normalizeLinkWhitelist(["https://rightapi.ai"])
    expect(isLinkAllowed("rightapi.ai", whitelist)).toBe(true)
    expect(isLinkAllowed("rightapi.com", whitelist)).toBe(true)
    expect(isLinkAllowed("rightapi.cn", whitelist)).toBe(true)
    expect(isLinkAllowed("https://rightapi.xyz/x", whitelist)).toBe(true)
    expect(isLinkAllowed("https://rightapi.org", whitelist)).toBe(true)
    // 子域名一并放行
    expect(isLinkAllowed("https://api.rightapi.com/v1", whitelist)).toBe(true)
    // 同顶级域但不同名 → 仍拦截
    expect(isLinkAllowed("evilapi.com", whitelist)).toBe(false)
    expect(isLinkAllowed("360.com", whitelist)).toBe(false)
    expect(isLinkAllowed("rightapixyz.com", whitelist)).toBe(false)
  })

  it("忽略顶级域后仍不允许相似后缀域名混入", () => {
    const whitelist = normalizeLinkWhitelist(["example.com"])
    // 前缀是 example.com.evil，不等于也不以 .example 结尾
    expect(isLinkAllowed("https://example.com.evil.test/x", whitelist)).toBe(
      false
    )
    expect(isLinkAllowed("https://example.comevil.cn", whitelist)).toBe(false)
    // 两段式公共后缀：example.com.cn 等价于 example
    expect(isLinkAllowed("https://example.com.cn", whitelist)).toBe(true)
  })
})
