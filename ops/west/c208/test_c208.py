#!/usr/bin/env python3
"""Local tests for ops/west/c208. Nothing here contacts a server.

    python3 ops/west/c208/test_c208.py        (needs git and sh; bun is optional)

Each runner script is run for real against a throwaway copy of the box: a fake
/home/ubuntu with the build-tree files at the repo's pre-change commit, the exact
c207 scripts read from WEST (fixtures/c207/, md5-verified), file:// in place of
raw.githubusercontent.com and a local HTTP server in place of the public sdk.js.
The c208 gate block runs under sh with curl/docker stubs, and the whole generated
flip-c208.sh runs under sh against a simulated nginx/docker/curl world (FlipSim).
"""
import ast, base64, hashlib, http.server, importlib.util, json, os, re, shutil, signal, subprocess, sys, tempfile, threading, time, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
FIX = os.path.join(HERE, "fixtures")
BASE = "a0761c8716fac452e6d315de226dd0ffbc65b29b"  # repo before the chat widget (= the box's build tree)
RUNNER = "dfe34f64a5e0f5a6b7420f751803ecdf7031041c"  # snapshot of ops/runners/_runner_common.py
FAKESHA = "0123456789abcdef0123456789abcdef01234567"
TOKEN = "AbCdEf1234567890xyzQ"
SDK_BYTES = b"/* fake chatwoot sdk.js */ window.chatwootSDK = {};\n"
SRI_GOOD = "sha384-" + base64.b64encode(hashlib.sha384(SDK_BYTES).digest()).decode()
# What the read-only probe (ssm_runx, 2026-11-06) saw on WEST: md5 of each file, None = missing.
PROBE = {
    "src/routing/AppRouter.jsx": "c30d1847b1a6b54c26b66ac2b7119499",
    "server/csp.js": "f8c3beae7696e51d26c83339a21ff43c",
    "src/components/ChatwootWidget/ChatwootWidget.js": None,
    "src/components/ChatwootWidget/chatwootLoader.js": None,
    "src/components/ChatwootWidget/chatwootLoader.test.js": None,
    "src/context/routeConfigurationContext.js": "9638d0adec76bf3cfa45278fa74b3a0c",
    "src/ducks/ui.duck.js": "311c87ddc2552054db2282fc5792f8e5",
    "src/hooks/useMediaQuery.js": "4c25023de4f9f8ce92f777dd88a03942",
    "src/util/routes.js": "f080c6da9cdb51951d5619e51a13f1a9",
    "src/routing/routeConfiguration.js": "df33ac56872a467311746ac159241d07",
    "build-c207.sh": "fddf1ce1189a6dc4f6a984ba9f30773d",
    "gate-c207.sh": "1b70e733c2eb7a9f89047542fce35e62",
    "flip-c207.sh": "f1940a806085782ead35756cc1d73806",
}
CLEAN_ENV = {k: v for k, v in os.environ.items() if "proxy" not in k.lower()}  # 127.0.0.1 only, never a proxy
md5 = lambda b: hashlib.md5(b).hexdigest()
sha256 = lambda b: hashlib.sha256(b).hexdigest()


def read(p, mode="rb"):
    with open(p, mode) as f:
        return f.read()


def git_show(rev, path):
    r = subprocess.run(["git", "-C", ROOT, "show", "%s:%s" % (rev, path)], capture_output=True)
    return r.stdout if r.returncode == 0 else None


def consts(name):
    """Top-level literal assignments of a runner script, read with ast (the script is not executed)."""
    out = {}
    for node in ast.parse(read(os.path.join(HERE, name), "r")).body:
        if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name):
            try:
                out[node.targets[0].id] = ast.literal_eval(node.value)
            except ValueError:
                pass
    return out


P, S = consts("patch_c208.py"), consts("scripts_c208.py")


def shipped_source(path):
    """The bytes the pinned commit serves: the working tree while SHA is still a placeholder."""
    if "REPLACE" in P["SHA"]:
        return read(os.path.join(ROOT, path))
    return git_show(P["SHA"], path)


def load_pin():
    spec = importlib.util.spec_from_file_location("pin_c208", os.path.join(HERE, "pin_c208.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class SDKServer:
    """127.0.0.1 stand-in for chat.poolrentalnearme.com: /packs/js/sdk.js with CORS,
    /nocors/... without it, /other/... with different bytes. Counts requests."""

    def __init__(self):
        outer = self
        self.hits = 0

        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                outer.hits += 1
                body = b"something else" if self.path.startswith("/other/") else SDK_BYTES
                self.send_response(200)
                self.send_header("Content-Type", "application/javascript")
                if not self.path.startswith("/nocors/"):
                    self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *a):
                pass

        self.httpd = http.server.HTTPServer(("127.0.0.1", 0), Handler)
        self.url = "http://127.0.0.1:%d" % self.httpd.server_address[1]
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def close(self):
        self.httpd.shutdown()
        self.httpd.server_close()


class Box:
    """A throwaway /home/ubuntu laid out the way the probe found WEST."""

    def __init__(self):
        self.root = tempfile.mkdtemp(prefix="c208test-")
        self.H = os.path.join(self.root, "home", "ubuntu")
        self.B = os.path.join(self.H, "build")
        self.raw = os.path.join(self.root, "raw", FAKESHA)
        os.makedirs(os.path.join(self.B, "src", "components"))
        for p in list(P["FILES"]) + list(P["DEPS"]):
            data = git_show(BASE, p)
            if data is not None:
                self.put(os.path.join(self.B, p), data)
        self.env = b"VITE_ENV=production\nSTRIPE_SECRET_KEY=rk_test_not_a_real_key"
        self.put(os.path.join(self.B, ".env"), self.env, 0o600)
        for f in S["C207"]:
            self.put(os.path.join(self.H, f), read(os.path.join(FIX, "c207", f)), 0o755)
        for p in list(P["FILES"]) + [S["BLOCK"][0], S["FLIP"][0]]:
            self.put(os.path.join(self.raw, p), shipped_source(p))
        self.sdk = SDKServer()

    @staticmethod
    def put(p, data, mode=0o644):
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "wb") as f:
            f.write(data)
        os.chmod(p, mode)

    def close(self):
        self.sdk.close()
        shutil.rmtree(self.root, ignore_errors=True)

    def tree(self):
        """Every path under the fake home with its mode and content hash."""
        out = {}
        for d, dirs, files in os.walk(self.H):
            for n in dirs + files:
                p = os.path.join(d, n)
                st = os.lstat(p)
                out[os.path.relpath(p, self.H)] = (oct(st.st_mode), sha256(read(p)) if os.path.isfile(p) else "dir")
        return out

    NEEDS = {"patch_c208.py": "DRY SHA TOKEN SRI RAW SDK B BK", "scripts_c208.py": "DRY SHA TOKEN SRI RAW SDK H pwd",
             "launch_c208.py": "DRY H PG"}

    def prep(self, name, dry=True, sha=FAKESHA, token=TOKEN, sri=SRI_GOOD, sdk="/packs/js/sdk.js", extra=()):
        """Copy a runner script with the box paths, values and DRY swapped in at exact anchors.
        Every anchor the script needs must match exactly once, so a script can never reach the
        real /home/ubuntu, GitHub or chat.poolrentalnearme.com from a test."""
        s = read(os.path.join(HERE, name), "r")
        if name != "launch_c208.py":  # sha256 pins re-derived from what the fake box serves (Pins checks the real ones)
            pm = load_pin()
            pm.git_bytes = lambda commit, path: shipped_source(path)
            s, n = pm.pin(s, {}, None)
            assert n == {"patch_c208.py": 5, "scripts_c208.py": 2}[name], (name, n)
        subs = {"DRY": (r'^DRY = True$', "DRY = %s" % dry), "SHA": (r'^SHA = "[^"]*"$', 'SHA = "%s"' % sha),
                "TOKEN": (r'^TOKEN = "[^"]*"$', 'TOKEN = "%s"' % token), "SRI": (r'^SRI = "[^"]*"$', 'SRI = "%s"' % sri),
                "RAW": (r'^RAW = "https://raw\.githubusercontent\.com/derekbowen/poolrentalnearme-web/%s/" % SHA$',
                        'RAW = "file://%s/raw/%%s/" %% SHA' % self.root),
                "SDK": (r'^SDK = "https://chat\.poolrentalnearme\.com/packs/js/sdk\.js"$', 'SDK = "%s%s"' % (self.sdk.url, sdk)),
                "H": (r'^H = "/home/ubuntu"$', 'H = "%s"' % self.H), "B": (r'^B = "/home/ubuntu/build"$', 'B = "%s"' % self.B),
                "BK": (r'^BK = "/home/ubuntu/backup-c208"$', 'BK = "%s/backup-c208"' % self.H),
                "pwd": (re.escape('pwd.getpwnam("ubuntu")'), "pwd.getpwuid(os.getuid())"),
                # only this box's scripts: other test runs on the same machine must not look "still running"
                "PG": (r'^PG = r"\(build\|gate\|flip\)-c208\\\.sh"', 'PG = r"%s/(build|gate|flip)-c208\\.sh"' % self.H)}
        for rx, rep in [subs[k] for k in self.NEEDS[name].split()] + list(extra):
            s, n = re.subn(rx, rep, s, flags=re.M)
            assert n == 1, "test anchor %r matched %d times in %s" % (rx, n, name)
        assert "raw.githubusercontent" not in s and "chat.poolrentalnearme.com/packs" not in s, name
        p = os.path.join(self.root, "run_" + name)
        with open(p, "w") as f:
            f.write(s)
        return p

    def run(self, name, env=None, **kw):
        r = subprocess.run([sys.executable, "-I", self.prep(name, **kw)], capture_output=True, text=True, timeout=120,
                           env=dict(CLEAN_ENV, **(env or {})))
        return r.returncode, r.stdout, r.stderr


