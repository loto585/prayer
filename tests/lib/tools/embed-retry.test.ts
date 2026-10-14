import { describe, it, expect, vi } from "vitest"

const pipeline = vi.fn()
vi.mock("@huggingface/transformers", () => ({ env: {}, pipeline }))

describe("embed 加载失败", () => {
  it("失败不缓存,下次调用重新加载", async () => {
    const { embed } = await import("@/lib/tools/embed")
    pipeline.mockRejectedValueOnce(new TypeError("fetch failed"))
    await expect(embed("a")).rejects.toThrow("fetch failed")

    const extractor = vi.fn(async () => ({ data: new Float32Array([1, 2]) }))
    pipeline.mockResolvedValueOnce(extractor)
    expect(await embed("b")).toEqual(new Float32Array([1, 2]))
    expect(pipeline).toHaveBeenCalledTimes(2)

    // 成功后复用同一个实例
    await embed("c")
    expect(pipeline).toHaveBeenCalledTimes(2)
  })
})
