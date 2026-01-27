#!/usr/bin/env python3
"""
File Hasher Tool
Calculate file hashes for integrity verification.
Based on Python's hashlib: https://github.com/python/cpython

Usage:
    python file_hasher.py file.zip
    python file_hasher.py file.zip --all
    python file_hasher.py file.zip --verify abc123...
    python file_hasher.py --find-duplicates ./folder/
"""

import argparse
import hashlib
import os
import sys
from collections import defaultdict
from pathlib import Path


ALGORITHMS = ['md5', 'sha1', 'sha256', 'sha512']
CHUNK_SIZE = 8192


def calculate_hash(filepath: str, algorithm: str = 'sha256') -> str:
    """Calculate hash of a file."""
    hasher = hashlib.new(algorithm)
    
    with open(filepath, 'rb') as f:
        while chunk := f.read(CHUNK_SIZE):
            hasher.update(chunk)
    
    return hasher.hexdigest()


def calculate_all_hashes(filepath: str) -> dict:
    """Calculate all supported hashes for a file."""
    results = {}
    
    # Read file once and update all hashers
    hashers = {alg: hashlib.new(alg) for alg in ALGORITHMS}
    
    with open(filepath, 'rb') as f:
        while chunk := f.read(CHUNK_SIZE):
            for hasher in hashers.values():
                hasher.update(chunk)
    
    for alg, hasher in hashers.items():
        results[alg] = hasher.hexdigest()
    
    return results


def find_duplicates(directory: str, algorithm: str = 'sha256') -> dict:
    """Find duplicate files in directory by hash."""
    hash_to_files = defaultdict(list)
    
    path = Path(directory)
    files = list(path.rglob('*'))
    files = [f for f in files if f.is_file()]
    
    print(f"Scanning {len(files)} files...")
    
    for filepath in files:
        try:
            file_hash = calculate_hash(str(filepath), algorithm)
            hash_to_files[file_hash].append(str(filepath))
        except (PermissionError, OSError) as e:
            print(f"Warning: Cannot read {filepath}: {e}", file=sys.stderr)
    
    # Filter to only duplicates
    duplicates = {h: files for h, files in hash_to_files.items() if len(files) > 1}
    return duplicates


def format_size(size: int) -> str:
    """Format file size in human readable format."""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size < 1024:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} TB"


def main():
    parser = argparse.ArgumentParser(
        description="Calculate file hashes",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s file.zip
  %(prog)s file.zip --algorithm md5
  %(prog)s file.zip --all
  %(prog)s file.zip --verify abc123def456...
  %(prog)s --find-duplicates ./downloads/
        """
    )
    
    parser.add_argument('files', nargs='*', help='Files to hash')
    parser.add_argument('--algorithm', '-a', default='sha256',
                       choices=ALGORITHMS, help='Hash algorithm')
    parser.add_argument('--all', action='store_true', help='Calculate all hash types')
    parser.add_argument('--verify', '-v', help='Verify against expected hash')
    parser.add_argument('--find-duplicates', '-d', metavar='DIR',
                       help='Find duplicate files in directory')
    parser.add_argument('--output', '-o', help='Output file for results')
    
    args = parser.parse_args()
    
    results = []
    
    # Find duplicates mode
    if args.find_duplicates:
        duplicates = find_duplicates(args.find_duplicates, args.algorithm)
        
        if not duplicates:
            print("✓ No duplicate files found")
            return
        
        print(f"\n✗ Found {len(duplicates)} sets of duplicates:\n")
        
        for file_hash, files in duplicates.items():
            size = os.path.getsize(files[0])
            print(f"Hash: {file_hash[:16]}... ({format_size(size)})")
            for f in files:
                print(f"  - {f}")
            print()
        
        total_wasted = sum(
            os.path.getsize(files[0]) * (len(files) - 1)
            for files in duplicates.values()
        )
        print(f"Total wasted space: {format_size(total_wasted)}")
        return
    
    # Hash files mode
    if not args.files:
        parser.error("Please provide files to hash or use --find-duplicates")
    
    for filepath in args.files:
        path = Path(filepath)
        
        if not path.exists():
            print(f"Error: File not found: {filepath}", file=sys.stderr)
            continue
        
        if not path.is_file():
            print(f"Error: Not a file: {filepath}", file=sys.stderr)
            continue
        
        size = path.stat().st_size
        
        if args.all:
            hashes = calculate_all_hashes(filepath)
            print(f"\n{filepath} ({format_size(size)})")
            for alg, hash_value in hashes.items():
                print(f"  {alg.upper():8} {hash_value}")
                results.append(f"{hash_value}  {filepath}  # {alg}")
        else:
            file_hash = calculate_hash(filepath, args.algorithm)
            
            if args.verify:
                if file_hash.lower() == args.verify.lower():
                    print(f"✓ {filepath}: Hash matches")
                else:
                    print(f"✗ {filepath}: Hash mismatch!")
                    print(f"  Expected: {args.verify}")
                    print(f"  Got:      {file_hash}")
                    sys.exit(1)
            else:
                print(f"{file_hash}  {filepath}")
                results.append(f"{file_hash}  {filepath}")
    
    if args.output and results:
        with open(args.output, 'w') as f:
            f.write('\n'.join(results) + '\n')
        print(f"\n✓ Results saved to {args.output}")


if __name__ == "__main__":
    main()
