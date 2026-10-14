"use client"

import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { SectionCard } from "@/components/admin/section-card"
import { ConfigTabContent } from "./config-tab-content"

import type { ConfigForm } from "./use-config-form"

/** 平台品牌与客服身份设置；业务事实仍由知识库和插件提供。 */
export function BrandSettings({
  cfg,
  updateField,
  embedded = false,
}: Pick<ConfigForm, "cfg" | "updateField"> & { embedded?: boolean }) {
  return (
    <ConfigTabContent value="brand" embedded={embedded}>
      <SectionCard
        title="品牌"
        description="设置对外名称与客服身份。保存后会同步到管理后台和 Agent。"
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="brandName">品牌名称</FieldLabel>
            <Input
              id="brandName"
              value={cfg.brandName ?? "Prayer"}
              maxLength={80}
              onChange={(e) => updateField("brandName", e.target.value)}
            />
            <FieldDescription>
              默认是 Prayer，也可以填写团队或产品的白标名称。
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="brandDescription">品牌简介</FieldLabel>
            <Input
              id="brandDescription"
              value={cfg.brandDescription ?? "多渠道 AI 客服中台"}
              maxLength={500}
              onChange={(e) => updateField("brandDescription", e.target.value)}
            />
            <FieldDescription>
              用一句话说明客服所服务的产品或业务；具体事实仍以知识库和业务插件为准。
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="replyRules">客服回复规则</FieldLabel>
            <Textarea
              id="replyRules"
              value={cfg.replyRules ?? ""}
              maxLength={4000}
              rows={7}
              placeholder={
                "例如：\n- 自我介绍时称为「某某公司官方客服机器人」。\n- 使用简体中文，语气专业、简洁。\n- 不确定的信息先说明无法核实，不要猜测。\n- 每次回复控制在 300 字以内。"
              }
              onChange={(e) => updateField("replyRules", e.target.value)}
            />
            <FieldDescription>
              配置称呼、语气、回复格式和业务表达习惯。系统身份、保密和转人工边界始终由内置规则保护。
            </FieldDescription>
          </Field>
        </FieldGroup>
      </SectionCard>
    </ConfigTabContent>
  )
}