class Pins(unittest.TestCase):
    def test_changed_files_pinned_to_repo_before_change_and_probe(self):
        for p, (m, _) in P["FILES"].items():
            before = git_show(BASE, p)
            self.assertEqual(PROBE[p], m, p)
            self.assertEqual(None if before is None else md5(before), m, p)

    def test_deps_pinned_to_repo_and_probe(self):
        for p, m in P["DEPS"].items():
            self.assertEqual(md5(git_show(BASE, p)), m, p)
            self.assertEqual(PROBE[p], m, p)

    def test_c207_fixtures_are_the_probed_scripts(self):
        for f, m in S["C207"].items():
            self.assertEqual(md5(read(os.path.join(FIX, "c207", f))), m)
            self.assertEqual(PROBE[f], m)

    def test_sha256_pins_match_what_the_commit_serves(self):
        for p, (_, s) in P["FILES"].items():
            self.assertEqual(sha256(shipped_source(p)), s, "re-pin with pin_c208.py: " + p)
        self.assertEqual(sha256(shipped_source(S["BLOCK"][0])), S["BLOCK"][1], "re-pin: gate block")
        self.assertEqual(sha256(shipped_source(S["FLIP"][0])), S["FLIP"][1], "re-pin: flip block")

    def test_every_hide_route_name_exists_in_the_route_configuration(self):
        """A typo in HIDE_ON_ROUTES or HIDE_ON_COMPACT_ROUTES would silently leave a payment page unhidden:
        shouldHide() just never matches. Checked against the box's routeConfiguration.js (md5-pinned in DEPS)
        and the repo's, with the loader the pinned commit serves."""
        rc_path = "src/routing/routeConfiguration.js"
        box_rc = git_show(BASE, rc_path)
        self.assertEqual(md5(box_rc), P["DEPS"][rc_path])  # the box's file, byte for byte
        loader = shipped_source("src/components/ChatwootWidget/chatwootLoader.js").decode()
        hide = {}
        for k in ("HIDE_ON_ROUTES", "HIDE_ON_COMPACT_ROUTES"):
            m = re.search(r"^export const %s = Object\.freeze\(\[\n(.*?)\n\]\);$" % k, loader, re.M | re.S)
            self.assertIsNotNone(m, k)
            lines = [x.strip() for x in m.group(1).split("\n")]
            self.assertTrue(all(re.fullmatch(r"'\w+',", x) for x in lines), (k, lines))  # one quoted name per line
            hide[k] = [x[1:-2] for x in lines]
        total = sum(map(len, hide.values()))
        self.assertEqual(total, 12)
        self.assertIn("All %d route names that the hide rules use exist" % total, read(os.path.join(HERE, "README.md"), "r"))
        for label, rc in (("box", box_rc), ("repo", read(os.path.join(ROOT, rc_path)))):
            rc = rc.decode()
            names = re.findall(r"^\s+name: '(\w+)',$", rc, re.M)
            self.assertEqual(len(names), len(re.findall(r"^\s+path: ", rc, re.M)), label)  # every route's name parsed
            self.assertGreater(len(names), 30, label)
            for k, v in hide.items():
                for n in v:
                    self.assertIn(n, names, "%s: %r is not a route name in the %s routeConfiguration.js" % (k, n, label))

    def test_both_scripts_share_values(self):
        for k in ("SHA", "TOKEN", "SRI", "SDK"):
            self.assertEqual(P[k], S[k], k)

    def test_dry_by_default_and_placeholders_until_pinned(self):
        for c in (P, S, consts("launch_c208.py")):
            self.assertIs(c["DRY"], True)
        self.assertTrue("REPLACE" in P["TOKEN"] and "REPLACE" in P["SRI"] or re.fullmatch(r"[A-Za-z0-9]{16,64}", P["TOKEN"]))


class Payload(unittest.TestCase):
    """Plain ssm_runx form: echo <b64> | base64 -d > /tmp/prnm_step_<10>.py && python3 ...; rm -f ...  <= 9500."""

    def test_runner_formula_is_the_snapshot(self):
        snap = git_show(RUNNER, "ops/runners/_runner_common.py").decode()
        self.assertIn('cmd = "echo %s | base64 -d > %s && python3 %s; rm -f %s" % (b64, remote, remote, remote)', snap)
        self.assertIn("if len(cmd) > 9500:", snap)

    def test_each_script_fits_with_worst_case_values_filled(self):
        for name in ("patch_c208.py", "scripts_c208.py", "launch_c208.py"):
            s = read(os.path.join(HERE, name), "r")
            self.assertNotIn("RUNNER_TIMEOUT", s)
            s = re.sub(r'^DRY = True$', "DRY = False", s, flags=re.M)
            s = re.sub(r'^SHA = "[^"]*"$', 'SHA = "%s"' % ("f" * 40), s, flags=re.M)
            s = re.sub(r'^TOKEN = "[^"]*"$', 'TOKEN = "%s"' % ("T" * 64), s, flags=re.M)
            s = re.sub(r'^SRI = "[^"]*"$', 'SRI = "sha384-%s"' % ("S" * 64), s, flags=re.M)
            remote = "/tmp/prnm_step_0123456789.py"
            cmd = "echo %s | base64 -d > %s && python3 %s; rm -f %s" % (base64.b64encode(s.encode()).decode(), remote, remote, remote)
            self.assertLessEqual(len(cmd), 9500, name)


