#!/usr/bin/env python3
"""Tests for availability_block.py — the two defects that caused the incident.

Run: python3 scripts/availability_block_test.py
"""
import datetime
import io
import sys
import unittest
from contextlib import redirect_stderr, redirect_stdout
from unittest import mock

sys.path.insert(0, __file__.rsplit("/", 1)[0])
import availability_block as ab  # noqa: E402

UTC = datetime.timezone.utc
T0 = datetime.datetime(2026, 8, 30, 9, 0, 0, tzinfo=UTC)
D = datetime.timedelta


class TestGapMath(unittest.TestCase):
    def test_no_existing_cover_means_whole_window(self):
        gaps = ab.compute_gaps([], T0, T0 + D(days=10))
        self.assertEqual(gaps, [(T0, T0 + D(days=10))])

    def test_gaps_around_existing_blocks(self):
        existing = [(T0 + D(days=2), T0 + D(days=3)), (T0 + D(days=5), T0 + D(days=6))]
        self.assertEqual(
            ab.compute_gaps(existing, T0, T0 + D(days=8)),
            [(T0, T0 + D(days=2)), (T0 + D(days=3), T0 + D(days=5)),
             (T0 + D(days=6), T0 + D(days=8))])

    def test_fully_covered_yields_no_gaps(self):
        self.assertEqual(ab.compute_gaps([(T0, T0 + D(days=10))], T0, T0 + D(days=10)), [])

    def test_overlapping_existing_blocks_are_merged(self):
        existing = [(T0, T0 + D(days=4)), (T0 + D(days=2), T0 + D(days=6))]
        self.assertEqual(ab.compute_gaps(existing, T0, T0 + D(days=6)), [])

    def test_chunking_respects_the_limit(self):
        chunks = ab.chunk([(T0, T0 + D(days=100))], days=28)
        self.assertEqual(len(chunks), 4)
        for a, b in chunks:
            self.assertLessEqual((b - a).days, 28)
        self.assertEqual(chunks[0][0], T0)          # contiguous, no holes
        self.assertEqual(chunks[-1][1], T0 + D(days=100))
        for i in range(1, len(chunks)):
            self.assertEqual(chunks[i][0], chunks[i - 1][1])

    def test_utc_instants_span_dst_without_a_hole(self):
        # America/Detroit leaves DST on 2026-11-01. Exceptions are absolute UTC
        # instants, so a contiguous chain must stay contiguous across it.
        start = datetime.datetime(2026, 10, 25, 0, 0, tzinfo=UTC)
        chunks = ab.chunk([(start, start + D(days=20))], days=7)
        for i in range(1, len(chunks)):
            self.assertEqual(chunks[i][0], chunks[i - 1][1])


class TestIdempotency(unittest.TestCase):
    def test_second_run_plans_nothing(self):
        window_end = T0 + D(days=60)
        first = ab.plan_blocks([], T0, window_end)
        self.assertTrue(first)
        # simulate those having been created, then re-plan
        now_existing = [(a, b, 0, "id-%d" % i) for i, (a, b) in enumerate(first)]
        second = ab.plan_blocks(now_existing, T0, window_end)
        self.assertEqual(second, [], "re-running must not plan duplicate exceptions")

    def test_host_blocks_are_never_duplicated(self):
        hosts = [(T0 + D(days=1), T0 + D(days=2), 0, "host-1")]
        plan = ab.plan_blocks(hosts, T0, T0 + D(days=3))
        for a, b in plan:
            self.assertFalse(a < T0 + D(days=2) and b > T0 + D(days=1),
                             "plan must not overlap the host's own block")


class TestFailClosed(unittest.TestCase):
    def test_query_error_raises_not_returns_empty(self):
        with mock.patch.object(ab, "_call", side_effect=ab.ApiError("HTTP 400 window too long")):
            with self.assertRaises(ab.ApiError):
                ab.fetch_exceptions("tok", "lid", T0, T0 + D(days=10))

    def test_main_exits_nonzero_when_the_query_fails(self):
        # the original defect: error swallowed, empty result assumed, whole
        # window blanket-blocked, host's blocks overlapped, month left open
        with mock.patch.object(ab, "fetch_exceptions", side_effect=ab.ApiError("boom")):
            buf, err = io.StringIO(), io.StringIO()
            with redirect_stdout(buf), redirect_stderr(err):
                rc = ab.main(["--listing-id", "L", "--token", "T", "--apply"])
            self.assertEqual(rc, 1)
            self.assertIn("ABORT", err.getvalue())

    def test_failed_query_creates_nothing(self):
        created = []
        with mock.patch.object(ab, "fetch_exceptions", side_effect=ab.ApiError("boom")), \
             mock.patch.object(ab, "_call", side_effect=lambda *a, **k: created.append(a)):
            with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
                ab.main(["--listing-id", "L", "--token", "T", "--apply"])
        self.assertEqual(created, [], "nothing may be written after a failed read")

    def test_horizon_above_the_api_limit_is_refused(self):
        with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            self.assertEqual(
                ab.main(["--listing-id", "L", "--token", "T", "--days", "400"]), 2)


class TestModes(unittest.TestCase):
    def test_default_is_dry_run_and_writes_nothing(self):
        created = []
        with mock.patch.object(ab, "fetch_exceptions", return_value=[]), \
             mock.patch.object(ab, "_call", side_effect=lambda *a, **k: created.append(a)):
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = ab.main(["--listing-id", "L", "--token", "T"])
        self.assertEqual(rc, 0)
        self.assertEqual(created, [])
        self.assertIn("dry run", buf.getvalue())

    def test_verify_reports_gaps_with_nonzero_exit(self):
        with mock.patch.object(ab, "fetch_exceptions", return_value=[]):
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = ab.main(["--listing-id", "L", "--token", "T", "--verify"])
        self.assertEqual(rc, 3)
        self.assertIn("GAPS PRESENT", buf.getvalue())

    def test_verify_passes_when_fully_covered(self):
        now = datetime.datetime.now(datetime.timezone.utc)
        covering = [(now - D(days=1), now + D(days=400), 0, "x")]
        with mock.patch.object(ab, "fetch_exceptions", return_value=covering):
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = ab.main(["--listing-id", "L", "--token", "T", "--verify"])
        self.assertEqual(rc, 0)
        self.assertIn("FULLY COVERED", buf.getvalue())


if __name__ == "__main__":
    unittest.main(verbosity=2)
