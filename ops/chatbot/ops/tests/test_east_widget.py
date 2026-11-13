# Local harness for ops/chatbot/ops/east_widget.py against a fake EAST box. Touches no server.
# Run: PATH=/path/to/node/bin:$PATH python3 ops/chatbot/ops/tests/test_east_widget.py   (needs node, npm, curl, bun;
# the layout case also uses Playwright + Chromium when it finds them: NODE_PATH or /opt/node-tools/node_modules)
# The first two cases run the REAL ops/chatbot/ops/east/chatwoot-widget.tsx: its behaviour under bun against a fake
# Chatwoot modelled on the v4.19.1 tag (sdk/bubbleHelpers.js, sdk/IFrameHelper.js and widget/App.vue), and its CSS
# in headless Chromium on top of Chatwoot's own sdk.css (fixtures/chatwoot-v4.19.1-sdk.css, sha256-checked).
# The real script is copied with ONLY these substitutions: DRY, SHA/SUM, RAW (file:// to a fixture TSX, so the
# test does not depend on the live widget source), APP, SITE + SDK (local server), backup/stage dirs, the sudo
# part of the ubuntu prefix, the pm2 command, sleep, the token query (echo), MIN_MB. docker, systemd-run and
# systemctl are fakes on PATH that log every call (systemd-run --scope runs its command, like the real one).
# Runs get PRNM_RUNNER_TIMEOUT=1800, as ops/runners/east_runx.py exports for this script's RUNNER_TIMEOUT.
import base64, hashlib, http.server, json, os, re, shutil, subprocess, sys, tempfile, threading, time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
H = tempfile.mkdtemp(prefix="prnm-ops-test-")  # all fake boxes live here
SCRIPT = REPO + "/ops/chatbot/ops/east_widget.py"
BOX = os.path.join(HERE, "fixtures", "east__root.tsx")  # EAST copy, md5 c6aedc95...
TSX = os.path.join(HERE, "fixtures", "chatwoot-widget.fixture.tsx")
TOKEN = "TestToken1234567890abcd"
SDKJS = b"/* fake chatwoot sdk.js for the harness */ window.chatwootSDK = { run: function () {} };\n"
SRI = "sha384-" + base64.b64encode(hashlib.sha384(SDKJS).digest()).decode()
PORT = 8797
STATE = {"inject": False, "sdk": SDKJS, "acao": "*"}

FAKEBUILD = r'''
import fs from "node:fs"; import crypto from "node:crypto";
if (fs.existsSync("FAIL_BUILD")) { console.error("fake build failure"); process.exit(1); }
// in-place writer, like the TanStack router plugin's routeTree.gen.ts
fs.writeFileSync("src/routeTree.gen.ts", "// regenerated " + Date.now() + "\n");
let out = fs.readFileSync("src/routes/__root.tsx", "utf8");
if (out.includes('from "@/components/chatwoot-widget"')) {
  let comp = fs.readFileSync("src/components/chatwoot-widget.tsx", "utf8");
  const env = fs.existsSync(".env.production.local") ? fs.readFileSync(".env.production.local", "utf8") : "";
  for (const m of env.matchAll(/^(VITE_\w+)=(.*)$/gm)) comp = comp.split("import.meta.env." + m[1]).join(JSON.stringify(m[2]));
  out += comp;
}
fs.rmSync("dist", { recursive: true, force: true });
fs.mkdirSync("dist/client/fw-assets", { recursive: true }); fs.mkdirSync("dist/server/fw-assets", { recursive: true });
const h = crypto.createHash("md5").update(out).digest("hex").slice(0, 8);
fs.writeFileSync(`dist/client/fw-assets/index-${h}.js`, out);
fs.writeFileSync("dist/client/fw-assets/__build.json", JSON.stringify({ h }));
fs.writeFileSync(`dist/server/fw-assets/chunk-${h}.js`, "server chunk");
fs.writeFileSync("dist/server/server.js", "export default {};");
fs.mkdirSync("node_modules/.vite-temp", { recursive: true });
fs.writeFileSync("node_modules/.vite-temp/vite.config.timestamp.mjs", "x");
if (process.env.PRNM_FAIL_VERIFY) fs.writeFileSync(process.env.PRNM_FAIL_VERIFY, "1");
console.log("fake build wrote index-" + h + ".js");
'''

FAKES = {  # %(c)s = case dir
    "docker": '#!/bin/sh\necho "docker $*" >> %(c)s/calls.log\n'
              'case "$*" in "exec chatwoot-rails-1 cat "*) cat %(c)s/sdk.js;; esac\n',
    "systemd-run": '#!/bin/bash\necho "systemd-run $*" >> %(c)s/calls.log\n'
                   '[ "$1" = "--scope" ] || exit ${FAKE_TIMER_RC:-0}\n'
                   'while [ $# -gt 0 ]; do case "$1" in --scope|-q|--unit=*) shift;; -p) shift 2;; *) break;; esac; done\n'
                   'exec "$@"\n',
    "systemctl": '#!/bin/sh\necho "systemctl $*" >> %(c)s/calls.log\n',
}