class PatchBuildTree(unittest.TestCase):
    def setUp(self):
        self.box = Box()
        self.before = self.box.tree()

    def tearDown(self):
        self.box.close()

    def refused(self, want, **kw):
        code, out, err = self.box.run("patch_c208.py", **kw)
        self.assertNotEqual(code, 0, out + err)
        self.assertIn(want, err)
        self.assertEqual(self.box.tree(), self.before, "something changed on a refused run")
        return err

    def test_placeholders_refused_before_any_fetch(self):
        err = self.refused("placeholders remain: SHA, TOKEN, SRI", sha="REPLACE_AFTER_COMMIT",
                           token="REPLACE_WITH_TOKEN", sri="REPLACE_WITH_SRI")
        self.assertEqual(self.box.sdk.hits, 0)
        self.refused("placeholders remain: SRI", sri="REPLACE_WITH_SRI")
        self.refused("placeholders remain: server/csp.js", extra=[(r'"[0-9a-f]{64}"\),\n(\s+"src/components/ChatwootWidget/ChatwootWidget)',
                                                                   '"REPLACE_ME"),\n\\1')])

    def test_malformed_values_refused(self):
        self.refused("malformed TOKEN", token="short")
        self.refused("malformed SRI", sri="sha256-" + "A" * 64)
        self.refused("malformed SHA", sha="main")

    def test_dry_run_passes_and_changes_nothing(self):
        code, out, err = self.box.run("patch_c208.py")
        self.assertIn("DRY RUN: checks passed, nothing changed", err)
        self.assertIn("public sdk.js matches SRI with CORS", out)
        self.assertEqual(self.box.tree(), self.before)

    def test_drift_refused(self):
        p = os.path.join(self.box.B, "server/csp.js")
        self.box.put(p, read(p) + b"\n")
        self.before = self.box.tree()
        self.refused("drift: server/csp.js")

    def test_new_file_already_there_refused(self):
        self.box.put(os.path.join(self.box.B, "src/components/ChatwootWidget/chatwootLoader.js"), b"x")
        self.before = self.box.tree()
        self.refused("already exists: src/components/ChatwootWidget/chatwootLoader.js")

    def test_dep_drift_refused(self):
        p = os.path.join(self.box.B, "src/ducks/ui.duck.js")
        self.box.put(p, read(p).replace(b"disableScrollRequests", b"disableScrollRequestz"))
        self.before = self.box.tree()
        self.refused("dep drift: src/ducks/ui.duck.js")

    def test_tampered_or_missing_download_refused(self):
        p = os.path.join(self.box.raw, "src/routing/AppRouter.jsx")
        self.box.put(p, read(p) + b"// evil\n")
        self.refused("sha256 mismatch: src/routing/AppRouter.jsx")
        os.remove(p)
        self.refused("fetch src/routing/AppRouter.jsx")

    def test_sdk_must_match_sri_and_send_cors(self):
        self.refused("does not match SRI", sdk="/other/packs/js/sdk.js")
        self.refused("lacks CORS", sdk="/nocors/packs/js/sdk.js")
        self.refused("does not match SRI", sri="sha384-" + "A" * 64)

    def test_env_guards(self):
        for f in (".env.production", ".env.local", ".env.production.local"):
            self.box.put(os.path.join(self.box.B, f), b"VITE_X=1\n")
            self.before = self.box.tree()
            self.refused(f + " exists (would override .env)")
            os.remove(os.path.join(self.box.B, f))
        self.box.put(os.path.join(self.box.B, ".env"), self.box.env + b"\nVITE_CHATWOOT_SDK_SRI=x\n", 0o600)
        self.before = self.box.tree()
        self.refused("already has VITE_CHATWOOT_*")

    def test_backup_dir_exists_refused(self):
        os.makedirs(os.path.join(self.box.H, "backup-c208"))
        self.before = self.box.tree()
        self.refused("backup-c208 exists")

    def test_leftover_env_tmp_refused(self):
        self.box.put(os.path.join(self.box.B, ".env.c208tmp"), b"VITE_ENV=production\n", 0o600)
        self.before = self.box.tree()
        self.refused(".env.c208tmp exists (left by an earlier run)")

    def test_env_tmp_clash_during_the_real_run_patches_nothing(self):
        """The O_EXCL temp .env is made before any build-tree file changes, so a clash there leaves the tree as it was."""
        tree = {k: v for k, v in self.before.items() if k.startswith("build")}
        code, out, err = self.box.run("patch_c208.py", dry=False, extra=[(
            r'^tmp = B \+ "/\.env\.c208tmp".*$', 'tmp = B + "/.env.c208tmp"; open(tmp, "w").close()')])
        self.assertNotEqual(code, 0)
        self.assertIn("FileExistsError", err)
        after = {k: v for k, v in self.box.tree().items() if k.startswith("build") and k != "build/.env.c208tmp"}
        self.assertEqual(after, tree)

    def test_real_run(self):
        code, out, err = self.box.run("patch_c208.py", dry=False)
        self.assertEqual(code, 0, out + err)
        self.assertIn("PATCHED build tree", out)
        self.assertNotIn(TOKEN, out + err)
        self.assertNotIn(SRI_GOOD, out + err)
        bk = os.path.join(self.box.H, "backup-c208")
        for p, (m, _) in P["FILES"].items():
            self.assertEqual(read(os.path.join(self.box.B, p)), shipped_source(p), p)
            if m:
                self.assertEqual(md5(read(os.path.join(bk, p))), m, p)
            else:
                self.assertFalse(os.path.exists(os.path.join(bk, p)))
        self.assertEqual(read(os.path.join(bk, "NEW_FILES"), "r").split(), [p for p, (m, _) in P["FILES"].items() if m is None])
        self.assertEqual(read(os.path.join(bk, ".env")), self.box.env)
        self.assertEqual(os.stat(os.path.join(bk, ".env")).st_mode & 0o777, 0o600)
        self.assertEqual(os.stat(bk).st_mode & 0o777, 0o700)
        env = os.path.join(self.box.B, ".env")
        self.assertEqual(read(env), self.box.env + (
            "\n# c208 chat launcher: public, compiled into the client bundle (ops/west/c208)\n"
            "VITE_CHATWOOT_WEBSITE_TOKEN=%s\nVITE_CHATWOOT_SDK_SRI=%s\n" % (TOKEN, SRI_GOOD)).encode())
        self.assertEqual(os.stat(env).st_mode & 0o777, 0o600)
        self.assertFalse(os.path.exists(env + ".c208tmp"))
        for p, m in P["DEPS"].items():
            self.assertEqual(md5(read(os.path.join(self.box.B, p))), m)
        after = self.box.tree()
        code, out, err = self.box.run("patch_c208.py", dry=False)
        self.assertNotEqual(code, 0)
        self.assertIn("already exists", err)
        self.assertEqual(self.box.tree(), after)

    def test_env_with_trailing_newline_gets_no_blank_line(self):
        self.box.put(os.path.join(self.box.B, ".env"), self.box.env + b"\n", 0o600)
        code, out, err = self.box.run("patch_c208.py", dry=False)
        self.assertEqual(code, 0, out + err)
        self.assertTrue(read(os.path.join(self.box.B, ".env")).startswith(self.box.env + b"\n# c208"))


def strip_block(gate):
    """gate-c208.sh without the inserted c208 block."""
    i = gate.index("# c208 gate block:")
    j = gate.index('echo "=== c208 GATE PASSED')
    return gate[:i] + gate[j:]


