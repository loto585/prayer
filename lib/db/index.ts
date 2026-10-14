import Database from "better-sqlite3"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import * as sqliteVec from "sqlite-vec"
import { migrateDatabase } from "./migrations/index.ts"

export const DIM = 512 // bge-small-zh-v1.5 输出维度

export function openDb(dbPath: string, dim: number = DIM): Database.Database {
  // better-sqlite3 不会自动创建父目录；首次启动时确保默认 ./data 可用。
  // dirname(":memory:") 返回当前目录，不影响内存数据库测试和调用方。
  mkdirSync(dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  try {
    db.pragma("journal_mode = WAL")
    sqliteVec.load(db)
    migrateDatabase(db, dim)
    return db
  } catch (error) {
    // 启动失败时立即释放文件句柄，避免阻塞修复或恢复数据库。
    db.close()
    throw error
  }
}

export {
  ensurePerfIndexes,
  ensureQuestionTopicUnique,
  ensureSeenMessagesCreatedIndex,
  migrateLegacySessionKeys,
} from "./migrations/index.ts"
