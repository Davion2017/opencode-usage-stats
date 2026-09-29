/**
 * 用量统计面板视图。数据来自 OpenCode 服务端
 * GET /api/experimental/session/stats（经 context.client.session.stats 调用）。
 */
import { For, Show, createEffect, createSignal, on } from "solid-js"
import type { RGBA } from "@opentui/core"
import type { Context } from "@opencode/plugin/tui/plugin"
import type { SessionStatsInfo } from "@opencode/client"
import {
  RANGE_OPTIONS,
  bar,
  cacheHitRate,
  formatDateTime,
  formatDay,
  formatLocalDay,
  formatMoney,
  formatPercent,
  formatTokens,
  modelLabel,
  padDisplay,
  parseCustomRangeInput,
  rangeBounds,
  realTokens,
  sortedModels,
  toDateTimeInput,
  toolTotals,
  truncateDisplay,
  type CustomRange,
  type RangeKey,
} from "./stats"

const PAGE_HINT = "[1] 今天  [2] 7天  [3] 30天  [4] 全部  [5] 自定义   r 刷新   q 返回"

export interface SessionReturn {
  type: "session"
  sessionID: string
}

interface Query {
  key: RangeKey
  custom?: CustomRange
}

const MODEL_COL = 42
const NUM_COL = 9
const COST_COL = 9
const BAR_COL = 8
const ACTIVITY_BARS = 30

export function Dashboard(props: { context: Context; returnTo?: SessionReturn }) {
  const theme = props.context.theme
  const muted = theme.text.muted
  const strong = theme.text.base
  const accent = theme.hue.accent[500]
  const bad = theme.text.feedback.error.base

  const [query, setQuery] = createSignal<Query>({ key: "7d" })
  const [data, setData] = createSignal<SessionStatsInfo>()
  const [error, setError] = createSignal<string>()
  const [loading, setLoading] = createSignal(false)
  const [updatedAt, setUpdatedAt] = createSignal<string>()
  const [dialogOpen, setDialogOpen] = createSignal(false)
  const [lastCustom, setLastCustom] = createSignal<CustomRange>()
  let seq = 0
  let prompting = false

  const load = async () => {
    const id = ++seq
    setLoading(true)
    setError(undefined)
    try {
      const stats = await props.context.client.session.stats({
        ...rangeBounds(query().key, query().custom),
        tools: "summary",
        timezone: timeZone(),
      })
      if (id !== seq) return
      setData(stats)
      setUpdatedAt(clock())
    } catch (e) {
      if (id !== seq) return
      setData(undefined)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (id === seq) setLoading(false)
    }
  }

  createEffect(on(query, () => void load()))

  const promptCustom = async () => {
    if (prompting) return
    prompting = true
    setDialogOpen(true)
    try {
      const previous = lastCustom()
      const raw = await props.context.ui.dialog.prompt({
        title: "自定义时间范围",
        description: "一行填写起止：2026-09-01 ~ 2026-09-15；结束留空表示至今，支持 HH:mm",
        placeholder: "2026-09-01 ~ 2026-09-15",
        value: previous
          ? `${toDateTimeInput(previous.from)} ~ ${previous.to ? toDateTimeInput(previous.to) : ""}`
          : undefined,
      })
      if (raw === undefined || !raw.trim()) return
      const parsed = parseCustomRangeInput(raw)
      if ("error" in parsed) {
        props.context.ui.toast.show({ title: "用量统计", message: parsed.error, variant: "error" })
        return
      }
      setLastCustom(parsed)
      setQuery({ key: "custom", custom: parsed })
    } finally {
      prompting = false
      setDialogOpen(false)
    }
  }

  const close = () => {
    const back = props.returnTo
    if (back?.type === "session") {
      props.context.ui.router.navigate({ type: "session", sessionID: back.sessionID })
    } else {
      props.context.ui.router.navigate({ type: "home" })
    }
  }

  props.context.keymap.layer(() => ({
    mode: "global",
    priority: 20,
    // 对话框打开期间禁用快捷键，避免数字/字母键被拦截（如日期中的 1/2/5/r/q）。
    enabled: () => !dialogOpen(),
    commands: [
      ...RANGE_OPTIONS.map((option, index) => {
        if (option.key === "custom") {
          return {
            id: "usage.range.custom",
            title: "统计范围: 自定义",
            group: "Usage",
            bind: String(index + 1),
            run: () => void promptCustom(),
          }
        }
        return {
          id: `usage.range.${option.key}`,
          title: `统计范围: ${option.label}`,
          group: "Usage",
          bind: String(index + 1),
          run: () => setQuery({ key: option.key }),
        }
      }),
      {
        id: "usage.refresh",
        title: "刷新统计",
        group: "Usage",
        bind: "r",
        run: () => void load(),
      },
      {
        id: "usage.close",
        title: props.returnTo?.type === "session" ? "返回会话" : "关闭统计面板",
        group: "Usage",
        bind: "q",
        run: close,
      },
    ],
  }))

  const rangeLabel = () => {
    const q = query()
    if (q.key === "custom" && q.custom) {
      const to = q.custom.to
      const toText = to ? `${formatLocalDay(to)} ${formatDateTime(to).slice(11, 16)}` : "至今"
      return `自定义 ${formatLocalDay(q.custom.from)} ${formatDateTime(q.custom.from).slice(11, 16)} ~ ${toText}`
    }
    return RANGE_OPTIONS.find((o) => o.key === q.key)?.label ?? ""
  }

  return (
    <box width="100%" height="100%" flexDirection="column" paddingTop={1} paddingBottom={1} paddingLeft={2} paddingRight={2}>
      <box flexDirection="row" justifyContent="space-between" paddingBottom={1}>
        <text fg={strong}>
          <b>OpenCode 用量统计</b>
        </text>
        <text fg={muted}>{PAGE_HINT}</text>
      </box>

      <Show
        when={!error()}
        fallback={
          <box flexDirection="column" flexGrow={1} paddingTop={1}>
            <text fg={bad}>✗ 统计获取失败：{error()}</text>
            <text fg={muted}>按 r 重试。v2 以下的服务端不支持统计端点。</text>
          </box>
        }
      >
        <scrollbox flexGrow={1} focused={true}>
          <Show when={data()} keyed fallback={<text fg={muted}>{loading() ? "加载中…" : "暂无数据，按 r 刷新"}</text>}>
            {(d: SessionStatsInfo) => <Body d={d} theme={theme} accent={accent} muted={muted} strong={strong} />}
          </Show>
        </scrollbox>
      </Show>

      <box paddingTop={1}>
        <text fg={muted}>
          范围 {rangeLabel()} · {loading() ? "刷新中…" : updatedAt() ? `更新于 ${updatedAt()}` : "就绪"} · 命中率=缓存读/(输入+缓存读) · 真实消耗=输入+输出+缓存
        </text>
      </box>
    </box>
  )
}

