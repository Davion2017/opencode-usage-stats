/**
 * 纯统计逻辑：时间范围、派生指标与格式化。
 * 无运行时依赖（仅类型导入），可独立单测。
 */
import type {
  ModelRef,
  SessionStatsInfo,
  SessionStatsToolTotals,
  TokenUsageInfo,
} from "@opencode/client"

export type { SessionStatsInfo, TokenUsageInfo, ModelRef }

export type RangeKey = "today" | "7d" | "30d" | "all" | "custom"

export const RANGE_OPTIONS: readonly { key: RangeKey; label: string }[] = [
  { key: "today", label: "今天" },
  { key: "7d", label: "7 天" },
  { key: "30d", label: "30 天" },
  { key: "all", label: "全部" },
  { key: "custom", label: "自定义" },
]

export interface CustomRange {
  from: number
  to?: number
}

const DAY_MS = 86_400_000

/** 统计范围的起始时间戳（毫秒）；「全部」返回 undefined 表示不限制。 */
export function rangeFrom(key: RangeKey, now = Date.now()): number | undefined {
  switch (key) {
    case "today": {
      const d = new Date(now)
      d.setHours(0, 0, 0, 0)
      return d.getTime()
    }
    case "7d":
      return now - 7 * DAY_MS
    case "30d":
      return now - 30 * DAY_MS
    case "all":
      return undefined
    case "custom":
      return undefined
  }
}

/** 计算请求 stats 端点的实际边界（毫秒）；自定义范围透传 from/to。 */
export function rangeBounds(
  key: RangeKey,
  custom: CustomRange | undefined,
  now = Date.now(),
): { from?: number; to?: number } {
  if (key === "custom") {
    if (!custom) return {}
    return { from: custom.from, to: custom.to }
  }
  const from = rangeFrom(key, now)
  return from === undefined ? {} : { from }
}

const DATE_TIME_RE = /^(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/

/**
 * 解析 "YYYY-MM-DD [HH:mm[:ss]]"（兼容 / 与 . 分隔）。
 * 仅日期时：start 取当天 00:00:00.000，end 取当天 23:59:59.999。无效输入返回 undefined。
 */
export function parseDateTimeInput(input: string, mode: "start" | "end"): number | undefined {
  const match = DATE_TIME_RE.exec(input.trim())
  if (!match) return undefined
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hasTime = match[4] !== undefined
  const hour = hasTime ? Number(match[4]) : mode === "end" ? 23 : 0
  const minute = hasTime ? Number(match[5]) : mode === "end" ? 59 : 0
  const second = hasTime ? (match[6] !== undefined ? Number(match[6]) : 0) : mode === "end" ? 59 : 0
  const ms = mode === "end" && !hasTime ? 999 : 0
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    return undefined
  }
  const date = new Date(year, month - 1, day, hour, minute, second, ms)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return undefined
  }
  return date.getTime()
}

export type CustomRangeParse = { from: number; to?: number } | { error: string }

/** 解析自定义范围输入；结束留空表示至今。 */
export function parseCustomRange(startInput: string, endInput: string | undefined): CustomRangeParse {
  const from = parseDateTimeInput(startInput, "start")
  if (from === undefined) {
    return { error: `开始时间无法解析：「${startInput}」，示例 2026-09-01 或 2026-09-01 09:30` }
  }
  const trimmedEnd = endInput?.trim()
  if (trimmedEnd) {
    const to = parseDateTimeInput(trimmedEnd, "end")
    if (to === undefined) {
      return { error: `结束时间无法解析：「${endInput}」，示例 2026-09-29 或 2026-09-29 18:00` }
    }
    if (to < from) return { error: "结束时间早于开始时间" }
    return { from, to }
  }
  return { from }
}

const TIME_ONLY_RE = /^\d{1,2}:\d{2}(:\d{2})?$/

/**
 * 解析一行式自定义范围输入：
 * - "2026-09-01"                          仅开始，至今
 * - "2026-09-01 ~ 2026-09-15"             起~止（分隔符支持 ~ 至 到）
 * - "2026-09-01 2026-09-15"               空格分隔起止（仅日期）
 * - "2026-09-01 09:30"                    开始带时间，至今
 * - "2026-09-01 09:30 ~ 2026-09-15 18:00" 起止均带时间
 */
export function parseCustomRangeInput(raw: string): CustomRangeParse {
  const text = raw.trim()
  if (!text) return { error: "请输入时间范围，示例：2026-09-01 ~ 2026-09-15" }
  const separator = text.match(/[~至到]/)
  if (separator?.[0]) {
    const index = text.indexOf(separator[0])
    return parseCustomRange(text.slice(0, index), text.slice(index + 1))
  }
  const tokens = text.split(/\s+/)
  if (tokens.length === 1) return parseCustomRange(tokens[0], undefined)
  if (tokens.length === 2) {
    const [first, second] = tokens as [string, string]
    if (TIME_ONLY_RE.test(second)) {
      return parseCustomRange(`${first} ${second}`, undefined)
    }
    return parseCustomRange(first, second)
  }
  return { error: "无法解析范围，请用 ~ 分隔起止时间，示例：2026-09-01 09:00 ~ 2026-09-15 18:00" }
}