class Scripts(unittest.TestCase):
    def setUp(self):
        self.box = Box()
        self.before = self.box.tree()

    def tearDown(self):
        self.box.close()

    def refused(self, want, **kw):
        code, out, err = self.box.run("scripts_c208.py", **kw)
        self.assertNotEqual(code, 0, out + err)
        self.assertIn(want, err)
        self.assertEqual(self.box.tree(), self.before)

    def written(self):
        code, out, err = self.box.run("scripts_c208.py", dry=False)
        self.assertEqual(code, 0, out + err)
        return {k: read(os.path.join(self.box.H, "%s-c208.sh" % k), "r") for k in ("build", "gate", "flip")}

    def test_placeholders_and_format(self):
        self.refused("placeholders remain: SHA, TOKEN, SRI", sha="REPLACE_AFTER_COMMIT", token="REPLACE_WITH_TOKEN",
                     sri="REPLACE_WITH_SRI")
        self.refused("placeholders remain: BLOCK", extra=[(r'^(BLOCK = \("[^"]+", ")[0-9a-f]{64}', r'\1REPLACE_ME')])
        self.refused("placeholders remain: FLIP", extra=[(r'^(FLIP = \("[^"]+", ")[0-9a-f]{64}', r'\1REPLACE_ME')])
        self.refused("malformed SRI", sri="sha384-short")

    def test_dry_run_writes_nothing(self):
        code, out, err = self.box.run("scripts_c208.py")
        self.assertIn("DRY RUN: checks passed, nothing written", err)
        self.assertEqual(self.box.tree(), self.before)

    def test_c207_scripts_must_be_the_probed_ones(self):
        p = os.path.join(self.box.H, "gate-c207.sh")
        self.box.put(p, read(p) + b"# edited on the box\n", 0o755)
        self.before = self.box.tree()
        self.refused("c207 script missing or changed: gate-c207.sh")
        os.remove(os.path.join(self.box.H, "flip-c207.sh"))
        self.before = self.box.tree()
        self.refused("c207 script missing or changed: flip-c207.sh")

    def test_existing_c208_script_refused(self):
        self.box.put(os.path.join(self.box.H, "flip-c208.sh"), b"#!/bin/sh\n")
        self.before = self.box.tree()
        self.refused("already exists flip-c208.sh")

    def test_block_tampered_refused(self):
        p = os.path.join(self.box.raw, S["BLOCK"][0])
        self.box.put(p, read(p).replace(b"abort", b"true"))
        self.refused("sha256 mismatch: ops/west/c208/gate_c208_block.sh")

    def test_flip_block_tampered_or_missing_refused(self):
        p = os.path.join(self.box.raw, S["FLIP"][0])
        self.box.put(p, read(p).replace(b"BACK=1", b"BACK=0"))
        self.refused("sha256 mismatch: ops/west/c208/flip_c208_block.sh")
        os.remove(p)
        self.refused("fetch ops/west/c208/flip_c208_block.sh")

    def test_anchor_count_is_exact(self):
        p = os.path.join(self.box.H, "build-c207.sh")
        data = read(p).replace(b"free -m\n", b"free -m\necho \"=== c207 build again\"\n")
        self.box.put(p, data, 0o755)
        self.before = self.box.tree()
        pin = (r'"build-c207\.sh": "[0-9a-f]{32}"', '"build-c207.sh": "%s"' % md5(data))
        self.refused("anchor '=== c207 build' found 2 times in build-c207.sh, want 1", extra=[pin])

    def test_outputs_are_c207_plus_only_the_c208_changes(self):
        out = self.written()
        for k, body in out.items():
            p = os.path.join(self.box.H, "%s-c208.sh" % k)
            self.assertEqual(os.stat(p).st_mode & 0o777, 0o755)
            r = subprocess.run(["sh", "-n", p], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, k + r.stderr)
        c207 = {k: read(os.path.join(FIX, "c207", "%s-c207.sh" % k), "r") for k in ("build", "gate", "flip")}
        T = " src/components/ChatwootWidget/chatwootLoader.test.js"
        b = out["build"]
        cd = "cd /home/ubuntu/build || exit 1\n"
        guard = b[b.index(cd) + len(cd):b.index('echo "=== c208 build')]
        self.assertEqual(guard.count("NOT PATCHED"), 2)
        undone = b.replace(guard, "").replace(T, "").replace("c208-chat-widget", "c207-no-intercom").replace("c208", "c207")
        self.assertEqual(undone, c207["build"])
        self.assertEqual(b.count("DOCKER_BUILDKIT=0 docker build --memory=2500m --memory-swap=2500m"), 2)
        self.assertIn("docker stop poolrentalnearme-production-rollback", b)
        self.assertIn("--memory=1200m --memory-swap=1200m c208-chat-widget-buildstage bun test", b)
        self.assertIn("health-booking.test.js" + T + " ||", b)

        g = out["gate"]
        blk = g[g.index("# c208 gate block:"):g.index('echo "=== c208 GATE PASSED')]
        self.assertEqual(blk, read(os.path.join(HERE, "gate_c208_block.sh"), "r").replace("@TOKEN@", TOKEN)
                         .replace("@SRI@", SRI_GOOD).replace("@SDK@", self.box.sdk.url + "/packs/js/sdk.js"))
        self.assertTrue(g.index("--- promo math + payment endpoints ---") < g.index("# c208 gate block:"))
        self.assertIn("live still on c207 (:4000)", g)
        undone = (strip_block(g).replace("live still on c207", "live still on c204").replace("c208-chat-widget", "c207-no-intercom")
                  .replace("c208", "c207"))
        self.assertEqual(undone, c207["gate"])
        for check in ("--- promo math + payment endpoints ---", "CUSTOMER_BOOKING_FEE_PCT = 15", "additional-charge/initiate",
                      "--- c207 THE FIX: Intercom removed", "intercom still in CSP", "c158 cookie", "inbound not fail-closed"):
            self.assertIn(check, g)

        f = out["flip"]
        fb = read(os.path.join(HERE, "flip_c208_block.sh"), "r")
        self.assertIn("NEW=c208-chat-widget:latest; OLD=c207-no-intercom:latest", f)
        self.assertEqual(f.count(fb), 1)
        self.assertIn('|| abort "env preflight failed"\n' + fb + 'echo "--- step 1:', f)  # before nginx is touched
        self.assertIn('(reload, never restart) ---"\nBACK=1\nsudo cp /home/ubuntu/main-web.conf', f)
        self.assertIn('BACK=0\ndocker rm -f "$MAIN" || abort "rm MAIN"', f)
        for n in (1, 3):
            self.assertIn('abort "live $u after step %d"; done\nlive_idx "after step %d"\n' % (n, n), f)
        undone = (f.replace(fb, "").replace('---"\nBACK=1\n', '---"\n').replace('BACK=0\ndocker rm', "docker rm")
                  .replace('live_idx "after step 1"\n', "").replace('live_idx "after step 3"\n', ""))
        undone = undone.replace("OLD=c207-no-intercom", "OLD=c206-ceo-cal-health").replace("c208-chat-widget", "c207-no-intercom")
        self.assertEqual(undone.replace("c208", "c207"), c207["flip"])


