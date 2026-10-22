import {
  env,
  pipeline,
  type FeatureExtractionPipeline,
} from "@huggingface/transformers"

const MODEL = "Xenova/bge-small-zh-v1.5"
let extractorPromise: Promise<FeatureExtractionPipeline> | null = null

// 本地缓存缺失时会去 huggingface.co 下载,国内服务器常连不上(fetch failed)。
// HF_ENDPOINT 可指向镜像(如 https://hf-mirror.com),与 Python 生态同名同义。
const endpoint = process.env.HF_ENDPOINT?.trim()
if (endpoint)
  env.remoteHost = endpoint.endsWith("/") ? endpoint : `${endpoint}/`

function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    const p = pipeline(
      "feature-extraction",
      MODEL
    ) as Promise<FeatureExtractionPipeline>
    // 失败不缓存:否则一次网络抖动就让进程内所有 embed 永久复用同一个 rejected promise
    p.catch(() => {
      if (extractorPromise === p) extractorPromise = null
    })
    extractorPromise = p
  }
  return extractorPromise
}

export async function embed(text: string): Promise<Float32Array> {
  const extractor = await getExtractor()
  const output = await extractor(text, { pooling: "mean", normalize: true })
  return Float32Array.from(output.data as Float32Array)
}
