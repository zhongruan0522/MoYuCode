#!/usr/bin/env python3
"""
CSV Processor Tool
Process CSV files with filtering, sorting, aggregation and conversion.
Based on: https://github.com/pandas-dev/pandas

Usage:
    python csv_processor.py read data.csv
    python csv_processor.py filter data.csv --column "status" --value "active"
    python csv_processor.py sort data.csv --by "date" --desc
    python csv_processor.py convert data.csv --format json --output data.json
    python csv_processor.py aggregate data.csv --group "category" --sum "amount"

Requirements:
    pip install pandas
"""

import argparse
import csv
import json
import sys
from pathlib import Path
from typing import Any


def read_csv(filepath: str, delimiter: str = ',') -> list[dict]:
    """Read CSV file and return list of dictionaries."""
    with open(filepath, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f, delimiter=delimiter)
        return list(reader)


def write_csv(data: list[dict], filepath: str, delimiter: str = ',') -> None:
    """Write list of dictionaries to CSV file."""
    if not data:
        print("Warning: No data to write", file=sys.stderr)
        return
    
    with open(filepath, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=data[0].keys(), delimiter=delimiter)
        writer.writeheader()
        writer.writerows(data)


def cmd_read(args):
    """Read and display CSV file."""
    data = read_csv(args.file, args.delimiter)
    
    if args.head:
        data = data[:args.head]
    
    if args.columns:
        cols = [c.strip() for c in args.columns.split(',')]
        data = [{k: row.get(k, '') for k in cols} for row in data]
    
    # Print as table
    if data:
        headers = list(data[0].keys())
        print(args.delimiter.join(headers))
        print('-' * 50)
        for row in data:
            print(args.delimiter.join(str(row.get(h, '')) for h in headers))
    
    print(f"\n✓ Total rows: {len(data)}")


def cmd_filter(args):
    """Filter CSV rows by column value."""
    data = read_csv(args.file, args.delimiter)
    
    filtered = []
    for row in data:
        value = row.get(args.column, '')
        if args.contains:
            if args.value.lower() in value.lower():
                filtered.append(row)
        elif args.regex:
            import re
            if re.search(args.value, value):
                filtered.append(row)
        else:
            if value == args.value:
                filtered.append(row)
    
    if args.output:
        write_csv(filtered, args.output, args.delimiter)
        print(f"✓ Filtered {len(filtered)} rows saved to {args.output}")
    else:
        for row in filtered:
            print(args.delimiter.join(str(v) for v in row.values()))
        print(f"\n✓ Found {len(filtered)} matching rows")


def cmd_sort(args):
    """Sort CSV by column."""
    data = read_csv(args.file, args.delimiter)
    
    def sort_key(row):
        val = row.get(args.by, '')
        if args.numeric:
            try:
                return float(val) if val else 0
            except ValueError:
                return 0
        return val
    
    sorted_data = sorted(data, key=sort_key, reverse=args.desc)
    
    if args.output:
        write_csv(sorted_data, args.output, args.delimiter)
        print(f"✓ Sorted data saved to {args.output}")
    else:
        headers = list(sorted_data[0].keys()) if sorted_data else []
        print(args.delimiter.join(headers))
        for row in sorted_data[:20]:
            print(args.delimiter.join(str(row.get(h, '')) for h in headers))
        if len(sorted_data) > 20:
            print(f"... and {len(sorted_data) - 20} more rows")


def cmd_convert(args):
    """Convert CSV to other formats."""
    data = read_csv(args.file, args.delimiter)
    
    output_path = args.output or Path(args.file).stem + f'.{args.format}'
    
    if args.format == 'json':
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    
    elif args.format == 'jsonl':
        with open(output_path, 'w', encoding='utf-8') as f:
            for row in data:
                f.write(json.dumps(row, ensure_ascii=False) + '\n')
    
    elif args.format == 'tsv':
        write_csv(data, output_path, delimiter='\t')
    
    elif args.format == 'markdown':
        with open(output_path, 'w', encoding='utf-8') as f:
            if data:
                headers = list(data[0].keys())
                f.write('| ' + ' | '.join(headers) + ' |\n')
                f.write('| ' + ' | '.join(['---'] * len(headers)) + ' |\n')
                for row in data:
                    f.write('| ' + ' | '.join(str(row.get(h, '')) for h in headers) + ' |\n')
    
    print(f"✓ Converted to {args.format}: {output_path}")


