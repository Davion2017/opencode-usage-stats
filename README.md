# opencode-usage-stats

OpenCode v2 的用量统计插件：在 TUI 中执行 `/usage` 打开全屏统计面板，
查看 Token 消耗、缓存命中率、估算费用、模型分布与每日活跃趋势。
参考 [cc-switch](https://github.com/farion1231/cc-switch) 的「用量统计」功能设计，
数据直接来自 OpenCode 服务端内置的
`GET /api/experimental/session/stats` 聚合端点，无需扫描本地文件。

## 功能

- **Hero 汇总卡**：真实消耗 Tokens、缓存命中率、估算费用、会话数
- **汇总行**：提示数、步骤数、子代理数、活跃天数、连续活跃天数、工具成功率
- **每日活跃**：最近 14 天 steps 横向条形图
- **模型统计**：按 `providerID/model(variant)` 分组的步骤、输入/输出/推理/缓存读 Token、费用与占比条（按费用降序）
- **时间范围**：`1` 今天 / `2` 7 天 / `3` 30 天 / `4` 全部 / `5` 自定义（单行输入起止时间，
  支持 `2026-09-01 ~ 2026-09-15`、`至`/`到`/空格分隔、`HH:mm` 精确到时间；结束留空表示至今。
  再次打开会预填上次范围。对话框打开期间面板快捷键自动禁用，不会拦截输入）
- `r` 刷新，`q` 关闭面板——从会话中打开时会**回到原会话**而不是首页（`esc` 由宿主处理返回）

## 指标口径（与 cc-switch 一致）

| 指标 | 计算 |
| --- | --- |
| 真实消耗 Tokens | `输入 + 输出 + 缓存读 + 缓存写`（推理已计入输出，不重复相加） |
| 缓存命中率 | `缓存读 / (输入 + 缓存读)` |
| 估算费用 | 服务端按 models.dev 定价计算后返回的 `cost` 汇总 |
| 工具成功率 | `成功调用 / 总调用` |

## 安装

插件为 CLI(TUI) 侧插件，在 `~/.config/opencode/cli.json` 中注册（对远程 server 同样生效）：

```json
{
  "plugins": [
    "file:///D:/worksapce/opencode/opencode-usage-stats"
  ]
}
```

重启 TUI（或 `opencode service restart` 后重新打开）即可，无需安装依赖——
`@opencode/plugin/tui`、`@opentui/*`、`solid-js` 均由 OpenCode 运行时解析。

## 使用

在 OpenCode TUI 中：

1. 输入 `/usage`（或在命令面板中选「用量统计」）
2. 数字键 `1`–`5` 切换统计范围（`5` 为自定义日期范围），`r` 刷新，`q` 返回来源处

## 开发

```sh
npm install        # 安装类型与测试依赖（运行时不需要）
npm run typecheck  # tsc --noEmit
npm test           # vitest，覆盖 stats.ts 派生指标与格式化
```

## 结构

```
index.ts / tui.tsx     根入口（转发 src/）
src/index.ts           服务端插件占位（包主入口）
src/tui.tsx            TUI 入口：/usage 命令 + 全屏路由
src/view.tsx           统计面板 JSX
src/stats.ts           纯逻辑：时间范围、派生指标、格式化
src/stats.test.ts      单元测试
```
