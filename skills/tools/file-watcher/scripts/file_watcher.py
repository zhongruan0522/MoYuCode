#!/usr/bin/env python3
"""
File Watcher Tool
Based on: https://github.com/gorakhargosh/watchdog

Usage:
    python file_watcher.py ./src/
    python file_watcher.py ./src/ --pattern "*.py"
"""

import argparse
import fnmatch
import os
import subprocess
import sys
import time
from pathlib import Path

def get_file_info(path):
    """Get file modification time and size."""
    try:
        stat = os.stat(path)
        return (stat.st_mtime, stat.st_size)
    except:
        return None

def watch_directory(path, pattern=None, exec_cmd=None, interval=1):
    """Watch directory for changes."""
    path = Path(path)
    file_states = {}
    
    def scan_files():
        files = {}
        if path.is_file():
            files[str(path)] = get_file_info(path)
        else:
            for root, dirs, filenames in os.walk(path):
                for filename in filenames:
                    if pattern and not fnmatch.fnmatch(filename, pattern):
                        continue
                    filepath = os.path.join(root, filename)
                    files[filepath] = get_file_info(filepath)
        return files
    
    print(f"Watching: {path}")
    if pattern:
        print(f"Pattern: {pattern}")
    print("Press Ctrl+C to stop\n")
    
    file_states = scan_files()
    
    try:
        while True:
            time.sleep(interval)
            current = scan_files()
            
            # Check for changes
            for filepath, info in current.items():
                if filepath not in file_states:
                    print(f"[CREATED] {filepath}")
                    if exec_cmd:
                        subprocess.run(exec_cmd, shell=True)
                elif file_states[filepath] != info:
                    print(f"[MODIFIED] {filepath}")
                    if exec_cmd:
                        subprocess.run(exec_cmd, shell=True)
            
            for filepath in file_states:
                if filepath not in current:
                    print(f"[DELETED] {filepath}")
            
            file_states = current
            
    except KeyboardInterrupt:
        print("\n✓ Stopped watching")

def main():
    parser = argparse.ArgumentParser(description="Watch files for changes")
    parser.add_argument('path', help='Path to watch')
    parser.add_argument('--pattern', '-p', help='File pattern (e.g., *.py)')
    parser.add_argument('--exec', '-e', dest='exec_cmd', help='Command to run')
    parser.add_argument('--interval', '-i', type=float, default=1, help='Check interval')
    args = parser.parse_args()
    
    watch_directory(args.path, args.pattern, args.exec_cmd, args.interval)

if __name__ == "__main__":
    main()
