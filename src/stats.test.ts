import { describe, expect, it } from "vitest"
import {
  bar,
  cacheHitRate,
  displayWidth,
  formatDateTime,
  formatDay,
  formatLocalDay,
  formatMoney,
  formatPercent,
  formatTokens,
  localTimeZone,
  modelLabel,
  padDisplay,
  parseCustomRange,
  parseCustomRangeInput,
  parseDateTimeInput,
  rangeBounds,
  rangeFrom,
  realTokens,
  sortedModels,
  toDateTimeInput,
  toolTotals,
  truncateDisplay,
  type SessionStatsInfo,
} from "./stats"

const usage = (input: number, output: number, read: number, write = 0, reasoning = 0) => ({
  input,
  output,
  reasoning,
  cache: { read, write },
})

describe("rangeFrom", () => {
  it("today 起点为本地零点", () => {
    const now = new Date(2026, 8, 29, 15, 42, 30, 500).getTime()
    expect(rangeFrom("today", now)).toBe(new Date(2026, 8, 29, 0, 0, 0, 0).getTime())
  })
  it("7d/30d 按整 24 小时回退", () => {
    const now = 1_791_000_000_000
    expect(rangeFrom("7d", now)).toBe(now - 7 * 86_400_000)
    expect(rangeFrom("30d", now)).toBe(now - 30 * 86_400_000)
  })
  it("all 无下界", () => {
    expect(rangeFrom("all", 1)).toBeUndefined()
  })
})

describe("realTokens / cacheHitRate", () => {
  it("真实消耗 = 输入+输出+缓存读+缓存写，reasoning 不重复计", () => {
    expect(realTokens(usage(100, 50, 800, 20, 30))).toBe(970)
  })
  it("命中率 = 缓存读 / (输入 + 缓存读)", () => {
    expect(cacheHitRate(usage(100, 0, 300))).toBeCloseTo(0.75)
  })
  it("分母为 0 时命中率为 0", () => {
    expect(cacheHitRate(usage(0, 0, 0))).toBe(0)
  })
})

describe("toolTotals", () => {
  it("none 模式无汇总", () => {
    const stats = { tools: { mode: "none" } } as unknown as SessionStatsInfo
    expect(toolTotals(stats)).toBeUndefined()
  })
  it("调用数为 0 时视为无汇总", () => {
    const stats = { tools: { mode: "summary", totals: { calls: 0, succeeded: 0, failed: 0, unfinished: 0 } } } as unknown as SessionStatsInfo
    expect(toolTotals(stats)).toBeUndefined()
  })
  it("summary/detail 模式返回汇总", () => {
    const totals = { calls: 10, succeeded: 9, failed: 1, unfinished: 0 }
    const stats = { tools: { mode: "summary", totals } } as unknown as SessionStatsInfo
    expect(toolTotals(stats)).toEqual(totals)
  })
})

describe("sortedModels / modelLabel", () => {
  it("按费用降序、费用相同按步骤降序", () => {
    const m = (cost: number, steps: number) => ({ model: { id: "x", providerID: "p" }, steps, tokens: usage(0, 0, 0), cost })
    expect(sortedModels([m(0, 5), m(2, 1), m(0, 9)]).map((x) => x.steps)).toEqual([1, 9, 5])
  })
  it("default 变体省略，非 default 附加括号", () => {
    expect(modelLabel({ id: "glm-5.3-flash", providerID: "zhipuai", variant: "default" })).toBe("zhipuai/glm-5.3-flash")
    expect(modelLabel({ id: "glm-5.3-flash", providerID: "zhipuai", variant: "high" })).toBe("zhipuai/glm-5.3-flash(high)")
  })
})

describe("formatTokens / formatMoney / formatPercent", () => {
  it("Token 单位换算", () => {
    expect(formatTokens(0)).toBe("0")
    expect(formatTokens(999)).toBe("999")
    expect(formatTokens(1234)).toBe("1.2K")
    expect(formatTokens(67_287_622)).toBe("67.3M")
    expect(formatTokens(1_043_731_355)).toBe("1B")
    expect(formatTokens(1_500_000_000)).toBe("1.5B")
  })
  it("费用格式化", () => {
    expect(formatMoney(0)).toBe("$0")
    expect(formatMoney(0.001)).toBe("<$0.01")
    expect(formatMoney(21.5865)).toBe("$21.59")
  })
  it("百分比", () => {
    expect(formatPercent(0.962)).toBe("96.2%")
    expect(formatPercent(1)).toBe("100.0%")
  })
})

describe("formatDay / formatDateTime / formatLocalDay", () => {
  it("ISO 日期取月-日", () => {
    expect(formatDay("2026-09-29")).toBe("09-29")
  })
  it("时间戳按本地时区格式化", () => {
    const ms = new Date(2026, 8, 29, 9, 5).getTime()
    expect(formatDateTime(ms)).toBe("2026-09-29 09:05")
    expect(formatLocalDay(ms)).toBe("09-29")
  })
})

describe("displayWidth / padDisplay / truncateDisplay", () => {
  it("全角字符宽度为 2", () => {
    expect(displayWidth("ab")).toBe(2)
    expect(displayWidth("统计")).toBe(4)
    expect(displayWidth("ab统计")).toBe(6)
  })
  it("补齐与截断按显示宽度", () => {
    expect(displayWidth(padDisplay("统计", 8))).toBe(8)
    expect(truncateDisplay("abcdef", 4)).toBe("abc…")
    expect(displayWidth(truncateDisplay("abcdef", 4))).toBe(4)
    expect(truncateDisplay("统计", 10)).toBe("统计")
  })
})

