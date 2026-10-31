import { createComponent as _$createComponent } from "opentui:runtime-module:%40opentui%2Fsolid";
import { createTextNode as _$createTextNode } from "opentui:runtime-module:%40opentui%2Fsolid";
import { use as _$use } from "opentui:runtime-module:%40opentui%2Fsolid";
import { effect as _$effect } from "opentui:runtime-module:%40opentui%2Fsolid";
import { insertNode as _$insertNode } from "opentui:runtime-module:%40opentui%2Fsolid";
import { memo as _$memo } from "opentui:runtime-module:%40opentui%2Fsolid";
import { insert as _$insert } from "opentui:runtime-module:%40opentui%2Fsolid";
import { setProp as _$setProp } from "opentui:runtime-module:%40opentui%2Fsolid";
import { createElement as _$createElement } from "opentui:runtime-module:%40opentui%2Fsolid";
import { Plugin } from "@opencode/plugin/tui";
import { createEffect, createSignal, onCleanup, onMount } from "opentui:runtime-module:solid-js";
const FALLBACK_WIDTH = 34;
const POLL_MS = 15_000;
let cachedKey;

/** The Console OAuth access token is accepted by the Go usage endpoint, so it
 * doubles as the API key. Never cache it for long: OAuth tokens rotate. */
