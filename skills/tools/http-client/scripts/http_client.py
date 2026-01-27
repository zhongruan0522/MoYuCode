#!/usr/bin/env python3
"""
HTTP Client Tool
Make HTTP requests with full support for methods, headers, auth.
Based on: https://github.com/psf/requests

Usage:
    python http_client.py GET https://api.example.com/users
    python http_client.py POST https://api.example.com/users --json '{"name": "John"}'
    python http_client.py GET https://api.example.com/data --header "Authorization: Bearer token"

Requirements:
    pip install requests
"""

import argparse
import json
import sys
from pathlib import Path
from urllib.parse import urljoin

try:
    import requests
except ImportError:
    print("Error: requests package required. Install: pip install requests", file=sys.stderr)
    sys.exit(1)


def make_request(
    method: str,
    url: str,
    headers: dict = None,
    params: dict = None,
    json_data: dict = None,
    data: str = None,
    files: dict = None,
    auth: tuple = None,
    timeout: int = 30,
    verify: bool = True,
    follow_redirects: bool = True
) -> requests.Response:
    """Make HTTP request and return response."""
    kwargs = {
        'headers': headers or {},
        'params': params,
        'timeout': timeout,
        'verify': verify,
        'allow_redirects': follow_redirects
    }
    
    if json_data:
        kwargs['json'] = json_data
    elif data:
        kwargs['data'] = data
    
    if files:
        kwargs['files'] = files
    
    if auth:
        kwargs['auth'] = auth
    
    response = requests.request(method.upper(), url, **kwargs)
    return response


def format_response(response: requests.Response, verbose: bool = False) -> str:
    """Format response for display."""
    output = []
    
    # Status line
    status_emoji = "✓" if response.ok else "✗"
    output.append(f"{status_emoji} {response.status_code} {response.reason}")
    output.append(f"URL: {response.url}")
    output.append(f"Time: {response.elapsed.total_seconds():.3f}s")
    
    if verbose:
        output.append("\n--- Headers ---")
        for key, value in response.headers.items():
            output.append(f"{key}: {value}")
    
    output.append("\n--- Body ---")
    
    # Try to format as JSON
    content_type = response.headers.get('content-type', '')
    if 'application/json' in content_type:
        try:
            formatted = json.dumps(response.json(), indent=2, ensure_ascii=False)
            output.append(formatted)
        except json.JSONDecodeError:
            output.append(response.text)
    else:
        # Truncate long responses
        text = response.text
        if len(text) > 2000:
            output.append(text[:2000] + f"\n... (truncated, {len(text)} total chars)")
        else:
            output.append(text)
    
    return '\n'.join(output)


def parse_header(header_str: str) -> tuple:
    """Parse header string 'Key: Value' into tuple."""
    if ':' in header_str:
        key, value = header_str.split(':', 1)
        return key.strip(), value.strip()
    return header_str, ''


def main():
    parser = argparse.ArgumentParser(
        description="HTTP Client Tool",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s GET https://httpbin.org/get
  %(prog)s POST https://httpbin.org/post --json '{"key": "value"}'
  %(prog)s GET https://api.example.com --header "Authorization: Bearer token"
  %(prog)s POST https://api.example.com/upload --file document.pdf
        """
    )
    
    parser.add_argument('method', choices=['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
                       help='HTTP method')
    parser.add_argument('url', help='Request URL')
    parser.add_argument('--header', '-H', action='append', help='Header (Key: Value)')
    parser.add_argument('--json', '-j', dest='json_body', help='JSON body')
    parser.add_argument('--data', '-d', help='Form data or raw body')
    parser.add_argument('--file', '-f', help='File to upload')
    parser.add_argument('--param', '-p', action='append', help='Query param (key=value)')
    parser.add_argument('--user', '-u', help='Basic auth (user:pass)')
    parser.add_argument('--timeout', '-t', type=int, default=30, help='Timeout in seconds')
    parser.add_argument('--no-verify', action='store_true', help='Skip SSL verification')
    parser.add_argument('--no-redirect', action='store_true', help='Do not follow redirects')
    parser.add_argument('--verbose', '-v', action='store_true', help='Show response headers')
    parser.add_argument('--output', '-o', help='Save response body to file')
    
    args = parser.parse_args()
    
    # Parse headers
    headers = {}
    if args.header:
        for h in args.header:
            key, value = parse_header(h)
            headers[key] = value
    
    # Parse query params
    params = {}
    if args.param:
        for p in args.param:
            if '=' in p:
                key, value = p.split('=', 1)
                params[key] = value
    
    # Parse JSON body
    json_data = None
    if args.json_body:
        try:
            json_data = json.loads(args.json_body)
        except json.JSONDecodeError as e:
            print(f"Error: Invalid JSON: {e}", file=sys.stderr)
            sys.exit(1)
    
    # Handle file upload
    files = None
    if args.file:
        path = Path(args.file)
        if not path.exists():
            print(f"Error: File not found: {args.file}", file=sys.stderr)
            sys.exit(1)
        files = {'file': (path.name, open(path, 'rb'))}
    
    # Parse auth
    auth = None
    if args.user:
        if ':' in args.user:
            auth = tuple(args.user.split(':', 1))
        else:
            auth = (args.user, '')
    
    try:
        response = make_request(
            method=args.method,
            url=args.url,
            headers=headers,
            params=params or None,
            json_data=json_data,
            data=args.data,
            files=files,
            auth=auth,
            timeout=args.timeout,
            verify=not args.no_verify,
            follow_redirects=not args.no_redirect
        )
        
        print(format_response(response, args.verbose))
        
        if args.output:
            with open(args.output, 'wb') as f:
                f.write(response.content)
            print(f"\n✓ Response saved to {args.output}")
        
        sys.exit(0 if response.ok else 1)
        
    except requests.exceptions.Timeout:
        print(f"Error: Request timed out after {args.timeout}s", file=sys.stderr)
        sys.exit(1)
    except requests.exceptions.ConnectionError as e:
        print(f"Error: Connection failed: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
