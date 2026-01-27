#!/usr/bin/env python3
"""
URL Shortener Tool
Based on: https://github.com/ellisonleao/pyshorteners

Usage:
    python url_shortener.py "https://example.com/long/path"
"""

import argparse
import hashlib
import sys
import urllib.request
import urllib.parse

def shorten_tinyurl(url):
    """Shorten URL using TinyURL."""
    api_url = f"http://tinyurl.com/api-create.php?url={urllib.parse.quote(url)}"
    try:
        with urllib.request.urlopen(api_url, timeout=10) as response:
            return response.read().decode('utf-8')
    except Exception as e:
        return None

def shorten_isgd(url):
    """Shorten URL using is.gd."""
    api_url = f"https://is.gd/create.php?format=simple&url={urllib.parse.quote(url)}"
    try:
        with urllib.request.urlopen(api_url, timeout=10) as response:
            return response.read().decode('utf-8')
    except Exception as e:
        return None

def generate_local_short(url):
    """Generate a local short hash."""
    hash_obj = hashlib.md5(url.encode())
    return f"local:{hash_obj.hexdigest()[:8]}"

SERVICES = {
    'tinyurl': shorten_tinyurl,
    'isgd': shorten_isgd,
    'local': generate_local_short
}

def main():
    parser = argparse.ArgumentParser(description="Shorten URLs")
    parser.add_argument('url', help='URL to shorten')
    parser.add_argument('--service', '-s', default='tinyurl', 
                       choices=list(SERVICES.keys()))
    parser.add_argument('--qr', action='store_true', help='Generate QR code')
    parser.add_argument('--output', '-o', help='QR code output file')
    args = parser.parse_args()
    
    # Validate URL
    if not args.url.startswith(('http://', 'https://')):
        args.url = 'https://' + args.url
    
    # Shorten
    shortener = SERVICES.get(args.service)
    short_url = shortener(args.url)
    
    if not short_url:
        print(f"Error: Failed to shorten URL", file=sys.stderr)
        sys.exit(1)
    
    print(f"Original: {args.url}")
    print(f"Shortened: {short_url}")
    
    if args.qr:
        try:
            import qrcode
            qr = qrcode.make(short_url)
            output = args.output or 'qr_code.png'
            qr.save(output)
            print(f"QR Code: {output}")
        except ImportError:
            print("Note: Install qrcode for QR generation: pip install qrcode")

if __name__ == "__main__":
    main()