REAL_TSX = os.path.join(REPO, "ops", "chatbot", "ops", "east", "chatwoot-widget.tsx")
SDK_CSS = os.path.join(HERE, "fixtures", "chatwoot-v4.19.1-sdk.css")
SDK_CSS_SHA = "9daa40b3e0035708e5d4f1d0475f97d52381c3c8e595514bc9e53d7a793d57b2"  # sdk.css at the v4.19.1 tag
WTOKEN = "AbCdEf1234567890xyzQ"
WSRI = "sha384-" + "A1b2+/C3" * 8

# React is never rendered here: the cases drive the module's own functions.
REACT_STUB = {
    "package.json": '{"name":"react","version":"0.0.0-stub","main":"index.js"}\n',
    "index.js": "export const useEffect = () => {}; export const useState = (v) => [v, () => {}];\n"
                "export const useSyncExternalStore = (s, get) => get(); export default {};\n",
    "jsx-runtime.js": "export const jsx = () => null; export const jsxs = jsx; export const Fragment = 'f';\n",
    "jsx-dev-runtime.js": "export const jsxDEV = () => null; export const Fragment = 'f';\n",
}

# bun driver.mjs <scenario>: prints one JSON object of what it saw.
WIDGET_DRIVER = r'''
import { st, load, toggleChat, setHidden } from "./widget.tsx";
const scenario = process.argv[2];
const classSet = () => {
  const set = new Set();
  return { add: (...c) => c.forEach((x) => set.add(x)), remove: (...c) => c.forEach((x) => set.delete(x)),
    contains: (c) => set.has(c),
    toggle: (c, force) => { const on = force === undefined ? !set.has(c) : !!force; on ? set.add(c) : set.delete(c); return on; } };
};
const byId = {}, listeners = {}, observers = [], queue = [], toggles = [], timers = [];
const el = (tag) => ({ tagName: tag, id: "", classList: classSet(), dataset: {}, focus() {} });
const append = (e) => { if (e.id) byId[e.id] = e; };
const root = { classList: classSet() };
globalThis.document = { cookie: "cw_conversation=abc", activeElement: null, getElementById: (id) => byId[id] || null,
  createElement: el, head: { appendChild: append }, body: { appendChild: append }, documentElement: root };
const fire = (name) => (listeners[name] || []).forEach((fn) => fn());
const win = globalThis.window = {
  addEventListener: (n, fn) => (listeners[n] = listeners[n] || []).push(fn),
  setTimeout: (fn, ms) => timers.push(fn), clearTimeout: () => {},
};
globalThis.MutationObserver = class { constructor(cb) { this.cb = cb; observers.push(this); } observe(t) { this.target = t; } };

// Chatwoot, as read from the v4.19.1 tag. Parent page: sdk/bubbleHelpers.js onBubbleClick and the
// sdk/IFrameHelper.js events. Iframe: widget/App.vue; closing on 'unread-messages' (or 'campaigns')
// runs conversation/setUserLastSeen (app.seen) and resetUnreadMode. postMessage and MutationObserver
// records are asynchronous: they queue up and flush() delivers them.
const app = { route: "home", isWidgetOpen: false, messages: 2, unread: 0, seen: 0 };
const later = (fn) => queue.push(fn);
const flush = () => { for (let i = 0; queue.length; i++) { if (i > 1000) throw new Error("no settle"); queue.shift()(); } };
const holder = () => byId["cw-widget-holder"];
const mutated = () => later(() => observers.forEach((o) => o.target === holder() && o.cb()));
const seen = () => { if (app.messages) { app.seen++; app.unread = 0; } };
let toParent;
const toIframe = (m) => later(() => {
  app.isWidgetOpen = m.isOpen;
  if (app.route === "home" && m.isOpen && app.messages) app.route = "messages";
  if (!m.isOpen && ["unread-messages", "campaigns"].includes(app.route)) {
    seen(); toParent("resetUnreadMode"); app.route = "home";
  }
});
const onBubbleClick = (value) => {
  const { isOpen } = win.$chatwoot;
  if (isOpen === value) return;
  const next = value === undefined ? !isOpen : value;
  win.$chatwoot.isOpen = next;
  holder().classList.toggle("woot--hide");
  mutated();
  toIframe({ isOpen: next });
  fire(next ? "chatwoot:opened" : "chatwoot:closed");
};
toParent = (ev) => later(() => {
  if (ev === "setUnreadMode") { holder().classList.add("has-unread-view"); mutated(); onBubbleClick(true); }
  if (ev === "resetUnreadMode") { holder().classList.remove("has-unread-view"); mutated(); }
});
const agentReply = () => { // ON_AGENT_MESSAGE_RECEIVED + setUnreadView
  app.messages++; app.unread++;
  if (app.isWidgetOpen && app.route === "messages") seen();
  if (app.route === "unread-messages") return;
  if (app.unread > 0 && !app.isWidgetOpen) { app.route = "unread-messages"; toParent("setUnreadMode"); }
};
win.chatwootSDK = { run: () => {
  const h = el("div"); h.id = "cw-widget-holder"; h.classList.add("woot-widget-holder", "woot--hide", "woot-elements--left");
  byId[h.id] = h;
  const f = el("iframe"); f.id = "chatwoot_live_chat_widget"; byId[f.id] = f;
  win.$chatwoot = { isOpen: false, toggle: (how) => { toggles.push(how); onBubbleClick({ open: true, close: false }[how]); } };
} };
const snap = (label) => ({ label, view: st.view, phase: st.phase, toggles: [...toggles], seen: app.seen, unread: app.unread,
  route: app.route, hidden: root.classList.contains("prnm-cw-hidden"), open: root.classList.contains("prnm-cw-open"),
  unreadClass: !!holder() && holder().classList.contains("has-unread-view"),
  closedClass: !!holder() && holder().classList.contains("woot--hide") });
const out = [];
const boot = () => { // the returning-chatter load, as the component's effect does it
  load(win, document);
  const s = byId["prnm-chatwoot-sdk"];
  out.push({ label: "script", src: s.src, integrity: s.integrity, crossOrigin: s.crossOrigin, mark: s.dataset.prnm });
  s.onload(); fire("chatwoot:ready"); flush();
};
if (scenario === "preview-then-hide") {
  boot();
  agentReply(); flush(); out.push(snap("reply"));
  setHidden(true); flush(); out.push(snap("hidden"));
  agentReply(); flush(); out.push(snap("second reply while hidden"));
  setHidden(false); flush(); out.push(snap("shown"));
  setHidden(true); flush(); setHidden(false); flush(); out.push(snap("hidden and shown again"));
  toggleChat(); flush(); out.push(snap("clicked"));
} else if (scenario === "open-then-hide") {
  boot();
  toggleChat(); flush(); out.push(snap("opened"));
  setHidden(true); flush(); out.push(snap("hidden"));
  agentReply(); flush(); out.push(snap("reply while hidden"));
  setHidden(false); flush(); out.push(snap("shown"));
} else if (scenario === "model") { // the fake is App.vue: closing the preview marks the reply read
  boot();
  agentReply(); flush();
  win.$chatwoot.toggle("close"); flush(); out.push(snap("preview closed by toggle"));
}
console.log(JSON.stringify(out));
'''

