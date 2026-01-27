#!/usr/bin/env python3
"""
Web Scraper Tool
Extract data from web pages using CSS selectors.
Based on: https://github.com/cheeriojs/cheerio (concept), BeautifulSoup (implementation)

Usage:
    python web_scraper.py --url "https://example.com" --selector ".item" --output data.json
    python web_scraper.py --url "https://example.com" --selectors "title:h1,price:.price,link:a@href"
    python web_scraper.py --urls urls.txt --selector ".product" --delay 2

Requirements:
    pip install requests beautifulsoup4 lxml
"""

import argparse
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import urljoin, urlparse

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("Error: Required packages missing. Install: pip install requests beautifulsoup4 lxml", file=sys.stderr)
    sys.exit(1)


# Default headers to avoid blocking
DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
}


def fetch_page(url: str, headers: dict = None, timeout: int = 30) -> str | None:
    """
    Fetch HTML content from URL.
    
    Args:
        url: URL to fetch
        headers: Custom headers
        timeout: Request timeout in seconds
    
    Returns:
        HTML content or None on error
    """
    try:
        response = requests.get(
            url,
            headers=headers or DEFAULT_HEADERS,
            timeout=timeout,
        )
        response.raise_for_status()
        return response.text
    except requests.RequestException as e:
        print(f"Error fetching {url}: {e}", file=sys.stderr)
        return None


def parse_selector(selector_str: str) -> tuple[str, str | None]:
    """
    Parse selector string with optional attribute.
    
    Format: "selector" or "selector@attribute"
    Examples: ".price", "a@href", "img@src"
    
    Returns:
        Tuple of (css_selector, attribute_name)
    """
    if '@' in selector_str:
        parts = selector_str.rsplit('@', 1)
        return parts[0], parts[1]
    return selector_str, None


def extract_value(element, attribute: str = None) -> str:
    """Extract text or attribute value from element."""
    if attribute:
        return element.get(attribute, '').strip()
    return element.get_text(strip=True)


def scrape_page(
    html: str,
    selector: str = None,
    selectors: dict = None,
    base_url: str = None,
) -> list[dict] | list[str]:
    """
    Scrape data from HTML using CSS selectors.
    
    Args:
        html: HTML content
        selector: Single CSS selector (returns list of strings)
        selectors: Dict of {name: selector} for structured extraction
        base_url: Base URL for resolving relative links
    
    Returns:
        List of extracted data
    """
    soup = BeautifulSoup(html, 'lxml')
    results = []
    
    if selectors:
        # Multiple selectors - extract structured data
        # Find container elements first
        containers = soup.select(selectors.get('_container', 'body'))
        if not containers:
            containers = [soup]
        
        for container in containers:
            item = {}
            for name, sel_str in selectors.items():
                if name.startswith('_'):
                    continue
                
                css_sel, attr = parse_selector(sel_str)
                element = container.select_one(css_sel)
                
                if element:
                    value = extract_value(element, attr)
                    
                    # Resolve relative URLs
                    if attr in ['href', 'src'] and base_url and value:
                        value = urljoin(base_url, value)
                    
                    item[name] = value
                else:
                    item[name] = None
            
            if any(v is not None for v in item.values()):
                results.append(item)
    
    elif selector:
        # Single selector - extract list of values
        css_sel, attr = parse_selector(selector)
        elements = soup.select(css_sel)
        
        for element in elements:
            value = extract_value(element, attr)
            
            if attr in ['href', 'src'] and base_url and value:
                value = urljoin(base_url, value)
            
            if value:
                results.append(value)
    
    return results


def scrape_urls(
    urls: list[str],
    selector: str = None,
    selectors: dict = None,
    delay: float = 1.0,
    output_path: str = None,
) -> list:
    """
    Scrape multiple URLs with rate limiting.
    
    Args:
        urls: List of URLs to scrape
        selector: Single CSS selector
        selectors: Dict of selectors for structured data
        delay: Delay between requests in seconds
        output_path: Optional path to save results
    
    Returns:
        Combined results from all URLs
    """
    all_results = []
    
    for i, url in enumerate(urls):
        print(f"Scraping [{i+1}/{len(urls)}]: {url}")
        
        html = fetch_page(url)
        if html:
            results = scrape_page(html, selector, selectors, base_url=url)
            
            # Add source URL to results
            if selectors and results:
                for item in results:
                    item['_source_url'] = url
            
            all_results.extend(results)
            print(f"  Found {len(results)} items")
        
        # Rate limiting
        if i < len(urls) - 1 and delay > 0:
            time.sleep(delay)
    
    # Save results
    if output_path:
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(all_results, f, indent=2, ensure_ascii=False)
        print(f"\n✓ Saved {len(all_results)} items to {output_path}")
    
    return all_results


def parse_selectors_arg(selectors_str: str) -> dict:
    """
    Parse selectors argument string.
    
    Format: "name1:selector1,name2:selector2@attr"
    Example: "title:h1,price:.price,link:a@href"
    """
    selectors = {}
    for part in selectors_str.split(','):
        if ':' in part:
            name, selector = part.split(':', 1)
            selectors[name.strip()] = selector.strip()
    return selectors


def main():
    parser = argparse.ArgumentParser(
        description="Web scraper tool",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --url "https://example.com" --selector "h1"
  %(prog)s --url "https://example.com" --selectors "title:h1,link:a@href"
  %(prog)s --urls urls.txt --selector ".item" --output data.json --delay 2
        """
    )
    
    parser.add_argument("--url", "-u", help="Single URL to scrape")
    parser.add_argument("--urls", "-U", help="File with URLs (one per line)")
    parser.add_argument("--selector", "-s", help="CSS selector (e.g., '.item', 'a@href')")
    parser.add_argument("--selectors", "-S", help="Multiple selectors (e.g., 'title:h1,price:.price')")
    parser.add_argument("--container", "-c", help="Container selector for structured data")
    parser.add_argument("--output", "-o", help="Output JSON file")
    parser.add_argument("--delay", "-d", type=float, default=1.0, help="Delay between requests (seconds)")
    parser.add_argument("--timeout", "-t", type=int, default=30, help="Request timeout (seconds)")
    
    args = parser.parse_args()
    
    # Validate arguments
    if not args.url and not args.urls:
        parser.error("Either --url or --urls is required")
    
    if not args.selector and not args.selectors:
        parser.error("Either --selector or --selectors is required")
    
    # Get URLs
    urls = []
    if args.url:
        urls = [args.url]
    elif args.urls:
        urls_file = Path(args.urls)
        if not urls_file.exists():
            print(f"Error: URLs file not found: {args.urls}", file=sys.stderr)
            sys.exit(1)
        urls = [line.strip() for line in urls_file.read_text().splitlines() if line.strip()]
    
    # Parse selectors
    selectors = None
    if args.selectors:
        selectors = parse_selectors_arg(args.selectors)
        if args.container:
            selectors['_container'] = args.container
    
    # Scrape
    results = scrape_urls(
        urls=urls,
        selector=args.selector,
        selectors=selectors,
        delay=args.delay,
        output_path=args.output,
    )
    
    # Print results if no output file
    if not args.output:
        print(json.dumps(results, indent=2, ensure_ascii=False))
    
    sys.exit(0 if results else 1)


if __name__ == "__main__":
    main()
