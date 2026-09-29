/**
 * TUI 插件入口：注册 /usage 斜杠命令与命令面板条目，
 * 打开全屏用量统计页面。由 OpenCode CLI 在终端侧自动加载。
 *
 * 注意：keymap.layer 需要 reactive owner（组件作用域），
 * 因此全局命令挂在 app 插槽的渲染组件内注册，
 * 而不是在插件 setup 顶层调用。
 */
import { Plugin } from "@opencode/plugin/tui"
import type { Context } from "@opencode/plugin/tui/plugin"
import { Dashboard, type SessionReturn } from "./view"

export const PAGE_NAME = "usage-stats"

export default Plugin.define({
  id: "usage-stats",
  setup(context: Context) {
    const unregisterPage = context.ui.router.register({
      name: PAGE_NAME,
      render: (input) => <Dashboard context={context} returnTo={input.data?.return as SessionReturn | undefined} />,
    })

    const removeCommandSlot = context.ui.slot({
      append: "app",
      render: () => {
        context.keymap.layer(() => ({
          mode: "global",
          priority: 10,
          commands: [
            {
              id: "usage.open",
              title: "用量统计",
              description: "查看 OpenCode 使用统计、缓存命中率与费用",
              group: "Usage",
              palette: true,
              suggested: true,
              slash: { name: "usage" },
              bind: false,
              run: () => {
                // 记住来源路由，关闭面板时回到原处（会话页则回到该会话）。
                const current = context.ui.router.current()
                const returnRoute =
                  current.type === "session" ? { type: "session", sessionID: current.sessionID } : undefined
                context.ui.router.navigate({
                  type: "plugin",
                  name: PAGE_NAME,
                  data: returnRoute ? { return: returnRoute } : undefined,
                })
              },
            },
          ],
        }))
        return null
      },
    })

    return () => {
      removeCommandSlot()
      unregisterPage()
    }
  },
})
