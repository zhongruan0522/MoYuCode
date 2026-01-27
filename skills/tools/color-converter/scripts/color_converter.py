#!/usr/bin/env python3
"""
Color Converter Tool
Based on: https://github.com/vaab/colour

Usage:
    python color_converter.py "#FF5733"
    python color_converter.py "rgb(255,87,51)"
"""

import argparse
import colorsys
import re
import sys

def hex_to_rgb(hex_color):
    """Convert HEX to RGB."""
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))

def rgb_to_hex(r, g, b):
    """Convert RGB to HEX."""
    return f"#{r:02x}{g:02x}{b:02x}"

def rgb_to_hsl(r, g, b):
    """Convert RGB to HSL."""
    r, g, b = r/255, g/255, b/255
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    return (int(h*360), int(s*100), int(l*100))

def rgb_to_hsv(r, g, b):
    """Convert RGB to HSV."""
    r, g, b = r/255, g/255, b/255
    h, s, v = colorsys.rgb_to_hsv(r, g, b)
    return (int(h*360), int(s*100), int(v*100))

def parse_color(color_str):
    """Parse color string to RGB."""
    color_str = color_str.strip().lower()
    
    # HEX format
    if color_str.startswith('#'):
        return hex_to_rgb(color_str)
    
    # RGB format
    rgb_match = re.match(r'rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)', color_str)
    if rgb_match:
        return tuple(int(x) for x in rgb_match.groups())
    
    # Try as plain hex
    if re.match(r'^[0-9a-f]{6}$', color_str):
        return hex_to_rgb(color_str)
    
    return None

def generate_palette(rgb, palette_type='complementary'):
    """Generate color palette."""
    r, g, b = rgb
    h, s, v = colorsys.rgb_to_hsv(r/255, g/255, b/255)
    
    colors = []
    if palette_type == 'complementary':
        colors = [(h, s, v), ((h + 0.5) % 1, s, v)]
    elif palette_type == 'triadic':
        colors = [(h, s, v), ((h + 1/3) % 1, s, v), ((h + 2/3) % 1, s, v)]
    elif palette_type == 'analogous':
        colors = [((h - 1/12) % 1, s, v), (h, s, v), ((h + 1/12) % 1, s, v)]
    elif palette_type == 'split':
        colors = [(h, s, v), ((h + 5/12) % 1, s, v), ((h + 7/12) % 1, s, v)]
    
    result = []
    for h2, s2, v2 in colors:
        r2, g2, b2 = colorsys.hsv_to_rgb(h2, s2, v2)
        result.append((int(r2*255), int(g2*255), int(b2*255)))
    return result

def main():
    parser = argparse.ArgumentParser(description="Convert colors")
    parser.add_argument('color', nargs='?', help='Color to convert')
    parser.add_argument('--palette', '-p', choices=['complementary', 'triadic', 'analogous', 'split'])
    parser.add_argument('--list', '-l', action='store_true', help='List named colors')
    args = parser.parse_args()
    
    if args.list:
        print("Use HEX (#FF5733) or RGB (rgb(255,87,51)) format")
        return
    
    if not args.color:
        parser.error("Provide a color")
    
    rgb = parse_color(args.color)
    if not rgb:
        print(f"Error: Cannot parse color: {args.color}", file=sys.stderr)
        sys.exit(1)
    
    r, g, b = rgb
    hex_color = rgb_to_hex(r, g, b)
    hsl = rgb_to_hsl(r, g, b)
    hsv = rgb_to_hsv(r, g, b)
    
    print(f"HEX: {hex_color}")
    print(f"RGB: rgb({r}, {g}, {b})")
    print(f"HSL: hsl({hsl[0]}, {hsl[1]}%, {hsl[2]}%)")
    print(f"HSV: hsv({hsv[0]}, {hsv[1]}%, {hsv[2]}%)")
    
    if args.palette:
        palette = generate_palette(rgb, args.palette)
        print(f"\n{args.palette.title()} palette:")
        for c in palette:
            print(f"  {rgb_to_hex(*c)} - rgb{c}")

if __name__ == "__main__":
    main()