def cmd_aggregate(args):
    """Aggregate CSV data."""
    data = read_csv(args.file, args.delimiter)
    
    groups = {}
    for row in data:
        key = row.get(args.group, 'Unknown')
        if key not in groups:
            groups[key] = []
        groups[key].append(row)
    
    results = []
    for key, rows in groups.items():
        result = {args.group: key, 'count': len(rows)}
        
        if args.sum:
            total = sum(float(r.get(args.sum, 0) or 0) for r in rows)
            result[f'sum_{args.sum}'] = total
        
        if args.avg:
            values = [float(r.get(args.avg, 0) or 0) for r in rows]
            result[f'avg_{args.avg}'] = sum(values) / len(values) if values else 0
        
        if args.min:
            values = [float(r.get(args.min, 0) or 0) for r in rows]
            result[f'min_{args.min}'] = min(values) if values else 0
        
        if args.max:
            values = [float(r.get(args.max, 0) or 0) for r in rows]
            result[f'max_{args.max}'] = max(values) if values else 0
        
        results.append(result)
    
    if args.output:
        write_csv(results, args.output, args.delimiter)
        print(f"✓ Aggregated data saved to {args.output}")
    else:
        for r in results:
            print(r)


def main():
    parser = argparse.ArgumentParser(description="CSV Processor Tool")
    parser.add_argument('--delimiter', '-d', default=',', help="CSV delimiter")
    
    subparsers = parser.add_subparsers(dest='command', required=True)
    
    # Read command
    p_read = subparsers.add_parser('read', help='Read and display CSV')
    p_read.add_argument('file', help='CSV file path')
    p_read.add_argument('--head', type=int, help='Show first N rows')
    p_read.add_argument('--columns', help='Columns to display (comma-separated)')
    p_read.set_defaults(func=cmd_read)
    
    # Filter command
    p_filter = subparsers.add_parser('filter', help='Filter rows')
    p_filter.add_argument('file', help='CSV file path')
    p_filter.add_argument('--column', '-c', required=True, help='Column to filter')
    p_filter.add_argument('--value', '-v', required=True, help='Value to match')
    p_filter.add_argument('--contains', action='store_true', help='Partial match')
    p_filter.add_argument('--regex', action='store_true', help='Regex match')
    p_filter.add_argument('--output', '-o', help='Output file')
    p_filter.set_defaults(func=cmd_filter)
    
    # Sort command
    p_sort = subparsers.add_parser('sort', help='Sort by column')
    p_sort.add_argument('file', help='CSV file path')
    p_sort.add_argument('--by', '-b', required=True, help='Column to sort by')
    p_sort.add_argument('--desc', action='store_true', help='Descending order')
    p_sort.add_argument('--numeric', '-n', action='store_true', help='Numeric sort')
    p_sort.add_argument('--output', '-o', help='Output file')
    p_sort.set_defaults(func=cmd_sort)
    
    # Convert command
    p_convert = subparsers.add_parser('convert', help='Convert format')
    p_convert.add_argument('file', help='CSV file path')
    p_convert.add_argument('--format', '-f', required=True, 
                          choices=['json', 'jsonl', 'tsv', 'markdown'])
    p_convert.add_argument('--output', '-o', help='Output file')
    p_convert.set_defaults(func=cmd_convert)
    
    # Aggregate command
    p_agg = subparsers.add_parser('aggregate', help='Aggregate data')
    p_agg.add_argument('file', help='CSV file path')
    p_agg.add_argument('--group', '-g', required=True, help='Group by column')
    p_agg.add_argument('--sum', help='Sum column')
    p_agg.add_argument('--avg', help='Average column')
    p_agg.add_argument('--min', help='Min column')
    p_agg.add_argument('--max', help='Max column')
    p_agg.add_argument('--output', '-o', help='Output file')
    p_agg.set_defaults(func=cmd_agg)
    
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
