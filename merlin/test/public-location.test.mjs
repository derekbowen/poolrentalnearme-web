
import { readFileSync } from "node:fs";
const SRC = readFileSync("/app/dist/assets/index-4d5740d4.js", "utf8");

// ---- pull the real formatter out of the shipped bundle ----
const fnStart = SRC.indexOf("function __prnmPublicLoc");
if (fnStart !== 0) throw new Error("__prnmPublicLoc is not at the head of the bundle");
const fnEnd = SRC.indexOf('return""}') + 'return""}'.length;
const safeLoc = new Function(SRC.slice(fnStart, fnEnd) + ";return __prnmPublicLoc")();

// ---- pull the real Places reducer out of the shipped bundle ----
// Rebuilt as a callable with the same body, so a change to the shipped
// extraction breaks this test rather than silently diverging.
const exStart = SRC.indexOf('let T="",G="",W="",Ta=""');
const exEnd = SRC.indexOf("lng:R.geometry.location.lng()})", exStart) + "lng:R.geometry.location.lng()})".length;
if (exStart < 0) throw new Error("could not locate the address_components reducer");
const body = SRC.slice(exStart, exEnd);
const extract = new Function("R", "r", body);
const place = (components, formatted) => {
  let out = null;
  extract({ address_components: components, formatted_address: formatted,
            geometry: { location: { lat: () => -33.93, lng: () => 150.93 } } },
          (v) => { out = v; });
  return out;
};
const C = (types, long, short) => ({ types, long_name: long, short_name: short ?? long });

let fail = 0, n = 0;
const eq = (label, got, want) => {
  n++;
  const ok = got === want;
  if (!ok) fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}\n          got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`);
};
const noStreet = (label, got, forbidden) => {
  n++;
  const bad = forbidden.filter((t) => String(got).toLowerCase().includes(t.toLowerCase()));
  if (bad.length) fail++;
  console.log(`  ${bad.length ? "FAIL" : "PASS"}  ${label}\n          got ${JSON.stringify(got)}${bad.length ? "  LEAKED " + bad.join(",") : "  (no street token)"}`);
};

console.log("US  — 123 Main St, Austin, TX 78701, USA");
const us = place([
  C(["street_number"], "123"), C(["route"], "Main St"),
  C(["locality", "political"], "Austin"),
  C(["administrative_area_level_1", "political"], "Texas", "TX"),
  C(["postal_code"], "78701"), C(["country", "political"], "United States", "US"),
], "123 Main St, Austin, TX 78701, USA");
eq("US preview", safeLoc(us), "Austin, TX");
eq("US publish (with zip)", safeLoc(us, true), "Austin, TX 78701");
noStreet("US never emits street", safeLoc(us), ["123", "Main St"]);

console.log("AU  — 2 Gal Cres, Moorebank NSW 2170, Australia");
const au = place([
  C(["street_number"], "2"), C(["route"], "Gal Crescent", "Gal Cres"),
  C(["locality", "political"], "Moorebank"),
  C(["administrative_area_level_1", "political"], "New South Wales", "NSW"),
  C(["postal_code"], "2170"), C(["country", "political"], "Australia", "AU"),
], "2 Gal Cres, Moorebank NSW 2170, Australia");
eq("AU preview", safeLoc(au), "Moorebank, NSW");
eq("AU publish (with zip)", safeLoc(au, true), "Moorebank, NSW 2170");
noStreet("AU never emits street", safeLoc(au), ["2 Gal", "Gal Cres", "Gal Crescent"]);

console.log("GB  — no locality; postal_town carries the town");
const gb = place([
  C(["street_number"], "10"), C(["route"], "Downing Street"),
  C(["postal_town"], "London"),
  C(["administrative_area_level_1"], "England", "England"),
  C(["postal_code"], "SW1A 2AA"), C(["country"], "United Kingdom", "GB"),
], "10 Downing St, London SW1A 2AA, UK");
eq("GB falls back to postal_town", safeLoc(gb), "London, England");
noStreet("GB never emits street", safeLoc(gb), ["10 Downing", "Downing Street"]);

console.log("MALFORMED — '11914, Park Creek Drive', geocoder gave nothing usable");
const bad1 = { address: "11914, Park Creek Drive", city: "", state: "", zip: "", country: "" };
eq("malformed degrades to empty (UI shows neutral text)", safeLoc(bad1), "");
noStreet("malformed never emits street", safeLoc(bad1), ["11914", "Park Creek"]);

console.log("TWO-COMPONENT — must not assume the first segment is safe");
const bad2 = { address: "2 Gal Cres, Moorebank", city: "", state: "", zip: "", country: "Australia" };
eq("two-component degrades to country", safeLoc(bad2), "Australia");
noStreet("two-component never emits street", safeLoc(bad2), ["2 Gal", "Gal Cres", "Moorebank"]);

console.log("MISSING LOCALITY — broader area, never street");
const rural = place([
  C(["route"], "Nicholas Dr"),
  C(["administrative_area_level_2"], "Cumberland County"),
  C(["administrative_area_level_1"], "Pennsylvania", "PA"),
  C(["postal_code"], "17015"), C(["country"], "United States", "US"),
], "Nicholas Dr, Carlisle, PA 17015, USA");
eq("rural falls back to county", safeLoc(rural), "Cumberland County, PA");
noStreet("rural never emits street", safeLoc(rural), ["Nicholas Dr"]);

const onlyState = { city: "", state: "PA", zip: "17015", country: "United States" };
eq("state-only degrades to state+country", safeLoc(onlyState), "PA, United States");

console.log("HOSTILE INPUTS");
eq("null", safeLoc(null), "");
eq("undefined", safeLoc(undefined), "");
eq("address present but nothing structured", safeLoc({ address: "72 Harper St, Atoka, TN 38004, USA" }), "");
noStreet("address-only object never emits street", safeLoc({ address: "72 Harper St, Atoka, TN" }), ["72 Harper", "Harper St"]);
eq("whitespace-only fields", safeLoc({ city: "   ", state: "  ", country: " " }), "");
eq("non-string fields", safeLoc({ city: 123, state: null, country: undefined }), "123");

console.log("\nFORMATTER MUST NOT REFERENCE .address AT ALL");
n++;
const fnSrc = SRC.slice(fnStart, fnEnd);
if (/\baddress\b|\bbuilding\b|\blat\b|\blng\b/.test(fnSrc)) { fail++; console.log("  FAIL  formatter references a private field"); }
else console.log("  PASS  formatter reads only city/state/zip/country");

console.log(`\n${n - fail}/${n} passed`);
process.exit(fail ? 1 : 0);
