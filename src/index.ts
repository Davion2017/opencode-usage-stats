/**
 * 服务端插件入口（包主入口）。
 * 统计面板完全在 TUI 侧实现（见 ./tui），服务端无需注册钩子；
 * 保留此入口以便包也能通过 opencode.json 的 plugins 正常加载。
 */
import { Plugin } from "@opencode/plugin"

export default Plugin.define({
  id: "usage-stats",
  setup() {},
})
