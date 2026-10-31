import { createComponent as _$createComponent } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { memo as _$memo } from "@opentui/solid";
import { use as _$use } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { Plugin } from "@opencode/plugin/tui";
const FALLBACK_WIDTH = 34;
function trackColor(themeMode) {
  return themeMode === "light" ? "#d4d4d8" : "#4b5563";
}
function clamped(meter) {
  if (!Number.isFinite(meter.percent)) return 0;
  return Math.max(0, Math.min(100, meter.percent));
}
function formatReset(at, now) {
  if (!Number.isFinite(at)) return "";
  const seconds = Math.max(0, Math.round((at - now) / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(seconds % 86400 / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return "<1m";
}
function barColor(theme, percent) {
  if (percent > 80) return theme.text.feedback.error.base;
  if (percent > 50) return theme.text.feedback.warning.base;
  return theme.text.feedback.success.base;
}
function MeterRow(props) {
  const percent = clamped(props.meter);
  const total = Math.max(1, props.width);
  const used = percent > 0 ? Math.min(total, Math.max(1, Math.round(percent / 100 * total))) : 0;
  const rest = Math.max(0, total - used);
  const reset = formatReset(props.meter.resetsAt, props.now);
  const color = barColor(props.theme, percent);
  return (() => {
    var _el$ = _$createElement("box"),
      _el$2 = _$createElement("box"),
      _el$3 = _$createElement("text"),
      _el$4 = _$createElement("box"),
      _el$5 = _$createElement("text"),
      _el$6 = _$createElement("box");
    _$insertNode(_el$, _el$2);
    _$insertNode(_el$, _el$6);
    _$setProp(_el$, "flexDirection", "column");
    _$insertNode(_el$2, _el$3);
    _$insertNode(_el$2, _el$4);
    _$insertNode(_el$2, _el$5);
    _$setProp(_el$2, "flexDirection", "row");
    _$setProp(_el$2, "gap", 1);
    _$insert(_el$3, () => props.label);
    _$insert(_el$2, reset ? (() => {
      var _el$7 = _$createElement("text");
      _$insert(_el$7, `(${reset})`);
      _$effect(_$p => _$setProp(_el$7, "fg", props.theme.text.muted, _$p));
      return _el$7;
    })() : null, _el$4);
    _$setProp(_el$4, "flexGrow", 1);
    _$insert(_el$5, () => `${Math.round(percent)}%`);
    _$setProp(_el$6, "flexDirection", "row");
    _$setProp(_el$6, "height", 1);
    _$setProp(_el$6, "width", "100%");
    _$insert(_el$6, used > 0 ? (() => {
      var _el$8 = _$createElement("text");
      _$setProp(_el$8, "fg", color);
      _$insert(_el$8, () => "▬".repeat(used));
      return _el$8;
    })() : null, null);
    _$insert(_el$6, rest > 0 ? (() => {
      var _el$9 = _$createElement("text");
      _$insert(_el$9, () => "▬".repeat(rest));
      _$effect(_$p => _$setProp(_el$9, "fg", trackColor(props.themeMode), _$p));
      return _el$9;
    })() : null, null);
    _$effect(_p$ => {
      var _v$ = props.theme.text.base,
        _v$2 = props.theme.text.muted;
      _v$ !== _p$.e && (_p$.e = _$setProp(_el$3, "fg", _v$, _p$.e));
      _v$2 !== _p$.t && (_p$.t = _$setProp(_el$5, "fg", _v$2, _p$.t));
      return _p$;
    }, {
      e: undefined,
      t: undefined
    });
    return _el$;
  })();
}
function Panel(props) {
  const theme = props.ctx.theme;
  const open = () => props.view.open;
  const go = () => props.state.go;
  const toggle = () => {
    void props.setView(draft => {
      draft.open = !draft.open;
    }).catch(() => {});
  };
  const summary = () => {
    const data = go();
    if (!data) return undefined;
    return Math.round(Math.max(clamped(data.rolling), clamped(data.weekly), clamped(data.monthly)));
  };
  return (() => {
    var _el$0 = _$createElement("box"),
      _el$1 = _$createElement("box"),
      _el$10 = _$createElement("text"),
      _el$11 = _$createElement("text"),
      _el$12 = _$createElement("b");
    _$insertNode(_el$0, _el$1);
    _$use(element => {
      if (!element) return;
      const update = () => {
        const next = (element.width ?? 0) | 0;
        if (!next) return;
        props.setUI(draft => {
          if (draft.width !== next) draft.width = next;
        });
      };
      element.onSizeChange = update;
      queueMicrotask(update);
    }, _el$0);
    _$setProp(_el$0, "flexDirection", "column");
    _$setProp(_el$0, "width", "100%");
    _$insertNode(_el$1, _el$10);
    _$insertNode(_el$1, _el$11);
    _$setProp(_el$1, "flexDirection", "row");
    _$setProp(_el$1, "gap", 1);
    _$setProp(_el$1, "onMouseDown", toggle);
    _$insert(_el$10, () => open() ? "▼" : "▶");
    _$insertNode(_el$11, _el$12);
    _$insertNode(_el$12, _$createTextNode(`OpenCode Go`));
    _$insert(_el$11, (() => {
      var _c$ = _$memo(() => !!(!open() && summary() !== undefined));
      return () => _c$() ? (() => {
        var _el$14 = _$createElement("span");
        _$insert(_el$14, () => ` (${summary()}% used)`);
        _$effect(_$p => _$setProp(_el$14, "style", {
          fg: theme.text.muted
        }, _$p));
        return _el$14;
      })() : null;
    })(), null);
    _$insert(_el$0, (() => {
      var _c$2 = _$memo(() => !!!open());
      return () => _c$2() ? null : [_$memo(() => _$memo(() => !!(props.state.loading && !go()))() ? (() => {
        var _el$17 = _$createElement("text");
        _$insertNode(_el$17, _$createTextNode(`Loading…`));
        _$effect(_$p => _$setProp(_el$17, "fg", theme.text.muted, _$p));
        return _el$17;
      })() : _$memo(() => !!(props.state.error && !go()))() ? (() => {
        var _el$19 = _$createElement("text");
        _$insert(_el$19, () => props.state.error);
        _$effect(_$p => _$setProp(_el$19, "fg", theme.text.feedback.error.base, _$p));
        return _el$19;
      })() : _$memo(() => !!go())() ? [_$createComponent(MeterRow, {
        theme: theme,
        get themeMode() {
          return props.ctx.themeMode;
        },
        label: "5h",
        get meter() {
          return go().rolling;
        },
        get width() {
          return props.ui.width;
        },
        get now() {
          return props.state.now;
        }
      }), _$createComponent(MeterRow, {
        theme: theme,
        get themeMode() {
          return props.ctx.themeMode;
        },
        label: "Weekly",
        get meter() {
          return go().weekly;
        },
        get width() {
          return props.ui.width;
        },
        get now() {
          return props.state.now;
        }
      }), _$createComponent(MeterRow, {
        theme: theme,
        get themeMode() {
          return props.ctx.themeMode;
        },
        label: "Monthly",
        get meter() {
          return go().monthly;
        },
        get width() {
          return props.ui.width;
        },
        get now() {
          return props.state.now;
        }
      })] : (() => {
        var _el$20 = _$createElement("text");
        _$insertNode(_el$20, _$createTextNode(`No Go quota`));
        _$effect(_$p => _$setProp(_el$20, "fg", theme.text.muted, _$p));
        return _el$20;
      })()), (() => {
        var _el$15 = _$createElement("text");
        _$insertNode(_el$15, _$createTextNode(` `));
        return _el$15;
      })()];
    })(), null);
    _$effect(_p$ => {
      var _v$3 = theme.text.base,
        _v$4 = theme.text.base;
      _v$3 !== _p$.e && (_p$.e = _$setProp(_el$10, "fg", _v$3, _p$.e));
      _v$4 !== _p$.t && (_p$.t = _$setProp(_el$11, "fg", _v$4, _p$.t));
      return _p$;
    }, {
      e: undefined,
      t: undefined
    });
    return _el$0;
  })();
}
export default Plugin.define({
  id: "go.quota.sidebar",
  setup(ctx) {
    const [state, setState] = ctx.storage.memory("state", {
      initial: {
        loading: true,
        error: "",
        now: Date.now()
      }
    });
    const [view, setView] = ctx.storage.store("view", {
      initial: {
        open: true
      }
    });
    const [ui, setUI] = ctx.storage.memory("ui", {
      initial: {
        width: FALLBACK_WIDTH
      }
    });
    let disposed = false;
    const refresh = async () => {
      try {
        const result = await ctx.client.experimental.usage.limits(ctx.location ? {
          location: {
            directory: ctx.location.directory
          }
        } : undefined);
        if (disposed) return;
        setState(draft => {
          draft.loading = false;
          draft.now = Date.now();
          draft.go = result.data?.go;
          draft.error = result.data?.go ? "" : "No Go quota";
        });
      } catch (error) {
        if (disposed) return;
        const message = error instanceof Error ? error.message : String(error);
        setState(draft => {
          draft.loading = false;
          draft.now = Date.now();
          draft.error = message;
        });
      }
    };
    void refresh();
    const interval = setInterval(() => void refresh(), 60_000);
    let timer;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 1500);
    };
    const stops = [ctx.data.on("session.execution.succeeded", schedule), ctx.data.on("session.execution.failed", schedule), ctx.data.on("session.execution.interrupted", schedule), ctx.data.on("session.idle", schedule)];
    const dispose = ctx.ui.slot({
      append: "sidebar.content",
      render: () => _$createComponent(Panel, {
        ctx: ctx,
        state: state,
        view: view,
        setView: setView,
        ui: ui,
        setUI: setUI
      })
    });
    return () => {
      disposed = true;
      clearInterval(interval);
      if (timer) clearTimeout(timer);
      for (const stop of stops) stop();
      dispose();
    };
  }
});