# node layout.cjs <css file> <sdk.css> <header px> <sizes>: one JSON line per layout.
LAYOUT_DRIVER = r'''
const fs = require("fs");
const { chromium } = require("playwright");
const css = fs.readFileSync(process.argv[2], "utf8"), sdkCss = fs.readFileSync(process.argv[3], "utf8");
const header = Number(process.argv[4]), sizes = process.argv[5].split(",");
const page = (unread) => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;height:3000px} #topbar{position:sticky;top:0;height:${header}px;background:#ddd}</style>
<style id="prnm-chatwoot-style">${css}</style></head><body><header id="topbar">top bar</header>
<button type="button" id="prnm-chat-launcher" data-view="${unread ? "unread" : "open"}"><svg viewBox="0 0 24 24"></svg><span>Chat</span></button>
<div id="cw-widget-holder" class="woot-widget-holder woot-elements--left woot-widget--without-bubble${unread ? " has-unread-view" : ""}"><iframe id="chatwoot_live_chat_widget" style="height: ${unread ? "180px" : "100%"} !important"></iframe></div>
<style id="cw-widget-styles">${sdkCss}</style><script>document.documentElement.classList.add("prnm-cw-open")</script></body></html>`;
(async () => {
  const b = await chromium.launch();
  for (const unread of [false, true]) for (const sz of sizes) {
    const [w, h] = sz.split("x").map(Number);
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.setContent(page(unread));
    const r = await p.evaluate(() => Object.fromEntries(["cw-widget-holder", "prnm-chat-launcher", "topbar"].map((id) => {
      const x = document.getElementById(id).getBoundingClientRect();
      return [id, { top: x.top, bottom: x.bottom, left: x.left, right: x.right, height: x.height }];
    })));
    console.log(JSON.stringify({ unread, w, h, card: r["cw-widget-holder"], launcher: r["prnm-chat-launcher"], bar: r.topbar }));
    await p.close();
  }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
'''


def tool(name, *extra):
    for p in [shutil.which(name)] + list(extra):
        if p and os.path.exists(p):
            return p
    return None


