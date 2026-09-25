/**
 * The marketplace's listing slug — a copy of createSlug() in the Sharetribe web
 * app (src/util/urlHelpers.js).
 *
 * A listing's one public URL is /l/<createSlug(title)>/<id>: the marketplace
 * sets that as rel=canonical and 301s /l/<id> and every other slug to it. Any
 * listing URL built here (sitemap, homepage cards, city inventory) must use the
 * same slug, or Google is sent a redirect instead of the page.
 */
const SETS: { to: string; from: string }[] = [
  { to: "a", from: "ÀÁÂÃÄÅÆĀĂĄẠẢẤẦẨẪẬẮẰẲẴẶ" },
  { to: "c", from: "ÇĆĈČ" },
  { to: "d", from: "ÐĎĐÞ" },
  { to: "e", from: "ÈÉÊËĒĔĖĘĚẸẺẼẾỀỂỄỆ" },
  { to: "g", from: "ĜĞĢǴ" },
  { to: "h", from: "ĤḦ" },
  { to: "i", from: "ÌÍÎÏĨĪĮİỈỊ" },
  { to: "j", from: "Ĵ" },
  { to: "ij", from: "Ĳ" },
  { to: "k", from: "Ķ" },
  { to: "l", from: "ĹĻĽŁ" },
  { to: "m", from: "Ḿ" },
  { to: "n", from: "ÑŃŅŇ" },
  { to: "o", from: "ÒÓÔÕÖØŌŎŐỌỎỐỒỔỖỘỚỜỞỠỢǪǬƠ" },
  { to: "oe", from: "Œ" },
  { to: "p", from: "ṕ" },
  { to: "r", from: "ŔŖŘ" },
  { to: "s", from: "ßŚŜŞŠ" },
  { to: "t", from: "ŢŤ" },
  { to: "u", from: "ÙÚÛÜŨŪŬŮŰŲỤỦỨỪỬỮỰƯ" },
  { to: "w", from: "ẂŴẀẄ" },
  { to: "x", from: "ẍ" },
  { to: "y", from: "ÝŶŸỲỴỶỸ" },
  { to: "z", from: "ŹŻŽ" },
  { to: "-", from: "·/_,:;'" },
];

export function listingSlug(title: string | null | undefined): string {
  let text = String(title ?? "").toLowerCase().trim();
  for (const set of SETS) {
    text = text.replace(new RegExp(`[${set.from}]`, "gi"), set.to);
  }
  const slug = encodeURIComponent(
    text
      .replace(/\s+/g, "-")
      .replace(/[^\w-]+/g, "")
      .replace(/--+/g, "-")
      .replace(/^-+/, "")
      .replace(/-+$/, ""),
  );
  return slug.length > 0 ? slug : "no-slug";
}
