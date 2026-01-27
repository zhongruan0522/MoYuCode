#!/usr/bin/env python3
"""
Image Processor Tool
Resize, convert, watermark, and generate thumbnails for images.
Based on: https://github.com/python-pillow/Pillow

Usage:
    python process_image.py resize --input photo.jpg --output resized.jpg --width 800
    python process_image.py convert --input photo.png --output photo.webp
    python process_image.py watermark --input photo.jpg --output marked.jpg --text "© 2024"
    python process_image.py thumbnail --input photo.jpg --sizes 64,128,256

Requirements:
    pip install Pillow
"""

import argparse
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance
except ImportError:
    print("Error: Pillow is required. Install with: pip install Pillow", file=sys.stderr)
    sys.exit(1)


def resize_image(
    input_path: str,
    output_path: str,
    width: int = None,
    height: int = None,
    keep_aspect: bool = True,
    quality: int = 85,
) -> bool:
    """Resize an image to specified dimensions."""
    try:
        with Image.open(input_path) as img:
            original_width, original_height = img.size
            
            if keep_aspect:
                if width and not height:
                    ratio = width / original_width
                    height = int(original_height * ratio)
                elif height and not width:
                    ratio = height / original_height
                    width = int(original_width * ratio)
                elif width and height:
                    # Fit within bounds while keeping aspect ratio
                    ratio = min(width / original_width, height / original_height)
                    width = int(original_width * ratio)
                    height = int(original_height * ratio)
            
            if not width or not height:
                print("Error: Specify at least width or height", file=sys.stderr)
                return False
            
            resized = img.resize((width, height), Image.Resampling.LANCZOS)
            
            # Handle format-specific options
            save_kwargs = {}
            output_format = Path(output_path).suffix.lower()
            
            if output_format in ['.jpg', '.jpeg']:
                save_kwargs = {'quality': quality, 'optimize': True}
                if resized.mode in ('RGBA', 'P'):
                    resized = resized.convert('RGB')
            elif output_format == '.png':
                save_kwargs = {'optimize': True}
            elif output_format == '.webp':
                save_kwargs = {'quality': quality}
            
            resized.save(output_path, **save_kwargs)
            print(f"✓ Resized: {input_path} -> {output_path} ({width}x{height})")
            return True
    
    except Exception as e:
        print(f"Error resizing image: {e}", file=sys.stderr)
        return False


def convert_format(
    input_path: str,
    output_path: str,
    quality: int = 85,
) -> bool:
    """Convert image to different format."""
    try:
        with Image.open(input_path) as img:
            output_format = Path(output_path).suffix.lower()
            
            save_kwargs = {}
            
            if output_format in ['.jpg', '.jpeg']:
                save_kwargs = {'quality': quality, 'optimize': True}
                if img.mode in ('RGBA', 'P'):
                    img = img.convert('RGB')
            elif output_format == '.png':
                save_kwargs = {'optimize': True}
            elif output_format == '.webp':
                save_kwargs = {'quality': quality}
            elif output_format == '.gif':
                if img.mode != 'P':
                    img = img.convert('P', palette=Image.ADAPTIVE)
            
            img.save(output_path, **save_kwargs)
            print(f"✓ Converted: {input_path} -> {output_path}")
            return True
    
    except Exception as e:
        print(f"Error converting image: {e}", file=sys.stderr)
        return False


