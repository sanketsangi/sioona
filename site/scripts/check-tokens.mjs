#!/usr/bin/env node
/**
 * Design-token guard: components bind to --sio-* only. Fails on literal colors,
 * raw --ds-* use, default Tailwind palette classes, and forbidden engine names
 * outside the token files.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("../src", import.meta.url).pathname;
const allowed = new Set(["styles/tokens.css", "lib/tokens.ts"]);

const rules = [
  { name: "hex color literal", re: /#[0-9a-fA-F]{3,8}\b(?![\w-])/g, skip: (line) => /&#\d|href=|\/#[a-z-]+|#main|#faq|#product|#story|#signals|#score|#features|#security-band/i.test(line) },
  { name: "rgb/hsl/oklch/lab literal", re: /\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/g },
  { name: "raw --ds-* token in component", re: /--ds-[a-z0-9-]+/g },
  { name: "default Tailwind palette class", re: /\b(?:bg|text|border|ring|fill|stroke|from|to|via|divide|outline|shadow)-(?:white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\d{2,3})?\b/g },
  { name: "forbidden internal engine name", re: new RegExp(["signal", "c1"].join(""), "gi") },
  { name: "transition-all", re: /\btransition-all\b|transition:\s*all\b/g },
];

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

let failures = 0;
for (const file of walk(root)) {
  const rel = relative(root, file);
  if (allowed.has(rel) || !/\.(tsx?|css|mdx?)$/.test(file)) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    for (const rule of rules) {
      if (rule.skip?.(line)) continue;
      if (rule.re.test(line)) {
        rule.re.lastIndex = 0;
        failures += 1;
        console.error(`${rel}:${i + 1}  ${rule.name}: ${line.trim()}`);
      }
      rule.re.lastIndex = 0;
    }
  });
}

if (failures) {
  console.error(`\n${failures} token violation(s).`);
  process.exit(1);
}
console.log("check-tokens: ok");