describe("bar", () => {
  it("按比例渲染并夹取", () => {
    expect(bar(0.5, 10)).toBe("▇▇▇▇▇")
    expect(bar(0, 10)).toBe("")
    expect(bar(2, 10)).toBe("▇".repeat(10))
    expect(bar(0.3, 10, "#")).toBe("###")
  })
})

describe("parseDateTimeInput", () => {
  it("仅日期：start 取零点，end 取当天末尾", () => {
    expect(parseDateTimeInput("2026-09-01", "start")).toBe(new Date(2026, 8, 1, 0, 0, 0, 0).getTime())
    expect(parseDateTimeInput("2026-09-01", "end")).toBe(new Date(2026, 8, 1, 23, 59, 59, 999).getTime())
  })
  it("带时间按本地时区精确解析", () => {
    expect(parseDateTimeInput("2026-09-01 09:30", "start")).toBe(new Date(2026, 8, 1, 9, 30).getTime())
    expect(parseDateTimeInput("2026-09-01 09:30:15", "start")).toBe(new Date(2026, 8, 1, 9, 30, 15).getTime())
  })
  it("兼容 / 与 . 分隔符", () => {
    expect(parseDateTimeInput("2026/09/01", "start")).toBe(new Date(2026, 8, 1).getTime())
    expect(parseDateTimeInput("2026.09.01", "start")).toBe(new Date(2026, 8, 1).getTime())
  })
  it("非法输入返回 undefined", () => {
    expect(parseDateTimeInput("abc", "start")).toBeUndefined()
    expect(parseDateTimeInput("2026-13-01", "start")).toBeUndefined()
    expect(parseDateTimeInput("2026-02-30", "start")).toBeUndefined()
    expect(parseDateTimeInput("2026-09-01 25:00", "start")).toBeUndefined()
    expect(parseDateTimeInput("", "start")).toBeUndefined()
  })
})

describe("parseCustomRange", () => {
  it("结束留空表示至今", () => {
    const r = parseCustomRange("2026-09-01", "  ")
    expect(r).toEqual({ from: new Date(2026, 8, 1).getTime() })
  })
  it("起止齐全时返回边界，end 为当天末尾", () => {
    const r = parseCustomRange("2026-09-01", "2026-09-15")
    expect(r).toEqual({
      from: new Date(2026, 8, 1).getTime(),
      to: new Date(2026, 8, 15, 23, 59, 59, 999).getTime(),
    })
  })
  it("结束早于开始报错", () => {
    const r = parseCustomRange("2026-09-15", "2026-09-01")
    expect("error" in r && r.error).toContain("结束时间早于开始时间")
  })
  it("开始无法解析报错", () => {
    const r = parseCustomRange("9月1号", undefined)
    expect("error" in r && r.error).toContain("开始时间无法解析")
  })
})

describe("parseCustomRangeInput", () => {
  it("单个日期表示至今", () => {
    expect(parseCustomRangeInput("2026-09-01")).toEqual({ from: new Date(2026, 8, 1).getTime() })
  })
  it("~ / 至 / 空格分隔起止", () => {
    const expected = {
      from: new Date(2026, 8, 1).getTime(),
      to: new Date(2026, 8, 15, 23, 59, 59, 999).getTime(),
    }
    expect(parseCustomRangeInput("2026-09-01 ~ 2026-09-15")).toEqual(expected)
    expect(parseCustomRangeInput("2026-09-01至2026-09-15")).toEqual(expected)
    expect(parseCustomRangeInput("2026-09-01 2026-09-15")).toEqual(expected)
  })
  it("第二个 token 是时间时作为开始时间", () => {
    expect(parseCustomRangeInput("2026-09-01 09:30")).toEqual({
      from: new Date(2026, 8, 1, 9, 30).getTime(),
    })
  })
  it("起止均带时间", () => {
    expect(parseCustomRangeInput("2026-09-01 09:30 ~ 2026-09-15 18:00")).toEqual({
      from: new Date(2026, 8, 1, 9, 30).getTime(),
      to: new Date(2026, 8, 15, 18, 0).getTime(),
    })
  })
  it("空输入与非法输入报错", () => {
    expect("error" in parseCustomRangeInput("")).toBe(true)
    expect("error" in parseCustomRangeInput("abc")).toBe(true)
    expect("error" in parseCustomRangeInput("2026-09-15 ~ 2026-09-01")).toBe(true)
  })
})

describe("toDateTimeInput", () => {
  it("零点简写为日期，其余保留时间", () => {
    expect(toDateTimeInput(new Date(2026, 8, 1, 0, 0).getTime())).toBe("2026-09-01")
    expect(toDateTimeInput(new Date(2026, 8, 1, 9, 30).getTime())).toBe("2026-09-01 09:30")
  })
})

describe("rangeBounds", () => {
  it("自定义透传 from/to", () => {
    expect(rangeBounds("custom", { from: 100, to: 200 })).toEqual({ from: 100, to: 200 })
    expect(rangeBounds("custom", { from: 100 })).toEqual({ from: 100 })
  })
  it("自定义缺失 custom 时无边界", () => {
    expect(rangeBounds("custom", undefined)).toEqual({})
  })
  it("预设范围返回 from，全部无边界", () => {
    const now = 1_791_000_000_000
    expect(rangeBounds("7d", undefined, now)).toEqual({ from: now - 7 * 86_400_000 })
    expect(rangeBounds("all", undefined, now)).toEqual({})
  })
})

describe("localTimeZone", () => {
  it("返回 IANA 时区或 undefined", () => {
    const tz = localTimeZone()
    expect(tz === undefined || typeof tz === "string").toBe(true)
  })
})
