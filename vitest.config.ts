import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

export default defineConfig({
  resolve: {
    alias: {
      // 与 tsconfig 的 "@/*": ["./*"] 对齐,供集中在 tests/ 的用例引用源码
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // macOS 外置卷上的 AppleDouble `._*` 资源文件不是 TypeScript；避免被 include 通配符误识别。
    exclude: ["tests/**/._*"],
    testTimeout: 20000,
  },
})
