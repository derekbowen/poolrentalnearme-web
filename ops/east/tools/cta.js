
/* prnm-org v1: Organization JSON-LD with sameAs on every page (entity consolidation). */
(function () {
  "use strict";
  try {
    var ld = {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": "https://www.poolrentalnearme.com/#org",
      "name": "Pool Rental Near Me",
      "legalName": "PRNM Corp",
      "url": "https://www.poolrentalnearme.com",
      "telephone": "+1-909-272-8096",
      "email": "support@poolrentalnearme.com",
      "founder": { "@type": "Person", "name": "Derek Bowen" },
      // 2026-09-04: an unverified insurance clause was removed from this
      // description. It contradicted ToS 2026.3, which states that PRNM does not
      // provide, arrange, underwrite or guarantee cover of any kind; it published a
      // figure while src/config/insurance.config.js has verified:false; and it named
      // a carrier the policy record does not. Deliberately NOT replaced with another
      // carrier, amount or protection claim. See docs/INSURANCE_CLAIM_INVENTORY.md.
      "description": "U.S. marketplace for renting private swimming pools by the hour. 0% host fees through 2026.",
      "sameAs": ["https://apps.apple.com/us/app/id6737762373"]
    };
    var s = document.createElement("script");
    s.type = "application/ld+json";
    s.textContent = JSON.stringify(ld);
    document.head.appendChild(s);
  } catch (e) {}
})();


/* prnm-edu v1: Course JSON-LD for academy pages (Google renders JS-inserted LD). */
(function () {
  "use strict";
  try {
    if (location.pathname.indexOf("/p/elearning-academy-") !== 0) return;
    var t = (document.title || "").split("|")[0].trim();
    var dm = document.querySelector('meta[name="description"]');
    var desc = dm ? dm.getAttribute("content") : "Free video course for pool hosts from the Pool Rental Near Me Host Academy.";
    var ld = {
      "@context": "https://schema.org",
      "@type": "Course",
      "name": t,
      "description": desc,
      "provider": { "@type": "Organization", "name": "Pool Rental Near Me", "url": "https://www.poolrentalnearme.com" },
      "isAccessibleForFree": true,
      "inLanguage": /conviertete|alberca|-es$/.test(location.pathname) ? "es" : "en",
      "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD", "category": "Free" },
      "hasCourseInstance": { "@type": "CourseInstance", "courseMode": "Online", "courseWorkload": "PT1H" }
    };
    var s = document.createElement("script");
    s.type = "application/ld+json";
    s.textContent = JSON.stringify(ld);
    document.head.appendChild(s);
  } catch (e) {}
})();

/* prnm-a v1: first-party funnel beacons (pageviews + SPA navigation). */
(function () {
  "use strict";
  try {
    if (/bot|crawl|spider|headless|lighthouse/i.test(navigator.userAgent)) return;
    var ls = window.localStorage, ss = window.sessionStorage;
    var vid = ls.getItem("prnm_vid") || (Math.random().toString(36).slice(2) + Date.now().toString(36));
    ls.setItem("prnm_vid", vid);
    var sid = ss.getItem("prnm_sid") || (Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4));
    ss.setItem("prnm_sid", sid);
    function fam(p) {
      if (p === "/") return "home";
      if (p.indexOf("/s") === 0 && (p.length === 2 || p[2] === "?" || p[2] === "/")) return "search";
      if (/^\/l\/.+\/checkout/.test(p)) return "checkout";
      if (p.indexOf("/l/") === 0) return "listing";
      if (p.indexOf("/order") === 0 || p.indexOf("/sale") === 0) return "order";
      if (p.indexOf("/signup") === 0 || p.indexOf("/login") === 0) return "auth";
      if (p.indexOf("/public-pools") === 0) return "publicpools";
      if (p.indexOf("/p/") === 0) return "content";
      return "other";
    }
    var land = ss.getItem("prnm_land");
    function send(p, first) {
      var f = fam(p);
      if (!land) { land = f; try { ss.setItem("prnm_land", f); } catch (e) {} }
      var q = "/tools/a-beacon?v=1&e=pv&f=" + f + "&land=" + land + "&sid=" + sid + "&vid=" + vid + "&p=" + encodeURIComponent(p.slice(0, 120));
      try {
        if (f === "search") { var a = new URLSearchParams(location.search).get("address"); if (a) q += "&q=" + encodeURIComponent(a.slice(0, 40)); }
        if (first) {
          q += "&r=" + encodeURIComponent((document.referrer || "").slice(0, 80));
          var u = new URLSearchParams(location.search);
          var us = u.get("utm_source"); if (us) q += "&us=" + encodeURIComponent(us.slice(0, 24));
          var uc = u.get("utm_campaign"); if (uc) q += "&uc=" + encodeURIComponent(uc.slice(0, 24));
        }
      } catch (e) {}
      try { navigator.sendBeacon ? navigator.sendBeacon(q) : (new Image().src = q); } catch (e) {}
    }
    var last = location.pathname + location.search;
    send(location.pathname, true);
    function onNav() {
      var now = location.pathname + location.search;
      if (now !== last) { last = now; setTimeout(function () { send(location.pathname, false); }, 250); }
    }
    var ps = history.pushState; history.pushState = function () { ps.apply(this, arguments); onNav(); };
    var rs = history.replaceState; history.replaceState = function () { rs.apply(this, arguments); onNav(); };
    window.addEventListener("popstate", onNav);
  } catch (e) {}
})();