/** 将时间戳转回可再次解析的输入文本；零点简写为日期。 */
export function toDateTimeInput(ms: number): string {
  const text = formatDateTime(ms)
  return text.endsWith(" 00:00") ? text.slice(0, 10) : text
}

/**
 * cc-switch 口径的「真实消耗 Tokens」：输入 + 输出 + 缓存读 + 缓存写。
 * reasoning 已计入 output，不重复相加。
 */
export function realTokens(t: TokenUsageInfo): number {
  return t.input + t.output + t.cache.read + t.cache.write
}

/** cc-switch 口径的「缓存命中率」：缓存读取占可缓存输入（输入 + 缓存读）的比例。 */
export function cacheHitRate(t: TokenUsageInfo): number {
  const denom = t.cache.read + t.input
  return denom > 0 ? t.cache.read / denom : 0
}

/** 工具调用汇总；mode=none 或无调用时返回 undefined。 */
export function toolTotals(stats: SessionStatsInfo): SessionStatsToolTotals | undefined {
  if (stats.tools.mode === "none") return undefined
  const totals = stats.tools.totals
  return totals.calls > 0 ? totals : undefined
}

/** 模型显示名：providerID/modelID(variant)，default 变体省略。 */
export function modelLabel(model: ModelRef): string {
  return model.variant && model.variant !== "default"
    ? `${model.providerID}/${model.id}(${model.variant})`
    : `${model.providerID}/${model.id}`
}

/** 模型按费用降序，其次按步骤降序。 */
export function sortedModels(models: SessionStatsInfo["models"]): SessionStatsInfo["models"] {
  return [...models].sort((a, b) => b.cost - a.cost || b.steps - a.steps)
}

/** 本机 IANA 时区，用于服务端按日聚合；取不到时返回 undefined。 */
export function localTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined
  } catch {
    return undefined
  }
}

// ---------- 格式化 ----------

/** Token 数人性化：1043731355 -> "1.0B"，67287622 -> "67.3M"。 */
export function formatTokens(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1e9) return trim1(n / 1e9) + "B"
  if (abs >= 1e6) return trim1(n / 1e6) + "M"
  if (abs >= 1e3) return trim1(n / 1e3) + "K"
  return String(Math.round(n))
}

function trim1(n: number): string {
  const s = n.toFixed(1)
  return s.endsWith(".0") ? s.slice(0, -2) : s
}

/** 美元费用：0 -> "$0"，0.001 -> "<$0.01"，其余两位小数。 */
export function formatMoney(usd: number): string {
  if (usd === 0) return "$0"
  if (usd > 0 && usd < 0.01) return "<$0.01"
  return "$" + usd.toFixed(2)
}

/** 比例转百分比：0.962 -> "96.2%"。 */
export function formatPercent(fraction: number, digits = 1): string {
  return (fraction * 100).toFixed(digits) + "%"
}

/** "2026-09-29" -> "09-29"。 */
export function formatDay(date: string): string {
  return date.length >= 10 ? date.slice(5) : date
}

/** 本地时间 "YYYY-MM-DD HH:mm"。 */
export function formatDateTime(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 本地日期 "MM-DD"。 */
export function formatLocalDay(ms: number): string {
  return formatDateTime(ms).slice(5, 10)
}

/** 中日韩等全角字符按 2 列计算的显示宽度。 */
export function displayWidth(text: string): number {
  let width = 0
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    const wide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe4f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x20000 && code <= 0x3fffd)
    width += wide ? 2 : 1
  }
  return width
}

/** 按显示宽度右补空格。 */
export function padDisplay(text: string, width: number): string {
  return text + " ".repeat(Math.max(0, width - displayWidth(text)))
}

/** 按显示宽度截断，超出部分以 … 结尾。 */
export function truncateDisplay(text: string, width: number): string {
  if (displayWidth(text) <= width) return text
  let out = ""
  let width2 = 0
  for (const ch of text) {
    const cw = displayWidth(ch)
    if (width2 + cw > width - 1) break
    out += ch
    width2 += cw
  }
  return out + "…"
}

/** 水平条形：ratio∈[0,1] 渲染到 barWidth 列。 */
export function bar(ratio: number, barWidth: number, char = "▇"): string {
  const clamped = Math.min(1, Math.max(0, ratio))
  const n = Math.round(clamped * barWidth)
  return char.repeat(n)
}
