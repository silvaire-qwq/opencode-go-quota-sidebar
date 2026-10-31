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
mkdirSync(fileURLToPath(new URL("../dist", import.meta.url)), { recursive: true })
writeFileSync(new URL("../dist/tui.js", import.meta.url), tui.code)
console.log("built dist/tui.js")
