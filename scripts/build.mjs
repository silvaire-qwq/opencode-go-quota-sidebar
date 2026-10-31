import { transformFileSync } from "@babel/core"
import { mkdirSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const tui = transformFileSync(fileURLToPath(new URL("../src/tui.tsx", import.meta.url)), {
  babelrc: false,
  configFile: false,
  presets: [
    "@babel/preset-typescript",
    ["babel-preset-solid", { moduleName: "@opentui/solid", generate: "universal" }],
  ],
})

if (!tui?.code) throw new Error("Babel produced no output for src/tui.tsx")

// Bind the compiled plugin to the host's Solid/OpenTUI runtime. Resolving a
// local copy of either package gives the plugin its own reactive graph, so the
// slot paints once and never repaints (opencode#39986).
const runtime = (specifier) => `opentui:runtime-module:${encodeURIComponent(specifier)}`
const code = tui.code
  .replaceAll('from "@opentui/solid"', `from "${runtime("@opentui/solid")}"`)
  .replaceAll('from "solid-js/store"', `from "${runtime("solid-js/store")}"`)
  .replaceAll('from "solid-js"', `from "${runtime("solid-js")}"`)

mkdirSync(fileURLToPath(new URL("../dist", import.meta.url)), { recursive: true })
writeFileSync(new URL("../dist/tui.js", import.meta.url), code)
console.log("built dist/tui.js")
