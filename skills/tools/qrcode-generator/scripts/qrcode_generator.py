#!/usr/bin/env python3
"""
QR Code Generator Tool
Generate QR codes with custom styling and logos.
Based on: https://github.com/lincolnloop/python-qrcode

Usage:
    python qrcode_generator.py --data "https://example.com" --output qr.png
    python qrcode_generator.py --data "Hello" --output qr.png --fill "#FF0000"
    python qrcode_generator.py --data "https://example.com" --output qr.png --logo logo.png

Requirements:
    pip install qrcode[pil] Pillow
"""

import argparse
import sys
from pathlib import Path

try:
    import qrcode
    from qrcode.image.styledpil import StyledPilImage
    from qrcode.image.styles.moduledrawers import RoundedModuleDrawer, CircleModuleDrawer
    from PIL import Image
except ImportError:
    print("Error: Required packages missing. Install: pip install qrcode[pil] Pillow", file=sys.stderr)
    sys.exit(1)


def generate_qrcode(
    data: str,
    output_path: str,
    size: int = 10,
    border: int = 4,
    fill_color: str = "black",
    back_color: str = "white",
    logo_path: str = None,
    style: str = "square",
    error_correction: str = "M",
) -> bool:
    """
    Generate a QR code image.
    
    Args:
        data: Data to encode in QR code
        output_path: Output image path
        size: Box size (pixels per module)
        border: Border size (modules)
        fill_color: QR code color
        back_color: Background color
        logo_path: Optional logo to embed in center
        style: Module style (square, rounded, circle)
        error_correction: Error correction level (L, M, Q, H)
    
    Returns:
        True if successful
    """
    try:
        # Error correction levels
        ec_levels = {
            'L': qrcode.constants.ERROR_CORRECT_L,  # 7%
            'M': qrcode.constants.ERROR_CORRECT_M,  # 15%
            'Q': qrcode.constants.ERROR_CORRECT_Q,  # 25%
            'H': qrcode.constants.ERROR_CORRECT_H,  # 30%
        }
        ec = ec_levels.get(error_correction.upper(), qrcode.constants.ERROR_CORRECT_M)
        
        # Use higher error correction if adding logo
        if logo_path:
            ec = qrcode.constants.ERROR_CORRECT_H
        
        # Create QR code
        qr = qrcode.QRCode(
            version=None,  # Auto-determine
            error_correction=ec,
            box_size=size,
            border=border,
        )
        qr.add_data(data)
        qr.make(fit=True)
        
        # Select module drawer style
        module_drawer = None
        if style == "rounded":
            module_drawer = RoundedModuleDrawer()
        elif style == "circle":
            module_drawer = CircleModuleDrawer()
        
        # Generate image
        if module_drawer:
            img = qr.make_image(
                image_factory=StyledPilImage,
                module_drawer=module_drawer,
                fill_color=fill_color,
                back_color=back_color,
            )
        else:
            img = qr.make_image(fill_color=fill_color, back_color=back_color)
        
        # Convert to PIL Image if needed
        if hasattr(img, 'get_image'):
            img = img.get_image()
        elif not isinstance(img, Image.Image):
            img = img.convert('RGB')
        
        # Add logo if provided
        if logo_path:
            logo_file = Path(logo_path)
            if logo_file.exists():
                img = _add_logo(img, logo_path)
            else:
                print(f"Warning: Logo not found: {logo_path}", file=sys.stderr)
        
        # Save
        img.save(output_path)
        print(f"✓ QR code generated: {output_path}")
        return True
    
    except Exception as e:
        print(f"Error generating QR code: {e}", file=sys.stderr)
        return False


