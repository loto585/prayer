"use client"

import { ChevronsUpDown, X } from "lucide-react"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { SectionCard } from "@/components/admin/section-card"

import type { ConfigForm } from "./use-config-form"

const roleLabel = (role: "owner" | "admin") =>
  role === "owner" ? "群主" : "管理"

function parseList(value: string): string[] {
  return value.split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean)
}

export function QqSettings({
  cfg,
  setCfg,
  updateField,
  fieldValue,
  groups,
  groupsLoading,
  admins,
  adminsLoading,
  enabledQqIds,
  adminQq,
  toggleGroup,
  adminLabel,
  toggleExtraAt,
  groupName,
}: Pick<
  ConfigForm,
  | "cfg"
  | "setCfg"
  | "updateField"
  | "fieldValue"
  | "groups"
  | "groupsLoading"
  | "admins"
  | "adminsLoading"
  | "enabledQqIds"
  | "adminQq"
  | "toggleGroup"
  | "adminLabel"
  | "toggleExtraAt"
  | "groupName"
> ) {
  return (
    <SectionCard title="QQ 通道" description="OneBot 连接地址与群相关参数。">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="onebotWsUrl">WS 地址</FieldLabel>
          <Input
            id="onebotWsUrl"
            value={cfg.onebotWsUrl}
            placeholder="ws://127.0.0.1:3001"
            onChange={(e) => updateField("onebotWsUrl", e.target.value)}
          />
        </Field>
        <Field>
          <div className="flex items-center justify-between gap-3">
            <div>
              <FieldLabel htmlFor="qqLinkWhitelistEnabled">链接白名单</FieldLabel>
              <FieldDescription>
                开启后，生效群里不在域名列表中的链接会被自动撤回；管理群和机器人自身消息免检。
              </FieldDescription>
            </div>
            <Switch
              id="qqLinkWhitelistEnabled"
              checked={cfg.qqLinkWhitelistEnabled}
              onCheckedChange={(checked) => setCfg({ ...cfg, qqLinkWhitelistEnabled: checked })}
            />
          </div>
        </Field>
        <Field>
          <FieldLabel htmlFor="qqLinkWhitelist">允许的域名</FieldLabel>
          <Textarea
            id="qqLinkWhitelist"
            rows={3}
            value={(cfg.qqLinkWhitelist ?? []).join("\n")}
            placeholder="example.com\ntrusted.example.cn"
            onChange={(event) => setCfg({ ...cfg, qqLinkWhitelist: parseList(event.target.value) })}
          />
          <FieldDescription>每行一个域名；匹配时忽略大小写并允许其子域名。开启白名单但列表为空时会撤回所有含链接的消息。</FieldDescription>
        </Field>
        <Field>
          <div className="flex items-center justify-between gap-3">
            <div>
              <FieldLabel htmlFor="groupRequestEnabled">入群申请验证</FieldLabel>
              <FieldDescription>只处理当前生效 QQ 群的申请；申请备注中的订单号需通过付款校验。</FieldDescription>
            </div>
            <Switch
              id="groupRequestEnabled"
              checked={cfg.groupRequestEnabled}
              onCheckedChange={(checked) => setCfg({ ...cfg, groupRequestEnabled: checked })}
            />
          </div>
        </Field>
        {cfg.groupRequestEnabled && (
          <>
            <Field>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <FieldLabel htmlFor="groupRequestRequireOrder">必须提供订单号</FieldLabel>
                  <FieldDescription>关闭后，没有订单号的申请交由管理员手动处理。</FieldDescription>
                </div>
                <Switch
                  id="groupRequestRequireOrder"
                  checked={cfg.groupRequestRequireOrder}
                  onCheckedChange={(checked) => setCfg({ ...cfg, groupRequestRequireOrder: checked })}
                />
              </div>
            </Field>
            <Field>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <FieldLabel htmlFor="groupRequestAutoApprove">验证通过后自动审批</FieldLabel>
                  <FieldDescription>关闭时，仅记录验证结果并拒绝申请，需人工审批。</FieldDescription>
                </div>
                <Switch
                  id="groupRequestAutoApprove"
                  checked={cfg.groupRequestAutoApprove}
                  onCheckedChange={(checked) => setCfg({ ...cfg, groupRequestAutoApprove: checked })}
                />
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor="groupRequestOrderQueryUrl">订单校验地址</FieldLabel>
              <Input
                id="groupRequestOrderQueryUrl"
              value={cfg.groupRequestOrderQueryUrl ?? "https://rc.cnweb.org/api/bill/query"}
                onChange={(event) => setCfg({ ...cfg, groupRequestOrderQueryUrl: event.target.value })}
              />
            </Field>
          </>
        )}
        <Field>
          <FieldLabel htmlFor="onebotAccessToken">Access Token</FieldLabel>
          <Input
            id="onebotAccessToken"
            value={cfg.onebotAccessToken}
            placeholder="留空不修改"
            onChange={(e) => updateField("onebotAccessToken", e.target.value)}
          />
          <FieldDescription>
            已保存的密钥以掩码显示,留空或不改动则保留原值。
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="botQQ">Bot QQ</FieldLabel>
          <Input
            id="botQQ"
            inputMode="numeric"
            value={fieldValue("botQQ")}
            onChange={(e) => updateField("botQQ", e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="enabledChatsQq">生效群</FieldLabel>
          {groups ? (
            <>
              <Popover>
                <PopoverTrigger
                  render={
                    <Button
                      id="enabledChatsQq"
                      variant="outline"
                      role="combobox"
                      className="justify-between font-normal"
                    />
                  }
                >
                  {enabledQqIds.length
                    ? `已选 ${enabledQqIds.length} 个群`
                    : "选择生效群"}
                  <ChevronsUpDown className="opacity-50" />
                </PopoverTrigger>
                <PopoverContent className="p-0" align="start">
                  <Command>
                    <CommandInput placeholder="搜索群名…" />
                    <CommandList>
                      <CommandEmpty>无匹配群</CommandEmpty>
                      <CommandGroup>
                        {groups.map((g) => (
                          <CommandItem
                            key={g.groupId}
                            value={`${g.groupName} ${g.groupId}`}
                            disabled={adminQq === g.groupId}
                            onSelect={() => toggleGroup(g.groupId)}
                          >
                            <Checkbox
                              checked={enabledQqIds.includes(g.groupId)}
                              disabled={adminQq === g.groupId}
                              className="mr-2"
                            />
                            {g.groupName} ({g.groupId})
                            {adminQq === g.groupId && (
                              <span className="ml-1 text-xs text-muted-foreground">
                                管理群
                              </span>
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {enabledQqIds.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {enabledQqIds.map((id) => (
                    <Badge
                      key={id}
                      variant="secondary"
                      className="cursor-pointer gap-1"
                      onClick={() => toggleGroup(id)}
                    >
                      {groupName(id)}
                      <X className="size-3" />
                    </Badge>
                  ))}
                </div>
              )}
              <FieldDescription>
                仅这些群里 bot
                才会回复。管理群不可选(只处理管理命令)。也可在「生效会话」页一键开关。
              </FieldDescription>
            </>
          ) : (
            <FieldDescription>
              {groupsLoading
                ? "正在获取群列表…"
                : "bot 未连接,无法获取群列表。"}
            </FieldDescription>
          )}
        </Field>
        <Field>
          <FieldLabel htmlFor="extraAtQQs">额外监听 AT</FieldLabel>
          {!enabledQqIds.length ? (
            <FieldDescription>
              请先选择生效群,再从群管理员中勾选。
            </FieldDescription>
          ) : adminsLoading ? (
            <FieldDescription>正在拉取生效群管理员…</FieldDescription>
          ) : admins === null ? (
            <FieldDescription>
              bot 未连接或无法获取群成员,请确认 OneBot 已连接。
            </FieldDescription>
          ) : (
            <>
              <Popover>
                <PopoverTrigger
                  render={
                    <Button
                      id="extraAtQQs"
                      variant="outline"
                      role="combobox"
                      className="justify-between font-normal"
                    />
                  }
                >
                  {cfg.extraAtQQs.length
                    ? `已选 ${cfg.extraAtQQs.length} 人`
                    : "选择群管理员"}
                  <ChevronsUpDown className="opacity-50" />
                </PopoverTrigger>
                <PopoverContent className="p-0" align="start">
                  <Command>
                    <CommandInput placeholder="搜索昵称或 QQ…" />
                    <CommandList>
                      <CommandEmpty>无匹配管理员</CommandEmpty>
                      <CommandGroup>
                        {admins.map((a) => (
                          <CommandItem
                            key={a.userId}
                            value={`${a.name} ${a.userId} ${roleLabel(a.role)}`}
                            onSelect={() => toggleExtraAt(a.userId)}
                          >
                            <Checkbox
                              checked={cfg.extraAtQQs.includes(a.userId)}
                              className="mr-2"
                            />
                            <span className="min-w-0 flex-1 truncate">
                              {a.name} ({a.userId})
                            </span>
                            <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                              {roleLabel(a.role)}
                              {a.groupIds.length > 1
                                ? ` · ${a.groupIds.length} 群`
                                : ""}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {cfg.extraAtQQs.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {cfg.extraAtQQs.map((qq) => (
                    <Badge
                      key={qq}
                      variant="secondary"
                      className="cursor-pointer gap-1"
                      onClick={() => toggleExtraAt(qq)}
                    >
                      {adminLabel(qq)}
                      <X className="size-3" />
                    </Badge>
                  ))}
                </div>
              )}
              <FieldDescription>
                从生效群的群主/管理员中多选(跨群已去重,不含 Bot QQ)。群友 @
                这些人时也当作 @bot 处理。
                {admins.length === 0 ? " 当前生效群未识别到管理员。" : ""}
              </FieldDescription>
            </>
          )}
        </Field>
      </FieldGroup>
    </SectionCard>
  )
}