def widget_case():
    print("== case widget behaviour (real chatwoot-widget.tsx under bun, Chatwoot modelled on v4.19.1 App.vue)")
    bun = tool("bun", os.path.expanduser("~/.bun/bin/bun"))
    check("bun found (runs the real TSX)", bool(bun))
    if not bun:
        return
    d = H + "/case-widget"
    os.makedirs(d + "/node_modules/react")
    for f, body in REACT_STUB.items():
        open(d + "/node_modules/react/" + f, "w").write(body)
    src = open(REAL_TSX).read()
    for a, b in [("import.meta.env.VITE_CHATWOOT_WEBSITE_TOKEN", '"%s"' % WTOKEN),
                 ("import.meta.env.VITE_CHATWOOT_SDK_SRI", '"%s"' % WSRI)]:
        assert src.count(a) == 1, a  # the build-time values, filled in as the Vite build does
        src = src.replace(a, b)
    open(d + "/widget.tsx", "w").write(src + "\nexport { st, load, toggleChat, setHidden };\n")
    open(d + "/driver.mjs", "w").write(WIDGET_DRIVER)

    def drive(scenario):
        r = subprocess.run([bun, "driver.mjs", scenario], cwd=d, capture_output=True, text=True, timeout=120)
        try:
            return {x["label"]: x for x in json.loads(r.stdout.strip().splitlines()[-1])}
        except Exception:  # noqa: BLE001
            print("     | " + (r.stdout + r.stderr).strip().replace("\n", "\n     | "))
            return {}

    m = drive("model")
    pc = m.get("preview closed by toggle", {})
    check("fake SDK is App.vue: toggle('close') on the preview marks the reply seen and dismisses it",
          pc.get("seen") == 1 and pc.get("route") == "home" and not pc.get("unreadClass") and pc.get("view") == "closed")

    p = drive("preview-then-hide")
    s = p.get("script", {})
    check("returning chatter: sdk.js inserted with SRI, crossorigin and the ?v= URL",
          s.get("integrity") == WSRI and s.get("crossOrigin") == "anonymous" and s.get("mark") == "prnm-chatwoot-v1"
          and s.get("src", "").startswith("https://chat.poolrentalnearme.com/packs/js/sdk.js?v="))
    r = p.get("reply", {})
    check("a reply opens the unread preview (view unread, #prnm-cta hidden)",
          r.get("view") == "unread" and r.get("open") is True and r.get("toggles") == [] and r.get("seen") == 0)
    h = p.get("hidden", {})
    check("hiding with the preview on screen: no toggle('close'), the reply is NOT marked seen",
          h.get("toggles") == [] and h.get("seen") == 0 and h.get("route") == "unread-messages")
    check("hidden preview: still open behind prnm-cw-hidden (unread class kept, not woot--hide)",
          h.get("view") == "unread" and h.get("hidden") is True and h.get("open") is False
          and h.get("unreadClass") is True and h.get("closedClass") is False)
    r2 = p.get("second reply while hidden", {})
    check("a second reply while hidden: still unread, no toggle", r2.get("seen") == 0 and r2.get("unread") == 2
          and r2.get("toggles") == [])
    sh = p.get("shown", {})
    check("shown again: the preview is back on screen, unread", sh.get("view") == "unread" and sh.get("open") is True
          and sh.get("hidden") is False and sh.get("seen") == 0)
    again = p.get("hidden and shown again", {})
    check("hidden and shown again: still unread, still no toggle", again.get("seen") == 0 and again.get("toggles") == []
          and again.get("view") == "unread")
    c = p.get("clicked", {})
    check("a launcher click opens the full chat; only now is the reply marked seen",
          c.get("toggles") == ["close", "open"] and c.get("seen") == 1 and c.get("view") == "open")

    o = drive("open-then-hide")
    check("the full chat open when hiding starts is closed",
          o.get("opened", {}).get("view") == "open" and o.get("hidden", {}).get("toggles") == ["open", "close"]
          and o.get("hidden", {}).get("view") == "closed")
    rw = o.get("reply while hidden", {})
    check("a reply while hidden is recorded, not fought (no toggle, not seen)", rw.get("toggles") == ["open", "close"]
          and rw.get("seen") == 0 and rw.get("view") == "unread" and rw.get("hidden") is True)
    check("shown again: that preview appears", o.get("shown", {}).get("view") == "unread"
          and o.get("shown", {}).get("open") is True)


