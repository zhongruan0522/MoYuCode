#!/usr/bin/env python3
"""
Code Formatter Tool
Format source code files using industry-standard formatters.
Based on: https://github.com/psf/black

Usage:
    python code_formatter.py file.py
    python code_formatter.py file.py --line-length 100
    python code_formatter.py config.json
    python code_formatter.py file.py --check

Requirements:
    pip install black
"""

import argparse
import json
import sys
from pathlib import Path


def format_python(content: str, line_length: int = 88) -> str:
    """Format Python code using black."""
    try:
        import black
        mode = black.Mode(line_length=line_length)
        return black.format_str(content, mode=mode)
    except ImportError:
        print("Warning: black not installed, using basic formatting", file=sys.stderr)
        return content


def format_json(content: str, indent: int = 2) -> str:
    """Format JSON content."""
    data = json.loads(content)
    return json.dumps(data, indent=indent, ensure_ascii=False)


def format_file(filepath: str, line_length: int = 88, check: bool = False) -> bool:
    """Format a single file."""
    path = Path(filepath)
    
    if not path.exists():
        print(f"Error: File not found: {filepath}", file=sys.stderr)
        return False
    
    with open(path, 'r', encoding='utf-8') as f:
        original = f.read()
    
    suffix = path.suffix.lower()
    
    try:
        if suffix == '.py':
            formatted = format_python(original, line_length)
        elif suffix == '.json':
            formatted = format_json(original)
        else:
            print(f"Warning: Unsupported file type: {suffix}", file=sys.stderr)
            return True
        
        if check:
            if original != formatted:
                print(f"✗ {filepath} would be reformatted")
                return False
            else:
                print(f"✓ {filepath} is formatted")
                return True
        
        if original != formatted:
            with open(path, 'w', encoding='utf-8') as f:
                f.write(formatted)
            print(f"✓ Formatted: {filepath}")
        else:
            print(f"✓ Already formatted: {filepath}")
        
        return True
        
    except Exception as e:
        print(f"Error formatting {filepath}: {e}", file=sys.stderr)
        return False


def main():
    parser = argparse.ArgumentParser(description="Format source code files")
    parser.add_argument('files', nargs='+', help='Files to format')
    parser.add_argument('--line-length', '-l', type=int, default=88)
    parser.add_argument('--check', '-c', action='store_true', help='Check only')
    parser.add_argument('--recursive', '-r', action='store_true')
    
    args = parser.parse_args()
    
    files = []
    for f in args.files:
        path = Path(f)
        if path.is_dir() and args.recursive:
            files.extend(path.rglob('*.py'))
            files.extend(path.rglob('*.json'))
        else:
            files.append(path)
    
    success = all(format_file(str(f), args.line_length, args.check) for f in files)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
