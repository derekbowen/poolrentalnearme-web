#!/usr/bin/env node
/**
 * check:tools-hub — proves every tool displayed on /p/pool-host-tools maps to a
 * published canonical destination.
 *
 * Fails (exit 1) if:
 *   - the hub links any /host-tools/* URL (that prefix was deleted, git 8eac8996)
 *   - the hub links a /p/ tool path that is not in src/lib/host-tools-live.ts
 *   - any registry path does not return a canonical 200
 *   - a registry path redirects somewhere else (not canonical)
 *
 * env: BASE_URL (default https://www.poolrentalnearme.com), TIMEOUT_MS
 */
import { readFileSync } from "node:fs";

const BASE = (process.env.BASE_URL || "https://www.poolrentalnearme.com").replace(/\/$/, "");
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 20000);
const HUB = "/p/pool-host-tools";

function registryPaths() {
  const src = readFileSync(new URL("../src/lib/host-tools-live.ts", import.meta.url), "utf8");
  const paths = [...src.matchAll(/path:\s*"([^"]+)"/g)].map((m) => m[1]);
  if (!paths.length) throw new Error("could not parse host-tools-live.ts");
  return paths;
}

async function get(path) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(BASE + path, { signal: ctl.signal, redirect: "follow" });
    return { status: r.status, finalPath: new URL(r.url).pathname, body: await r.text() };
  } catch (e) {
    return { status: 0, finalPath: path, body: "", err: String(e).slice(0, 120) };
  }
}

const hrefsIn = (html) =>
  [...new Set([...html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)].map((m) => m[1]))];

const failures = [];
const registry = registryPaths();
console.log(`check:tools-hub — base ${BASE}`);
console.log(`registry paths: ${registry.length}`);

// 1. every registry path must be a canonical 200
for (const p of registry) {
  const r = await get(p);
  const ok = r.status === 200 && r.finalPath === p;
  console.log(`  ${ok ? "OK  " : "FAIL"} ${p} -> ${r.status}${r.finalPath !== p ? " (redirects to " + r.finalPath + ")" : ""}`);
  if (!ok) failures.push(`registry path ${p} -> status ${r.status}, final ${r.finalPath} ${r.err || ""}`);
}

// 2. the hub must not link anything outside the registry
const hub = await get(HUB);
if (hub.status !== 200) {
  failures.push(`hub ${HUB} returned ${hub.status}`);
} else {
  const links = hrefsIn(hub.body)
    .map((h) => (h.startsWith(BASE) ? h.slice(BASE.length) : h))
    .filter((h) => h.startsWith("/"));
  const dead = links.filter((h) => h.startsWith("/host-tools/"));
  if (dead.length) failures.push(`hub links ${dead.length} dead /host-tools/* URLs: ${dead.slice(0, 5).join(", ")}`);
  console.log(`  hub links scanned: ${links.length} | /host-tools/*: ${dead.length}`);

  // any /p/*-calculator|generator|kit style tool link must be registered
  // The hub pages themselves match the "tool" substring; they are navigation,
  // not tools, and both return 200.
  const HUB_PATHS = ["/p/pool-host-tools", "/p/free-host-tools"];
  const toolish = links.filter((h) =>
    /^\/p\/[a-z0-9-]*(calculator|generator|waiver|rules|kit|checklist|tool)/.test(h) &&
    !HUB_PATHS.includes(h.split("#")[0].split("?")[0]),
  );
  const unregistered = toolish.filter((h) => !registry.includes(h.split("#")[0].split("?")[0]));
  if (unregistered.length) {
    failures.push(`hub links unregistered tool paths: ${[...new Set(unregistered)].join(", ")}`);
  }
  console.log(`  tool-shaped links: ${toolish.length} | unregistered: ${unregistered.length}`);
}

if (failures.length) {
  console.error("\nFAILED:");
  failures.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
console.log("\nPASS — every tool on the hub maps to a published canonical destination.");
