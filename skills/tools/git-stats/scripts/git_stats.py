#!/usr/bin/env python3
"""
Git Stats Tool
Based on: https://github.com/gitpython-developers/GitPython

Usage:
    python git_stats.py
    python git_stats.py --contributors
"""

import argparse
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import datetime

def run_git(args, cwd='.'):
    """Run git command and return output."""
    try:
        result = subprocess.run(
            ['git'] + args,
            cwd=cwd,
            capture_output=True,
            text=True,
            check=True
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        return None

def get_commits(since=None, until=None, author=None):
    """Get commit list."""
    args = ['log', '--pretty=format:%H|%an|%ae|%ad|%s', '--date=short']
    if since:
        args.append(f'--since={since}')
    if until:
        args.append(f'--until={until}')
    if author:
        args.append(f'--author={author}')
    
    output = run_git(args)
    if not output:
        return []
    
    commits = []
    for line in output.split('\n'):
        parts = line.split('|', 4)
        if len(parts) == 5:
            commits.append({
                'hash': parts[0][:8],
                'author': parts[1],
                'email': parts[2],
                'date': parts[3],
                'message': parts[4]
            })
    return commits

def get_contributors():
    """Get contributor statistics."""
    output = run_git(['shortlog', '-sne', 'HEAD'])
    if not output:
        return []
    
    contributors = []
    for line in output.split('\n'):
        parts = line.strip().split('\t', 1)
        if len(parts) == 2:
            count = int(parts[0].strip())
            name_email = parts[1]
            contributors.append({'commits': count, 'name': name_email})
    return sorted(contributors, key=lambda x: x['commits'], reverse=True)

def get_file_stats():
    """Get file change statistics."""
    output = run_git(['log', '--pretty=format:', '--name-only'])
    if not output:
        return {}
    
    files = [f for f in output.split('\n') if f.strip()]
    return Counter(files)

def main():
    parser = argparse.ArgumentParser(description="Git repository statistics")
    parser.add_argument('--contributors', '-c', action='store_true')
    parser.add_argument('--commits', action='store_true')
    parser.add_argument('--files', '-f', action='store_true')
    parser.add_argument('--since', help='Start date')
    parser.add_argument('--until', help='End date')
    parser.add_argument('--top', '-t', type=int, default=10)
    args = parser.parse_args()
    
    # Check if in git repo
    if not run_git(['rev-parse', '--git-dir']):
        print("Error: Not a git repository", file=sys.stderr)
        sys.exit(1)
    
    if args.contributors:
        contributors = get_contributors()
        print(f"Contributors ({len(contributors)}):\n")
        for c in contributors[:args.top]:
            print(f"  {c['commits']:5} {c['name']}")
    
    elif args.commits:
        commits = get_commits(args.since, args.until)
        print(f"Commits ({len(commits)}):\n")
        for c in commits[:args.top]:
            print(f"  {c['hash']} {c['date']} {c['author']}: {c['message'][:50]}")
    
    elif args.files:
        files = get_file_stats()
        print(f"Most changed files:\n")
        for f, count in files.most_common(args.top):
            print(f"  {count:5} {f}")
    
    else:
        # Overview
        commits = get_commits()
        contributors = get_contributors()
        branch = run_git(['branch', '--show-current']) or 'unknown'
        
        print(f"Repository Statistics")
        print(f"{'='*40}")
        print(f"Current branch: {branch}")
        print(f"Total commits: {len(commits)}")
        print(f"Contributors: {len(contributors)}")
        
        if commits:
            print(f"First commit: {commits[-1]['date']}")
            print(f"Last commit: {commits[0]['date']}")

if __name__ == "__main__":
    main()
