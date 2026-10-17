"""Check the live article after apply.sql: run `python3 -I verify.py` (any machine with internet).

Baseline taken 2026-10-17 before the change: the canonical, the 9 H2s and the 6
JSON-LD blocks listed below. After the change the only differences should be the
new H3, exactly one link to carnivalriderental.us, and Article.dateModified (the
blog_posts updated_at trigger moves it to the time of the update).
"""
import json, re, sys, time, urllib.request

URL = "https://www.poolrentalnearme.com/p/how-to-host-a-pool-party"
CANON = '<link rel="canonical" href="https://www.poolrentalnearme.com/p/how-to-host-a-pool-party"/>'
H2 = ["1. Choose a Cohesive Theme and Atmosphere", "2. Safety and Logistics: The Non-Negotiables",
      "3. High-Quality Amenities and Gear", "4. Curating a Pool-Friendly Menu", "5. Entertainment Beyond the Water",
      "Frequently Asked Questions (FAQ)", "Make a Splash with Pool Rental Near Me", "Frequently asked questions",
      "Keep exploring"]
LD = ["Organization", "WebSite", "BreadcrumbList", "Article", "FAQPage", "BreadcrumbList"]
H3 = "Planning a Larger Celebration With Several Kinds of Entertainment"

req = urllib.request.Request("%s?v=%d" % (URL, time.time()), headers={"User-Agent": "Mozilla/5.0 (PRNM content check)"})
p = urllib.request.urlopen(req, timeout=30).read().decode("utf-8")
text = lambda h: re.sub(r"<[^>]+>", "", h).strip()
ld = []
for b in re.findall(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>', p, re.S):
    j = json.loads(b)
    ld += [i.get("@type") for i in (j.get("@graph", [j]) if isinstance(j, dict) else j)]
links = re.findall(r'<a [^>]*href="https://carnivalriderental\.us/?"[^>]*>.*?</a>', p, re.S)
checks = {
    "canonical unchanged": CANON in p,
    "H2s unchanged": [text(h) for h in re.findall(r"<h2[^>]*>(.*?)</h2>", p, re.S)] == H2,
    "new H3 present": H3 in [text(h) for h in re.findall(r"<h3[^>]*>(.*?)</h3>", p, re.S)],
    "JSON-LD types unchanged": ld == LD,
    "exactly one carnivalriderental.us link": len(links) == 1,
}
for k, v in checks.items():
    print("%-40s %s" % (k, "OK" if v else "FAIL"))
print("link html:", links[:1])
sys.exit(0 if all(checks.values()) else 1)
