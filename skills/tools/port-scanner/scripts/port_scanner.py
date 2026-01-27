#!/usr/bin/env python3
"""
Port Scanner Tool
Based on Python's socket: https://github.com/python/cpython

Usage:
    python port_scanner.py localhost 8080
    python port_scanner.py 192.168.1.1 --range 80-443
"""

import argparse
import socket
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

COMMON_PORTS = {
    21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS',
    80: 'HTTP', 110: 'POP3', 143: 'IMAP', 443: 'HTTPS', 465: 'SMTPS',
    587: 'SMTP', 993: 'IMAPS', 995: 'POP3S', 3306: 'MySQL', 5432: 'PostgreSQL',
    6379: 'Redis', 8080: 'HTTP-Alt', 8443: 'HTTPS-Alt', 27017: 'MongoDB'
}

def scan_port(host, port, timeout=1):
    """Scan a single port."""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        result = sock.connect_ex((host, port))
        sock.close()
        return port, result == 0
    except:
        return port, False

def scan_ports(host, ports, timeout=1, threads=50):
    """Scan multiple ports concurrently."""
    results = {}
    with ThreadPoolExecutor(max_workers=threads) as executor:
        futures = {executor.submit(scan_port, host, p, timeout): p for p in ports}
        for future in as_completed(futures):
            port, is_open = future.result()
            results[port] = is_open
    return results

def main():
    parser = argparse.ArgumentParser(description="Scan network ports")
    parser.add_argument('host', help='Target host')
    parser.add_argument('port', nargs='?', type=int, help='Single port')
    parser.add_argument('--range', '-r', help='Port range (e.g., 80-443)')
    parser.add_argument('--common', '-c', action='store_true', help='Scan common ports')
    parser.add_argument('--available', '-a', action='store_true', help='Check if available')
    parser.add_argument('--timeout', '-t', type=float, default=1, help='Timeout')
    args = parser.parse_args()
    
    # Resolve hostname
    try:
        ip = socket.gethostbyname(args.host)
        print(f"Scanning {args.host} ({ip})...")
    except socket.gaierror:
        print(f"Error: Cannot resolve {args.host}", file=sys.stderr)
        sys.exit(1)
    
    # Determine ports to scan
    if args.port:
        ports = [args.port]
    elif args.range:
        start, end = map(int, args.range.split('-'))
        ports = range(start, end + 1)
    elif args.common:
        ports = list(COMMON_PORTS.keys())
    else:
        parser.error("Specify port, --range, or --common")
    
    results = scan_ports(args.host, ports, args.timeout)
    
    open_ports = [p for p, is_open in results.items() if is_open]
    
    if args.available and args.port:
        if args.port in open_ports:
            print(f"✗ Port {args.port} is in use")
            sys.exit(1)
        else:
            print(f"✓ Port {args.port} is available")
            sys.exit(0)
    
    print(f"\nOpen ports ({len(open_ports)}):")
    for port in sorted(open_ports):
        service = COMMON_PORTS.get(port, 'Unknown')
        print(f"  {port}/tcp - {service}")
    
    if not open_ports:
        print("  No open ports found")

if __name__ == "__main__":
    main()