def layout_case():
    print("== case layout (the real widget CSS over Chatwoot v4.19.1 sdk.css, headless Chromium)")
    fx = open(SDK_CSS, "rb").read().split(b"/* prnm-fixture:verbatim-below */\n", 1)
    check("sdk.css fixture is the v4.19.1 file (sha256)", len(fx) == 2 and hashlib.sha256(fx[1]).hexdigest() == SDK_CSS_SHA)
    node = tool("node")
    paths = [x for x in os.environ.get("NODE_PATH", "").split(os.pathsep) if x] + ["/opt/node-tools/node_modules"]
    npath = next((x for x in paths if os.path.exists(os.path.join(x, "playwright"))), None)
    if not node or not npath:
        print("  SKIP layout: node or Playwright not found (NODE_PATH, /opt/node-tools/node_modules)")
        return
    d = H + "/case-layout"
    os.makedirs(d)
    m = re.search(r"prnm-cw-css:start \*/.*?`(.*?)`.*?/\* prnm-cw-css:end", open(REAL_TSX).read(), re.S)
    open(d + "/widget.css", "w").write(m.group(1))
    open(d + "/sdk.css", "wb").write(fx[1])
    open(d + "/layout.cjs", "w").write(LAYOUT_DRIVER)
    tablet = ["1024x768", "1024x600", "768x500", "700x466", "768x1024", "820x1180"]
    short = ["667x375", "812x375", "932x430", "1024x465"]
    rows = []
    for bar in (60, 65):  # WEST topbar, EAST header
        r = subprocess.run([node, "layout.cjs", "widget.css", "sdk.css", str(bar), ",".join(tablet + short)], cwd=d,
                           capture_output=True, text=True, timeout=300, env=dict(os.environ, NODE_PATH=npath))
        if r.returncode:
            print("     | " + (r.stdout + r.stderr).strip()[-600:].replace("\n", "\n     | "))
        rows += [dict(json.loads(x), barpx=bar) for x in r.stdout.splitlines() if x.startswith("{")]
    check("Chromium measured every layout", len(rows) == 2 * 2 * len(tablet + short))
    covers = lambda a, b: not (a["bottom"] <= b["top"] or a["top"] >= b["bottom"] or a["right"] <= b["left"]
                               or a["left"] >= b["right"])
    groups = {}  # check name -> sizes where it failed
    for x in rows:
        sz = "%dx%d/%dpx bar" % (x["w"], x["h"], x["barpx"])
        card, lau, bar = x["card"], x["launcher"], x["bar"]
        above = abs(lau["top"] - card["bottom"] - 12) < 0.5  # 12px gap above the launcher
        if x["unread"]:
            ok = {"preview: 12px above the launcher, never over it": above and not covers(card, lau)}
        elif "%dx%d" % (x["w"], x["h"]) in tablet:
            ok = {"open card (%s): below the sticky top bar + 12px, >= 250px tall, 12px above the launcher"
                  % ", ".join(tablet): card["top"] >= bar["bottom"] + 12 and card["height"] >= 250 and above
                  and not covers(card, lau)}
            if (x["w"], x["h"]) == (1024, 768):
                ok["open card 1024x768: top 80px, 552px tall (was 24.8px, 607px)"] = (
                    abs(card["top"] - 80) < 0.5 and abs(card["height"] - 552) < 0.5)
        else:
            ok = {"open card, short landscape (%s): full height, beside the launcher tile, not over it"
                  % ", ".join(short): card["top"] == 0 and card["height"] == x["h"] and card["left"] >= lau["right"] + 10
                  and lau["right"] - lau["left"] == 48 and not covers(card, lau)}
        for name, good in ok.items():
            bad = groups.setdefault(name, [])
            if not good:
                bad.append("%s: card top %.1f h %.1f left %.1f / launcher %.1f-%.1f" % (
                    sz, card["top"], card["height"], card["left"], lau["top"], lau["right"]))
    for name, bad in groups.items():
        check(name + ("" if not bad else " -- " + "; ".join(bad)), not bad)


