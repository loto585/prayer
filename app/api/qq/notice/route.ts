import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getRuntime } from "@/lib/runtime"
import { fail, ok } from "@/lib/api"
import { normalizeGroupIds, publishNotice, resolveQqOps } from "@/lib/qq/ops"

const requestSchema = z.object({
  groupIds: z
    .array(z.union([z.string(), z.number()]))
    .min(1)
    .max(100),
  content: z.string().trim().min(1).max(5000),
  /** 缺省不置顶,与管理面 /公告 指令、后台页面一致 */
  pinned: z.boolean().default(false),
})

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => null)
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json(fail("参数非法"), { status: 400 })

  const groupIds = normalizeGroupIds(parsed.data.groupIds)
  if (groupIds.length === 0) {
    return NextResponse.json(fail("至少填写一个有效群号"), { status: 400 })
  }
  const ops = resolveQqOps(getRuntime().getChannel("qq"))
  if (!ops) {
    return NextResponse.json(fail("QQ 通道未连接"), { status: 503 })
  }

  const summary = await publishNotice(
    ops,
    groupIds,
    parsed.data.content,
    parsed.data.pinned
  )
  return NextResponse.json(ok(summary))
}
