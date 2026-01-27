#!/usr/bin/env python3
"""
Environment Manager Tool
Based on: https://github.com/theskumar/python-dotenv

Usage:
    python env_manager.py list
    python env_manager.py get DATABASE_URL
    python env_manager.py set API_KEY "value" --file .env
"""

import argparse
import os
import re
import sys
from pathlib import Path

def parse_env_file(filepath):
    """Parse .env file and return dict."""
    env = {}
    if not Path(filepath).exists():
        return env
    
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            if '=' in line:
                key, value = line.split('=', 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                env[key] = value
    return env

def write_env_file(filepath, env):
    """Write dict to .env file."""
    with open(filepath, 'w', encoding='utf-8') as f:
        for key, value in sorted(env.items()):
            if ' ' in value or '"' in value:
                f.write(f'{key}="{value}"\n')
            else:
                f.write(f'{key}={value}\n')

def main():
    parser = argparse.ArgumentParser(description="Manage environment variables")
    subparsers = parser.add_subparsers(dest='command', required=True)
    
    # List
    p_list = subparsers.add_parser('list', help='List env vars')
    p_list.add_argument('--file', '-f', default='.env', help='.env file')
    p_list.add_argument('--system', '-s', action='store_true', help='Include system')
    
    # Get
    p_get = subparsers.add_parser('get', help='Get env var')
    p_get.add_argument('key', help='Variable name')
    p_get.add_argument('--file', '-f', default='.env')
    
    # Set
    p_set = subparsers.add_parser('set', help='Set env var')
    p_set.add_argument('key', help='Variable name')
    p_set.add_argument('value', help='Variable value')
    p_set.add_argument('--file', '-f', default='.env')
    
    # Template
    p_tpl = subparsers.add_parser('template', help='Generate template')
    p_tpl.add_argument('file', help='Source .env file')
    p_tpl.add_argument('--output', '-o', default='.env.example')
    
    # Validate
    p_val = subparsers.add_parser('validate', help='Validate .env')
    p_val.add_argument('file', help='.env file')
    p_val.add_argument('--required', '-r', help='Required vars (comma-sep)')
    
    args = parser.parse_args()
    
    if args.command == 'list':
        env = parse_env_file(args.file)
        if args.system:
            env.update(os.environ)
        for key, value in sorted(env.items()):
            masked = value[:3] + '***' if len(value) > 6 else '***'
            print(f"{key}={masked}")
    
    elif args.command == 'get':
        env = parse_env_file(args.file)
        value = env.get(args.key) or os.environ.get(args.key)
        if value:
            print(value)
        else:
            print(f"Not found: {args.key}", file=sys.stderr)
            sys.exit(1)
    
    elif args.command == 'set':
        env = parse_env_file(args.file)
        env[args.key] = args.value
        write_env_file(args.file, env)
        print(f"✓ Set {args.key} in {args.file}")
    
    elif args.command == 'template':
        env = parse_env_file(args.file)
        with open(args.output, 'w') as f:
            for key in sorted(env.keys()):
                f.write(f"{key}=\n")
        print(f"✓ Template saved to {args.output}")
    
    elif args.command == 'validate':
        env = parse_env_file(args.file)
        if args.required:
            required = [k.strip() for k in args.required.split(',')]
            missing = [k for k in required if k not in env]
            if missing:
                print(f"✗ Missing: {', '.join(missing)}", file=sys.stderr)
                sys.exit(1)
        print(f"✓ Valid ({len(env)} variables)")

if __name__ == "__main__":
    main()
