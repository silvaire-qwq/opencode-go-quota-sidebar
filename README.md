# OpenCode Go quota sidebar

A local OpenCode V2 TUI plugin that shows the OpenCode Go allowance in the
session sidebar.

## What it shows

Three rows, each with a label on the left and the used percentage on the right:

| Row | Window |
| --- | --- |
| 5h | Rolling five-hour allowance |
| Weekly | Weekly allowance |
| Monthly | Monthly allowance |

The used part of each bar is green up to 50%, yellow above 50%, and red above
80%. The remaining part is gray. Click the `OpenCode Go` header to collapse the
panel. When collapsed, the header shows the highest used percentage in gray. Each
label is followed by a light reset countdown such as `(3h 15m)`.

## Data

The plugin calls the connected OpenCode server's
`experimental.usage.limits()` endpoint. That endpoint reports the Go windows for
the signed-in workspace, so the plugin never reads or stores the Go API key.

The panel refreshes once a minute and shortly after each assistant turn.

## Install

The package is TUI-only, so load it from `cli.json`:

```json
{
  "plugins": ["/absolute/path/to/go-quota-sidebar"]
}
```

Use the absolute path on your machine. Clone the repository to
`~/.config/opencode/plugins/go-quota-sidebar` to keep it beside the other local
plugins. Reload or restart the TUI if it does not appear.

## Development

```sh
npm install
npm run typecheck
npm run build
```

`npm run build` compiles `src/tui.tsx` into `dist/tui.js` with the Solid JSX
transform. OpenCode provides `@opencode/*` and `@opentui/*` at runtime.
