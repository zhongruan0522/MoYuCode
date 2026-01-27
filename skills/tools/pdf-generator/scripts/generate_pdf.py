#!/usr/bin/env python3
"""
PDF Generator Tool
Generate PDF documents from Markdown, HTML, or plain text.

Usage:
    python generate_pdf.py --input "document.md" --output "document.pdf"
    python generate_pdf.py --input "report.html" --output "report.pdf" --format html
    python generate_pdf.py --input "text.txt" --output "text.pdf" --title "My Document"

Requirements:
    pip install markdown weasyprint
"""

import argparse
import sys
from pathlib import Path

try:
    import markdown
    from weasyprint import HTML, CSS
    WEASYPRINT_AVAILABLE = True
except ImportError:
    WEASYPRINT_AVAILABLE = False

try:
    from reportlab.lib.pagesizes import letter, A4, legal
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
    from reportlab.lib.enums import TA_JUSTIFY
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False


# Default CSS for PDF styling
DEFAULT_CSS = """
@page {
    size: A4;
    margin: 2cm;
}
body {
    font-family: 'Helvetica', 'Arial', sans-serif;
    font-size: 12pt;
    line-height: 1.6;
    color: #333;
}
h1 { font-size: 24pt; color: #1a1a1a; margin-top: 0; }
h2 { font-size: 18pt; color: #2a2a2a; }
h3 { font-size: 14pt; color: #3a3a3a; }
code {
    background: #f4f4f4;
    padding: 2px 6px;
    border-radius: 3px;
    font-family: 'Courier New', monospace;
}
pre {
    background: #f4f4f4;
    padding: 12px;
    border-radius: 5px;
    overflow-x: auto;
}
table {
    border-collapse: collapse;
    width: 100%;
    margin: 1em 0;
}
th, td {
    border: 1px solid #ddd;
    padding: 8px;
    text-align: left;
}
th { background: #f4f4f4; }
blockquote {
    border-left: 4px solid #ddd;
    margin: 1em 0;
    padding-left: 1em;
    color: #666;
}
"""


def markdown_to_html(md_content: str, title: str = None) -> str:
    """Convert Markdown to HTML with styling."""
    md = markdown.Markdown(extensions=[
        'tables',
        'fenced_code',
        'codehilite',
        'toc',
        'meta',
    ])
    html_body = md.convert(md_content)
    
    title_tag = f"<title>{title}</title>" if title else ""
    
    return f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    {title_tag}
    <style>{DEFAULT_CSS}</style>
</head>
<body>
    {f'<h1>{title}</h1>' if title else ''}
    {html_body}
</body>
</html>
"""


def generate_pdf_weasyprint(html_content: str, output_path: str, css: str = None):
    """Generate PDF using WeasyPrint (better quality)."""
    stylesheets = [CSS(string=DEFAULT_CSS)]
    if css:
        stylesheets.append(CSS(string=css))
    
    HTML(string=html_content).write_pdf(output_path, stylesheets=stylesheets)


def generate_pdf_reportlab(text_content: str, output_path: str, title: str = None, page_size: str = "A4"):
    """Generate PDF using ReportLab (fallback, no external deps)."""
    sizes = {"A4": A4, "letter": letter, "legal": legal}
    size = sizes.get(page_size, A4)
    
    doc = SimpleDocTemplate(
        output_path,
        pagesize=size,
        rightMargin=72,
        leftMargin=72,
        topMargin=72,
        bottomMargin=72
    )
    
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        name='Body',
        parent=styles['Normal'],
        fontSize=12,
        leading=18,
        alignment=TA_JUSTIFY,
    ))
    
    story = []
    
    if title:
        story.append(Paragraph(title, styles['Title']))
        story.append(Spacer(1, 0.5 * inch))
    
    # Split content into paragraphs
    paragraphs = text_content.split('\n\n')
    for para in paragraphs:
        if para.strip():
            # Handle headers
            if para.startswith('# '):
                story.append(Paragraph(para[2:], styles['Heading1']))
            elif para.startswith('## '):
                story.append(Paragraph(para[3:], styles['Heading2']))
            elif para.startswith('### '):
                story.append(Paragraph(para[4:], styles['Heading3']))
            else:
                story.append(Paragraph(para.replace('\n', '<br/>'), styles['Body']))
            story.append(Spacer(1, 0.2 * inch))
    
    doc.build(story)


def generate_pdf(
    input_path: str,
    output_path: str,
    format: str = "auto",
    title: str = None,
    author: str = None,
    page_size: str = "A4",
    css: str = None,
) -> bool:
    """
    Generate PDF from input file.
    
    Args:
        input_path: Path to input file (md, html, txt)
        output_path: Path for output PDF
        format: Input format (auto, markdown, html, text)
        title: Document title
        author: Document author
        page_size: Page size (A4, letter, legal)
        css: Additional CSS styling
    
    Returns:
        True if successful, False otherwise
    """
    input_file = Path(input_path)
    
    if not input_file.exists():
        print(f"Error: Input file not found: {input_path}", file=sys.stderr)
        return False
    
    # Read input content
    content = input_file.read_text(encoding="utf-8")
    
    # Auto-detect format
    if format == "auto":
        suffix = input_file.suffix.lower()
        if suffix in [".md", ".markdown"]:
            format = "markdown"
        elif suffix in [".html", ".htm"]:
            format = "html"
        else:
            format = "text"
    
    try:
        if WEASYPRINT_AVAILABLE:
            # Use WeasyPrint for better quality
            if format == "markdown":
                html_content = markdown_to_html(content, title)
            elif format == "html":
                html_content = content
            else:
                # Wrap text in HTML
                html_content = markdown_to_html(f"```\n{content}\n```", title)
            
            generate_pdf_weasyprint(html_content, output_path, css)
        
        elif REPORTLAB_AVAILABLE:
            # Fallback to ReportLab
            print("Note: Using ReportLab (install weasyprint for better quality)", file=sys.stderr)
            generate_pdf_reportlab(content, output_path, title, page_size)
        
        else:
            print("Error: No PDF library available. Install: pip install weasyprint", file=sys.stderr)
            return False
        
        print(f"✓ PDF generated: {output_path}")
        return True
    
    except Exception as e:
        print(f"Error generating PDF: {e}", file=sys.stderr)
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Generate PDF from Markdown, HTML, or text files",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --input document.md --output document.pdf
  %(prog)s --input report.html --output report.pdf --format html
  %(prog)s --input notes.txt --output notes.pdf --title "My Notes"
        """
    )
    
    parser.add_argument("--input", "-i", required=True, help="Input file path")
    parser.add_argument("--output", "-o", required=True, help="Output PDF path")
    parser.add_argument("--format", "-f", choices=["auto", "markdown", "html", "text"], 
                        default="auto", help="Input format (default: auto-detect)")
    parser.add_argument("--title", "-t", help="Document title")
    parser.add_argument("--author", "-a", help="Document author")
    parser.add_argument("--page-size", choices=["A4", "letter", "legal"], 
                        default="A4", help="Page size (default: A4)")
    parser.add_argument("--css", help="Additional CSS file for styling")
    
    args = parser.parse_args()
    
    # Load custom CSS if provided
    css = None
    if args.css and Path(args.css).exists():
        css = Path(args.css).read_text()
    
    success = generate_pdf(
        input_path=args.input,
        output_path=args.output,
        format=args.format,
        title=args.title,
        author=args.author,
        page_size=args.page_size,
        css=css,
    )
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
