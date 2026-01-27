#!/usr/bin/env python3
"""
Clipboard Manager Tool
Based on: https://github.com/asweigart/pyperclip

Usage:
    python clipboard_manager.py copy "Hello World"
    python clipboard_manager.py paste
"""

import argparse
import sys
from pathlib import Path

def get_clipboard():
    """Get clipboard content."""
    try:
        import pyperclip
        return pyperclip.paste()
    except ImportError:
        # Fallback for Windows
        try:
            import subprocess
            result = subprocess.run(['powershell', '-command', 'Get-Clipboard'],
                                  capture_output=True, text=True)
            return result.stdout.strip()
        except:
            return None

def set_clipboard(text):
    """Set clipboard content."""
    try:
        import pyperclip
        pyperclip.copy(text)
        return True
    except ImportError:
        # Fallback for Windows
        try:
            import subprocess
            subprocess.run(['powershell', '-command', f'Set-Clipboard -Value "{text}"'],
                         check=True)
            return True
        except:
            return False

def main():
    parser = argparse.ArgumentParser(description="Clipboard operations")
    subparsers = parser.add_subparsers(dest='command', required=True)
    
    # Copy
    p_copy = subparsers.add_parser('copy', help='Copy to clipboard')
    p_copy.add_argument('text', nargs='?', help='Text to copy')
    p_copy.add_argument('--file', '-f', help='File to copy')
    
    # Paste
    p_paste = subparsers.add_parser('paste', help='Paste from clipboard')
    p_paste.add_argument('--output', '-o', help='Output file')
    
    args = parser.parse_args()
    
    if args.command == 'copy':
        if args.file:
            with open(args.file, 'r', encoding='utf-8') as f:
                text = f.read()
        elif args.text:
            text = args.text
        else:
            text = sys.stdin.read()
        
        if set_clipboard(text):
            print(f"✓ Copied {len(text)} characters to clipboard")
        else:
            print("Error: Failed to copy to clipboard", file=sys.stderr)
            sys.exit(1)
    
    elif args.command == 'paste':
        content = get_clipboard()
        if content is None:
            print("Error: Failed to read clipboard", file=sys.stderr)
            sys.exit(1)
        
        if args.output:
            with open(args.output, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"✓ Pasted to {args.output}")
        else:
            print(content)

if __name__ == "__main__":
    main()
