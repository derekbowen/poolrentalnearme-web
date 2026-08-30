#!/usr/bin/env python3
"""Reversibly block bookable availability on a Sharetribe listing.

Written after an incident: a listing was rebuilt and given a DEFAULT
availability plan (7 days, 10:00-22:00) that its host had never set, making it
bookable at hours she never agreed to. The remedy is to lay `seats: 0`
availability exceptions over every otherwise-open interval, WITHOUT touching the
host's own records or inventing an availability plan.

Two defects in the first, ad-hoc version of this are fixed here:

1. FAIL CLOSED. That version called availability_exceptions/query with a window
   longer than the API's 366-day limit, DISCARDED the error, and concluded the
   listing had zero existing exceptions. It then tried to blanket the whole year,
   overlapped the host's real blocks, and left the nearest month unblocked -
   the most bookable window of all. Every API call here raises; nothing is ever
   inferred from an empty result that might be an error in disguise.

2. IDEMPOTENT. Re-running must never create a duplicate exception. The plan is
   computed as the COMPLEMENT of what already exists, so an already-covered
   listing yields an empty plan and the script exits without writing.

Default mode is --dry-run. --apply writes. --verify only reports coverage.
"""
import argparse
import datetime
import json
import sys
import urllib.error
import urllib.request

API = "https://flex-integ-api.sharetribe.com/v1/integration_api/"

# The API rejects any exception window whose end is more than 366 days out, and
# rejects overlong single exceptions; 28 days is comfortably inside both.
MAX_HORIZON_DAYS = 360
CHUNK_DAYS = 28
QUERY_WINDOW_DAYS = 180


class ApiError(RuntimeError):
    """Any non-success from the API. Raised, never swallowed."""


def zulu(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def parse_iso(s):
    return datetime.datetime.fromisoformat(s.replace("Z", "+00:00"))


def _call(token, path, body=None):
    data = None if body is None else json.dumps(body).encode()
    headers = {"Authorization": "Bearer " + token}
    if body is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(API + path, data=data, headers=headers)
    try:
        return json.load(urllib.request.urlopen(req, timeout=120))
    except urllib.error.HTTPError as e:
        raise ApiError("%s -> HTTP %d %s" % (path, e.code, e.read().decode()[:300]))
    except Exception as e:  # network, timeout, malformed JSON
        raise ApiError("%s -> %s" % (path, e))


def fetch_exceptions(token, listing_id, start, end):
    """All exceptions in [start, end), paged inside the API's window limit.

    Raises ApiError on any failure. An empty list therefore means 'none exist',
    never 'the query failed'.
    """
    out = {}
    w = start
    while w < end:
        w2 = min(w + datetime.timedelta(days=QUERY_WINDOW_DAYS), end)
        res = _call(
            token,
            "availability_exceptions/query?listingId=%s&start=%s&end=%s"
            % (listing_id, zulu(w), zulu(w2)),
        )
        for r in res.get("data") or []:
            rid = r["id"] if isinstance(r["id"], str) else r["id"]["uuid"]
            a = r["attributes"]
            out[rid] = (parse_iso(a["start"]), parse_iso(a["end"]), a.get("seats"))
        w = w2
    return [(s, e, seats, i) for i, (s, e, seats) in out.items()]


def merge_intervals(intervals):
    """Union of [start, end) pairs, sorted and coalesced."""
    ordered = sorted(intervals)
    merged = []
    for s, e in ordered:
        if merged and s <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], e))
        else:
            merged.append((s, e))
    return merged


def compute_gaps(covered, start, end):
    """Intervals within [start, end) not already covered."""
    gaps = []
    cur = start
    for s, e in merge_intervals(covered):
        if e <= cur:
            continue
        if s >= end:
            break
        if s > cur:
            gaps.append((cur, min(s, end)))
        cur = max(cur, e)
        if cur >= end:
            break
    if cur < end:
        gaps.append((cur, end))
    return [(a, b) for a, b in gaps if b > a]


def chunk(intervals, days=CHUNK_DAYS):
    """Split intervals so no single exception exceeds `days`."""
    out = []
    for a, b in intervals:
        cur = a
        while cur < b:
            nxt = min(cur + datetime.timedelta(days=days), b)
            out.append((cur, nxt))
            cur = nxt
    return out


def plan_blocks(existing, start, end):
    """The exceptions that still need creating. Empty when already covered.

    This is what makes reruns idempotent: the plan is always the complement of
    what exists right now, so a second run has nothing left to do.
    """
    covered = [(s, e) for s, e, _seats, _i in existing]
    return chunk(compute_gaps(covered, start, end))


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--listing-id", required=True)
    p.add_argument("--token", required=True)
    p.add_argument("--days", type=int, default=MAX_HORIZON_DAYS)
    p.add_argument("--manifest", default=None, help="where to record created ids")
    mode = p.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true", help="actually create exceptions")
    mode.add_argument("--verify", action="store_true", help="report coverage only")
    args = p.parse_args(argv)

    if args.days > MAX_HORIZON_DAYS:
        print("refusing: --days above the API's 366-day horizon", file=sys.stderr)
        return 2

    now = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0)
    end = now + datetime.timedelta(days=args.days)

    try:
        existing = fetch_exceptions(args.token, args.listing_id,
                                    now - datetime.timedelta(days=2), end)
    except ApiError as e:
        # Fail closed: never proceed as if the listing had no exceptions.
        print("ABORT: could not read existing exceptions: %s" % e, file=sys.stderr)
        return 1

    open_seats = [x for x in existing if x[2] not in (0, None)]
    todo = plan_blocks(existing, now, end)

    print("existing exceptions: %d (with seats>0: %d)" % (len(existing), len(open_seats)))
    print("uncovered intervals needing a block: %d" % len(todo))

    if args.verify:
        print("VERIFY: %s" % ("FULLY COVERED" if not todo else "GAPS PRESENT"))
        for a, b in todo:
            print("   gap %s -> %s" % (zulu(a), zulu(b)))
        return 0 if not todo else 3

    if not todo:
        print("nothing to do - already fully covered (idempotent no-op)")
        return 0

    if not args.apply:
        for a, b in todo:
            print("   would block %s -> %s" % (zulu(a), zulu(b)))
        print("dry run - pass --apply to write")
        return 0

    created = []
    try:
        for a, b in todo:
            res = _call(args.token, "availability_exceptions/create",
                        {"listingId": args.listing_id, "start": zulu(a),
                         "end": zulu(b), "seats": 0})
            rid = res["data"]["id"]
            created.append({"id": rid["uuid"] if isinstance(rid, dict) else rid,
                            "start": zulu(a), "end": zulu(b)})
    except ApiError as e:
        print("ABORT mid-apply after %d creates: %s" % (len(created), e), file=sys.stderr)
        if args.manifest and created:
            _write_manifest(args.manifest, args.listing_id, created)
        return 1

    if args.manifest:
        _write_manifest(args.manifest, args.listing_id, created)
    print("created %d exceptions" % len(created))
    return 0


def _write_manifest(path, listing_id, created):
    import os
    payload = {"listingId": listing_id, "createdExceptionIds": created}
    with open(path, "w") as f:
        json.dump(payload, f, indent=1)
    os.chmod(path, 0o600)  # ids only, but keep it owner-readable regardless
    print("manifest -> %s (%d ids, mode 600)" % (path, len(created)))


if __name__ == "__main__":
    sys.exit(main())
