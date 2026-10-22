/**
 * QQ 群链接白名单。
 *
 * 两条对外语义（与 README / 设置页说明保持一致）：
 *   1. 裸域名（无协议、无 www）同样算链接，例如 `360.com`；但不能把文件名
 *      `index.js`、版本号 `1.5`、邮箱 `a@b.com` 误判成链接，故裸域名必须
 *      以常见顶级域结尾才成立。
 *   2. 白名单忽略顶级域：白名单写 `rightapi.ai` 时，`rightapi.com`、
 *      `rightapi.cn`、`rightapi.xyz` 一并放行；比对的是「公共后缀之前的部分」，
 *      因此 `example.com` 仍放行 `sub.example.com`，而
 *      `example.com.evil.test` 依然被拦（前缀是 `example.com.evil`）。
 */

/** 常见顶级域：用于把裸域名与文件名/版本号区分开。 */
const COMMON_TLDS = new Set([
  "com",
  "cn",
  "net",
  "org",
  "top",
  "xyz",
  "info",
  "biz",
  "online",
  "site",
  "tech",
  "store",
  "shop",
  "club",
  "vip",
  "pro",
  "live",
  "fun",
  "art",
  "design",
  "group",
  "work",
  "space",
  "website",
  "wang",
  "xin",
  "icu",
  "pub",
  "run",
  "red",
  "link",
  "email",
  "ltd",
  "plus",
  "wiki",
  "mobi",
  "asia",
  "name",
  "cc",
  "tv",
  "me",
  "io",
  "ai",
  "app",
  "dev",
  "co",
  "so",
  "gd",
  "gs",
  "us",
  "uk",
  "ca",
  "au",
  "nz",
  "jp",
  "kr",
  "hk",
  "tw",
  "sg",
  "my",
  "th",
  "vn",
  "ph",
  "id",
  "in",
  "de",
  "fr",
  "it",
  "es",
  "nl",
  "be",
  "ch",
  "se",
  "no",
  "dk",
  "fi",
  "pl",
  "ru",
  "ua",
  "cz",
  "at",
  "ie",
  "pt",
  "gr",
  "tr",
  "il",
  "ae",
  "sa",
  "br",
  "mx",
  "ar",
  "cl",
  "za",
  "eg",
])

/**
 * 两段式公共后缀：`example.com.cn` 的可注册名是 `example` 而不是 `com`。
 * 不覆盖完整的 PSL（仓库无该依赖），只收编常见组合。
 */
const TWO_PART_SUFFIXES = new Set([
  "com.cn",
  "net.cn",
  "org.cn",
  "gov.cn",
  "edu.cn",
  "ac.cn",
  "co.uk",
  "org.uk",
  "ac.uk",
  "gov.uk",
  "com.hk",
  "org.hk",
  "com.tw",
  "com.sg",
  "com.my",
  "co.jp",
  "co.kr",
  "com.au",
  "com.br",
])

/**
 * 提取文本中的链接：带协议 / www 的一律算，裸域名需末段是常见顶级域。
 * 尾部紧跟的路径、查询串与中文标点按原逻辑处理。
 */
export function extractHttpLinks(text: string): string[] {
  const matches = text.match(LINK_RE) ?? []
  const out: string[] = []
  for (const raw of matches) {
    const value = raw
      .split(/[，。！？；：）】》]/u, 1)[0]!
      .replace(/[),.!?;:]+$/u, "")
    if (!value) continue
    if (/^(?:https?:\/\/|www\.)/i.test(value)) {
      out.push(value)
      continue
    }
    // 裸域名：末段必须在常见顶级域表内，否则 index.js / 1.5 / a@b.com 会误判
    const tld = value.slice(value.lastIndexOf(".") + 1).toLowerCase()
    if (COMMON_TLDS.has(tld)) out.push(value)
  }
  return out
}

/**
 * 链接匹配：协议可选，其次 www. 前缀，最后是裸域名。
 * 裸域名前的 lookbehind 排除邮箱与已匹配 URL 内部的重复命中；
 * 末段后的 lookahead 防止把 `example.comfoo` 截成 `example.com`。
 *
 * 裸域名只抓到 host，不含其后的路径/查询串（与带协议的写法不同）。
 * 白名单判定走 new URL().hostname，路径本就不参与比较；少抓一段还能避免
 * `example.com的网站` 这类中文正文被吞进匹配结果与日志。
 */
const LINK_RE =
  /(?:(?:https?:\/\/|www\.)[^\s<>"'“”‘’]+|(?<![@\w./-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?![a-z0-9-]))/gi

function normalizeHost(value: string): string | undefined {
  const input = value.trim().toLowerCase()
  if (!input) return undefined
  const withScheme = input.includes("://") ? input : `https://${input}`
  try {
    const host = new URL(withScheme).hostname
      .toLowerCase()
      .replace(/^www\./, "")
    return host || undefined
  } catch {
    return undefined
  }
}

/**
 * 取「公共后缀之前的部分」，用于忽略顶级域的比较。
 * `rightapi.ai` → `rightapi`；`sub.rightapi.org` → `sub.rightapi`；
 * `example.com.cn` → `example`（两段式后缀）；单段输入返回 undefined。
 */
function hostPrefix(host: string): string | undefined {
  const labels = host
    .toLowerCase()
    .replace(/^www\./, "")
    .split(".")
    .filter(Boolean)
  if (labels.length < 2) return undefined
  const suffixLen = TWO_PART_SUFFIXES.has(labels.slice(-2).join(".")) ? 2 : 1
  if (labels.length <= suffixLen) return undefined
  return labels.slice(0, labels.length - suffixLen).join(".")
}

export function normalizeLinkWhitelist(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const host = normalizeHost(value.replace(/^\*\./, ""))
    if (!host || seen.has(host)) continue
    seen.add(host)
    out.push(host)
  }
  return out
}

export function isLinkAllowed(link: string, whitelist: string[]): boolean {
  const host = normalizeHost(link)
  if (!host) return false
  const prefix = hostPrefix(host)
  if (!prefix) return false
  // 忽略顶级域：同前缀即放行，子域名（前缀以 .<白名单前缀> 结尾）同样放行
  return normalizeLinkWhitelist(whitelist).some((allowed) => {
    const allowedPrefix = hostPrefix(allowed)
    if (!allowedPrefix) return false
    return (
      prefix === allowedPrefix || prefix.endsWith(`.${allowedPrefix}`)
    )
  })
}

export function findBlockedLink(
  text: string,
  whitelist: string[]
): string | undefined {
  return extractHttpLinks(text).find((link) => !isLinkAllowed(link, whitelist))
}