def add_watermark(
    input_path: str,
    output_path: str,
    text: str = None,
    image_path: str = None,
    position: str = "bottom-right",
    opacity: float = 0.5,
    font_size: int = 36,
) -> bool:
    """Add text or image watermark to an image."""
    try:
        with Image.open(input_path) as img:
            if img.mode != 'RGBA':
                img = img.convert('RGBA')
            
            if text:
                # Create text watermark
                txt_layer = Image.new('RGBA', img.size, (255, 255, 255, 0))
                draw = ImageDraw.Draw(txt_layer)
                
                try:
                    font = ImageFont.truetype("arial.ttf", font_size)
                except:
                    font = ImageFont.load_default()
                
                # Get text bounding box
                bbox = draw.textbbox((0, 0), text, font=font)
                text_width = bbox[2] - bbox[0]
                text_height = bbox[3] - bbox[1]
                
                # Calculate position
                padding = 20
                positions = {
                    "top-left": (padding, padding),
                    "top-right": (img.width - text_width - padding, padding),
                    "bottom-left": (padding, img.height - text_height - padding),
                    "bottom-right": (img.width - text_width - padding, img.height - text_height - padding),
                    "center": ((img.width - text_width) // 2, (img.height - text_height) // 2),
                }
                pos = positions.get(position, positions["bottom-right"])
                
                # Draw text with opacity
                alpha = int(255 * opacity)
                draw.text(pos, text, font=font, fill=(255, 255, 255, alpha))
                
                # Composite
                img = Image.alpha_composite(img, txt_layer)
            
            elif image_path:
                # Image watermark
                with Image.open(image_path) as watermark:
                    if watermark.mode != 'RGBA':
                        watermark = watermark.convert('RGBA')
                    
                    # Resize watermark to 20% of image width
                    wm_width = int(img.width * 0.2)
                    ratio = wm_width / watermark.width
                    wm_height = int(watermark.height * ratio)
                    watermark = watermark.resize((wm_width, wm_height), Image.Resampling.LANCZOS)
                    
                    # Apply opacity
                    if opacity < 1:
                        alpha = watermark.split()[3]
                        alpha = alpha.point(lambda p: int(p * opacity))
                        watermark.putalpha(alpha)
                    
                    # Calculate position
                    padding = 20
                    positions = {
                        "top-left": (padding, padding),
                        "top-right": (img.width - wm_width - padding, padding),
                        "bottom-left": (padding, img.height - wm_height - padding),
                        "bottom-right": (img.width - wm_width - padding, img.height - wm_height - padding),
                        "center": ((img.width - wm_width) // 2, (img.height - wm_height) // 2),
                    }
                    pos = positions.get(position, positions["bottom-right"])
                    
                    img.paste(watermark, pos, watermark)
            
            # Save
            output_format = Path(output_path).suffix.lower()
            if output_format in ['.jpg', '.jpeg']:
                img = img.convert('RGB')
            
            img.save(output_path)
            print(f"✓ Watermark added: {output_path}")
            return True
    
    except Exception as e:
        print(f"Error adding watermark: {e}", file=sys.stderr)
        return False


def generate_thumbnails(
    input_path: str,
    sizes: list[int],
    output_dir: str = None,
    quality: int = 85,
) -> bool:
    """Generate multiple thumbnail sizes."""
    try:
        input_file = Path(input_path)
        output_directory = Path(output_dir) if output_dir else input_file.parent
        output_directory.mkdir(parents=True, exist_ok=True)
        
        with Image.open(input_path) as img:
            for size in sizes:
                thumb = img.copy()
                thumb.thumbnail((size, size), Image.Resampling.LANCZOS)
                
                output_name = f"{input_file.stem}_thumb_{size}{input_file.suffix}"
                output_path = output_directory / output_name
                
                save_kwargs = {}
                if input_file.suffix.lower() in ['.jpg', '.jpeg']:
                    save_kwargs = {'quality': quality}
                    if thumb.mode in ('RGBA', 'P'):
                        thumb = thumb.convert('RGB')
                
                thumb.save(output_path, **save_kwargs)
                print(f"✓ Thumbnail: {output_path} ({thumb.width}x{thumb.height})")
        
        return True
    
    except Exception as e:
        print(f"Error generating thumbnails: {e}", file=sys.stderr)
        return False


def main():
    parser = argparse.ArgumentParser(description="Image processing tool")
    subparsers = parser.add_subparsers(dest="command", help="Commands")
    
    # Resize command
    resize_parser = subparsers.add_parser("resize", help="Resize an image")
    resize_parser.add_argument("--input", "-i", required=True, help="Input image path")
    resize_parser.add_argument("--output", "-o", required=True, help="Output image path")
    resize_parser.add_argument("--width", "-w", type=int, help="Target width")
    resize_parser.add_argument("--height", "-H", type=int, help="Target height")
    resize_parser.add_argument("--no-aspect", action="store_true", help="Don't preserve aspect ratio")
    resize_parser.add_argument("--quality", "-q", type=int, default=85, help="Output quality (1-100)")
    
    # Convert command
    convert_parser = subparsers.add_parser("convert", help="Convert image format")
    convert_parser.add_argument("--input", "-i", required=True, help="Input image path")
    convert_parser.add_argument("--output", "-o", required=True, help="Output image path")
    convert_parser.add_argument("--quality", "-q", type=int, default=85, help="Output quality (1-100)")
    
    # Watermark command
    watermark_parser = subparsers.add_parser("watermark", help="Add watermark to image")
    watermark_parser.add_argument("--input", "-i", required=True, help="Input image path")
    watermark_parser.add_argument("--output", "-o", required=True, help="Output image path")
    watermark_parser.add_argument("--text", "-t", help="Watermark text")
    watermark_parser.add_argument("--image", help="Watermark image path")
    watermark_parser.add_argument("--position", "-p", default="bottom-right",
                                  choices=["top-left", "top-right", "bottom-left", "bottom-right", "center"])
    watermark_parser.add_argument("--opacity", type=float, default=0.5, help="Watermark opacity (0-1)")
    watermark_parser.add_argument("--font-size", type=int, default=36, help="Font size for text watermark")
    
    # Thumbnail command
    thumb_parser = subparsers.add_parser("thumbnail", help="Generate thumbnails")
    thumb_parser.add_argument("--input", "-i", required=True, help="Input image path")
    thumb_parser.add_argument("--sizes", "-s", required=True, help="Comma-separated sizes (e.g., 64,128,256)")
    thumb_parser.add_argument("--output-dir", "-o", help="Output directory")
    thumb_parser.add_argument("--quality", "-q", type=int, default=85, help="Output quality (1-100)")
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        sys.exit(1)
    
    success = False
    
    if args.command == "resize":
        success = resize_image(
            args.input, args.output,
            width=args.width, height=args.height,
            keep_aspect=not args.no_aspect,
            quality=args.quality
        )
    elif args.command == "convert":
        success = convert_format(args.input, args.output, quality=args.quality)
    elif args.command == "watermark":
        if not args.text and not args.image:
            print("Error: Specify --text or --image for watermark", file=sys.stderr)
            sys.exit(1)
        success = add_watermark(
            args.input, args.output,
            text=args.text, image_path=args.image,
            position=args.position, opacity=args.opacity,
            font_size=args.font_size
        )
    elif args.command == "thumbnail":
        sizes = [int(s.strip()) for s in args.sizes.split(",")]
        success = generate_thumbnails(args.input, sizes, args.output_dir, args.quality)
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