def _add_logo(qr_img: Image.Image, logo_path: str, logo_size_ratio: float = 0.3) -> Image.Image:
    """Add a logo to the center of QR code."""
    # Open and resize logo
    logo = Image.open(logo_path)
    
    # Calculate logo size (30% of QR code)
    qr_width, qr_height = qr_img.size
    logo_max_size = int(min(qr_width, qr_height) * logo_size_ratio)
    
    # Resize logo maintaining aspect ratio
    logo.thumbnail((logo_max_size, logo_max_size), Image.Resampling.LANCZOS)
    
    # Calculate position (center)
    logo_width, logo_height = logo.size
    pos_x = (qr_width - logo_width) // 2
    pos_y = (qr_height - logo_height) // 2
    
    # Create white background for logo
    if qr_img.mode != 'RGBA':
        qr_img = qr_img.convert('RGBA')
    
    # Add white padding around logo
    padding = 5
    bg_size = (logo_width + padding * 2, logo_height + padding * 2)
    bg = Image.new('RGBA', bg_size, (255, 255, 255, 255))
    
    # Paste logo on background
    if logo.mode == 'RGBA':
        bg.paste(logo, (padding, padding), logo)
    else:
        bg.paste(logo, (padding, padding))
    
    # Paste on QR code
    qr_img.paste(bg, (pos_x - padding, pos_y - padding))
    
    return qr_img


def generate_batch(
    data_file: str,
    output_dir: str,
    **kwargs,
) -> bool:
    """Generate multiple QR codes from a file."""
    data_path = Path(data_file)
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    if not data_path.exists():
        print(f"Error: Data file not found: {data_file}", file=sys.stderr)
        return False
    
    lines = data_path.read_text().strip().split('\n')
    success_count = 0
    
    for i, line in enumerate(lines, 1):
        if not line.strip():
            continue
        
        output_file = output_path / f"qr_{i:04d}.png"
        if generate_qrcode(line.strip(), str(output_file), **kwargs):
            success_count += 1
    
    print(f"\n✓ Generated {success_count}/{len(lines)} QR codes in {output_dir}")
    return success_count > 0


def main():
    parser = argparse.ArgumentParser(
        description="Generate QR codes",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --data "https://example.com" --output qr.png
  %(prog)s --data "Hello World" --output qr.png --fill "#FF0000" --style rounded
  %(prog)s --data "https://example.com" --output qr.png --logo logo.png
  %(prog)s --batch urls.txt --output-dir qrcodes/
        """
    )
    
    parser.add_argument("--data", "-d", help="Data to encode")
    parser.add_argument("--batch", "-b", help="File with data (one per line)")
    parser.add_argument("--output", "-o", help="Output image path")
    parser.add_argument("--output-dir", help="Output directory for batch mode")
    parser.add_argument("--size", "-s", type=int, default=10, help="Box size (default: 10)")
    parser.add_argument("--border", type=int, default=4, help="Border size (default: 4)")
    parser.add_argument("--fill", "--fill-color", default="black", help="QR code color")
    parser.add_argument("--back", "--back-color", default="white", help="Background color")
    parser.add_argument("--logo", "-l", help="Logo image to embed")
    parser.add_argument("--style", choices=["square", "rounded", "circle"], default="square",
                        help="Module style")
    parser.add_argument("--error-correction", "-e", choices=["L", "M", "Q", "H"], default="M",
                        help="Error correction level")
    
    args = parser.parse_args()
    
    if args.batch:
        if not args.output_dir:
            args.output_dir = "qrcodes"
        success = generate_batch(
            args.batch, args.output_dir,
            size=args.size, border=args.border,
            fill_color=args.fill, back_color=args.back,
            logo_path=args.logo, style=args.style,
            error_correction=args.error_correction,
        )
    elif args.data:
        if not args.output:
            args.output = "qrcode.png"
        success = generate_qrcode(
            args.data, args.output,
            size=args.size, border=args.border,
            fill_color=args.fill, back_color=args.back,
            logo_path=args.logo, style=args.style,
            error_correction=args.error_correction,
        )
    else:
        parser.error("Either --data or --batch is required")
        success = False
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
