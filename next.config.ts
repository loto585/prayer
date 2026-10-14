import type { NextConfig } from "next"

// macOS 外置/共享挂载卷会生成 AppleDouble `._*` 文件，Turbopack 持久化
// 缓存无法稳定解析这类条目。仅在该场景默认关闭；也可用环境变量显式开启。
const disableTurbopackFileSystemCache =
  process.env.PRAYER_DISABLE_TURBOPACK_CACHE !== "false" &&
  (process.env.PRAYER_DISABLE_TURBOPACK_CACHE === "true" ||
    (process.platform === "darwin" && process.cwd().startsWith("/Volumes/")))

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "better-sqlite3",
    "sqlite-vec",
    "@huggingface/transformers",
    "grammy",
  ],
  // 构建产物目录可用 NEXT_DIST_DIR 覆盖(默认 .next 不变):
  // 生产实例由 pm2 跑 `next start` 直接服务 .next,验证构建时指到别的目录,
  // 避免边跑边覆写在跑实例的产物。
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // 关闭文件系统缓存只影响构建/开发缓存，不影响运行时数据或生产页面。
  experimental: {
    turbopackFileSystemCacheForDev: !disableTurbopackFileSystemCache,
    turbopackFileSystemCacheForBuild: !disableTurbopackFileSystemCache,
  },
}

export default nextConfig
