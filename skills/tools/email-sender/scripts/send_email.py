#!/usr/bin/env python3
"""
Email Sender Tool
Send emails via SMTP with support for HTML content and attachments.
Based on: https://github.com/nodemailer/nodemailer

Usage:
    python send_email.py --to "user@example.com" --subject "Hello" --body "Message"
    python send_email.py --to "user@example.com" --subject "Report" --attachment "file.pdf"
    python send_email.py --to "user@example.com,user2@example.com" --subject "Newsletter" --html "template.html"

Environment Variables:
    SMTP_HOST: SMTP server host (default: smtp.gmail.com)
    SMTP_PORT: SMTP server port (default: 587)
    SMTP_USER: SMTP username/email
    SMTP_PASS: SMTP password or app password
    SMTP_FROM: Sender email address
"""

import argparse
import os
import smtplib
import sys
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
from pathlib import Path


def get_env(key: str, default: str = None) -> str:
    """Get environment variable or raise error if required."""
    value = os.environ.get(key, default)
    if value is None:
        print(f"Error: Environment variable {key} is required", file=sys.stderr)
        sys.exit(1)
    return value


def send_email(
    to: list[str],
    subject: str,
    body: str = None,
    html: str = None,
    attachments: list[str] = None,
    cc: list[str] = None,
    bcc: list[str] = None,
) -> bool:
    """
    Send an email via SMTP.
    
    Args:
        to: List of recipient email addresses
        subject: Email subject
        body: Plain text body (optional if html provided)
        html: HTML body content or path to HTML file
        attachments: List of file paths to attach
        cc: List of CC recipients
        bcc: List of BCC recipients
    
    Returns:
        True if email sent successfully, False otherwise
    """
    # Get SMTP configuration from environment
    smtp_host = get_env("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(get_env("SMTP_PORT", "587"))
    smtp_user = get_env("SMTP_USER")
    smtp_pass = get_env("SMTP_PASS")
    smtp_from = get_env("SMTP_FROM", smtp_user)
    
    # Create message
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = smtp_from
    msg["To"] = ", ".join(to)
    
    if cc:
        msg["Cc"] = ", ".join(cc)
    
    # Add body
    if body:
        msg.attach(MIMEText(body, "plain", "utf-8"))
    
    # Add HTML content
    if html:
        # Check if html is a file path
        if Path(html).exists():
            with open(html, "r", encoding="utf-8") as f:
                html_content = f.read()
        else:
            html_content = html
        msg.attach(MIMEText(html_content, "html", "utf-8"))
    
    # Add attachments
    if attachments:
        for filepath in attachments:
            path = Path(filepath)
            if not path.exists():
                print(f"Warning: Attachment not found: {filepath}", file=sys.stderr)
                continue
            
            with open(path, "rb") as f:
                part = MIMEBase("application", "octet-stream")
                part.set_payload(f.read())
            
            encoders.encode_base64(part)
            part.add_header(
                "Content-Disposition",
                f"attachment; filename={path.name}"
            )
            msg.attach(part)
    
    # Build recipient list
    all_recipients = list(to)
    if cc:
        all_recipients.extend(cc)
    if bcc:
        all_recipients.extend(bcc)
    
    # Send email
    try:
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_from, all_recipients, msg.as_string())
        
        print(f"✓ Email sent successfully to {', '.join(to)}")
        return True
    
    except smtplib.SMTPAuthenticationError:
        print("Error: SMTP authentication failed. Check credentials.", file=sys.stderr)
        return False
    except smtplib.SMTPException as e:
        print(f"Error: Failed to send email: {e}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Send emails via SMTP",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --to "user@example.com" --subject "Hello" --body "Hi there!"
  %(prog)s --to "a@example.com,b@example.com" --subject "Report" --attachment "report.pdf"
  %(prog)s --to "user@example.com" --subject "Newsletter" --html "newsletter.html"
        """
    )
    
    parser.add_argument("--to", required=True, help="Recipient email(s), comma-separated")
    parser.add_argument("--subject", required=True, help="Email subject")
    parser.add_argument("--body", help="Plain text body")
    parser.add_argument("--html", help="HTML content or path to HTML file")
    parser.add_argument("--attachment", action="append", help="File to attach (can be used multiple times)")
    parser.add_argument("--cc", help="CC recipients, comma-separated")
    parser.add_argument("--bcc", help="BCC recipients, comma-separated")
    
    args = parser.parse_args()
    
    # Validate: need either body or html
    if not args.body and not args.html:
        parser.error("Either --body or --html is required")
    
    # Parse recipients
    to = [email.strip() for email in args.to.split(",")]
    cc = [email.strip() for email in args.cc.split(",")] if args.cc else None
    bcc = [email.strip() for email in args.bcc.split(",")] if args.bcc else None
    
    # Send email
    success = send_email(
        to=to,
        subject=args.subject,
        body=args.body,
        html=args.html,
        attachments=args.attachment,
        cc=cc,
        bcc=bcc,
    )
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