class Site(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        p = self.path.split("?")[0]
        inj = STATE.get("inject")
        extra = {}
        if p == "/packs/js/sdk.js":
            body = STATE["sdk"]
            if STATE["acao"]:
                extra["Access-Control-Allow-Origin"] = STATE["acao"]
            self.send_response(200)
        elif p in ("/", "/p/how-to-host-a-pool-party"):
            body = ("page %s %s" % (p, "prnm-chatwoot-v1" if inj and os.path.exists(inj) else "")).encode()
            self.send_response(200)
        else:
            body = b"nope"
            self.send_response(404)
        for k, v in extra.items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


def mkbox(c):
    shutil.rmtree(c, ignore_errors=True)
    a = c + "/app"
    for d in ("src/routes", "src/components", "node_modules/pkg", "node_modules/.vite-temp",
              "dist/client/fw-assets", "dist/server/fw-assets", "dist.bak-old/client", ".git", "bin"):
        os.makedirs(os.path.join(a if d != "bin" else c, d), exist_ok=True)
    shutil.copy(BOX, a + "/src/routes/__root.tsx")
    open(a + "/src/routeTree.gen.ts", "w").write("// original route tree\n")
    open(a + "/node_modules/pkg/index.js", "w").write("module.exports = 1;\n")
    open(a + "/node_modules/.vite-temp/stale.mjs", "w").write("stale\n")
    open(a + "/fakebuild.mjs", "w").write(FAKEBUILD)
    open(a + "/package.json", "w").write('{"name":"fake","private":true,"scripts":{"build":"node fakebuild.mjs"}}\n')
    open(a + "/.env", "w").write("VITE_SUPABASE_URL=https://example.invalid\n")
    os.chmod(a + "/.env", 0o600)
    open(a + "/dist/client/fw-assets/index-OLDHASH.js", "w").write("old bundle\n")
    open(a + "/dist/server/fw-assets/chunk-OLD.js", "w").write("old server chunk\n")
    open(a + "/dist/server/server.js", "w").write("old server\n")
    open(a + "/dist.bak-old/client/x", "w").write("bak\n")
    old = time.time() - 7200
    for root, _, fs in os.walk(a):
        for f in fs:
            os.utime(os.path.join(root, f), (old, old))
    newer = time.time() - 3600
    os.utime(a + "/dist/client/fw-assets/index-OLDHASH.js", (newer, newer))
    open(c + "/sdk.js", "wb").write(SDKJS)  # what the fake chatwoot-rails-1 holds
    open(c + "/calls.log", "w").close()
    for tool, body in FAKES.items():
        open("%s/bin/%s" % (c, tool), "w").write(body % {"c": c})
        os.chmod("%s/bin/%s" % (c, tool), 0o755)
    os.makedirs(c + "/raw", exist_ok=True)
    shutil.copy(TSX, c + "/raw/chatwoot-widget.tsx")
    return a


def script(c, dry, min_mb=0, trial=False):
    s = open(SCRIPT).read()
    reps = [
        ("DRY = True\n", "DRY = %s\n" % dry),
        ("TRIAL = False  #", "TRIAL = %s  #" % trial),
        ('SHA = "REPLACE_AFTER_COMMIT"', 'SHA = "TESTSHA"'),
        ('SUM = "REPLACE_AFTER_COMMIT"', 'SUM = "%s"' % hashlib.sha256(open(TSX, "rb").read()).hexdigest()),
        ('RAW = "https://raw.githubusercontent.com/derekbowen/poolrentalnearme-web/%s/ops/chatbot/ops/east/" % SHA',
         'RAW = "file://%s/raw/"' % c),
        ('APP = "/home/ubuntu/fresh-web"', 'APP = "%s/app"' % c),
        ('SITE = "https://www.poolrentalnearme.com"', 'SITE = "http://127.0.0.1:%d"' % PORT),
        ('SDK = "https://chat.poolrentalnearme.com/packs/js/sdk.js"', 'SDK = "http://127.0.0.1:%d/packs/js/sdk.js"' % PORT),
        ('"/home/ubuntu/backup-east-chatwoot-widget-"', '"%s/bk-"' % c),
        ('"/home/ubuntu/fresh-web-stage-"', '"%s/stage-"' % c),
        ("sudo -u ubuntu PM2_HOME=/home/ubuntu/.pm2 bash -lc %s", "bash -c %s"),
        ('ub("pm2 restart fresh-web")', 'ub("echo restart >> %s/calls.log")' % c),
        ("time.sleep(10)", "time.sleep(0)"),
        ('"docker exec chatwoot-postgres-1 psql -U postgres -d chatwoot_production -Atc \\"select w.website_token from "',
         '"echo %s # "' % TOKEN),
        ("MIN_MB = 1536", "MIN_MB = %d" % min_mb),
    ]
    for a, b in reps:
        assert s.count(a) == 1, a
        s = s.replace(a, b)
    p = c + "/east_widget.test.py"
    open(p, "w").write(s)
    return p


def run(c, p, extra_env=None, budget="1800"):
    STATE["inject"] = c + "/INJECT"
    env = dict(os.environ, PATH=c + "/bin:" + os.environ["PATH"], PRNM_INJECT_FILE=c + "/INJECT", **(extra_env or {}))
    env.pop("PRNM_RUNNER_TIMEOUT", None)
    if budget:
        env["PRNM_RUNNER_TIMEOUT"] = budget
    r = subprocess.run([sys.executable, p], capture_output=True, text=True, env=env)
    return r.returncode, r.stdout + r.stderr


def calls(c):
    return open(c + "/calls.log").read()


def tree_md5(a):
    h = hashlib.md5()
    for root, dirs, fs in sorted(os.walk(a)):
        dirs.sort()
        for f in sorted(fs):
            fp = os.path.join(root, f)
            h.update(fp.encode() + open(fp, "rb").read())
    return h.hexdigest()


def check(name, cond):
    print(("  ok   " if cond else "  FAIL ") + name)
    if not cond:
        check.fails += 1


check.fails = 0


def refused_untouched(label, c, a, before, rc, out, why):
    check("%s: exit 1, nothing changed (%s)" % (label, why), rc == 1 and "ABORT, nothing changed" in out and why in out)
    check("%s: app tree byte-identical, no stage/backup dirs" % label, tree_md5(a) == before
          and not [x for x in os.listdir(c) if x.startswith(("stage-", "bk-"))])


def main():
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Site)
    threading.Thread(target=srv.serve_forever, daemon=True).start()

    widget_case()
    layout_case()

    print("== case dry")
    c = H + "/case-dry"
    a = mkbox(c)
    before = tree_md5(a)
    rc, out = run(c, script(c, True))
    check("exit 1 with DRY RUN", rc == 1 and "DRY RUN: nothing changed" in out)
    check("DRY prints the SRI computed from the container's sdk.js", SRI in out)
    check("app tree unchanged", tree_md5(a) == before)
    check("no stage/backup dirs", not [x for x in os.listdir(c) if x.startswith(("stage-", "bk-"))])
    check("DRY made no systemd-run/stop calls", "systemd-run" not in calls(c) and "docker stop" not in calls(c))

    print("== case no runner budget (run outside east_runx.py: 560 s default)")
    c = H + "/case-budget"
    a = mkbox(c)
    before = tree_md5(a)
    rc, out = run(c, script(c, False), budget=None)
    refused_untouched("budget", c, a, before, rc, out, "runner budget too short")

    print("== case public sdk.js differs from the container's (SRI would never match)")
    c = H + "/case-sdk-mismatch"
    a = mkbox(c)
    before = tree_md5(a)
    STATE["sdk"] = SDKJS + b"/* altered by a proxy */"
    rc, out = run(c, script(c, False))
    STATE["sdk"] = SDKJS
    refused_untouched("sdk mismatch", c, a, before, rc, out, "differs from the container's")

    print("== case public sdk.js without CORS (crossorigin=anonymous would block it)")
    c = H + "/case-sdk-cors"
    a = mkbox(c)
    before = tree_md5(a)
    STATE["acao"] = None
    rc, out = run(c, script(c, False))
    STATE["acao"] = "*"
    refused_untouched("no CORS", c, a, before, rc, out, "Access-Control-Allow-Origin None")

    print("== case no sdk.js in the container (no SRI)")
    c = H + "/case-sdk-missing"
    a = mkbox(c)
    os.remove(c + "/sdk.js")
    before = tree_md5(a)
    rc, out = run(c, script(c, False))
    refused_untouched("no sdk.js", c, a, before, rc, out, "no SRI")

    print("== case ok")
    c = H + "/case-ok"
    a = mkbox(c)
    nm_ino = os.stat(a + "/node_modules/pkg/index.js").st_ino
    rc, out = run(c, script(c, False))
    print("\n".join("     | " + x for x in out.strip().splitlines()[-7:]))
    root = open(a + "/src/routes/__root.tsx").read()
    js = [f for f in os.listdir(a + "/dist/client/fw-assets") if f.startswith("index-") and f != "index-OLDHASH.js"]
    bundle = open(a + "/dist/client/fw-assets/" + js[0]).read() if js else ""
    envf = open(a + "/.env.production.local").read() if os.path.exists(a + "/.env.production.local") else ""
    check("exit 0 DONE", rc == 0 and "DONE." in out)
    check("__root.tsx has import + mount", root.count("ChatwootWidget") == 2)
    check("component installed (the pinned TSX bytes)", os.path.exists(a + "/src/components/chatwoot-widget.tsx")
          and open(a + "/src/components/chatwoot-widget.tsx", "rb").read() == open(TSX, "rb").read())
    check(".env.production.local mode 600 with BOTH token and SRI",
          oct(os.stat(a + "/.env.production.local").st_mode & 0o777) == "0o600"
          and envf == "VITE_CHATWOOT_WEBSITE_TOKEN=%s\nVITE_CHATWOOT_SDK_SRI=%s\n" % (TOKEN, SRI))
    check("live dist has the new bundle with marker, token and SRI",
          "prnm-chatwoot-v1" in bundle and TOKEN in bundle and SRI in bundle)
    scope = [x for x in calls(c).splitlines() if x.startswith("systemd-run --scope")]
    check("build ran in one memory-capped transient scope (MemoryMax, MemorySwapMax, RuntimeMaxSec)",
          len(scope) == 1 and re.search(r"--unit=prnm-fw-build-\S+ -p MemoryMax=\d+M -p MemorySwapMax=\d+M "
                                        r"-p RuntimeMaxSec=\d+ bash -c .*max-old-space-size=3072.*npm run build", scope[0]))
    check("scope disclosed in the output", "transient scope prnm-fw-build-" in out and "MemoryMax=" in out)
    check("no sidekiq stop when the cap is above MIN_MB", "docker stop" not in calls(c))
    check("old hashed client asset kept", os.path.exists(a + "/dist/client/fw-assets/index-OLDHASH.js"))
    check("old server chunk kept", os.path.exists(a + "/dist/server/fw-assets/chunk-OLD.js"))
    check("new server.js live", open(a + "/dist/server/server.js").read() == "export default {};")
    bk = [x for x in os.listdir(c) if x.startswith("bk-")]
    check("backup has __root.tsx + dist-prev with the old bundle", bk and os.path.exists(
        "%s/%s/dist-prev/client/fw-assets/index-OLDHASH.js" % (c, bk[0])) and open(
        "%s/%s/__root.tsx" % (c, bk[0]), "rb").read() == open(BOX, "rb").read())
    check("stage removed", not [x for x in os.listdir(c) if x.startswith("stage-")])
    check("live node_modules untouched (same inode, same content)",
          os.stat(a + "/node_modules/pkg/index.js").st_ino == nm_ino
          and open(a + "/node_modules/pkg/index.js").read() == "module.exports = 1;\n"
          and os.path.exists(a + "/node_modules/.vite-temp/stale.mjs"))
    check("in-place build writer did not reach live src",
          open(a + "/src/routeTree.gen.ts").read() == "// original route tree\n")
    newest = max(os.path.getmtime(a + "/dist/client/fw-assets/" + f) for f in os.listdir(a + "/dist/client/fw-assets")
                 if f.endswith(".js"))
    check("live src older than the new bundle (next gate clean)",
          os.path.getmtime(a + "/src/routes/__root.tsx") < newest
          and os.path.getmtime(a + "/src/components/chatwoot-widget.tsx") < newest)
    check("pm2 restart called once", calls(c).count("restart") == 1)
    check("dist.bak-* not copied into stage (no stray copy in backup)", not os.path.exists(
        "%s/%s/dist-prev/dist.bak-old" % (c, bk[0])) if bk else False)
    rc2, out2 = run(c, script(c, False))
    check("second run refuses (drift + files exist)", rc2 == 1 and "drift" in out2 and "exists" in out2)

    print("== case trial (capped staged build only, never swaps)")
    c = H + "/case-trial"
    a = mkbox(c)
    before = tree_md5(a)
    rc, out = run(c, script(c, False, trial=True))
    print("\n".join("     | " + x[:120] for x in out.strip().splitlines()[-3:]))
    check("exit 1 TRIAL passed, peak memory reported", rc == 1 and "TRIAL: capped build passed" in out
          and re.search(r"peak RAM \S+ swap \S+ bytes", out))
    check("trial: build ran in the capped scope", "systemd-run --scope" in calls(c) and "MemoryMax=" in calls(c))
    check("trial: live tree byte-identical, no pm2 restart, no stage/backup left", tree_md5(a) == before
          and "restart" not in calls(c) and not [x for x in os.listdir(c) if x.startswith(("stage-", "bk-"))])

    print("== case buildfail")
    c = H + "/case-buildfail"
    a = mkbox(c)
    open(a + "/FAIL_BUILD", "w").write("1")
    before = tree_md5(a)
    rc, out = run(c, script(c, False))
    check("exit 1 build failed", rc == 1 and "ABORT: build failed or out of time; live site untouched" in out)
    check("live tree byte-identical", tree_md5(a) == before)
    check("stage removed", not [x for x in os.listdir(c) if x.startswith("stage-")])

    print("== case verifyfail (marker leaks into server HTML after the swap)")
    c = H + "/case-verifyfail"
    a = mkbox(c)
    before = tree_md5(a)
    rc, out = run(c, script(c, False), {"PRNM_FAIL_VERIFY": c + "/INJECT"})
    print("\n".join("     | " + x for x in out.strip().splitlines()[-4:]))
    check("exit 1 FAILED -> exchanging back", rc == 1 and "exchanging the previous dist back" in out)
    check("live tree byte-identical after rollback", tree_md5(a) == before)
    check("pm2 restarted twice (new, then old)", calls(c).count("restart") == 2)

    print("== case lowmem (sidekiq stop + safety timer, always restarted)")
    c = H + "/case-lowmem"
    a = mkbox(c)
    rc, out = run(c, script(c, False, min_mb=10 ** 9))
    log = calls(c)
    print("\n".join("     | " + x[:110] for x in log.strip().splitlines()))
    order = [" ".join(x.split()[:2]) for x in log.strip().splitlines() if not x.startswith("restart")]
    check("exit 0", rc == 0)
    check("sdk read, timer armed, sidekiq stopped, scoped build, started, timer cancelled (in that order)",
          order == ["docker exec", "systemd-run --on-active=1300", "docker stop", "systemd-run --scope",
                    "docker start", "systemctl stop"])
    check("timer is uniquely named and cancelled by that name",
          re.search(r"--unit=(prnm-sidekiq-guard-\S+) ", log) and "systemctl stop %s.timer" % re.search(
              r"--unit=(prnm-sidekiq-guard-\S+) ", log).group(1) in log)
    check("timer disclosed in output (name, schedule, command)", "prnm-sidekiq-guard-" in out and "+1300 s" in out
          and "docker start chatwoot-sidekiq-1" in out)

    print("== case lowmem + buildfail (sidekiq still restarted)")
    c = H + "/case-lowmem-fail"
    a = mkbox(c)
    open(a + "/FAIL_BUILD", "w").write("1")
    rc, out = run(c, script(c, False, min_mb=10 ** 9))
    log = calls(c)
    check("exit 1 and sidekiq started + timer cancelled", rc == 1 and "docker start chatwoot-sidekiq-1" in log
          and re.search(r"systemctl stop prnm-sidekiq-guard-\S+\.timer", log))

    print("== case lowmem, guard timer cannot be created (sidekiq must stay up)")
    c = H + "/case-lowmem-noguard"
    a = mkbox(c)
    rc, out = run(c, script(c, False, min_mb=10 ** 9), {"FAKE_TIMER_RC": "1"})
    log = calls(c)
    check("exit 0, no docker stop, build still capped", rc == 0 and "docker stop" not in log
          and "systemd-run --scope" in log and "not created; sidekiq left running" in out)

    print("\nharness:", "ALL OK" if not check.fails else "%d FAIL(S)" % check.fails)
    srv.shutdown()
    shutil.rmtree(H, ignore_errors=True)
    sys.exit(1 if check.fails else 0)


if __name__ == "__main__":
    main()
