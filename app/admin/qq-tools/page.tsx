"use client"

import { useEffect, useMemo, useState } from "react"
import { RefreshCw, Send, Pin } from "lucide-react"
import { toast } from "sonner"
import { PageShell } from "@/components/admin/page-shell"
import { PageHeader } from "@/components/admin/page-header"
import { SectionCard } from "@/components/admin/section-card"
import { ErrorState } from "@/components/admin/data-state"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"

interface Group {
  groupId: number
  groupName: string
}

interface Result {
  groupId: number
  ok: boolean
  error?: string
}

function parseIds(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split(/[\s,;]+/)
        .map((value) => value.trim())
        .filter((value) => /^[1-9]\d*$/.test(value))
    )
  )
}

export default function QqToolsPage() {
  const [groups, setGroups] = useState<Group[] | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [manualIds, setManualIds] = useState("")
  const [message, setMessage] = useState("")
  const [notice, setNotice] = useState("")
  const [mentionAll, setMentionAll] = useState(false)
  const [pinNotice, setPinNotice] = useState(false)
  const [sending, setSending] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [results, setResults] = useState<Result[]>([])

  async function loadGroups() {
    try {
      const response = await fetch("/api/onebot/groups?refresh=1")
      const body = await response.json()
      if (!body.ok) throw new Error(body.error ?? "群列表获取失败")
      setGroups(body.data as Group[])
    } catch (error) {
      setGroups(null)
      toast.error(error instanceof Error ? error.message : "群列表获取失败")
    }
  }

  useEffect(() => {
    let cancelled = false
    fetch("/api/onebot/groups?refresh=1")
      .then((response) => response.json())
      .then((body) => {
        if (cancelled) return
        setGroups(
          body.ok && Array.isArray(body.data) ? (body.data as Group[]) : null
        )
      })
      .catch(() => {
        if (!cancelled) setGroups(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const targetIds = useMemo(
    () => Array.from(new Set([...selected, ...parseIds(manualIds)])),
    [manualIds, selected]
  )

  function toggleGroup(id: number) {
    const value = String(id)
    setSelected((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
    )
  }

  async function sendBroadcast() {
    if (targetIds.length === 0 || !message.trim()) {
      toast.error("请选择群并填写消息")
      return
    }
    setSending(true)
    try {
      const response = await fetch("/api/qq/broadcast", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          groupIds: targetIds,
          text: message,
          mentionAll,
        }),
      })
      const body = await response.json()
      if (!body.ok) throw new Error(body.error ?? "群发失败")
      setResults(body.data.results)
      toast.success(`已发送 ${body.data.succeeded} 个群`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "群发失败")
    } finally {
      setSending(false)
    }
  }

  async function publishNotice() {
    if (targetIds.length === 0 || !notice.trim()) {
      toast.error("请选择群并填写公告")
      return
    }
    setPublishing(true)
    try {
      const response = await fetch("/api/qq/notice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          groupIds: targetIds,
          content: notice,
          pinned: pinNotice,
        }),
      })
      const body = await response.json()
      if (!body.ok) throw new Error(body.error ?? "公告发布失败")
      setResults(body.data.results)
      toast.success(
        `已发布 ${body.data.succeeded} 个群公告${pinNotice ? "（已置顶）" : ""}`
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "公告发布失败")
    } finally {
      setPublishing(false)
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="QQ 运维"
        description="向多个群发送消息，或批量发布群公告。"
        actions={
          <Button variant="outline" onClick={() => void loadGroups()}>
            <RefreshCw data-icon="inline-start" />
            刷新群列表
          </Button>
        }
      />

      <SectionCard
        title="目标群"
        description="选择已连接 QQ 账号所在的群，也可以直接输入群号。"
      >
        <FieldGroup>
          {groups === null ? (
            <ErrorState description="无法获取群列表，请确认 QQ 通道已连接。" />
          ) : groups.length === 0 ? (
            <FieldDescription>暂未获取到群列表。</FieldDescription>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {groups.map((group) => (
                <label
                  key={group.groupId}
                  className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/50"
                >
                  <Checkbox
                    checked={selected.includes(String(group.groupId))}
                    onCheckedChange={() => toggleGroup(group.groupId)}
                  />
                  <span className="min-w-0 truncate">
                    {group.groupName} ({group.groupId})
                  </span>
                </label>
              ))}
            </div>
          )}
          <Field>
            <FieldLabel htmlFor="manualGroupIds">补充群号</FieldLabel>
            <Textarea
              id="manualGroupIds"
              rows={2}
              value={manualIds}
              onChange={(event) => setManualIds(event.target.value)}
              placeholder="123456789, 987654321"
            />
            <FieldDescription>
              当前目标：{targetIds.length}{" "}
              个群。多个群号用空格、逗号或换行分隔。
            </FieldDescription>
          </Field>
        </FieldGroup>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="群发消息"
          description="逐群发送普通消息，可同时 @全体成员。"
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="broadcastMessage">消息内容</FieldLabel>
              <Textarea
                id="broadcastMessage"
                rows={6}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="请输入要发送到各群的内容"
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={mentionAll}
                onCheckedChange={(value) => setMentionAll(value === true)}
              />
              @全体成员
            </label>
            <Button
              onClick={() => void sendBroadcast()}
              disabled={sending || targetIds.length === 0}
            >
              {sending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Send data-icon="inline-start" />
              )}
              {sending ? "发送中…" : "发送到所选群"}
            </Button>
          </FieldGroup>
        </SectionCard>

        <SectionCard
          title="群公告"
          description="在所选群发布一条群公告，默认不置顶。"
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="groupNotice">公告内容</FieldLabel>
              <Textarea
                id="groupNotice"
                rows={6}
                value={notice}
                onChange={(event) => setNotice(event.target.value)}
                placeholder="请输入群公告内容"
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={pinNotice}
                onCheckedChange={(value) => setPinNotice(value === true)}
              />
              置顶
            </label>
            <Button
              onClick={() => void publishNotice()}
              disabled={publishing || targetIds.length === 0}
            >
              {publishing ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Pin data-icon="inline-start" />
              )}
              {publishing ? "发布中…" : "发布公告"}
            </Button>
          </FieldGroup>
        </SectionCard>
      </div>

      {results.length > 0 && (
        <SectionCard title="最近结果" description="本次操作按群返回的结果。">
          <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {results.map((result) => (
              <div
                key={result.groupId}
                className="flex items-center justify-between border-b py-2"
              >
                <span>{result.groupId}</span>
                <span
                  className={
                    result.ok ? "text-emerald-600" : "text-destructive"
                  }
                >
                  {result.ok ? "成功" : (result.error ?? "失败")}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </PageShell>
  )
}