async function resolveGoKey() {
  if (cachedKey && Date.now() - cachedKey.at < 60_000) return cachedKey.value;
  const env = process.env.OPENCODE_GO_API_KEY ?? process.env.OPENCODE_API_KEY;
  if (env?.trim()) {
    cachedKey = {
      value: env.trim(),
      at: Date.now()
    };
    return cachedKey.value;
  }
  const fromValue = value => {
    try {
      const parsed = JSON.parse(value);
      for (const key of [parsed?.access, parsed?.key, parsed?.apiKey]) {
        if (typeof key === "string" && key.trim()) return key.trim();
      }
    } catch {
      // stored value is a bare key
    }
    return value.trim() || undefined;
  };
  try {
    const {
      Database
    } = await import("bun:sqlite");
    const os = await import("node:os");
    const path = await import("node:path");
    const db = new Database(path.join(os.homedir(), ".local", "share", "opencode", "opencode.db"), {
      readonly: true
    });
    try {
      const rows = db.query("select integration_id, value from credential where integration_id in ('opencode-go', 'opencode') and active = 1").all();
      const ordered = [...rows.filter(row => row.integration_id === "opencode-go"), ...rows.filter(row => row.integration_id !== "opencode-go")];
      for (const row of ordered) {
        const key = fromValue(row.value);
        if (key) {
          cachedKey = {
            value: key,
            at: Date.now()
          };
          return key;
        }
      }
    } finally {
      db.close();
    }
  } catch {
    // bun:sqlite is unavailable or the credential is missing
  }
  try {
    const {
      readFile
    } = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    for (const file of [path.join(os.homedir(), ".local", "share", "opencode", "auth.json"), path.join(os.homedir(), ".config", "opencode", "auth.json")]) {
      try {
        const parsed = JSON.parse(await readFile(file, "utf8"));
        const entry = parsed?.["opencode-go"];
        const key = entry?.access ?? entry?.key ?? entry?.apiKey;
        if (typeof key === "string" && key.trim()) {
          cachedKey = {
            value: key.trim(),
            at: Date.now()
          };
          return cachedKey.value;
        }
      } catch {
        // try the next auth file
      }
    }
  } catch {
    // no legacy auth file
  }
  return undefined;
}
async function directQuota() {
  const key = await resolveGoKey();
  if (!key) return undefined;
  try {
    const response = await fetch("https://opencode.ai/zen/go/v1/usage", {
      headers: {
        authorization: `Bearer ${key}`,
        accept: "application/json"
      },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return undefined;
    const body = await response.json();
    const usage = body?.usage;
    if (!usage) return undefined;
    const pick = name => {
      const value = usage[name];
      if (!value || typeof value.percent !== "number" || !Number.isFinite(value.percent)) return undefined;
      const at = typeof value.resetsAt === "number" ? value.resetsAt : typeof value.resetsAt === "string" ? Date.parse(value.resetsAt) : 0;
      return {
        percent: value.percent,
        limited: value.status === "limited",
        resetsAt: Number.isFinite(at) ? at : 0
      };
    };
    const rolling = pick("rolling");
    const weekly = pick("weekly");
    const monthly = pick("monthly");
    if (!rolling || !weekly || !monthly) return undefined;
    return {
      rolling,
      weekly,
      monthly
    };
  } catch {
    return undefined;
  }
}
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("usage limits timed out")), ms);
    promise.then(value => {
      clearTimeout(timer);
      resolve(value);
    }, error => {
      clearTimeout(timer);
      reject(error);
    });
  });
}
async function clientQuota(ctx) {
  const result = await withTimeout(ctx.client.experimental.usage.limits(ctx.location ? {
    location: {
      directory: ctx.location.directory
    }
  } : undefined), 8000);
  return result.data?.go;
}
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
  // Props are getters; derived values must stay lazy or the row freezes at
  // its first render and only repaints when the panel remounts.
  const percent = () => clamped(props.meter);
  const total = () => Math.max(1, props.width);
  const used = () => {
    const value = percent();
    const width = total();
    return value > 0 ? Math.min(width, Math.max(1, Math.round(value / 100 * width))) : 0;
  };
  const rest = () => Math.max(0, total() - used());
  const reset = () => formatReset(props.meter.resetsAt, props.now);
  const color = () => barColor(props.theme, percent());
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
    _$insert(_el$2, (() => {
      var _c$ = _$memo(() => !!reset());
      return () => _c$() ? (() => {
        var _el$7 = _$createElement("text");
        _$insert(_el$7, () => `(${reset()})`);
        _$effect(_$p => _$setProp(_el$7, "fg", props.theme.text.muted, _$p));
        return _el$7;
      })() : null;
    })(), _el$4);
    _$setProp(_el$4, "flexGrow", 1);
    _$insert(_el$5, () => `${Math.round(percent())}%`);
    _$setProp(_el$6, "flexDirection", "row");
    _$setProp(_el$6, "height", 1);
    _$setProp(_el$6, "width", "100%");
    _$insert(_el$6, (() => {
      var _c$2 = _$memo(() => used() > 0);
      return () => _c$2() ? (() => {
        var _el$8 = _$createElement("text");
        _$insert(_el$8, () => "━".repeat(used()));
        _$effect(_$p => _$setProp(_el$8, "fg", color(), _$p));
        return _el$8;
      })() : null;
    })(), null);
    _$insert(_el$6, (() => {
      var _c$3 = _$memo(() => rest() > 0);
      return () => _c$3() ? (() => {
        var _el$9 = _$createElement("text");
        _$insert(_el$9, () => "━".repeat(rest()));
        _$effect(_$p => _$setProp(_el$9, "fg", trackColor(props.themeMode), _$p));
        return _el$9;
      })() : null;
    })(), null);
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
  const [go, setGo] = createSignal();
  const [now, setNow] = createSignal(Date.now());
  const [error, setError] = createSignal("");
  const [loading, setLoading] = createSignal(true);
  const repaint = () => {
    try {
      props.ctx.renderer.requestRender();
    } catch {
      // the renderer is gone during shutdown
    }
  };

  // Repaint as soon as either signal changes; text updates alone do not
  // always schedule a frame in the host renderer.
  createEffect(() => {
    go();
    now();
    repaint();
  });
  onMount(() => {
    let disposed = false;
    let busy = false;
    const load = async () => {
      if (busy || disposed) return;
      busy = true;
      try {
        let next = await directQuota();
        if (!next) next = await clientQuota(props.ctx);
        if (disposed) return;
        if (next) {
          setGo(next);
          setError("");
          repaint();
        } else if (!go()) {
          setError("No Go quota");
        }
      } catch (cause) {
        if (!disposed && !go()) setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        busy = false;
        if (!disposed) setLoading(false);
      }
    };
    void load();
    const poll = setInterval(() => void load(), POLL_MS);
    const tick = setInterval(() => {
      setNow(Date.now());
      repaint();
    }, 1_000);
    let timer;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void load(), 1500);
    };
    const stops = [props.ctx.data.on("session.execution.succeeded", schedule), props.ctx.data.on("session.execution.failed", schedule), props.ctx.data.on("session.execution.interrupted", schedule), props.ctx.data.on("session.step.ended", schedule), props.ctx.data.on("session.idle", schedule)];
    onCleanup(() => {
      disposed = true;
      clearInterval(poll);
      clearInterval(tick);
      if (timer) clearTimeout(timer);
      for (const stop of stops) stop();
    });
  });
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
    _$use(element => {
      if (!element) return;
      const update = () => {
        const next = (element.width ?? 0) | 0;
        if (!next) return;
        props.setUI(draft => {
          if (draft.barWidth !== next) draft.barWidth = next;
        });
      };
      element.onSizeChange = update;
      queueMicrotask(update);
    }, _el$1);
    _$setProp(_el$1, "flexDirection", "row");
    _$setProp(_el$1, "gap", 1);
    _$setProp(_el$1, "width", "100%");
    _$setProp(_el$1, "onMouseDown", toggle);
    _$insert(_el$10, () => open() ? "▼" : "▶");
    _$insertNode(_el$11, _el$12);
    _$insertNode(_el$12, _$createTextNode(`OpenCode Go`));
    _$insert(_el$11, (() => {
      var _c$4 = _$memo(() => !!(!open() && summary() !== undefined));
      return () => _c$4() ? (() => {
        var _el$14 = _$createElement("span");
        _$insert(_el$14, () => ` (${summary()}% used)`);
        _$effect(_$p => _$setProp(_el$14, "style", {
          fg: theme.text.muted
        }, _$p));
        return _el$14;
      })() : null;
    })(), null);
    _$insert(_el$0, (() => {
      var _c$5 = _$memo(() => !!!open());
      return () => _c$5() ? null : _$memo(() => _$memo(() => !!(loading() && !go()))() ? (() => {
        var _el$15 = _$createElement("text");
        _$insertNode(_el$15, _$createTextNode(`Loading…`));
        _$effect(_$p => _$setProp(_el$15, "fg", theme.text.muted, _$p));
        return _el$15;
      })() : _$memo(() => !!(error() && !go()))() ? (() => {
        var _el$17 = _$createElement("text");
        _$insert(_el$17, error);
        _$effect(_$p => _$setProp(_el$17, "fg", theme.text.feedback.error.base, _$p));
        return _el$17;
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
          return props.ui.barWidth || props.ui.width;
        },
        get now() {
          return now();
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
          return props.ui.barWidth || props.ui.width;
        },
        get now() {
          return now();
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
          return props.ui.barWidth || props.ui.width;
        },
        get now() {
          return now();
        }
      })] : (() => {
        var _el$18 = _$createElement("text");
        _$insertNode(_el$18, _$createTextNode(`No Go quota`));
        _$effect(_$p => _$setProp(_el$18, "fg", theme.text.muted, _$p));
        return _el$18;
      })());
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
    const [view, setView] = ctx.storage.store("view", {
      initial: {
        open: true
      }
    });
    const [ui, setUI] = ctx.storage.memory("ui", {
      initial: {
        width: FALLBACK_WIDTH,
        barWidth: 0
      }
    });
    const dispose = ctx.ui.slot({
      prepend: "sidebar.content",
      render: () => _$createComponent(Panel, {
        ctx: ctx,
        view: view,
        setView: setView,
        ui: ui,
        setUI: setUI
      })
    });
    return () => dispose();
  }
});