STUB_CURL = r"""#!/bin/sh
for a in "$@"; do last=$a; done
case " $* " in *" -I "*) cat "$STUB/headers"; exit 0;; esac
case "$last" in
  http://127.0.0.1:3000/login) cat "$STUB/login.html";;
  http://127.0.0.1:3000/) cat "$STUB/root.html";;
  https://www.poolrentalnearme.com/login) cat "$STUB/live_login.html";;
  *) exit 7;;
esac
"""
STUB_DOCKER = r"""#!/bin/sh
[ "$1" = exec ] && [ "$3" = sh ] && [ "$4" = -c ] || exit 99
cd "$STUB/img" && exec sh -c "$5"
"""
GOOD_HTML = '<html><script type="module" crossorigin src="/assets/index-AbC123_x.js"></script>Log in</html>'


class ShellBlocks(unittest.TestCase):
    """The c208 gate block and the flip's step 0b, run under sh with curl/docker stubs."""

    @classmethod
    def setUpClass(cls):
        cls.box = Box()
        code, out, err = cls.box.run("scripts_c208.py", dry=False)
        assert code == 0, out + err
        cls.gate = read(os.path.join(cls.box.H, "gate-c208.sh"), "r")
        cls.flip = read(os.path.join(cls.box.H, "flip-c208.sh"), "r")

    @classmethod
    def tearDownClass(cls):
        cls.box.close()

    def setUp(self):
        self.d = tempfile.mkdtemp(prefix="c208stub-", dir=self.box.root)
        os.makedirs(os.path.join(self.d, "bin"))
        os.makedirs(os.path.join(self.d, "img", "dist", "client", "assets"))
        Box.put(os.path.join(self.d, "bin", "curl"), STUB_CURL.encode(), 0o755)
        Box.put(os.path.join(self.d, "bin", "docker"), STUB_DOCKER.encode(), 0o755)
        self.files(headers=read(os.path.join(FIX, "csp_c208_login.txt")).rstrip(b"\n") + b"\r\n" + b"x-other: 1\r\n",
                   **{"login.html": GOOD_HTML, "root.html": "<html>Pool Rental Near Me</html>", "live_login.html": GOOD_HTML})
        self.bundle("var a='prnm-chat-launcher',t='%s',s='%s';" % (TOKEN, SRI_GOOD))

    def files(self, **kw):
        for k, v in kw.items():
            Box.put(os.path.join(self.d, k), v.encode() if isinstance(v, str) else v)

    def bundle(self, js):
        Box.put(os.path.join(self.d, "img", "dist", "client", "assets", "index-AbC123_x.js"), js.encode())

    def sh(self, body):
        script = os.path.join(self.d, "run.sh")
        Box.put(script, ('abort(){ echo "!!! ABORT: $1"; exit 1; }\nFB=poolrentalnearme-production-c208gate\n'
                         + body + '\necho "<<OK>>"\n').encode(), 0o755)
        env = dict(CLEAN_ENV, PATH=os.path.join(self.d, "bin") + ":" + os.environ["PATH"], STUB=self.d)
        r = subprocess.run(["sh", script], capture_output=True, text=True, env=env, timeout=60)
        return r.stdout + r.stderr

    def gate_block(self):
        return self.gate[self.gate.index("# c208 gate block:"):self.gate.index('echo "=== c208 GATE PASSED')]

    def assertPass(self, out):
        self.assertIn("<<OK>>", out)
        self.assertNotIn("ABORT", out)

    def assertAbort(self, out, why):
        self.assertNotIn("<<OK>>", out)
        self.assertIn("!!! ABORT: " + why, out)

    def test_gate_block_passes_on_a_good_candidate(self):
        out = self.sh(self.gate_block())
        self.assertPass(out)
        self.assertIn("CSP: https://chat.poolrentalnearme.com only in connect-src frame-src script-src", out)
        self.assertIn("SRI match True, CORS '*'", out)

    def test_gate_block_rejects_the_c207_csp(self):
        self.files(headers=read(os.path.join(FIX, "csp_c207_login.txt")))
        self.assertAbort(self.sh(self.gate_block()), "CSP names the chat host in ''")

    def test_gate_block_rejects_chat_host_in_other_directives_or_schemes(self):
        h = read(os.path.join(FIX, "csp_c208_login.txt"), "r")
        self.files(headers=h.replace("img-src 'self'", "img-src 'self' https://chat.poolrentalnearme.com"))
        self.assertAbort(self.sh(self.gate_block()), "CSP names the chat host in 'connect-src frame-src img-src script-src '")
        self.files(headers=h.replace("connect-src 'self'", "connect-src 'self' wss://chat.poolrentalnearme.com"))
        self.assertAbort(self.sh(self.gate_block()), "wss:/http: chat source in CSP")
        fs = re.search(r"frame-src [^;]*", h).group(0)
        self.files(headers=h.replace(fs, fs.replace(" https://chat.poolrentalnearme.com", " chat.poolrentalnearme.com")))
        self.assertAbort(self.sh(self.gate_block()), "frame-src lacks https://chat.poolrentalnearme.com")
        self.files(headers="HTTP/1.1 200 OK\r\n")
        self.assertAbort(self.sh(self.gate_block()), "no CSP on /login")

    def test_gate_block_needs_launcher_token_and_sri_in_bundle(self):
        self.bundle("var a='prnm-chat-launcher',t='%s';" % TOKEN)
        self.assertAbort(self.sh(self.gate_block()), "client bundle lacks " + SRI_GOOD)
        self.bundle("var t='%s',s='%s';" % (TOKEN, SRI_GOOD))
        self.assertAbort(self.sh(self.gate_block()), "client bundle lacks prnm-chat-launcher")

    def test_gate_block_rejects_chat_or_intercom_in_server_html(self):
        self.files(**{"login.html": GOOD_HTML + '<script src="https://chat.poolrentalnearme.com/packs/js/sdk.js">'})
        self.assertAbort(self.sh(self.gate_block()), "chat in /login server HTML")
        self.files(**{"login.html": GOOD_HTML, "root.html": "<script src=https://widget.intercom.io/widget/x>"})
        self.assertAbort(self.sh(self.gate_block()), "Intercom back on /")
        self.files(**{"root.html": ""})
        self.assertAbort(self.sh(self.gate_block()), "/ empty")

    def test_gate_block_checks_the_public_sdk(self):
        blk = self.gate_block()
        u = self.box.sdk.url
        self.assertAbort(self.sh(blk.replace(u + "/packs/", u + "/other/packs/")), "public sdk.js does not match the pinned SRI")
        self.assertAbort(self.sh(blk.replace(u + "/packs/", u + "/nocors/packs/")), "public sdk.js does not match the pinned SRI")


