#!/usr/bin/env python3
"""
File Archiver Tool
Create and extract ZIP, TAR, and GZIP archives.

Usage:
    python file_archiver.py create --input folder/ --output archive.zip
    python file_archiver.py extract --input archive.zip --output extracted/
    python file_archiver.py list --input archive.zip

Requirements:
    pip install pyzipper  # For password-protected ZIPs
"""

import argparse
import os
import sys
import tarfile
import zipfile
from pathlib import Path

try:
    import pyzipper
    PYZIPPER_AVAILABLE = True
except ImportError:
    PYZIPPER_AVAILABLE = False


def create_archive(
    input_path: str,
    output_path: str,
    password: str = None,
    compression: str = "zip",
    level: int = 9,
) -> bool:
    """
    Create an archive from file or directory.
    
    Args:
        input_path: File or directory to archive
        output_path: Output archive path
        password: Optional password for ZIP
        compression: Archive type (zip, tar, tar.gz, tar.bz2)
        level: Compression level (1-9)
    
    Returns:
        True if successful
    """
    input_path = Path(input_path)
    output_path = Path(output_path)
    
    if not input_path.exists():
        print(f"Error: Input not found: {input_path}", file=sys.stderr)
        return False
    
    try:
        # Determine archive type from extension
        suffix = output_path.suffix.lower()
        if suffix == '.zip' or compression == 'zip':
            return _create_zip(input_path, output_path, password, level)
        elif suffix in ['.tar', '.gz', '.bz2', '.xz'] or compression.startswith('tar'):
            return _create_tar(input_path, output_path, compression)
        else:
            print(f"Error: Unsupported archive format: {suffix}", file=sys.stderr)
            return False
    
    except Exception as e:
        print(f"Error creating archive: {e}", file=sys.stderr)
        return False


def _create_zip(input_path: Path, output_path: Path, password: str = None, level: int = 9) -> bool:
    """Create ZIP archive."""
    if password:
        if not PYZIPPER_AVAILABLE:
            print("Error: pyzipper required for password protection. Install: pip install pyzipper", file=sys.stderr)
            return False
        
        with pyzipper.AESZipFile(output_path, 'w', compression=pyzipper.ZIP_DEFLATED,
                                  encryption=pyzipper.WZ_AES) as zf:
            zf.setpassword(password.encode())
            _add_to_zip(zf, input_path)
    else:
        with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED, compresslevel=level) as zf:
            _add_to_zip(zf, input_path)
    
    size = output_path.stat().st_size
    print(f"✓ Created ZIP: {output_path} ({_format_size(size)})")
    return True


def _add_to_zip(zf, path: Path, base_path: Path = None):
    """Recursively add files to ZIP."""
    if base_path is None:
        base_path = path.parent if path.is_file() else path
    
    if path.is_file():
        arcname = path.relative_to(base_path)
        zf.write(path, arcname)
    else:
        for item in path.rglob('*'):
            if item.is_file():
                arcname = item.relative_to(base_path)
                zf.write(item, arcname)


def _create_tar(input_path: Path, output_path: Path, compression: str) -> bool:
    """Create TAR archive."""
    # Determine mode
    suffix = output_path.suffix.lower()
    if suffix == '.gz' or 'gz' in compression:
        mode = 'w:gz'
    elif suffix == '.bz2' or 'bz2' in compression:
        mode = 'w:bz2'
    elif suffix == '.xz' or 'xz' in compression:
        mode = 'w:xz'
    else:
        mode = 'w'
    
    with tarfile.open(output_path, mode) as tf:
        if input_path.is_file():
            tf.add(input_path, arcname=input_path.name)
        else:
            for item in input_path.rglob('*'):
                arcname = item.relative_to(input_path.parent)
                tf.add(item, arcname=arcname)
    
    size = output_path.stat().st_size
    print(f"✓ Created TAR: {output_path} ({_format_size(size)})")
    return True


