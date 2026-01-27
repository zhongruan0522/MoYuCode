#!/usr/bin/env python3
"""
Barcode Generator Tool
Based on: https://github.com/WhyNotHugo/python-barcode

Usage:
    python barcode_generator.py "ABC123" --format code128
    python barcode_generator.py "5901234123457" --format ean13
"""

import argparse
import sys
from pathlib import Path

FORMATS = ['code128', 'code39', 'ean13', 'ean8', 'upca', 'isbn13', 'isbn10', 'issn', 'pzn']

def generate_barcode(data, format='code128', output=None, show_text=True):
    """Generate barcode image."""
    try:
        import barcode
        from barcode.writer import ImageWriter
    except ImportError:
        print("Error: python-barcode required. Install: pip install python-barcode[images]", file=sys.stderr)
        sys.exit(1)
    
    try:
        barcode_class = barcode.get_barcode_class(format)
    except barcode.errors.BarcodeNotFoundError:
        print(f"Error: Unknown format: {format}", file=sys.stderr)
        print(f"Available: {', '.join(FORMATS)}")
        sys.exit(1)
    
    options = {'write_text': show_text}
    
    if output:
        output_path = Path(output).with_suffix('')
        bc = barcode_class(data, writer=ImageWriter())
        filename = bc.save(str(output_path), options=options)
        print(f"✓ Barcode saved: {filename}")
        return filename
    else:
        bc = barcode_class(data)
        print(f"Barcode ({format}): {data}")
        print(f"Encoded: {bc.get_fullcode()}")
        return None

def main():
    parser = argparse.ArgumentParser(description="Generate barcodes")
    parser.add_argument('data', help='Data to encode')
    parser.add_argument('--format', '-f', default='code128', choices=FORMATS)
    parser.add_argument('--output', '-o', help='Output file')
    parser.add_argument('--no-text', action='store_true', help='Hide text')
    parser.add_argument('--list', '-l', action='store_true', help='List formats')
    args = parser.parse_args()
    
    if args.list:
        print("Available formats:")
        for fmt in FORMATS:
            print(f"  {fmt}")
        return
    
    generate_barcode(args.data, args.format, args.output, not args.no_text)

if __name__ == "__main__":
    main()
