// robots-match.mjs — a small, dependency-free robots.txt matcher.
//
// It follows the rules Google documents in "How Google interprets the robots.txt
// specification" (read 2026-11-15, page dated "Last updated 2026-10-23 UTC"):
//   https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt
//   (redirects to https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec)
//
// What is implemented, each from that page:
//   * Lines are separated by CR, CR/LF or LF. A leading byte order mark is ignored.
//   * A line is <field>:<value>; everything after "#" is a comment; leading and
//     trailing space is ignored; field names are case-insensitive.
//   * Only user-agent, allow, disallow and sitemap are supported. Every other field
//     (crawl-delay included) is ignored and does NOT end or split a group.
//   * A group is one or more user-agent lines followed by rules. A user-agent line
//     that follows a rule starts a new group. Rules before the first user-agent
//     line belong to no group and are ignored.
//   * Only one group applies to a crawler: the one whose user agent matches it
//     specifically; otherwise the "*" group. Several groups for the same user agent
//     are merged. Specific groups and "*" groups are never combined.
//   * User-agent values are case-insensitive and "non-matching text is ignored"
//     (googlebot/1.2 and googlebot* both mean googlebot).
//   * A rule without a path is ignored. Path values are case-sensitive.
//   * "*" matches zero or more characters; "$" at the end of a rule anchors the
//     end of the URL. Without "$" a rule is a prefix match.
//   * The rule with the longest path wins; when an allow and a disallow rule are
//     equally long, allow (the least restrictive) wins. No matching rule = allowed.
//   * Rules are matched against the path and query of the URL; raw UTF-8 in a rule
//     is treated as its percent-encoded form.
//
// Deliberate limits (things that page does not specify, so they are not guessed):
//   * Which characters count as part of a user-agent name. This file uses letters,
//     "-" and "_" (the product-token alphabet of RFC 9309, which the page cites;
//     the RFC itself was not re-read for this work). Consequence: "MJ12bot" is
//     compared as "mj" on both sides, so it still matches itself.
//   * A crawler with more than one token (for example an image crawler that falls
//     back to "googlebot") is the caller's business: pass the tokens most specific
//     first, e.g. ['Googlebot-Image', 'Googlebot'].
//   * No typo tolerance ("disalow"), no hex-case normalisation of %xx escapes, and
//     the length used for precedence is the rule exactly as written.
//   * /robots.txt itself, HTTP status handling, the 500 KiB limit and caching are
//     out of scope: this answers "may this agent fetch this URL under this file".

const UA_TOKEN = /^[A-Za-z_-]+/;

/** Lower-cased user-agent name with "non-matching text" removed; '*' for the global group. */
export function normalizeAgent(value) {
  const v = String(value).trim();
  if (v === '*' || /^\*\s/.test(v)) return '*';
  const m = UA_TOKEN.exec(v);
  return m ? m[0].toLowerCase() : '';
}

/** Percent-encode raw non-ASCII characters; leave everything else exactly as written. */
function encodeNonAscii(s) {
  return s.replace(/[^\x00-\x7F]+/g, (run) =>
    Array.from(new TextEncoder().encode(run), (b) => '%' + b.toString(16).toUpperCase().padStart(2, '0')).join('')
  );
}

/**
 * Parse robots.txt text.
 * @returns {{groups: Array<{agents: string[], rules: Array<{type: 'allow'|'disallow', path: string, line: number}>}>,
 *            sitemaps: string[],
 *            ignored: Array<{line: number, text: string, reason: string}>}}
 */
export function parseRobots(text) {
  const src = String(text).replace(/^﻿/, '');
  const groups = [];
  const sitemaps = [];
  const ignored = [];
  let current = null; // group being built
  let sawRule = false; // has the current group received a rule line yet?

  src.split(/\r\n|\r|\n/).forEach((raw, i) => {
    const line = i + 1;
    const hash = raw.indexOf('#');
    const body = (hash === -1 ? raw : raw.slice(0, hash)).trim();
    if (!body) return;
    const colon = body.indexOf(':');
    if (colon === -1) {
      ignored.push({ line, text: body, reason: 'not a <field>:<value> line' });
      return;
    }
    const field = body.slice(0, colon).trim().toLowerCase();
    const value = body.slice(colon + 1).trim();

    if (field === 'user-agent') {
      if (!current || sawRule) {
        current = { agents: [], rules: [] };
        groups.push(current);
        sawRule = false;
      }
      current.agents.push(normalizeAgent(value));
    } else if (field === 'allow' || field === 'disallow') {
      if (!current) {
        ignored.push({ line, text: body, reason: 'rule outside any user-agent group' });
        return;
      }
      sawRule = true;
      if (!value) {
        ignored.push({ line, text: body, reason: 'rule without a path' });
        return;
      }
      current.rules.push({ type: field, path: encodeNonAscii(value), line });
    } else if (field === 'sitemap') {
      sitemaps.push(value);
    } else {
      ignored.push({ line, text: body, reason: `unsupported field "${field}"` });
    }
  });

  return { groups, sitemaps, ignored };
}