SIM_STUB = r'''
import json, os, signal, sys
W = os.environ["W"]
me, a = os.path.basename(sys.argv[0]), sys.argv[1:]
CONF = os.path.join(W, "etc", "main-web.conf")


def log(line):
    with open(os.path.join(W, "calls"), "a") as f:
        f.write(line + "\n")


def state(new=None):
    p = os.path.join(W, "state.json")
    if new is not None:
        with open(p, "w") as f:
            json.dump(new, f)
    with open(p) as f:
        return json.load(f)


def take(name):
    """Consume one unit of the fault counter W/<name>; True when a fault fires."""
    p = os.path.join(W, name)
    if not os.path.exists(p) or int(open(p).read() or 0) <= 0:
        return False
    k = int(open(p).read())
    open(p, "w").write(str(k - 1))
    return True


if me == "sudo":
    os.execvp(a[0], a)
if me == "sleep":
    log("sleep " + " ".join(a))
    if a == ["3"] and take("term_on_sleep3"):
        os.kill(os.getppid(), signal.SIGTERM)
    sys.exit(0)
if me == "nginx":
    log("nginx " + " ".join(a))
    sys.exit(1 if a == ["-t"] and "BROKEN" in open(CONF).read() else 0)
if me == "systemctl":
    log("systemctl " + " ".join(a))
    if a == ["reload", "nginx"] and not os.path.exists(os.path.join(W, "reload_noop")):
        x = state()
        x["live"] = open(CONF).read()
        state(x)
    sys.exit(0)
if me == "docker":
    x = state()
    c = x["containers"]
    if a[0] == "ps":
        fmt = a[a.index("--format") + 1]
        for n, v in c.items():
            print(n if fmt == "{{.Names}}" else "%s %s 127.0.0.1:%s->3000/tcp" % (n, v["image"], v["port"]))
        sys.exit(0)
    log("docker " + " ".join(a))
    if a[0] == "exec":
        os.chdir(os.path.join(W, "img"))
        os.execvp("sh", a[2:])
    if a[0] == "update":
        sys.exit(1 if os.path.exists(os.path.join(W, "update_fail")) else 0)
    if a[0] == "rm":
        c.pop(a[-1], None)
        state(x)
        sys.exit(0)
    if a[0] == "run":
        name = [s for s in a if s.startswith("--name=")][0][len("--name="):]
        port = [s for s in a if s.startswith("127.0.0.1:")][0].split(":")[1]
        if name == "poolrentalnearme-production" and os.path.exists(os.path.join(W, "main_fail")):
            sys.exit(125)
        c[name] = {"image": a[-1], "port": port}
        state(x)
        print("cid-" + name)
        sys.exit(0)
    sys.exit(99)
if me == "curl":
    u, w, post = [s for s in a if s.startswith("http")][-1], "-w" in a, "POST" in a
    live = u.startswith("https://www.poolrentalnearme.com")
    if live:
        path = u[len("https://www.poolrentalnearme.com"):] or "/"
        port = state()["live"].split("127.0.0.1:")[1].split(";")[0]
    elif u.startswith("http://127.0.0.1:"):
        port, _, rest = u[len("http://127.0.0.1:"):].partition("/")
        path = "/" + rest
    else:
        sys.exit(7)
    log("curl %s %s%s" % ("live" if live else port, path, " -w" if w else ""))
    if live and not w and path == "/login" and take("live_idx_fail"):
        sys.exit(28)
    if live and w and take("live_code_fail" + path.replace("/", "_")):
        print("502", end="")
        sys.exit(0)
    srv = [v["image"] for v in state()["containers"].values() if v["port"] == port]
    if not srv:
        print("000" if w else "", end="")
        sys.exit(7)
    if w:
        print("403" if post else "200", end="")
        sys.exit(0)
    print(open(os.path.join(W, ("new" if srv[0].startswith("c208") else "old") + ".html")).read())
    sys.exit(0)
sys.exit(98)
'''
FALLBACK = "upstream web { server 127.0.0.1:4000; }\n"
MAINWEB = "upstream web { server 127.0.0.1:3000; }\n"
NEW_HTML = '<html><script type="module" crossorigin src="/assets/index-New208_a.js"></script>Log in</html>'
OLD_HTML = '<html><script type="module" crossorigin src="/assets/index-Old207_b.js"></script>Log in</html>'
MAIN, GATE, RB = "poolrentalnearme-production", "poolrentalnearme-production-c208gate", "poolrentalnearme-production-rollback"