def extract_archive(
    input_path: str,
    output_path: str = None,
    password: str = None,
) -> bool:
    """
    Extract an archive.
    
    Args:
        input_path: Archive file path
        output_path: Extraction directory (default: current directory)
        password: Password for encrypted archives
    
    Returns:
        True if successful
    """
    input_path = Path(input_path)
    output_path = Path(output_path) if output_path else Path.cwd()
    
    if not input_path.exists():
        print(f"Error: Archive not found: {input_path}", file=sys.stderr)
        return False
    
    output_path.mkdir(parents=True, exist_ok=True)
    
    try:
        suffix = input_path.suffix.lower()
        
        if suffix == '.zip':
            if password and PYZIPPER_AVAILABLE:
                with pyzipper.AESZipFile(input_path, 'r') as zf:
                    zf.setpassword(password.encode())
                    zf.extractall(output_path)
            else:
                with zipfile.ZipFile(input_path, 'r') as zf:
                    if password:
                        zf.setpassword(password.encode())
                    zf.extractall(output_path)
        
        elif suffix in ['.tar', '.gz', '.bz2', '.xz', '.tgz']:
            with tarfile.open(input_path, 'r:*') as tf:
                tf.extractall(output_path)
        
        else:
            print(f"Error: Unsupported archive format: {suffix}", file=sys.stderr)
            return False
        
        print(f"✓ Extracted to: {output_path}")
        return True
    
    except Exception as e:
        print(f"Error extracting archive: {e}", file=sys.stderr)
        return False


def list_archive(input_path: str) -> bool:
    """
    List contents of an archive.
    
    Args:
        input_path: Archive file path
    
    Returns:
        True if successful
    """
    input_path = Path(input_path)
    
    if not input_path.exists():
        print(f"Error: Archive not found: {input_path}", file=sys.stderr)
        return False
    
    try:
        suffix = input_path.suffix.lower()
        
        print(f"\nContents of {input_path.name}:")
        print("-" * 60)
        
        if suffix == '.zip':
            with zipfile.ZipFile(input_path, 'r') as zf:
                total_size = 0
                for info in zf.infolist():
                    size_str = _format_size(info.file_size)
                    print(f"  {info.filename:<45} {size_str:>10}")
                    total_size += info.file_size
                print("-" * 60)
                print(f"  Total: {len(zf.infolist())} files, {_format_size(total_size)}")
        
        elif suffix in ['.tar', '.gz', '.bz2', '.xz', '.tgz']:
            with tarfile.open(input_path, 'r:*') as tf:
                total_size = 0
                count = 0
                for member in tf.getmembers():
                    if member.isfile():
                        size_str = _format_size(member.size)
                        print(f"  {member.name:<45} {size_str:>10}")
                        total_size += member.size
                        count += 1
                print("-" * 60)
                print(f"  Total: {count} files, {_format_size(total_size)}")
        
        else:
            print(f"Error: Unsupported archive format: {suffix}", file=sys.stderr)
            return False
        
        return True
    
    except Exception as e:
        print(f"Error listing archive: {e}", file=sys.stderr)
        return False


def _format_size(size: int) -> str:
    """Format file size in human-readable format."""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size < 1024:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} TB"


def main():
    parser = argparse.ArgumentParser(description="File archiver tool")
    subparsers = parser.add_subparsers(dest="command", help="Commands")
    
    # Create command
    create_parser = subparsers.add_parser("create", help="Create archive")
    create_parser.add_argument("--input", "-i", required=True, help="File or directory to archive")
    create_parser.add_argument("--output", "-o", required=True, help="Output archive path")
    create_parser.add_argument("--password", "-p", help="Password for ZIP encryption")
    create_parser.add_argument("--level", "-l", type=int, default=9, help="Compression level (1-9)")
    
    # Extract command
    extract_parser = subparsers.add_parser("extract", help="Extract archive")
    extract_parser.add_argument("--input", "-i", required=True, help="Archive file")
    extract_parser.add_argument("--output", "-o", help="Output directory")
    extract_parser.add_argument("--password", "-p", help="Password for encrypted archives")
    
    # List command
    list_parser = subparsers.add_parser("list", help="List archive contents")
    list_parser.add_argument("--input", "-i", required=True, help="Archive file")
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        sys.exit(1)
    
    success = False
    
    if args.command == "create":
        success = create_archive(args.input, args.output, args.password, level=args.level)
    elif args.command == "extract":
        success = extract_archive(args.input, args.output, args.password)
    elif args.command == "list":
        success = list_archive(args.input)
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
