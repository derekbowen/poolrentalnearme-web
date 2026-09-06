#!/usr/bin/env python3
"""WEST runner (marketplace box). Vendored copy — see ops/runners/_runner_common.py. Usage: python3 ssm_runx.py <script.py>"""
import sys, os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _runner_common import run

run("i-0a711c88043788b2b", "us-west-1", sys.argv[1])
