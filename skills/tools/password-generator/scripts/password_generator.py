#!/usr/bin/env python3
"""
Password Generator Tool
Generate secure passwords and passphrases.
Based on Python's secrets module: https://github.com/python/cpython

Usage:
    python password_generator.py --length 16
    python password_generator.py --passphrase --words 4
    python password_generator.py --count 5 --length 12
    python password_generator.py --pin --length 6
"""

import argparse
import math
import secrets
import string
import sys


# Common word list for passphrases (EFF short wordlist subset)
WORDLIST = [
    "acid", "acorn", "acre", "acts", "afar", "affix", "aged", "agent", "agile", "aging",
    "agony", "ahead", "aide", "aids", "aim", "ajar", "alarm", "album", "alert", "alike",
    "alive", "alley", "allot", "allow", "alloy", "aloft", "alone", "along", "alpha", "alps",
    "altar", "alter", "amaze", "amber", "amend", "amino", "ample", "amuse", "angel", "anger",
    "angle", "angry", "ankle", "annex", "antic", "anvil", "apart", "apex", "apple", "apply",
    "apron", "aqua", "arbor", "arena", "argue", "arise", "armor", "army", "aroma", "array",
    "arrow", "arson", "artsy", "ascot", "ashen", "aside", "asked", "asset", "atlas", "atom",
    "attic", "audio", "audit", "avert", "avoid", "await", "awake", "award", "aware", "awful",
    "awoke", "axial", "axis", "axle", "azure", "bacon", "badge", "badly", "bagel", "baggy",
    "baker", "balmy", "banjo", "barge", "baron", "basic", "basin", "batch", "bath", "baton",
    "beach", "beads", "beak", "beam", "beard", "beast", "beat", "beech", "beefy", "beep",
    "begin", "begun", "being", "belly", "below", "bench", "beret", "berry", "bike", "bingo",
    "biome", "birch", "bird", "birth", "bison", "black", "blade", "blame", "blank", "blast",
    "blaze", "bleak", "bleed", "blend", "bless", "blimp", "blind", "blink", "bliss", "blitz",
    "block", "blond", "blood", "bloom", "blown", "blues", "bluff", "blunt", "blur", "blurt",
    "blush", "board", "boast", "boat", "body", "bogus", "boil", "bold", "bolt", "bomb",
    "bond", "bone", "bonus", "book", "booth", "boots", "booze", "bore", "born", "boss",
    "botch", "both", "bough", "bound", "bow", "bowl", "boxer", "brace", "brain", "brake",
    "brand", "brass", "brave", "bravo", "bread", "break", "breed", "brew", "brick", "bride",
    "brief", "brim", "bring", "brink", "brisk", "broad", "broil", "broke", "brook", "broom",
]


def calculate_entropy(password: str, charset_size: int) -> float:
    """Calculate password entropy in bits."""
    return len(password) * math.log2(charset_size)


def generate_password(
    length: int = 16,
    uppercase: bool = True,
    lowercase: bool = True,
    digits: bool = True,
    symbols: bool = True,
    exclude: str = '',
    require_all: bool = True
) -> str:
    """Generate a random password."""
    charset = ''
    required_chars = []
    
    if uppercase:
        chars = string.ascii_uppercase
        for c in exclude:
            chars = chars.replace(c, '')
        charset += chars
        if require_all and chars:
            required_chars.append(secrets.choice(chars))
    
    if lowercase:
        chars = string.ascii_lowercase
        for c in exclude:
            chars = chars.replace(c, '')
        charset += chars
        if require_all and chars:
            required_chars.append(secrets.choice(chars))
    
    if digits:
        chars = string.digits
        for c in exclude:
            chars = chars.replace(c, '')
        charset += chars
        if require_all and chars:
            required_chars.append(secrets.choice(chars))
    
    if symbols:
        chars = '!@#$%^&*()_+-=[]{}|;:,.<>?'
        for c in exclude:
            chars = chars.replace(c, '')
        charset += chars
        if require_all and chars:
            required_chars.append(secrets.choice(chars))
    
    if not charset:
        print("Error: No characters available for password generation", file=sys.stderr)
        sys.exit(1)
    
    # Generate remaining characters
    remaining_length = length - len(required_chars)
    if remaining_length < 0:
        remaining_length = 0
        required_chars = required_chars[:length]
    
    password_chars = required_chars + [secrets.choice(charset) for _ in range(remaining_length)]
    
    # Shuffle the password
    password_list = list(password_chars)
    secrets.SystemRandom().shuffle(password_list)
    
    return ''.join(password_list)


