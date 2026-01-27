#!/usr/bin/env python3
"""
JSON Validator Tool
Based on: https://github.com/python-jsonschema/jsonschema

Usage:
    python json_validator.py data.json
    python json_validator.py data.json --schema schema.json
    python json_validator.py data.json --format
"""

import argparse
import json
import sys
from pathlib import Path

def validate_json(filepath):
    """Validate JSON syntax."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return True, data, None
    except json.JSONDecodeError as e:
        return False, None, f"Line {e.lineno}, Col {e.colno}: {e.msg}"
    except Exception as e:
        return False, None, str(e)

def validate_schema(data, schema_path):
    """Validate JSON against schema."""
    try:
        from jsonschema import validate, ValidationError
        with open(schema_path, 'r') as f:
            schema = json.load(f)
        validate(instance=data, schema=schema)
        return True, None
    except ImportError:
        return True, "jsonschema not installed, skipping schema validation"
    except ValidationError as e:
        return False, f"Schema error at {'/'.join(str(p) for p in e.path)}: {e.message}"
    except Exception as e:
        return False, str(e)

def main():
    parser = argparse.ArgumentParser(description="Validate JSON files")
    parser.add_argument('file', help='JSON file to validate')
    parser.add_argument('--schema', '-s', help='JSON Schema file')
    parser.add_argument('--format', '-f', action='store_true', help='Format output')
    parser.add_argument('--minify', '-m', action='store_true', help='Minify output')
    parser.add_argument('--output', '-o', help='Output file')
    args = parser.parse_args()
    
    valid, data, error = validate_json(args.file)
    
    if not valid:
        print(f"✗ Invalid JSON: {error}", file=sys.stderr)
        sys.exit(1)
    
    print(f"✓ Valid JSON syntax")
    
    if args.schema:
        valid, error = validate_schema(data, args.schema)
        if not valid:
            print(f"✗ Schema validation failed: {error}", file=sys.stderr)
            sys.exit(1)
        print(f"✓ Schema validation passed")
    
    if args.format or args.minify:
        indent = None if args.minify else 2
        output = json.dumps(data, indent=indent, ensure_ascii=False)
        
        if args.output:
            with open(args.output, 'w', encoding='utf-8') as f:
                f.write(output)
            print(f"✓ Output saved to {args.output}")
        else:
            print(output)

if __name__ == "__main__":
    main()