class FlipSim(unittest.TestCase):
    """The whole generated flip-c208.sh, run under sh in a simulated box: sudo/nginx/systemctl/docker/
    curl/sleep are one stub that keeps which conf nginx serves, which container holds which port and
    which image answers /login. Paths are moved into the sandbox at exact anchors."""

    @classmethod
    def setUpClass(cls):
        cls.box = Box()
        code, out, err = cls.box.run("scripts_c208.py", dry=False)
        assert code == 0, out + err
        cls.flip = read(os.path.join(cls.box.H, "flip-c208.sh"), "r")

    @classmethod
    def tearDownClass(cls):
        cls.box.close()

    def setUp(self):
        self.W = tempfile.mkdtemp(prefix="c208flip-", dir=self.box.root)
        self.H = os.path.join(self.W, "home")
        os.makedirs(os.path.join(self.W, "bin"))
        stub = os.path.join(self.W, "bin", "_stub.py")
        Box.put(stub, ("#!%s -I\n" % sys.executable + SIM_STUB).encode(), 0o755)
        for n in ("sudo", "nginx", "systemctl", "docker", "curl", "sleep"):
            os.symlink(stub, os.path.join(self.W, "bin", n))
        Box.put(os.path.join(self.W, "img", "dist", "client", "assets", "index-New208_a.js"), b"var a='prnm-chat-launcher';")
        Box.put(os.path.join(self.W, "new.html"), NEW_HTML.encode())
        Box.put(os.path.join(self.W, "old.html"), OLD_HTML.encode())
        Box.put(os.path.join(self.W, "etc", "main-web.conf"), FALLBACK.encode())
        Box.put(os.path.join(self.W, "nginx.pid"), b"4242\n")
        Box.put(os.path.join(self.H, "fallback-web.conf"), FALLBACK.encode(), 0o664)
        Box.put(os.path.join(self.H, "main-web.conf"), MAINWEB.encode(), 0o664)
        Box.put(os.path.join(self.H, "gate-c208.done"), b"OK\n")
        Box.put(os.path.join(self.H, "prod-clone-c208.env"), b"X=1\n", 0o600)
        Box.put(os.path.join(self.H, "env_preflight.py"), b"import sys\nsys.exit(0)\n")
        self.state({"live": FALLBACK, "containers": {MAIN: {"image": "c207-no-intercom:latest", "port": "4000"},
                                                      GATE: {"image": "c208-chat-widget:latest", "port": "3000"}}})
        s = self.flip
        for a, b in (("/home/ubuntu", self.H), ("/etc/nginx/conf.d/main-web.conf", os.path.join(self.W, "etc", "main-web.conf")),
                     ("/run/nginx.pid", os.path.join(self.W, "nginx.pid"))):
            self.assertIn(a, s)
            s = s.replace(a, b)
        self.assertNotIn("/home/ubuntu", s)
        self.assertNotIn("/etc/nginx", s)
        Box.put(os.path.join(self.H, "flip-c208.sh"), s.encode(), 0o755)

    def state(self, new=None):
        p = os.path.join(self.W, "state.json")
        if new is not None:
            Box.put(p, json.dumps(new).encode())
        return json.loads(read(p))

    def fault(self, name, n=1):
        Box.put(os.path.join(self.W, name), str(n).encode())

    def flipped(self):
        """Run the flip; return (done, log, calls)."""
        env = dict(CLEAN_ENV, PATH=os.path.join(self.W, "bin") + ":" + os.environ["PATH"], W=self.W)
        r = subprocess.run(["sh", os.path.join(self.H, "flip-c208.sh")], capture_output=True, text=True, env=env, timeout=90)
        self.assertEqual(r.stdout + r.stderr, "")  # everything goes to flip-c208.log
        done = os.path.join(self.H, "flip-c208.done")
        calls = os.path.join(self.W, "calls")
        return (read(done, "r").strip() if os.path.exists(done) else None, read(os.path.join(self.H, "flip-c208.log"), "r"),
                read(calls, "r").splitlines() if os.path.exists(calls) else [])

    def conf(self):
        return read(os.path.join(self.W, "etc", "main-web.conf"), "r")

    def assertRestored(self, done, log, calls, why):
        """Aborted between step 1 and step 2: traffic is back on the untouched MAIN (c207, :4000)."""
        self.assertEqual(done, "ABORTED", log)
        self.assertIn("!!! ABORT: " + why, log)
        self.assertIn("abort before step 2: returning traffic to MAIN on :4000", log)
        self.assertIn("nginx back on 127.0.0.1:4000; live /login -> 200", log)
        self.assertEqual(self.conf(), FALLBACK)
        st = self.state()
        self.assertEqual(st["live"], FALLBACK)
        self.assertEqual(st["containers"][MAIN], {"image": "c207-no-intercom:latest", "port": "4000"})
        self.assertNotIn("docker rm -f " + MAIN, calls)
        self.assertLess(log.index("!!! ABORT"), log.index("abort before step 2: returning"))
        self.assertNotIn("--- step 2", log)

    def test_happy_path(self):
        done, log, calls = self.flipped()
        self.assertEqual(done, "OK", log)
        self.assertNotIn("ABORT", log)
        self.assertIn("docker update --restart unless-stopped " + GATE, calls)
        self.assertEqual(log.count('live /login entry, try 1: src="/assets/index-New208_a.js"'), 2)
        self.assertEqual(self.conf(), FALLBACK)
        st = self.state()
        self.assertEqual(st["live"], FALLBACK)
        self.assertEqual(st["containers"], {MAIN: {"image": "c208-chat-widget:latest", "port": "4000"},
                                            RB: {"image": "c207-no-intercom:latest", "port": "3000"}})
        self.assertEqual(calls.count("systemctl reload nginx"), 2)
        self.assertNotIn("sleep 5", calls)
        self.assertFalse(os.path.exists(os.path.join(self.H, "prod-clone-c208.env")))

    def test_live_index_never_matches_after_step_1_so_nginx_swaps_back(self):
        self.fault("live_idx_fail", 3)
        done, log, calls = self.flipped()
        self.assertRestored(done, log, calls, "live /login not served by c208 after step 1")
        for t in (1, 2, 3):
            self.assertIn("live /login entry, try %d: none" % t, log)
        self.assertEqual(calls.count("sleep 5"), 2)  # 3 tries, 5 s apart
        self.assertEqual(calls.count("systemctl reload nginx"), 2)  # step 1, then the swap back

    def test_one_flaky_live_fetch_is_retried_and_the_flip_completes(self):
        self.fault("live_idx_fail", 1)
        done, log, calls = self.flipped()
        self.assertEqual(done, "OK", log)
        self.assertIn("live /login entry, try 1: none", log)
        self.assertIn('live /login entry, try 2: src="/assets/index-New208_a.js"', log)
        self.assertEqual(calls.count("sleep 5"), 1)
        self.assertEqual(self.state()["containers"][MAIN]["image"], "c208-chat-widget:latest")

    def test_reload_that_did_not_switch_is_caught_and_swapped_back(self):
        Box.put(os.path.join(self.W, "reload_noop"), b"")  # live keeps serving c207: status checks pass, index does not
        done, log, calls = self.flipped()
        self.assertEqual(done, "ABORTED", log)
        self.assertIn('live /login entry, try 3: src="/assets/index-Old207_b.js"', log)
        self.assertIn("!!! ABORT: live /login not served by c208 after step 1", log)
        self.assertIn("abort before step 2: returning traffic to MAIN on :4000", log)
        self.assertEqual(self.conf(), FALLBACK)
        self.assertNotIn("docker rm -f " + MAIN, calls)

    def test_carried_forward_status_check_failure_after_step_1_also_swaps_back(self):
        self.fault("live_code_fail_s")
        self.assertRestored(*self.flipped(), "live /s after step 1")

    def test_nginx_t_failure_in_step_1_swaps_back(self):
        Box.put(os.path.join(self.H, "main-web.conf"), ("# BROKEN\n" + MAINWEB).encode())
        done, log, calls = self.flipped()
        self.assertRestored(done, log, calls, "nginx -> 3000")
        self.assertEqual(calls.count("systemctl reload nginx"), 1)  # only the swap back

    def test_signal_in_the_step_1_window_swaps_back(self):
        self.fault("term_on_sleep3")
        self.assertRestored(*self.flipped(), "flip stopped by a signal")

    def test_abort_after_step_2_began_leaves_traffic_on_the_gate(self):
        Box.put(os.path.join(self.W, "main_fail"), b"")
        done, log, calls = self.flipped()
        self.assertEqual(done, "ABORTED", log)
        self.assertIn("!!! ABORT: MAIN run", log)
        self.assertNotIn("returning traffic", log)
        self.assertEqual(self.conf(), MAINWEB)
        self.assertEqual(self.state()["live"], MAINWEB)
        self.assertIn(GATE, self.state()["containers"])
        self.assertIn("docker update --restart unless-stopped " + GATE, calls)  # so it survives a reboot

    def test_step_0b_refusals_leave_nginx_untouched(self):
        cases = [("nginx is not on fallback-web.conf (:4000)", lambda: Box.put(os.path.join(self.W, "etc", "main-web.conf"),
                                                                              MAINWEB.encode())),
                 ("main-web.conf does not point at :3000", lambda: Box.put(os.path.join(self.H, "main-web.conf"), FALLBACK.encode())),
                 ("could not give the gate a restart policy", lambda: Box.put(os.path.join(self.W, "update_fail"), b"")),
                 ("gated image lacks the chat launcher", lambda: Box.put(os.path.join(
                     self.W, "img", "dist", "client", "assets", "index-New208_a.js"), b"var nothing;")),
                 ("no module entry on the gated /login", lambda: Box.put(os.path.join(self.W, "new.html"), b"<html></html>")),
                 ("env preflight failed", lambda: Box.put(os.path.join(self.H, "env_preflight.py"), b"raise SystemExit(1)\n"))]
        for why, setup in cases:
            with self.subTest(why):
                self.tearDown()
                self.setUp()
                setup()
                before = self.conf()
                done, log, calls = self.flipped()
                self.assertEqual(done, "ABORTED", log)
                self.assertIn("!!! ABORT: " + why, log)
                self.assertNotIn("returning traffic", log)
                self.assertEqual(self.conf(), before)
                self.assertFalse([c for c in calls if c.startswith(("systemctl", "nginx", "docker rm", "docker run"))], calls)

    def tearDown(self):
        shutil.rmtree(self.W, ignore_errors=True)