def generate_passphrase(words: int = 4, separator: str = '-', capitalize: bool = False) -> str:
    """Generate a random passphrase."""
    selected_words = [secrets.choice(WORDLIST) for _ in range(words)]
    
    if capitalize:
        selected_words = [w.capitalize() for w in selected_words]
    
    return separator.join(selected_words)


def generate_pin(length: int = 6) -> str:
    """Generate a numeric PIN."""
    return ''.join(secrets.choice(string.digits) for _ in range(length))


def main():
    parser = argparse.ArgumentParser(
        description="Generate secure passwords and passphrases",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --length 16
  %(prog)s --passphrase --words 4
  %(prog)s --count 5 --length 12
  %(prog)s --pin --length 6
  %(prog)s --length 20 --no-symbols
        """
    )
    
    parser.add_argument('--length', '-l', type=int, default=16, help='Password length (default: 16)')
    parser.add_argument('--count', '-c', type=int, default=1, help='Number of passwords to generate')
    
    # Character set options
    parser.add_argument('--uppercase', '-U', action='store_true', default=None, help='Include uppercase')
    parser.add_argument('--no-uppercase', action='store_true', help='Exclude uppercase')
    parser.add_argument('--lowercase', '-L', action='store_true', default=None, help='Include lowercase')
    parser.add_argument('--no-lowercase', action='store_true', help='Exclude lowercase')
    parser.add_argument('--digits', '-D', action='store_true', default=None, help='Include digits')
    parser.add_argument('--no-digits', action='store_true', help='Exclude digits')
    parser.add_argument('--symbols', '-S', action='store_true', default=None, help='Include symbols')
    parser.add_argument('--no-symbols', action='store_true', help='Exclude symbols')
    parser.add_argument('--exclude', '-e', default='', help='Characters to exclude')
    
    # Special modes
    parser.add_argument('--passphrase', '-p', action='store_true', help='Generate passphrase')
    parser.add_argument('--words', '-w', type=int, default=4, help='Number of words in passphrase')
    parser.add_argument('--separator', default='-', help='Word separator for passphrase')
    parser.add_argument('--capitalize', action='store_true', help='Capitalize passphrase words')
    parser.add_argument('--pin', action='store_true', help='Generate numeric PIN')
    
    parser.add_argument('--show-entropy', action='store_true', help='Show entropy calculation')
    
    args = parser.parse_args()
    
    for i in range(args.count):
        if args.passphrase:
            password = generate_passphrase(args.words, args.separator, args.capitalize)
            charset_size = len(WORDLIST)
            entropy = args.words * math.log2(charset_size)
        elif args.pin:
            password = generate_pin(args.length)
            charset_size = 10
            entropy = calculate_entropy(password, charset_size)
        else:
            # Determine character sets
            use_upper = not args.no_uppercase if args.uppercase is None else args.uppercase
            use_lower = not args.no_lowercase if args.lowercase is None else args.lowercase
            use_digits = not args.no_digits if args.digits is None else args.digits
            use_symbols = not args.no_symbols if args.symbols is None else args.symbols
            
            # Default: use all if none specified
            if not any([args.uppercase, args.lowercase, args.digits, args.symbols]):
                use_upper = not args.no_uppercase
                use_lower = not args.no_lowercase
                use_digits = not args.no_digits
                use_symbols = not args.no_symbols
            
            password = generate_password(
                length=args.length,
                uppercase=use_upper,
                lowercase=use_lower,
                digits=use_digits,
                symbols=use_symbols,
                exclude=args.exclude
            )
            
            # Calculate charset size for entropy
            charset_size = 0
            if use_upper:
                charset_size += 26
            if use_lower:
                charset_size += 26
            if use_digits:
                charset_size += 10
            if use_symbols:
                charset_size += 26
            
            entropy = calculate_entropy(password, charset_size) if charset_size > 0 else 0
        
        print(password)
        
        if args.show_entropy:
            strength = "Weak" if entropy < 40 else "Fair" if entropy < 60 else "Strong" if entropy < 80 else "Very Strong"
            print(f"  Entropy: {entropy:.1f} bits ({strength})")
    
    if args.count == 1 and not args.show_entropy:
        print(f"\n✓ Password generated (length: {len(password)})")


if __name__ == "__main__":
    main()
