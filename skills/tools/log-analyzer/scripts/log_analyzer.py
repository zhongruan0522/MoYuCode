#!/usr/bin/env python3
"""
Log Analyzer Tool - Parse and analyze log files.
Based on: https://github.com/logpai/logparser

Usage:
    python log_analyzer.py app.log
    python log_analyzer.py app.log --level ERROR
    python log_analyzer.py app.log --grep "connection"
"""

import argparse
import re
import sys
from collections import Counter
from pathlib import Path

LOG_LEVELS = ['DEBUG', 'INFO', 'WARN', 'WARNING', 'ERROR', 'FATAL', 'CRITICAL']

def parse_log_line(line):
    """Parse a log line and extract components."""
    # Pattern: timestamp [LEVEL] message
    pattern = r'^(\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}:\d{2}[.,]?\d*)\s*\[?(\w+)\]?\s*(.*)$'
    match = re.match(pattern, line)
    if match:
        return {'timestamp': match.group(1), 'level': match.group(2).upper(), 'message': match.group(3)}
    # Simple pattern: [LEVEL] message
    pattern2 = r'^\[?(\w+)\]?\s*[:-]?\s*(.*)$'
    match2 = re.match(pattern2, line)
    if match2 and match2.group(1).upper() in LOG_LEVELS:
        return {'timestamp': '', 'level': match2.group(1).upper(), 'message': match2.group(2)}
    return {'timestamp': '', 'level': 'INFO', 'message': line}

def analyze_logs(filepath, level=None, grep=None, stats=False, tail=None):
    """Analyze log file."""
    path = Path(filepath)
    if not path.exists():
        print(f"Error: File not found: {filepath}", file=sys.stderr)
        sys.exit(1)
    
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        lines = f.readlines()
    
    if tail:
        lines = lines[-tail:]
    
    entries = [parse_log_line(line.strip()) for line in lines if line.strip()]
    
    # Filter by level
    if level:
        level_upper = level.upper()
        entries = [e for e in entries if e['level'] == level_upper]
    
    # Filter by grep pattern
    if grep:
        entries = [e for e in entries if grep.lower() in e['message'].lower()]
    
    if stats:
        level_counts = Counter(e['level'] for e in entries)
        print(f"Total entries: {len(entries)}")
        print("\nBy level:")
        for lvl in LOG_LEVELS:
            if lvl in level_counts:
                print(f"  {lvl}: {level_counts[lvl]}")
        return
    
    for entry in entries:
        lvl = entry['level']
        color = '\033[91m' if lvl in ['ERROR', 'FATAL', 'CRITICAL'] else ''
        reset = '\033[0m' if color else ''
        ts = f"[{entry['timestamp']}] " if entry['timestamp'] else ''
        print(f"{color}{ts}[{lvl}] {entry['message']}{reset}")

def main():
    parser = argparse.ArgumentParser(description="Analyze log files")
    parser.add_argument('file', help='Log file to analyze')
    parser.add_argument('--level', '-l', help='Filter by log level')
    parser.add_argument('--grep', '-g', help='Search pattern')
    parser.add_argument('--stats', '-s', action='store_true', help='Show statistics')
    parser.add_argument('--tail', '-t', type=int, help='Show last N lines')
    args = parser.parse_args()
    analyze_logs(args.file, args.level, args.grep, args.stats, args.tail)

if __name__ == "__main__":
    main()
