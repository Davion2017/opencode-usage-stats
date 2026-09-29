import { describe, expect, it } from "vitest"
import plugin, { PAGE_NAME } from "./tui"

describe("tui entry", () => {
  it("定义了 id 与 setup", () => {
    expect(plugin.id).toBe("usage-stats")
    expect(typeof plugin.setup).toBe("function")
  })
  it("页面名不与内置路由冲突", () => {
    expect(PAGE_NAME).toMatch(/^usage-stats$/)
  })
})
