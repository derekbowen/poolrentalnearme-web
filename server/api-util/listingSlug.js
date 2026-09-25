/**
 * Server-side copy of src/util/urlHelpers.js createSlug().
 *
 * The listing page canonicalises to /l/<createSlug(title)>/<id> and the server
 * 301s every other slug there. Anything on the server that builds a listing
 * URL (the /go/ share redirect) must produce the same slug, or each click takes
 * an extra hop. src/ is ESM and cannot be required from server code, hence the
 * copy; listingSlug.test.js pins it to createSlug's behaviour.
 */
const SETS = [
  { to: 'a', from: 'ÀÁÂÃÄÅÆĀĂĄẠẢẤẦẨẪẬẮẰẲẴẶ' },
  { to: 'c', from: 'ÇĆĈČ' },
  { to: 'd', from: 'ÐĎĐÞ' },
  { to: 'e', from: 'ÈÉÊËĒĔĖĘĚẸẺẼẾỀỂỄỆ' },
  { to: 'g', from: 'ĜĞĢǴ' },
  { to: 'h', from: 'ĤḦ' },
  { to: 'i', from: 'ÌÍÎÏĨĪĮİỈỊ' },
  { to: 'j', from: 'Ĵ' },
  { to: 'ij', from: 'Ĳ' },
  { to: 'k', from: 'Ķ' },
  { to: 'l', from: 'ĹĻĽŁ' },
  { to: 'm', from: 'Ḿ' },
  { to: 'n', from: 'ÑŃŅŇ' },
  { to: 'o', from: 'ÒÓÔÕÖØŌŎŐỌỎỐỒỔỖỘỚỜỞỠỢǪǬƠ' },
  { to: 'oe', from: 'Œ' },
  { to: 'p', from: 'ṕ' },
  { to: 'r', from: 'ŔŖŘ' },
  { to: 's', from: 'ßŚŜŞŠ' },
  { to: 't', from: 'ŢŤ' },
  { to: 'u', from: 'ÙÚÛÜŨŪŬŮŰŲỤỦỨỪỬỮỰƯ' },
  { to: 'w', from: 'ẂŴẀẄ' },
  { to: 'x', from: 'ẍ' },
  { to: 'y', from: 'ÝŶŸỲỴỶỸ' },
  { to: 'z', from: 'ŹŻŽ' },
  { to: '-', from: "·/_,:;'" },
];

const createSlug = (str) => {
  let text = String(str == null ? '' : str)
    .toLowerCase()
    .trim();
  SETS.forEach((set) => {
    text = text.replace(new RegExp(`[${set.from}]`, 'gi'), set.to);
  });
  const slug = encodeURIComponent(
    text
      .replace(/\s+/g, '-')
      .replace(/[^\w-]+/g, '')
      .replace(/--+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, '')
  );
  return slug.length > 0 ? slug : 'no-slug';
};

module.exports = { createSlug };