/**
 * The single set of rules that applies to a crawler.
 * @param {ReturnType<typeof parseRobots>} parsed
 * @param {string|string[]} userAgent product token, or tokens most specific first
 * @returns {{agent: string|null, rules: Array<{type: string, path: string, line: number}>}}
 *          agent is the matched name, '*' for the global group, null when no group applies.
 */
export function selectRules(parsed, userAgent) {
  const tokens = (Array.isArray(userAgent) ? userAgent : [userAgent])
    .map(normalizeAgent)
    .filter((t) => t && t !== '*');
  for (const token of [...tokens, '*']) {
    const matching = parsed.groups.filter((g) => g.agents.includes(token));
    if (matching.length) {
      return { agent: token, rules: matching.flatMap((g) => g.rules) };
    }
  }
  return { agent: null, rules: [] };
}

/** Does a rule path match a URL path (path + query)? */
export function pathMatches(rulePath, urlPath) {
  let pattern = rulePath;
  const anchored = pattern.endsWith('$');
  if (anchored) pattern = pattern.slice(0, -1);
  const parts = pattern.split('*');

  // The first part must sit at the very start of the URL path.
  if (!urlPath.startsWith(parts[0])) return false;
  let pos = parts[0].length;
  if (parts.length === 1) return anchored ? pos === urlPath.length : true;

  // Middle parts: leftmost match after the previous one.
  for (let i = 1; i < parts.length - 1; i++) {
    const at = urlPath.indexOf(parts[i], pos);
    if (at === -1) return false;
    pos = at + parts[i].length;
  }
  const last = parts[parts.length - 1];
  if (anchored) {
    // The last part must end exactly at the end of the URL, after everything matched so far.
    return urlPath.length - last.length >= pos && urlPath.endsWith(last);
  }
  return urlPath.indexOf(last, pos) !== -1;
}

/** Path + query of a URL or path, with raw non-ASCII percent-encoded. The fragment is dropped. */
export function toUrlPath(urlOrPath) {
  let s = String(urlOrPath);
  const scheme = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/?#]*/.exec(s);
  if (scheme) s = s.slice(scheme[0].length);
  const frag = s.indexOf('#');
  if (frag !== -1) s = s.slice(0, frag);
  if (!s.startsWith('/')) s = '/' + s;
  return encodeNonAscii(s);
}

/**
 * Decide one URL for one crawler and say why.
 * @returns {{allowed: boolean, agent: string|null, rule: null|{type: string, path: string, line: number}}}
 *          rule is the winning rule, or null when nothing matched (allowed by default).
 */
export function explain(robots, userAgent, urlOrPath) {
  const parsed = typeof robots === 'string' ? parseRobots(robots) : robots;
  const { agent, rules } = selectRules(parsed, userAgent);
  const path = toUrlPath(urlOrPath);
  let best = null;
  for (const rule of rules) {
    if (!pathMatches(rule.path, path)) continue;
    if (
      !best ||
      rule.path.length > best.path.length ||
      (rule.path.length === best.path.length && rule.type === 'allow' && best.type === 'disallow')
    ) {
      best = rule;
    }
  }
  return { allowed: !best || best.type === 'allow', agent, rule: best };
}

/** May this crawler fetch this URL under this robots.txt? */
export function isAllowed(robots, userAgent, urlOrPath) {
  return explain(robots, userAgent, urlOrPath).allowed;
}

// Command line: node robots-match.mjs <robots.txt file> <user-agent> <url-or-path>...
if (import.meta.url === `file://${process.argv[1]}`) {
  const [file, agent, ...urls] = process.argv.slice(2);
  if (!file || !agent || !urls.length) {
    console.error('usage: node robots-match.mjs <robots.txt file> <user-agent> <url-or-path>...');
    process.exit(2);
  }
  const { readFileSync } = await import('node:fs');
  const parsed = parseRobots(readFileSync(file, 'utf8'));
  for (const u of urls) {
    const r = explain(parsed, agent, u);
    const why = r.rule ? `${r.rule.type}: ${r.rule.path} (line ${r.rule.line})` : 'no rule matches';
    console.log(`${r.allowed ? 'ALLOW   ' : 'DISALLOW'} ${u}  [group ${r.agent ?? 'none'}; ${why}]`);
  }
}