function Body(props: {
  d: SessionStatsInfo
  theme: Context["theme"]
  accent: RGBA
  muted: RGBA
  strong: RGBA
}) {
  const d = props.d
  const t = d.tokens
  const totals = toolTotals(d)
  const summary = [
    `提示 ${d.prompts}`,
    `步骤 ${d.steps}`,
    `子代理 ${d.subagents}`,
    `活跃 ${d.activeDays} 天`,
    `连续 ${d.streak} 天`,
    totals ? `工具成功率 ${formatPercent(totals.succeeded / totals.calls)} (${totals.succeeded}/${totals.calls})` : undefined,
  ]
    .filter(Boolean)
    .join(" · ")

  const detail = `输入 ${formatTokens(t.input)} · 输出 ${formatTokens(t.output)} · 推理 ${formatTokens(t.reasoning)} · 缓存读 ${formatTokens(
    t.cache.read,
  )} · 缓存写 ${formatTokens(t.cache.write)}`

  const hit = cacheHitRate(t)
  const hero = [
    { label: "真实消耗", value: `${formatTokens(realTokens(t))} tokens`, fg: props.strong },
    { label: "缓存命中率", value: formatPercent(hit), fg: hit >= 0.8 ? props.theme.text.feedback.success.base : props.strong },
    { label: "估算费用", value: formatMoney(d.cost), fg: d.cost > 0 ? props.accent : props.strong },
    { label: "会话", value: String(d.sessions), fg: props.strong },
  ]

  const models = sortedModels(d.models)
  const maxCost = models.reduce((max, m) => Math.max(max, m.cost), 0)
  const activity = d.activity.slice(-14)
  const maxSteps = activity.reduce((max, a) => Math.max(max, a.steps), 1)

  const tableHeader =
    padDisplay("模型", MODEL_COL) +
    padDisplay("步骤", NUM_COL) +
    padDisplay("输入", NUM_COL) +
    padDisplay("输出", NUM_COL) +
    padDisplay("推理", NUM_COL) +
    padDisplay("缓存读", NUM_COL) +
    padDisplay("费用", COST_COL) +
    "占比"

  return (
    <box flexDirection="column">
      <text fg={props.muted}>
        统计区间 {formatDateTime(d.range.from)} ~ {formatDateTime(d.range.to)}
      </text>

      <box flexDirection="row" paddingTop={1} paddingBottom={1}>
        <For each={hero}>
          {(card) => (
            <box flexDirection="column" paddingRight={4}>
              <text fg={props.muted}>{card.label}</text>
              <text fg={card.fg}>
                <b>{card.value}</b>
              </text>
            </box>
          )}
        </For>
      </box>

      <text fg={props.strong}>{summary}</text>
      <text fg={props.muted}>{detail}</text>

      <box flexDirection="row" paddingTop={1}>
        <text fg={props.accent}>▍</text>
        <text fg={props.strong}>
          每日活跃 (steps) · 最近 {activity.length} 天，峰值 {maxSteps}
        </text>
      </box>
      <For each={activity}>
        {(a) => (
          <text fg={a.steps > 0 ? props.accent : props.muted}>
            {formatDay(a.date)}  {a.steps > 0 ? bar(a.steps / maxSteps, ACTIVITY_BARS) + " " + a.steps : "· 0"}
          </text>
        )}
      </For>

      <box flexDirection="row" paddingTop={1}>
        <text fg={props.accent}>▍</text>
        <text fg={props.strong}>模型统计 · {models.length} 个模型（按费用排序）</text>
      </box>
      <text fg={props.muted}>{tableHeader}</text>
      <For each={models}>
        {(m) => {
          const share = maxCost > 0 && m.cost > 0 ? m.cost / maxCost : 0
          const row =
            padDisplay(truncateDisplay(modelLabel(m.model), MODEL_COL), MODEL_COL) +
            padDisplay(String(m.steps), NUM_COL) +
            padDisplay(formatTokens(m.tokens.input), NUM_COL) +
            padDisplay(formatTokens(m.tokens.output), NUM_COL) +
            padDisplay(formatTokens(m.tokens.reasoning), NUM_COL) +
            padDisplay(formatTokens(m.tokens.cache.read), NUM_COL) +
            padDisplay(formatMoney(m.cost), COST_COL) +
            (share > 0 ? bar(share, BAR_COL) + " " + formatPercent(share, 0) : "—")
          return <text fg={props.strong}>{row}</text>
        }}
      </For>
    </box>
  )
}

function clock(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function timeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined
  } catch {
    return undefined
  }
}
