import { Plugin } from "@opencode/plugin/tui"
import type { Context } from "@opencode/plugin/tui/context"
import type { Store } from "solid-js/store"
import { createEffect, createSignal, onCleanup, onMount } from "solid-js"

type Meter = {
  percent: number
  limited: boolean
  resetsAt: number
}

type Go = {
  rolling: Meter
  weekly: Meter
  monthly: Meter
}

type UI = { width: number; barWidth: number }
type ViewState = { open: boolean }

const FALLBACK_WIDTH = 34
const POLL_MS = 15_000

let cachedKey: { value: string; at: number } | undefined

/** The Console OAuth access token is accepted by the Go usage endpoint, so it
 * doubles as the API key. Never cache it for long: OAuth tokens rotate. */
async function resolveGoKey(): Promise<string | undefined> {
  if (cachedKey && Date.now() - cachedKey.at < 60_000) return cachedKey.value
  const env = process.env.OPENCODE_GO_API_KEY ?? process.env.OPENCODE_API_KEY
  if (env?.trim()) {
    cachedKey = { value: env.trim(), at: Date.now() }
    return cachedKey.value
  }
  const fromValue = (value: string): string | undefined => {
    try {
      const parsed = JSON.parse(value)
      for (const key of [parsed?.access, parsed?.key, parsed?.apiKey]) {
        if (typeof key === "string" && key.trim()) return key.trim()
      }
    } catch {
      // stored value is a bare key
    }
    return value.trim() || undefined
  }
  try {
    const { Database } = await import("bun:sqlite")
    const os = await import("node:os")
    const path = await import("node:path")
    const db = new Database(path.join(os.homedir(), ".local", "share", "opencode", "opencode.db"), { readonly: true })
    try {
      const rows = db
        .query(
          "select integration_id, value from credential where integration_id in ('opencode-go', 'opencode') and active = 1",
        )
        .all() as Array<{ integration_id: string; value: string }>
      const ordered = [
        ...rows.filter((row) => row.integration_id === "opencode-go"),
        ...rows.filter((row) => row.integration_id !== "opencode-go"),
      ]
      for (const row of ordered) {
        const key = fromValue(row.value)
        if (key) {
          cachedKey = { value: key, at: Date.now() }
          return key
        }
      }
    } finally {
      db.close()
    }
  } catch {
    // bun:sqlite is unavailable or the credential is missing
  }
  try {
    const { readFile } = await import("node:fs/promises")
    const os = await import("node:os")
    const path = await import("node:path")
    for (const file of [
      path.join(os.homedir(), ".local", "share", "opencode", "auth.json"),
      path.join(os.homedir(), ".config", "opencode", "auth.json"),
    ]) {
      try {
        const parsed = JSON.parse(await readFile(file, "utf8"))
        const entry = parsed?.["opencode-go"]
        const key = entry?.access ?? entry?.key ?? entry?.apiKey
        if (typeof key === "string" && key.trim()) {
          cachedKey = { value: key.trim(), at: Date.now() }
          return cachedKey.value
        }
      } catch {
        // try the next auth file
      }
    }
  } catch {
    // no legacy auth file
  }
  return undefined
}

