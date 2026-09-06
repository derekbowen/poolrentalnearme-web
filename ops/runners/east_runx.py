#!/usr/bin/env python3
"""EAST runner (fresh-web marketing box). Vendored copy — see ops/runners/_runner_common.py. Usage: python3 east_runx.py <script.py>"""
import sys, os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _runner_common import run

run("i-060692efd53e6e853", "us-east-1", sys.argv[1])
