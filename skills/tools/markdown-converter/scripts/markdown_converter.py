#!/usr/bin/env python3
"""
Markdown Converter Tool
Convert Markdown to HTML, PDF with syntax highlighting.
Based on: https://github.com/Python-Markdown/markdown

Usage:
    python markdown_converter.py README.md --format html
    python markdown_converter.py doc.md --format html --highlight
    python markdown_converter.py doc.md --format pdf --output doc.pdf

Requirements:
    pip install markdown pygments
"""

import argparse
import sys
from pathlib import Path

try:
    import markdown
    from markdown.extensions.codehilite import CodeHiliteExtension
    from markdown.extensions.tables import TableExtension
    from markdown.extensions.toc import TocExtension
    from markdown.extensions.fenced_code import FencedCodeExtension
except ImportError:
    print("Error: markdown package required. Install with: pip install markdown", file=sys.stderr)
    sys.exit(1)


HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
               max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; }}
        pre {{ background: #f4f4f4; padding: 16px; border-radius: 4px; overflow-x: auto; }}
        code {{ background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }}
        pre code {{ background: none; padding: 0; }}
        table {{ border-collapse: collapse; width: 100%; }}
        th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
        th {{ background: #f4f4f4; }}
        blockquote {{ border-left: 4px solid #ddd; margin: 0; padding-left: 16px; color: #666; }}
        img {{ max-width: 100%; }}
        {custom_css}
    </style>
    {highlight_css}
</head>
<body>
{content}
</body>
</html>"""


def convert_markdown(
    input_path: str,
    output_format: str = 'html',
    output_path: str = None,
    highlight: bool = True,
    custom_css: str = None,
    toc: bool = False
) -> str:
    """Convert Markdown file to specified format."""
    path = Path(input_path)
    if not path.exists():
        print(f"Error: File not found: {input_path}", file=sys.stderr)
        sys.exit(1)
    
    with open(path, 'r', encoding='utf-8') as f:
        md_content = f.read()
    
    # Configure extensions
    extensions = [
        'tables',
        'fenced_code',
        'nl2br',
        'sane_lists',
    ]
    
    extension_configs = {}
    
    if highlight:
        extensions.append('codehilite')
        extension_configs['codehilite'] = {
            'css_class': 'highlight',
            'linenums': False,
            'guess_lang': True
        }
    
    if toc:
        extensions.append('toc')
        extension_configs['toc'] = {'permalink': True}
    
    # Convert to HTML
    md = markdown.Markdown(extensions=extensions, extension_configs=extension_configs)
    html_content = md.convert(md_content)
    
    # Get highlight CSS
    highlight_css = ''
    if highlight:
        try:
            from pygments.formatters import HtmlFormatter
            highlight_css = f'<style>{HtmlFormatter().get_style_defs(".highlight")}</style>'
        except ImportError:
            pass
    
    # Load custom CSS
    css_content = ''
    if custom_css and Path(custom_css).exists():
        with open(custom_css, 'r') as f:
            css_content = f.read()
    
    # Build full HTML
    title = path.stem.replace('-', ' ').replace('_', ' ').title()
    full_html = HTML_TEMPLATE.format(
        title=title,
        content=html_content,
        highlight_css=highlight_css,
        custom_css=css_content
    )
    
    # Determine output path
    if not output_path:
        output_path = str(path.with_suffix(f'.{output_format}'))
    
    if output_format == 'html':
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(full_html)
        print(f"✓ Converted to HTML: {output_path}")
    
    elif output_format == 'pdf':
        try:
            from weasyprint import HTML
            HTML(string=full_html).write_pdf(output_path)
            print(f"✓ Converted to PDF: {output_path}")
        except ImportError:
            print("Error: weasyprint required for PDF. Install: pip install weasyprint", file=sys.stderr)
            sys.exit(1)
    
    return output_path


def main():
    parser = argparse.ArgumentParser(
        description="Convert Markdown to HTML or PDF",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s README.md --format html
  %(prog)s doc.md --format html --highlight --toc
  %(prog)s doc.md --format pdf --output doc.pdf
  %(prog)s doc.md --format html --css custom.css
        """
    )
    
    parser.add_argument('input', help='Input Markdown file')
    parser.add_argument('--format', '-f', default='html', choices=['html', 'pdf'],
                       help='Output format (default: html)')
    parser.add_argument('--output', '-o', help='Output file path')
    parser.add_argument('--highlight', action='store_true', default=True,
                       help='Enable syntax highlighting (default: True)')
    parser.add_argument('--no-highlight', action='store_true',
                       help='Disable syntax highlighting')
    parser.add_argument('--css', help='Custom CSS file')
    parser.add_argument('--toc', action='store_true', help='Generate table of contents')
    
    args = parser.parse_args()
    
    convert_markdown(
        input_path=args.input,
        output_format=args.format,
        output_path=args.output,
        highlight=not args.no_highlight,
        custom_css=args.css,
        toc=args.toc
    )


if __name__ == "__main__":
    main()