async function directQuota(): Promise<Go | undefined> {
  const key = await resolveGoKey()
  if (!key) return undefined
  try {
    const response = await fetch("https://opencode.ai/zen/go/v1/usage", {
      headers: { authorization: `Bearer ${key}`, accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) return undefined
    const body = (await response.json()) as { usage?: Record<string, unknown> }
    const usage = body?.usage
    if (!usage) return undefined
    const pick = (name: string): Meter | undefined => {
      const value = usage[name] as { percent?: unknown; status?: unknown; resetsAt?: unknown } | undefined
      if (!value || typeof value.percent !== "number" || !Number.isFinite(value.percent)) return undefined
      const at =
        typeof value.resetsAt === "number"
          ? value.resetsAt
          : typeof value.resetsAt === "string"
            ? Date.parse(value.resetsAt)
            : 0
      return {
        percent: value.percent,
        limited: value.status === "limited",
        resetsAt: Number.isFinite(at) ? at : 0,
      }
    }
    const rolling = pick("rolling")
    const weekly = pick("weekly")
    const monthly = pick("monthly")
    if (!rolling || !weekly || !monthly) return undefined
    return { rolling, weekly, monthly }
  } catch {
    return undefined
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("usage limits timed out")), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

async function clientQuota(ctx: Context): Promise<Go | undefined> {
  const result = await withTimeout(
    ctx.client.experimental.usage.limits(
      ctx.location ? { location: { directory: ctx.location.directory } } : undefined,
    ),
    8000,
  )
  return result.data?.go as Go | undefined
}

function trackColor(themeMode: "dark" | "light"): string {
  return themeMode === "light" ? "#d4d4d8" : "#4b5563"
}

function clamped(meter: Meter): number {
  if (!Number.isFinite(meter.percent)) return 0
  return Math.max(0, Math.min(100, meter.percent))
}

function formatReset(at: number, now: number): string {
  if (!Number.isFinite(at)) return ""
  const seconds = Math.max(0, Math.round((at - now) / 1000))
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m`
  return "<1m"
}

function barColor(theme: Context["theme"], percent: number): string {
  if (percent > 80) return theme.text.feedback.error.base
  if (percent > 50) return theme.text.feedback.warning.base
  return theme.text.feedback.success.base
}

function MeterRow(props: {
  theme: Context["theme"]
  themeMode: "dark" | "light"
  label: string
  meter: Meter
  width: number
  now: number
}) {
  // Props are getters; derived values must stay lazy or the row freezes at
  // its first render and only repaints when the panel remounts.
  const percent = () => clamped(props.meter)
  const total = () => Math.max(1, props.width)
  const used = () => {
    const value = percent()
    const width = total()
    return value > 0 ? Math.min(width, Math.max(1, Math.round((value / 100) * width))) : 0
  }
  const rest = () => Math.max(0, total() - used())
  const reset = () => formatReset(props.meter.resetsAt, props.now)
  const color = () => barColor(props.theme, percent())

  return (
    <box flexDirection="column">
      <box flexDirection="row" gap={1}>
        <text fg={props.theme.text.base}>{props.label}</text>
        {reset() ? (
          <text fg={props.theme.text.muted}>{`(${reset()})`}</text>
        ) : null}
        <box flexGrow={1} />
        <text fg={props.theme.text.muted}>{`${Math.round(percent())}%`}</text>
      </box>
      <box flexDirection="row" height={1} width="100%">
        {used() > 0 ? (
          <text fg={color()}>{"━".repeat(used())}</text>
        ) : null}
        {rest() > 0 ? (
          <text fg={trackColor(props.themeMode)}>{"━".repeat(rest())}</text>
        ) : null}
      </box>
    </box>
  )
}

function Panel(props: {
  ctx: Context
  view: Store<ViewState>
  setView: (mutation: (draft: ViewState) => void) => Promise<void>
  ui: Store<UI>
  setUI: (mutation: (draft: UI) => void) => void
}) {
  const theme = props.ctx.theme
  const open = () => props.view.open
  const [go, setGo] = createSignal<Go>()
  const [now, setNow] = createSignal(Date.now())
  const [error, setError] = createSignal("")
  const [loading, setLoading] = createSignal(true)
  const repaint = () => {
    try {
      props.ctx.renderer.requestRender()
    } catch {
      // the renderer is gone during shutdown
    }
  }

  // Repaint as soon as either signal changes; text updates alone do not
  // always schedule a frame in the host renderer.
  createEffect(() => {
    go()
    now()
    repaint()
  })

  onMount(() => {
    let disposed = false
    let busy = false
    const load = async () => {
      if (busy || disposed) return
      busy = true
      try {
        let next = await directQuota()
        if (!next) next = await clientQuota(props.ctx)
        if (disposed) return
        if (next) {
          setGo(next)
          setError("")
          repaint()
        } else if (!go()) {
          setError("No Go quota")
        }
      } catch (cause) {
        if (!disposed && !go()) setError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        busy = false
        if (!disposed) setLoading(false)
      }
    }

    void load()
    const poll = setInterval(() => void load(), POLL_MS)
    const tick = setInterval(() => {
      setNow(Date.now())
      repaint()
    }, 1_000)

    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void load(), 1500)
    }
    const stops = [
      props.ctx.data.on("session.execution.succeeded", schedule),
      props.ctx.data.on("session.execution.failed", schedule),
      props.ctx.data.on("session.execution.interrupted", schedule),
      props.ctx.data.on("session.step.ended", schedule),
      props.ctx.data.on("session.idle", schedule),
    ]

    onCleanup(() => {
      disposed = true
      clearInterval(poll)
      clearInterval(tick)
      if (timer) clearTimeout(timer)
      for (const stop of stops) stop()
    })
  })

  const toggle = () => {
    void props.setView((draft) => {
      draft.open = !draft.open
    }).catch(() => {})
  }

  const summary = () => {
    const data = go()
    if (!data) return undefined
    return Math.round(Math.max(clamped(data.rolling), clamped(data.weekly), clamped(data.monthly)))
  }

  return (
    <box
      flexDirection="column"
      width="100%"
      ref={((element: any) => {
        if (!element) return
        const update = () => {
          const next = (element.width ?? 0) | 0
          if (!next) return
          props.setUI((draft) => {
            if (draft.width !== next) draft.width = next
          })
        }
        element.onSizeChange = update
        queueMicrotask(update)
      }) as any}
    >
      <box flexDirection="row" gap={1} width="100%" onMouseDown={toggle} ref={((element: any) => {
        if (!element) return
        const update = () => {
          const next = (element.width ?? 0) | 0
          if (!next) return
          props.setUI((draft) => {
            if (draft.barWidth !== next) draft.barWidth = next
          })
        }
        element.onSizeChange = update
        queueMicrotask(update)
      }) as any}>
        <text fg={theme.text.base}>{open() ? "▼" : "▶"}</text>
        <text fg={theme.text.base}>
          <b>OpenCode Go</b>
          {!open() && summary() !== undefined ? (
            <span style={{ fg: theme.text.muted }}>{` (${summary()}% used)`}</span>
          ) : null}
        </text>
      </box>

      {!open() ? null : (
        <>
          {loading() && !go() ? (
            <text fg={theme.text.muted}>Loading…</text>
          ) : error() && !go() ? (
            <text fg={theme.text.feedback.error.base}>{error()}</text>
          ) : go() ? (
            <>
              <MeterRow theme={theme} themeMode={props.ctx.themeMode} label="5h" meter={go()!.rolling} width={props.ui.barWidth || props.ui.width} now={now()} />
              <MeterRow theme={theme} themeMode={props.ctx.themeMode} label="Weekly" meter={go()!.weekly} width={props.ui.barWidth || props.ui.width} now={now()} />
              <MeterRow theme={theme} themeMode={props.ctx.themeMode} label="Monthly" meter={go()!.monthly} width={props.ui.barWidth || props.ui.width} now={now()} />
            </>
          ) : (
            <text fg={theme.text.muted}>No Go quota</text>
          )}
        </>
      )}
    </box>
  )
}

export default Plugin.define({
  id: "go.quota.sidebar",
  setup(ctx: Context) {
    const [view, setView] = ctx.storage.store<ViewState>("view", { initial: { open: true } })
    const [ui, setUI] = ctx.storage.memory<UI>("ui", { initial: { width: FALLBACK_WIDTH, barWidth: 0 } })

    const dispose = ctx.ui.slot({
      prepend: "sidebar.content",
      render: () => (
        <Panel ctx={ctx} view={view} setView={setView} ui={ui} setUI={setUI} />
      ),
    })

    return () => dispose()
  },
})
