#!/usr/bin/env python3
"""
JSON/YAML/TOML Converter Tool
Convert between configuration file formats.
Based on: https://github.com/yaml/pyyaml

Usage:
    python json_yaml_converter.py convert --input config.json --output config.yaml
    python json_yaml_converter.py validate --input config.yaml
    python json_yaml_converter.py format --input config.json --indent 2

Requirements:
    pip install pyyaml toml
"""

import argparse
import json
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    yaml = None

try:
    import toml
except ImportError:
    toml = None


def detect_format(file_path: str) -> str:
    """Detect file format from extension."""
    suffix = Path(file_path).suffix.lower()
    formats = {
        '.json': 'json',
        '.yaml': 'yaml',
        '.yml': 'yaml',
        '.toml': 'toml',
    }
    return formats.get(suffix, 'json')


def load_file(file_path: str, format: str = None) -> dict:
    """Load data from file."""
    if format is None:
        format = detect_format(file_path)
    
    content = Path(file_path).read_text(encoding='utf-8')
    
    if format == 'json':
        return json.loads(content)
    elif format == 'yaml':
        if yaml is None:
            raise ImportError("PyYAML required. Install: pip install pyyaml")
        return yaml.safe_load(content)
    elif format == 'toml':
        if toml is None:
            raise ImportError("toml required. Install: pip install toml")
        return toml.loads(content)
    else:
        raise ValueError(f"Unsupported format: {format}")


def save_file(data: dict, file_path: str, format: str = None, indent: int = 2) -> None:
    """Save data to file."""
    if format is None:
        format = detect_format(file_path)
    
    if format == 'json':
        content = json.dumps(data, indent=indent, ensure_ascii=False)
    elif format == 'yaml':
        if yaml is None:
            raise ImportError("PyYAML required. Install: pip install pyyaml")
        content = yaml.dump(data, default_flow_style=False, allow_unicode=True, indent=indent)
    elif format == 'toml':
        if toml is None:
            raise ImportError("toml required. Install: pip install toml")
        content = toml.dumps(data)
    else:
        raise ValueError(f"Unsupported format: {format}")
    
    Path(file_path).write_text(content, encoding='utf-8')


def convert_file(
    input_path: str,
    output_path: str,
    input_format: str = None,
    output_format: str = None,
    indent: int = 2,
) -> bool:
    """Convert file between formats."""
    try:
        data = load_file(input_path, input_format)
        save_file(data, output_path, output_format, indent)
        
        in_fmt = input_format or detect_format(input_path)
        out_fmt = output_format or detect_format(output_path)
        print(f"✓ Converted {in_fmt.upper()} -> {out_fmt.upper()}: {output_path}")
        return True
    
    except Exception as e:
        print(f"Error converting file: {e}", file=sys.stderr)
        return False


def validate_file(file_path: str, format: str = None) -> bool:
    """Validate file syntax."""
    try:
        data = load_file(file_path, format)
        fmt = format or detect_format(file_path)
        print(f"✓ Valid {fmt.upper()}: {file_path}")
        
        # Print summary
        if isinstance(data, dict):
            print(f"  Keys: {len(data)}")
        elif isinstance(data, list):
            print(f"  Items: {len(data)}")
        
        return True
    
    except json.JSONDecodeError as e:
        print(f"✗ Invalid JSON: {e}", file=sys.stderr)
        return False
    except yaml.YAMLError as e:
        print(f"✗ Invalid YAML: {e}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"✗ Validation error: {e}", file=sys.stderr)
        return False


def format_file(
    input_path: str,
    output_path: str = None,
    indent: int = 2,
    sort_keys: bool = False,
) -> bool:
    """Format/prettify file."""
    try:
        format = detect_format(input_path)
        data = load_file(input_path, format)
        
        if sort_keys and isinstance(data, dict):
            data = dict(sorted(data.items()))
        
        output = output_path or input_path
        save_file(data, output, format, indent)
        
        print(f"✓ Formatted: {output}")
        return True
    
    except Exception as e:
        print(f"Error formatting file: {e}", file=sys.stderr)
        return False


def merge_files(
    input_paths: list[str],
    output_path: str,
    deep_merge: bool = True,
) -> bool:
    """Merge multiple config files."""
    try:
        result = {}
        
        for input_path in input_paths:
            data = load_file(input_path)
            
            if deep_merge:
                result = _deep_merge(result, data)
            else:
                result.update(data)
        
        save_file(result, output_path)
        print(f"✓ Merged {len(input_paths)} files: {output_path}")
        return True
    
    except Exception as e:
        print(f"Error merging files: {e}", file=sys.stderr)
        return False


def _deep_merge(base: dict, override: dict) -> dict:
    """Deep merge two dictionaries."""
    result = base.copy()
    
    for key, value in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    
    return result


def main():
    parser = argparse.ArgumentParser(description="JSON/YAML/TOML converter")
    subparsers = parser.add_subparsers(dest="command", help="Commands")
    
    # Convert command
    convert_parser = subparsers.add_parser("convert", help="Convert between formats")
    convert_parser.add_argument("--input", "-i", required=True, help="Input file")
    convert_parser.add_argument("--output", "-o", required=True, help="Output file")
    convert_parser.add_argument("--input-format", choices=["json", "yaml", "toml"])
    convert_parser.add_argument("--output-format", choices=["json", "yaml", "toml"])
    convert_parser.add_argument("--indent", type=int, default=2, help="Indentation")
    
    # Validate command
    validate_parser = subparsers.add_parser("validate", help="Validate file syntax")
    validate_parser.add_argument("--input", "-i", required=True, help="File to validate")
    validate_parser.add_argument("--format", choices=["json", "yaml", "toml"])
    
    # Format command
    format_parser = subparsers.add_parser("format", help="Format/prettify file")
    format_parser.add_argument("--input", "-i", required=True, help="Input file")
    format_parser.add_argument("--output", "-o", help="Output file (default: overwrite)")
    format_parser.add_argument("--indent", type=int, default=2, help="Indentation")
    format_parser.add_argument("--sort-keys", action="store_true", help="Sort keys")
    
    # Merge command
    merge_parser = subparsers.add_parser("merge", help="Merge multiple files")
    merge_parser.add_argument("--inputs", "-i", required=True, help="Comma-separated input files")
    merge_parser.add_argument("--output", "-o", required=True, help="Output file")
    merge_parser.add_argument("--shallow", action="store_true", help="Shallow merge")
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        sys.exit(1)
    
    success = False
    
    if args.command == "convert":
        success = convert_file(
            args.input, args.output,
            args.input_format, args.output_format,
            args.indent
        )
    elif args.command == "validate":
        success = validate_file(args.input, args.format)
    elif args.command == "format":
        success = format_file(args.input, args.output, args.indent, args.sort_keys)
    elif args.command == "merge":
        inputs = [f.strip() for f in args.inputs.split(",")]
        success = merge_files(inputs, args.output, not args.shallow)
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
