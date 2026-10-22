/**
 * Prayer 的平台品牌与客服身份配置。
 *
 * 品牌是核心运行时的一部分，但具体业务（例如 PackyAPI）应由知识库和
 * 插件提供，而不是写死在客服编排里。默认值放在这里，方便 UI、提示词和
 * 后台状态使用同一份真源。
 */
export const DEFAULT_BRAND = {
  name: "Prayer",
  description: "多渠道 AI 客服中台",
} as const

export type BrandProfile = {
  name: string
  description: string
}

export type BrandInput = Partial<BrandProfile> | null | undefined

/** 从配置/外部输入得到安全、非空的品牌资料。 */
export function resolveBrand(input: BrandInput = {}): BrandProfile {
  const name = input?.name?.trim() || DEFAULT_BRAND.name
  const description = input?.description?.trim() || DEFAULT_BRAND.description
  return { name, description }
}

/**
 * 客服身份的固定首句。
 *
 * 确定性拦截话术与 system prompt 逐字引用必须完全一致：只要两处各写一份，
 * 迟早会漂移成「拦截说 A、提示词要求 B」，模型自然选后者。真源放这里，
 * 两个调用方都从这里取。
 */
export function identityLine(brand: BrandProfile): string {
  return `我是 ${brand.name} 官方客服机器人，${brand.description}。`
}