/* PRNM floating host-CTA — single source of truth. v1 2026-07-18
   Injected sitewide via nginx sub_filter loader. Update THIS file only. */
(function () {
  "use strict";
  var PHONE_DISPLAY = "(909) 272-8096";
  var PHONE_TEL = "+19092728096";
  var DISMISS_KEY = "prnm_cta_dismiss";
  var DISMISS_DAYS = 30;
  var p = location.pathname;

  /* ── suppression ── */
  var BLOCKED = ["/checkout", "/order", "/login", "/signup", "/l/new", "/l/draft", "/inbox", "/account", "/verify", "/reset-password", "/recover"];
  for (var i = 0; i < BLOCKED.length; i++) if (p.indexOf(BLOCKED[i]) === 0) return;
  try {
    var d = localStorage.getItem(DISMISS_KEY);
    if (d && Date.now() - Number(d) < DISMISS_DAYS * 864e5) return;
    // v1 approximation of "logged-in with listing": any Sharetribe session cookie
    if (/(^|;\s*)st-[^=]*token/.test(document.cookie)) return;
  } catch (e) {}

  /* ── family + copy ── */
  var fam = "generic", city = null, es = false;
  if (p.indexOf("/public-pools") === 0) fam = "publicpools";
  var lang = (document.documentElement.getAttribute("lang") || "").toLowerCase();
  if (lang.indexOf("es") === 0 || /alberca|conviertete/.test(p)) { es = true; fam = "es"; }
  if (!es && fam === "generic") {
    var t = document.title || "";
    var m = t.match(/ in ([A-Za-z .'-]+),\s*[A-Z]{2}/);
    if (m) { city = m[1].trim(); fam = "city"; }
  }
  var line1, line2, badge = "";
  if (es) {
    line1 = "¿Tienes alberca? Gana dinero rentándola →";
    line2 = "Habla con el fundador: " + PHONE_DISPLAY;
    badge = "0% comisión hasta 2026";
  } else if (fam === "publicpools") {
    line1 = "Own a pool nearby? Rent it by the hour →";
    line2 = "Talk to the founder: Call or text " + PHONE_DISPLAY;
    badge = "0% fees through 2026";
  } else if (fam === "city") {
    line1 = "Own a pool in " + city + "? Start earning →";
    line2 = "Talk to the founder: Call or text " + PHONE_DISPLAY;
    badge = "0% fees through 2026";
  } else {
    line1 = "Own a pool? Earn money hosting →";
    line2 = "Talk to the founder: Call or text " + PHONE_DISPLAY;
    badge = "0% fees through 2026";
  }
  var hostUrl = "/p/hosting?utm_source=floating_cta&utm_medium=site&utm_campaign=host_recruit&utm_content=" + fam + (city ? "_" + encodeURIComponent(city) : "");

  /* ── beacon ── */
  function ping(ev) {
    try { navigator.sendBeacon && navigator.sendBeacon("/tools/cta-beacon?e=" + ev + "&f=" + fam); } catch (e) {}
  }

  /* ── build (after content; zero CLS: fixed pos, no layout participation) ── */
  function build() {
    if (document.getElementById("prnm-cta")) return;
    var css = "#prnm-cta{position:fixed;right:14px;bottom:14px;z-index:2147483000;max-width:min(78vw,300px);font-family:Manrope,system-ui,sans-serif;box-shadow:0 6px 24px rgba(10,40,70,.25);border-radius:16px;background:#0b6ea8;color:#fff;overflow:hidden;transform:translateY(6px);opacity:0;transition:opacity .3s,transform .3s}" +
      "#prnm-cta.on{opacity:1;transform:none}" +
      "#prnm-cta .l1{display:block;padding:11px 34px 9px 14px;font-weight:800;font-size:13.5px;line-height:1.3;color:#fff;text-decoration:none}" +
      "#prnm-cta .bdg{display:inline-block;background:#ffd54d;color:#12212e;border-radius:6px;font-size:10px;font-weight:800;padding:1px 6px;margin-top:4px}" +
      "#prnm-cta .l2{display:none;padding:0 34px 11px 14px;font-size:12px}" +
      "#prnm-cta .l2 a{color:#cfe9f7;font-weight:700;text-decoration:underline}" +
      "#prnm-cta.open .l2{display:block}" +
      "@media(hover:hover){#prnm-cta:hover .l2{display:block}}" +
      "#prnm-cta .x{position:absolute;top:4px;right:4px;width:26px;height:26px;border:0;background:transparent;color:#cfe9f7;font-size:15px;cursor:pointer;line-height:1}" +
      "@media(max-width:768px){#prnm-cta{bottom:88px;right:10px}}" +
      "@media(prefers-reduced-motion:reduce){#prnm-cta{transition:none}}" +
      "@media print{#prnm-cta{display:none}}";
    var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    var el = document.createElement("div"); el.id = "prnm-cta"; el.setAttribute("role", "complementary"); el.setAttribute("aria-label", es ? "Renta tu alberca" : "Host your pool");
    var a1 = document.createElement("a"); a1.className = "l1"; a1.href = hostUrl;
    a1.appendChild(document.createTextNode(line1));
    if (badge) { var b = document.createElement("span"); b.className = "bdg"; b.textContent = badge; a1.appendChild(document.createElement("br")); a1.appendChild(b); }
    a1.addEventListener("click", function () { ping("click"); });
    var l2 = document.createElement("div"); l2.className = "l2";
    var a2 = document.createElement("a"); a2.href = "tel:" + PHONE_TEL; a2.textContent = line2;
    a2.addEventListener("click", function () { ping("call"); });
    l2.appendChild(a2);
    var x = document.createElement("button"); x.className = "x"; x.setAttribute("aria-label", "Dismiss"); x.innerHTML = "✕";
    x.addEventListener("click", function (ev) {
      ev.stopPropagation();
      try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (e) {}
      el.remove(); ping("dismiss");
    });
    el.addEventListener("click", function (ev) { if (ev.target === el || ev.target === a1 && false) return; if (ev.target.tagName !== "A" && ev.target.tagName !== "BUTTON") el.classList.toggle("open"); });
    el.appendChild(a1); el.appendChild(l2); el.appendChild(x);
    document.body.appendChild(el);
    setTimeout(function () { el.classList.add("on"); }, 60);
    ping("imp");
  }
  if (document.readyState === "complete") setTimeout(build, 800);
  else window.addEventListener("load", function () { setTimeout(build, 800); });
})();

/* prnm-quotes v2.2: host-quotes ticker, homepage only, stage-beaconed for field debug. */
(function () {
  "use strict";
  if (window.__prnmQuotesV2) return; window.__prnmQuotesV2 = 1;
  function bea(st) { try { fetch('/tools/cta-beacon?e=q-' + st, { method: 'POST', keepalive: true }); } catch (e) {} }
  var QUOTES = [
    ['\u201cI love you guys over at Pool Rental Near Me \u2014 the founder and co-founder personally called me to make sure I\u2019m all right.\u201d', 'Demarco \u00b7 Queens, NY'],
    ['\u201cRock on, Derek \u2014 I see your hustle this year and it\u2019s legit.\u201d', 'Salty Without The Sharks \u00b7 CA'],
    ['\u201cThat is amazing that there are zero host fees!!\u201d', 'Katherine \u00b7 pool host'],
    ['\u201cTrying to get away from Swimply \u2014 your platform has a better insurance policy.\u201d', 'Clint \u00b7 pool host'],
    ['\u201cI\u2019m so happy!! Thanks so much!!\u201d', 'Esther \u00b7 Brooklyn, NY'],
    ['\u201c\ud83c\udf89 1st Birthdays are SPECIAL \ud83d\udc95 See you there!\u201d', 'Stacie \u00b7 host, after her guest booked a birthday party'],
    ['\u201cPerfect, thanks so much!!\u201d', 'Nicole \u00b7 Luke\u2019s Lounge, PA'],
    ['\u201cOk awesome, tysm!!\u201d', 'Trish \u00b7 Olathe, KS'],
    ['\u201cLooks great!\u201d', 'Adam & Connie \u00b7 pool hosts'],
    ['\u201cThanks Derek!\u201d', 'Rob & Evette \u00b7 The Luxe Oasis'],
    ['\u201cThanks for the update!\u201d', 'Backyard Blue \u00b7 MD']
  ];
  var added = false, alive30 = false;
  function onHome() { var p = location.pathname; return p === '/' || p === ''; }
  function add() {
    if (document.getElementById('prnm-quotes')) return;
    if (!document.getElementById('prnmq-css')) { var stx = document.createElement('style'); stx.id = 'prnmq-css'; stx.textContent = '@keyframes prnmq{0%{transform:translate3d(0,0,0)}100%{transform:translate3d(-50%,0,0)}}#prnm-quotes .prnmq-track{display:flex;width:max-content;will-change:transform;animation:prnmq 70s linear infinite}#prnm-quotes:hover .prnmq-track{animation-play-state:paused}@media (prefers-reduced-motion: reduce){#prnm-quotes .prnmq-track{animation:none}}'; document.head.appendChild(stx); }
    var items = '';
    for (var k = 0; k < 2; k++) {
      for (var i = 0; i < QUOTES.length; i++) {
        items += '<span style="display:inline-block;padding:0 34px;white-space:nowrap">'
          + '<span style="color:#f5a623">★</span> '
          + QUOTES[i][0] + ' <b style="color:#0b6ea8">— ' + QUOTES[i][1] + '</b></span>';
      }
    }
    var bar = document.createElement('div');
    bar.id = 'prnm-quotes';
    bar.setAttribute('aria-label', 'What our hosts are saying');
    bar.innerHTML =
      '<style>@keyframes prnmq{0%{transform:translate3d(0,0,0)}100%{transform:translate3d(-50%,0,0)}}' +
      '#prnm-quotes .prnmq-track{display:flex;width:max-content;will-change:transform;animation:prnmq 70s linear infinite}' +
      '#prnm-quotes:hover .prnmq-track{animation-play-state:paused}' +
      '@media (prefers-reduced-motion: reduce){#prnm-quotes .prnmq-track{animation:none}}' +
      '</style>' +
      '<div style="overflow:hidden;white-space:nowrap;background:#e8f1f7;border-top:1px solid #d5e5f0;border-bottom:1px solid #d5e5f0;padding:11px 0;font:14px/1.4 Manrope,Arial,sans-serif;color:#12212e">' +
      '<div class="prnmq-track">' + items + '</div></div>';
    document.body.insertBefore(bar, document.body.firstChild);
    if (!added) { added = true; bea('added-top'); }
  }
  function tick() {
    try {
      if (onHome()) add();
      else { var el = document.getElementById('prnm-quotes'); if (el && el.parentNode) el.parentNode.removeChild(el); }
    } catch (e) { bea('err-' + String(e && e.message).slice(0, 40).replace(/[^a-zA-Z0-9._-]/g, '_')); }
  }
  function boot() {
    bea('boot-' + (onHome() ? 'home' : 'away'));
    tick();
    setInterval(tick, 2500);
    setTimeout(function () {
      var el = document.getElementById('prnm-quotes');
      if (onHome()) bea(el ? 'alive30-h' + Math.round((el.getBoundingClientRect().height || 0)) : 'gone30');
    }, 30000);
  }
  if (document.readyState === 'complete') setTimeout(boot, 1200);
  else window.addEventListener('load', function () { setTimeout(boot, 1200); });
})();
