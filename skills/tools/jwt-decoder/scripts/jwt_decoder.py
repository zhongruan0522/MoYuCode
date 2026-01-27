#!/usr/bin/env python3
"""
JWT Decoder Tool
Based on: https://github.com/jpadilla/pyjwt

Usage:
    python jwt_decoder.py decode "eyJhbGciOiJIUzI1NiIs..."
    python jwt_decoder.py verify "eyJ..." --secret "secret"
"""

import argparse
import base64
import json
import sys
from datetime import datetime

def base64_decode(data):
    """Decode base64url."""
    padding = 4 - len(data) % 4
    if padding != 4:
        data += '=' * padding
    return base64.urlsafe_b64decode(data)

def decode_jwt(token, verify=False, secret=None):
    """Decode JWT token."""
    parts = token.split('.')
    if len(parts) != 3:
        return None, "Invalid JWT format"
    
    try:
        header = json.loads(base64_decode(parts[0]))
        payload = json.loads(base64_decode(parts[1]))
        
        # Check expiration
        if 'exp' in payload:
            exp_time = datetime.fromtimestamp(payload['exp'])
            payload['_exp_readable'] = exp_time.isoformat()
            payload['_expired'] = datetime.now() > exp_time
        
        if 'iat' in payload:
            payload['_iat_readable'] = datetime.fromtimestamp(payload['iat']).isoformat()
        
        if verify and secret:
            try:
                import jwt
                jwt.decode(token, secret, algorithms=[header.get('alg', 'HS256')])
                return {'header': header, 'payload': payload, 'valid': True}, None
            except jwt.InvalidTokenError as e:
                return {'header': header, 'payload': payload, 'valid': False, 'error': str(e)}, None
            except ImportError:
                return {'header': header, 'payload': payload}, "PyJWT not installed for verification"
        
        return {'header': header, 'payload': payload}, None
        
    except Exception as e:
        return None, str(e)

def generate_jwt(payload, secret, algorithm='HS256', exp_hours=24):
    """Generate JWT token."""
    try:
        import jwt
        from datetime import timedelta
        
        if exp_hours:
            payload['exp'] = datetime.utcnow() + timedelta(hours=exp_hours)
        payload['iat'] = datetime.utcnow()
        
        token = jwt.encode(payload, secret, algorithm=algorithm)
        return token, None
    except ImportError:
        return None, "PyJWT required: pip install pyjwt"

def main():
    parser = argparse.ArgumentParser(description="JWT token tools")
    subparsers = parser.add_subparsers(dest='command', required=True)
    
    # Decode
    p_dec = subparsers.add_parser('decode', help='Decode JWT')
    p_dec.add_argument('token', help='JWT token')
    
    # Verify
    p_ver = subparsers.add_parser('verify', help='Verify JWT')
    p_ver.add_argument('token', help='JWT token')
    p_ver.add_argument('--secret', '-s', required=True, help='Secret key')
    
    # Generate
    p_gen = subparsers.add_parser('generate', help='Generate JWT')
    p_gen.add_argument('--payload', '-p', required=True, help='JSON payload')
    p_gen.add_argument('--secret', '-s', required=True, help='Secret key')
    p_gen.add_argument('--algorithm', '-a', default='HS256')
    p_gen.add_argument('--exp', type=int, default=24, help='Expiration hours')
    
    args = parser.parse_args()
    
    if args.command == 'decode':
        result, error = decode_jwt(args.token)
        if error:
            print(f"Error: {error}", file=sys.stderr)
            sys.exit(1)
        print(json.dumps(result, indent=2))
    
    elif args.command == 'verify':
        result, error = decode_jwt(args.token, verify=True, secret=args.secret)
        if error:
            print(f"Warning: {error}")
        if result:
            print(json.dumps(result, indent=2))
            if result.get('valid'):
                print("\n✓ Token is valid")
            else:
                print(f"\n✗ Token invalid: {result.get('error')}")
    
    elif args.command == 'generate':
        payload = json.loads(args.payload)
        token, error = generate_jwt(payload, args.secret, args.algorithm, args.exp)
        if error:
            print(f"Error: {error}", file=sys.stderr)
            sys.exit(1)
        print(token)

if __name__ == "__main__":
    main()
