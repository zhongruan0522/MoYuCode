#!/usr/bin/env python3
"""
Text to Speech Tool
Based on: https://github.com/pyttsx3/pyttsx3

Usage:
    python text_to_speech.py "Hello World"
    python text_to_speech.py "Hello" --output hello.mp3
"""

import argparse
import sys
from pathlib import Path

def text_to_speech(text, output=None, rate=150, voice_id=0, volume=1.0):
    """Convert text to speech."""
    try:
        import pyttsx3
    except ImportError:
        print("Error: pyttsx3 required. Install: pip install pyttsx3", file=sys.stderr)
        sys.exit(1)
    
    engine = pyttsx3.init()
    
    # Set properties
    engine.setProperty('rate', rate)
    engine.setProperty('volume', volume)
    
    # Set voice
    voices = engine.getProperty('voices')
    if voice_id < len(voices):
        engine.setProperty('voice', voices[voice_id].id)
    
    if output:
        engine.save_to_file(text, output)
        engine.runAndWait()
        print(f"✓ Audio saved to {output}")
    else:
        engine.say(text)
        engine.runAndWait()
        print("✓ Speech completed")

def list_voices():
    """List available voices."""
    try:
        import pyttsx3
        engine = pyttsx3.init()
        voices = engine.getProperty('voices')
        print("Available voices:")
        for i, voice in enumerate(voices):
            print(f"  {i}: {voice.name} ({voice.languages})")
    except ImportError:
        print("Error: pyttsx3 required", file=sys.stderr)

def main():
    parser = argparse.ArgumentParser(description="Text to speech")
    parser.add_argument('text', nargs='?', help='Text to speak')
    parser.add_argument('--file', '-f', help='Read from file')
    parser.add_argument('--output', '-o', help='Output audio file')
    parser.add_argument('--rate', '-r', type=int, default=150, help='Speech rate')
    parser.add_argument('--voice', '-v', type=int, default=0, help='Voice ID')
    parser.add_argument('--volume', type=float, default=1.0, help='Volume (0-1)')
    parser.add_argument('--list-voices', '-l', action='store_true')
    args = parser.parse_args()
    
    if args.list_voices:
        list_voices()
        return
    
    if args.file:
        with open(args.file, 'r', encoding='utf-8') as f:
            text = f.read()
    elif args.text:
        text = args.text
    else:
        parser.error("Provide text or --file")
    
    text_to_speech(text, args.output, args.rate, args.voice, args.volume)

if __name__ == "__main__":
    main()