class Launch(unittest.TestCase):
    def setUp(self):
        self.box = Box()
        for k in ("build", "gate", "flip"):
            Box.put(os.path.join(self.box.H, "%s-c208.sh" % k),
                    ('#!/bin/sh\necho "=== %s ran" > %s/%s-c208.log\necho OK > %s/%s-c208.done\n'
                     % (k, self.box.H, k, self.box.H, k)).encode(), 0o755)

    def tearDown(self):
        self.box.close()

    def launch(self, step, dry=True, how=None, extra=(), env=None):
        ex = [(r'^STEP = "build"', 'STEP = "%s"' % step)] + list(extra)
        if how:
            ex.append((r'^HOW = "setsid"', 'HOW = "%s"' % how))
        return self.box.run("launch_c208.py", dry=dry, extra=ex, env=env)

    def stub_systemd_run(self, code=0):
        """A systemd-run on PATH that logs its argv and, like the real one, starts the command outside the caller."""
        d = os.path.join(self.box.root, "sdbin")
        Box.put(os.path.join(d, "systemd-run"), (
            "#!%s -I\nimport os, subprocess, sys\nopen(os.environ['STUBLOG'], 'a').write(' '.join(sys.argv[1:]) + '\\n')\n"
            "sys.exit(%d) if %d else None\n"
            "subprocess.Popen([a for a in sys.argv[1:] if not a.startswith('--')], start_new_session=True,"
            " stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)\n" % (sys.executable, code, code)).encode(), 0o755)
        self.stublog = os.path.join(self.box.root, "systemd-run.log")
        return {"PATH": d + ":" + os.environ["PATH"], "STUBLOG": self.stublog}

    def done(self, k):
        p = os.path.join(self.box.H, "%s-c208.done" % k)
        for _ in range(50):
            if os.path.exists(p):
                return read(p, "r").strip()
            time.sleep(0.1)
        return None

    def test_order_and_dry(self):
        code, out, err = self.launch("gate")
        self.assertIn("build-c208 has not printed OK", err)
        code, out, err = self.launch("build")
        self.assertIn("DRY RUN: would start build-c208.sh", err)
        self.assertFalse(os.path.exists(os.path.join(self.box.H, "build-c208.done")))
        self.assertIn("STEP must be", self.launch("deploy")[2])

    def test_runs_each_step_once_in_order(self):
        for k in ("build", "gate", "flip"):
            code, out, err = self.launch(k, dry=False)
            self.assertEqual(code, 0, out + err)
            self.assertEqual(self.done(k), "OK")
        self.assertIn("already OK", self.launch("gate", dry=False)[2])
        code, out, err = self.launch("build")
        self.assertIn("=== build ran", out)

    def test_flip_never_reruns_after_an_abort(self):
        for k, v in (("build", "OK"), ("gate", "OK"), ("flip", "ABORTED")):
            Box.put(os.path.join(self.box.H, "%s-c208.done" % k), (v + "\n").encode())
        self.assertIn("flip already ran (done=ABORTED)", self.launch("flip", dry=False)[2])

    def test_dry_reports_log_size_age_and_running_scripts(self):
        self.assertEqual(self.launch("build", dry=False)[0], 0)
        self.done("build")
        code, out, err = self.launch("gate")
        self.assertRegex(out, r"build-c208: done=OK, log \d+ B, last written \d+ s ago")
        self.assertIn("gate-c208: done=-, no log", out)
        self.assertIn("running c208 scripts: none", out)
        self.assertIn("DRY RUN: would start gate-c208.sh (setsid)", err)

    def test_start_is_confirmed_and_a_step_that_dies_at_once_is_reported(self):
        code, out, err = self.launch("build", dry=False)
        self.assertIn("STARTED build-c208.sh (setsid): pids none, done=OK.", out)
        Box.put(os.path.join(self.box.H, "gate-c208.sh"), b"#!/bin/sh\nexit 3\n", 0o755)
        code, out, err = self.launch("gate", dry=False, extra=[(r"range\(10\)", "range(2)")])
        self.assertNotEqual(code, 0)
        self.assertIn("ABORT: gate-c208.sh is not running and wrote no .done", err)

    def test_systemd_run_mode_starts_one_transient_unit(self):
        env = self.stub_systemd_run()
        code, out, err = self.launch("build", dry=False, how="systemd-run", env=env)
        self.assertEqual(code, 0, out + err)
        self.assertEqual(self.done("build"), "OK")
        self.assertEqual(read(self.stublog, "r"), "--unit=prnm-c208-build --collect --quiet sh %s/build-c208.sh\n" % self.box.H)
        self.assertIn("transient unit prnm-c208-build: runs %s/build-c208.sh once, not scheduled" % self.box.H, out)
        self.assertIn("STARTED build-c208.sh (systemd-run)", out)

    def test_systemd_run_failure_starts_nothing(self):
        env = self.stub_systemd_run(code=1)
        code, out, err = self.launch("build", dry=False, how="systemd-run", env=env)
        self.assertIn("ABORT: systemd-run failed, nothing started", err)
        time.sleep(0.5)
        self.assertFalse(os.path.exists(os.path.join(self.box.H, "build-c208.done")))
        self.assertIn("STEP must be build, gate or flip; HOW setsid or systemd-run", self.launch("build", how="nohup")[2])


class Pin(unittest.TestCase):
    """pin_c208.pin() re-derives SHA and every sha256 pin from a commit (here dfe34f6, which has the widget files)."""

    def setUp(self):
        self.pin = load_pin()

    def test_patch_pins_follow_the_commit(self):
        text, n = self.pin.pin(read(os.path.join(HERE, "patch_c208.py"), "r"), {"SHA": RUNNER, "TOKEN": TOKEN}, RUNNER)
        self.assertEqual(n, 5)
        self.assertIn('SHA = "%s"' % RUNNER, text)
        self.assertIn('TOKEN = "%s"' % TOKEN, text)
        for p, (m, _) in P["FILES"].items():
            self.assertIn('"%s": (%s, "%s")' % (p, '"%s"' % m if m else "None", sha256(git_show(RUNNER, p))), text)
        self.assertIn('SRI = "%s"' % P["SRI"], text)

    def test_scripts_block_pins(self):
        self.pin.git_bytes = lambda commit, path: path.encode()
        text, n = self.pin.pin(read(os.path.join(HERE, "scripts_c208.py"), "r"), {"SHA": RUNNER}, RUNNER)
        self.assertEqual(n, 2)
        for k, p in (("BLOCK", "gate"), ("FLIP", "flip")):
            path = "ops/west/c208/%s_c208_block.sh" % p
            self.assertIn('%s = ("%s", "%s")' % (k, path, sha256(path.encode())), text)


class CspFixtures(unittest.TestCase):
    """The CSP fixtures are what server/csp.js emits (needs bun + node_modules; skipped otherwise).
    Rendered from copies outside the repo, with node_modules linked in."""

    def render(self, csp_source):
        bun = shutil.which("bun") or os.path.expanduser("~/.bun/bin/bun")
        if not os.path.exists(bun) or not os.path.isdir(os.path.join(ROOT, "node_modules", "helmet")):
            self.skipTest("bun or node_modules/helmet not available")
        d = tempfile.mkdtemp(prefix="c208csp-")
        try:
            os.symlink(os.path.join(ROOT, "node_modules"), os.path.join(d, "node_modules"))
            Box.put(os.path.join(d, "server", "csp.js"), csp_source)
            Box.put(os.path.join(d, "render.mjs"), (
                "const { csp } = await import(process.argv[2]);"
                "csp('/csp-report', true)({}, { locals: { cspNonce: 'abc' }, setHeader: (k, v) => "
                "{ if (/content-security/i.test(k)) console.log(k + ': ' + v); } }, () => {});").encode())
            r = subprocess.run([bun, os.path.join(d, "render.mjs"), os.path.join(d, "server", "csp.js")],
                               capture_output=True, text=True, env=dict(CLEAN_ENV, VITE_ENV="production"), timeout=60)
        finally:
            shutil.rmtree(d, ignore_errors=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        return re.sub(r"'nonce-[^']*'", "'nonce-X'", r.stdout.strip())

    def test_c208_fixture_matches_server_csp(self):
        want = read(os.path.join(FIX, "csp_c208_login.txt"), "r").strip()
        self.assertEqual(self.render(read(os.path.join(ROOT, "server", "csp.js"))), re.sub(r"'nonce-[^']*'", "'nonce-X'", want))

    def test_c207_fixture_is_what_the_pre_change_csp_emits(self):
        got = self.render(git_show(BASE, "server/csp.js"))
        live = read(os.path.join(FIX, "csp_c207_login.txt"), "r").strip()
        self.assertEqual(got.split(":", 1)[1], re.sub(r"'nonce-[^']*'", "'nonce-X'", live).split(":", 1)[1])


if __name__ == "__main__":
    unittest.main(verbosity=2)
