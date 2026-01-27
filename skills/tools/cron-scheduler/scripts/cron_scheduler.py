#!/usr/bin/env python3
"""
Cron Scheduler Tool - Parse and explain cron expressions.
Based on: https://github.com/kiorber/croniter

Usage:
    python cron_scheduler.py "0 9 * * 1-5"
    python cron_scheduler.py "*/15 * * * *" --next 5
"""

import argparse
import sys
from datetime import datetime, timedelta

FIELD_NAMES = ['minute', 'hour', 'day', 'month', 'weekday']
FIELD_RANGES = [(0, 59), (0, 23), (1, 31), (1, 12), (0, 6)]
WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December']

def parse_field(field, idx):
    """Parse a single cron field."""
    min_val, max_val = FIELD_RANGES[idx]
    values = set()
    
    for part in field.split(','):
        if part == '*':
            values.update(range(min_val, max_val + 1))
        elif '/' in part:
            base, step = part.split('/')
            step = int(step)
            if base == '*':
                values.update(range(min_val, max_val + 1, step))
            else:
                start = int(base)
                values.update(range(start, max_val + 1, step))
        elif '-' in part:
            start, end = map(int, part.split('-'))
            values.update(range(start, end + 1))
        else:
            values.add(int(part))
    
    return sorted(values)

def explain_cron(expression):
    """Generate human-readable explanation of cron expression."""
    parts = expression.split()
    if len(parts) != 5:
        return "Invalid cron expression (need 5 fields)"
    
    minute, hour, day, month, weekday = parts
    explanations = []
    
    # Time
    if minute == '*' and hour == '*':
        explanations.append("Every minute")
    elif minute == '0' and hour == '*':
        explanations.append("Every hour")
    elif minute == '*':
        explanations.append(f"Every minute during hour {hour}")
    elif hour == '*':
        explanations.append(f"At minute {minute} of every hour")
    else:
        explanations.append(f"At {hour.zfill(2)}:{minute.zfill(2)}")
    
    # Day/Month
    if day != '*' and month != '*':
        explanations.append(f"on day {day} of month {month}")
    elif day != '*':
        explanations.append(f"on day {day} of every month")
    elif month != '*':
        explanations.append(f"every day in month {month}")
    
    # Weekday
    if weekday != '*':
        if '-' in weekday:
            start, end = map(int, weekday.split('-'))
            explanations.append(f"on {WEEKDAYS[start]} through {WEEKDAYS[end]}")
        else:
            days = [WEEKDAYS[int(d)] for d in weekday.split(',')]
            explanations.append(f"on {', '.join(days)}")
    
    return ' '.join(explanations)

def get_next_runs(expression, count=5):
    """Calculate next run times (simplified)."""
    parts = expression.split()
    if len(parts) != 5:
        return []
    
    minutes = parse_field(parts[0], 0)
    hours = parse_field(parts[1], 1)
    
    now = datetime.now()
    runs = []
    current = now.replace(second=0, microsecond=0)
    
    for _ in range(count * 1440):  # Check up to count days worth of minutes
        if current.minute in minutes and current.hour in hours:
            if current > now:
                runs.append(current)
                if len(runs) >= count:
                    break
        current += timedelta(minutes=1)
    
    return runs

def main():
    parser = argparse.ArgumentParser(description="Cron expression helper")
    parser.add_argument('expression', nargs='?', help='Cron expression')
    parser.add_argument('--next', '-n', type=int, default=5, help='Show next N runs')
    parser.add_argument('--validate', '-v', action='store_true', help='Validate only')
    args = parser.parse_args()
    
    if not args.expression:
        parser.error("Please provide a cron expression")
    
    print(f"Expression: {args.expression}")
    print(f"Meaning: {explain_cron(args.expression)}")
    
    if not args.validate:
        runs = get_next_runs(args.expression, args.next)
        print(f"\nNext {len(runs)} runs:")
        for run in runs:
            print(f"  {run.strftime('%Y-%m-%d %H:%M')}")

if __name__ == "__main__":
    main()
