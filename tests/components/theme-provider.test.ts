import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactElement } from "react"
import { ThemeProvider } from "@/components/theme-provider"

const mocks = vi.hoisted(() => ({
  effect: vi.fn(),
  setTheme: vi.fn(),
  resolvedTheme: "light",
}))

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useEffect: mocks.effect,
}))

vi.mock("next-themes", () => ({
  ThemeProvider: () => null,
  useTheme: () => ({
    resolvedTheme: mocks.resolvedTheme,
    setTheme: mocks.setTheme,
  }),
}))

class TestElement extends EventTarget {
  constructor(
    public tagName: string,
    public isContentEditable = false
  ) {
    super()
  }
}

describe("theme keyboard shortcut", () => {
  let eventWindow: EventTarget
  let cleanup: () => void

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolvedTheme = "light"
    eventWindow = new EventTarget()
    vi.stubGlobal("window", eventWindow)
    vi.stubGlobal("HTMLElement", TestElement)
    mocks.effect.mockImplementation((effect: () => () => void) => {
      cleanup = effect()
    })
  })

  afterEach(() => {
    cleanup?.()
    vi.unstubAllGlobals()
  })

  function mountHotkey() {
    const provider = ThemeProvider({ children: null })
    const hotkey = provider.props.children[0] as ReactElement
    ;(hotkey.type as () => null)()
  }

  function press(properties: Record<string, unknown>) {
    const event = new Event("keydown", { cancelable: true })
    for (const [key, value] of Object.entries(properties)) {
      Object.defineProperty(event, key, { value })
    }
    eventWindow.dispatchEvent(event)
  }

  it.each([undefined, null, 42, "", "a"])(
    "ignores an invalid or unrelated key: %s",
    (key) => {
      mountHotkey()
      expect(() => press({ key })).not.toThrow()
      expect(mocks.setTheme).not.toHaveBeenCalled()
    }
  )

  it.each(["d", "D"])("switches light to dark for %s", (key) => {
    mountHotkey()
    press({ key })
    expect(mocks.setTheme).toHaveBeenCalledWith("dark")
  })

  it("switches dark to light", () => {
    mocks.resolvedTheme = "dark"
    mountHotkey()
    press({ key: "d" })
    expect(mocks.setTheme).toHaveBeenCalledWith("light")
  })

  it.each([
    "defaultPrevented",
    "repeat",
    "isComposing",
    "metaKey",
    "ctrlKey",
    "altKey",
  ])("ignores events with %s", (flag) => {
    mountHotkey()
    press({ key: "d", [flag]: true })
    expect(mocks.setTheme).not.toHaveBeenCalled()
  })

  it.each([
    new TestElement("INPUT"),
    new TestElement("TEXTAREA"),
    new TestElement("SELECT"),
    new TestElement("DIV", true),
  ])("ignores typing targets: %o", (target) => {
    mountHotkey()
    press({ key: "d", target })
    press({ target })
    expect(mocks.setTheme).not.toHaveBeenCalled()
  })

  it("removes the listener on unmount", () => {
    mountHotkey()
    cleanup()
    press({ key: "d" })
    expect(mocks.setTheme).not.toHaveBeenCalled()
  })
})
