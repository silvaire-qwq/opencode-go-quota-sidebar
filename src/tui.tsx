import { Plugin } from "@opencode/plugin/tui"
import type { Context } from "@opencode/plugin/tui/context"
import type { Store } from "solid-js/store"

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

type State = {
  loading: boolean
  error: string
  now: number
  go?: Go
}

type UI = { width: number }
type ViewState = { open: boolean }

const FALLBACK_WIDTH = 34

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
  const percent = clamped(props.meter)
  const total = Math.max(1, props.width)
  const used = percent > 0 ? Math.min(total, Math.max(1, Math.round((percent / 100) * total))) : 0
  const rest = Math.max(0, total - used)
  const reset = formatReset(props.meter.resetsAt, props.now)
  const color = barColor(props.theme, percent)

  return (
    <box flexDirection="column">
      <box flexDirection="row" gap={1}>
        <text fg={props.theme.text.base}>{props.label}</text>
        {reset ? (
          <text fg={props.theme.text.muted}>{`(${reset})`}</text>
        ) : null}
        <box flexGrow={1} />
        <text fg={props.theme.text.muted}>{`${Math.round(percent)}%`}</text>
      </box>
      <box flexDirection="row" height={1} width="100%">
        {used > 0 ? (
          <text fg={color}>{"━".repeat(used)}</text>
        ) : null}
        {rest > 0 ? (
          <text fg={trackColor(props.themeMode)}>{"━".repeat(rest)}</text>
        ) : null}
      </box>
    </box>
  )
}

function Panel(props: {
  ctx: Context
  state: Store<State>
  view: Store<ViewState>
  setView: (mutation: (draft: ViewState) => void) => Promise<void>
  ui: Store<UI>
  setUI: (mutation: (draft: UI) => void) => void
}) {
  const theme = props.ctx.theme
  const open = () => props.view.open
  const go = () => props.state.go

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
      <box flexDirection="row" gap={1} onMouseDown={toggle}>
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
          {props.state.loading && !go() ? (
            <text fg={theme.text.muted}>Loading…</text>
          ) : props.state.error && !go() ? (
            <text fg={theme.text.feedback.error.base}>{props.state.error}</text>
          ) : go() ? (
            <>
              <MeterRow theme={theme} themeMode={props.ctx.themeMode} label="5h" meter={go()!.rolling} width={props.ui.width} now={props.state.now} />
              <MeterRow theme={theme} themeMode={props.ctx.themeMode} label="Weekly" meter={go()!.weekly} width={props.ui.width} now={props.state.now} />
              <MeterRow theme={theme} themeMode={props.ctx.themeMode} label="Monthly" meter={go()!.monthly} width={props.ui.width} now={props.state.now} />
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
    const [state, setState] = ctx.storage.memory<State>("state", {
      initial: { loading: true, error: "", now: Date.now() },
    })
    const [view, setView] = ctx.storage.store<ViewState>("view", { initial: { open: true } })
    const [ui, setUI] = ctx.storage.memory<UI>("ui", { initial: { width: FALLBACK_WIDTH } })

    let disposed = false
    const refresh = async () => {
      try {
        const result = await ctx.client.experimental.usage.limits(
          ctx.location ? { location: { directory: ctx.location.directory } } : undefined,
        )
        if (disposed) return
        setState((draft) => {
          draft.loading = false
          draft.now = Date.now()
          draft.go = result.data?.go
          draft.error = result.data?.go ? "" : "No Go quota"
        })
      } catch (error) {
        if (disposed) return
        const message = error instanceof Error ? error.message : String(error)
        setState((draft) => {
          draft.loading = false
          draft.now = Date.now()
          draft.error = message
        })
      }
    }

    void refresh()
    const interval = setInterval(() => void refresh(), 60_000)

    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void refresh(), 1500)
    }
    const stops = [
      ctx.data.on("session.execution.succeeded", schedule),
      ctx.data.on("session.execution.failed", schedule),
      ctx.data.on("session.execution.interrupted", schedule),
      ctx.data.on("session.idle", schedule),
    ]

    const dispose = ctx.ui.slot({
      prepend: "sidebar.content",
      render: () => (
        <Panel ctx={ctx} state={state} view={view} setView={setView} ui={ui} setUI={setUI} />
      ),
    })

    return () => {
      disposed = true
      clearInterval(interval)
      if (timer) clearTimeout(timer)
      for (const stop of stops) stop()
      dispose()
    }
  },
})
