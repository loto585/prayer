import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-verify/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // macOS 在部分挂载卷上生成的 AppleDouble 元数据，不是源码。
    "**/._*",
    // 运行时产物,非源码(gitignored):
    "data/**",
    "logs/**",
    "docs/kb/**",
  ]),
])

export default eslintConfig
