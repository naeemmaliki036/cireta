"""Email Service — sends transactional emails via Resend.

Loads templates from DB (admin-editable). Falls back to built-in defaults.
In dev mode without RESEND_API_KEY, logs emails instead of sending.
"""

import logging
import re

import resend

from packages.common.core.config import settings

logger = logging.getLogger(__name__)

_STYLE_WRAP = (
    '<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:40px 20px">'
)
_STYLE_FOOTER = (
    '<hr style="border:none;border-top:1px solid #eee;margin:32px 0">'
    '<p style="color:#aaa;font-size:12px">Cireta — Regulated Commodity Tokenization</p></div>'
)
_STYLE_BTN = (
    'display:inline-block;background:#111;color:#fff;padding:12px 24px;'
    'border-radius:8px;text-decoration:none;font-weight:600'
)
_STYLE_BOX = 'background:#f8f9fa;border-radius:12px;padding:20px;margin:24px 0'

DEFAULT_TEMPLATES: dict[str, dict[str, str]] = {
    "otp_code": {
        "subject": "Your Cireta verification code: {{code}}",
        "html_body": (
            '<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:40px 20px">'
            '<h2 style="color:#111">Your verification code</h2>'
            '<p style="color:#555;margin-bottom:24px">Enter this code to continue:</p>'
            '<div style="background:#f5f5f5;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">'
            '<span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#111">{{code}}</span></div>'
            '<p style="color:#888;font-size:13px">This code expires in 5 minutes.</p>'
            '<hr style="border:none;border-top:1px solid #eee;margin:24px 0">'
            '<p style="color:#aaa;font-size:12px">Cireta</p></div>'
        ),
        "description": "OTP code for login, register, email verification",
    },
    "welcome": {
        "subject": "Welcome to Cireta, {{display_name}}!",
        "html_body": (
            f'{_STYLE_WRAP}'
            '<h1 style="color:#111">Welcome to Cireta</h1>'
            '<p style="color:#555">Hi {{display_name}},</p>'
            '<p style="color:#555">Your email is verified and your account is ready.</p>'
            f'<div style="{_STYLE_BOX}">'
            '<h3 style="color:#111;margin-top:0">Next Steps</h3>'
            '<ol style="color:#555;padding-left:20px">'
            '<li style="margin-bottom:8px"><strong>Complete KYC</strong> — 5-10 min, required before investing.</li>'
            '<li style="margin-bottom:8px"><strong>Connect wallet</strong> — Link your crypto wallet (optional).</li>'
            '<li style="margin-bottom:8px"><strong>Browse assets</strong> — Gold, copper, infrastructure.</li>'
            '</ol></div>'
            f'<a href="{{{{frontend_url}}}}" style="{_STYLE_BTN}">Browse Assets</a>'
            f'{_STYLE_FOOTER}'
        ),
        "description": "Welcome email after email verification",
    },
    "investment_confirmation": {
        "subject": "Investment confirmed — {{token_name}}",
        "html_body": (
            f'{_STYLE_WRAP}'
            '<h2 style="color:#111">Investment Confirmed</h2>'
            '<p style="color:#555">Hi {{display_name}}, your investment has been recorded:</p>'
            f'<div style="{_STYLE_BOX}">'
            '<table style="width:100%;color:#555;font-size:14px">'
            '<tr><td style="padding:6px 0;color:#888">Asset</td><td style="text-align:right;font-weight:600">{{token_name}}</td></tr>'
            '<tr><td style="padding:6px 0;color:#888">Amount</td><td style="text-align:right;font-weight:600">{{amount}} {{payment_method}}</td></tr>'
            '<tr><td style="padding:6px 0;color:#888">Tokens</td><td style="text-align:right;font-weight:600">{{tokens_allocated}}</td></tr>'
            '<tr><td style="padding:6px 0;color:#888">Reference</td><td style="text-align:right;font-weight:600;font-family:monospace;font-size:12px;word-break:break-all">{{tx_reference}}</td></tr>'
            '</table></div>'
            f'<a href="{{{{tx_url}}}}" style="{_STYLE_BTN};margin-right:8px">View Transaction</a>'
            f'<a href="{{{{frontend_url}}}}/portfolio" style="{_STYLE_BTN}">View Portfolio</a>'
            f'{_STYLE_FOOTER}'
        ),
        "description": "Sent after successful investment (USDC or OTC)",
    },
    "kyc_approved": {
        "subject": "KYC approved — You're ready to invest",
        "html_body": (
            f'{_STYLE_WRAP}'
            '<h2 style="color:#111">Identity Verified</h2>'
            '<p style="color:#555">Hi {{display_name}}, your identity verification is complete. You can now invest.</p>'
            f'<a href="{{{{frontend_url}}}}" style="{_STYLE_BTN};margin-top:16px">Browse Assets</a>'
            f'{_STYLE_FOOTER}'
        ),
        "description": "Sent when KYC approved",
    },
    "kyc_rejected": {
        "subject": "KYC verification update",
        "html_body": (
            f'{_STYLE_WRAP}'
            '<h2 style="color:#111">Verification Update</h2>'
            '<p style="color:#555">Hi {{display_name}}, we could not verify your identity. '
            'Please try again or contact support@cireta.com.</p>'
            f'{_STYLE_FOOTER}'
        ),
        "description": "Sent when KYC rejected",
    },
    "kyb_approved": {
        "subject": "Business verification approved — {{company_name}}",
        "html_body": (
            f'{_STYLE_WRAP}'
            '<h2 style="color:#111">Business Verified</h2>'
            '<p style="color:#555">Hi {{display_name}}, the business verification for '
            '<strong>{{company_name}}</strong> is complete. Your corporate account is now '
            'approved for investing.</p>'
            f'<a href="{{{{frontend_url}}}}" style="{_STYLE_BTN};margin-top:16px">Browse Assets</a>'
            f'{_STYLE_FOOTER}'
        ),
        "description": "Sent when corporate KYB approved",
    },
    "kyb_rejected": {
        "subject": "Business verification update — {{company_name}}",
        "html_body": (
            f'{_STYLE_WRAP}'
            '<h2 style="color:#111">Verification Update</h2>'
            '<p style="color:#555">Hi {{display_name}}, we could not verify '
            '<strong>{{company_name}}</strong>. Please review the submitted documents and try '
            'again, or contact support@cireta.com for assistance.</p>'
            f'{_STYLE_FOOTER}'
        ),
        "description": "Sent when corporate KYB rejected",
    },
    "issuer_approved": {
        "subject": "Your issuer account is now active",
        "html_body": (
            f'{_STYLE_WRAP}'
            '<h2 style="color:#111">Issuer Account Activated</h2>'
            '<p style="color:#555">Hi {{display_name}}, your issuer account is approved. '
            'Create tokens and launch sales.</p>'
            f'<a href="{{{{admin_url}}}}/issuer/sales/new" style="{_STYLE_BTN};margin-top:16px">'
            'Create Your First Sale</a>'
            f'{_STYLE_FOOTER}'
        ),
        "description": "Sent when issuer activated by admin",
    },
    "sale_finalized_success": {
        "subject": "The {{token_name}} sale is complete",
        "html_body": (
            f'{_STYLE_WRAP}'
            '<h2 style="color:#111">Sale Complete</h2>'
            '<p style="color:#555">Hi {{display_name}}, the <strong>{{token_name}}</strong> sale '
            'has finalized successfully. Your tokens are ready to claim.</p>'
            f'<a href="{{{{frontend_url}}}}/portfolio" style="{_STYLE_BTN};margin-top:16px">Claim Tokens</a>'
            f'{_STYLE_FOOTER}'
        ),
        "description": "Sent to investors when a sale finalizes successfully",
    },
    "sale_finalized_failed": {
        "subject": "The {{token_name}} sale did not reach target",
        "html_body": (
            f'{_STYLE_WRAP}'
            '<h2 style="color:#111">Sale Did Not Reach Target</h2>'
            '<p style="color:#555">Hi {{display_name}}, the <strong>{{token_name}}</strong> sale '
            'did not meet its funding goal. Your refund is available.</p>'
            f'<a href="{{{{frontend_url}}}}/portfolio" style="{_STYLE_BTN};margin-top:16px">Claim Refund</a>'
            f'{_STYLE_FOOTER}'
        ),
        "description": "Sent to investors when a sale fails to reach target",
    },
    "redemption_fulfilled": {
        "subject": "Your {{token_symbol}} redemption is fulfilled",
        "html_body": (
            f'{_STYLE_WRAP}'
            '<h2 style="color:#111">Redemption Fulfilled</h2>'
            '<p style="color:#555">Hi {{display_name}}, your redemption request for '
            '<strong>{{token_symbol}}</strong> has been processed and fulfilled.</p>'
            f'<a href="{{{{frontend_url}}}}/portfolio" style="{_STYLE_BTN};margin-top:16px">View Portfolio</a>'
            f'{_STYLE_FOOTER}'
        ),
        "description": "Sent when a token redemption is fulfilled",
    },
    "kyc_expiry_warning": {
        "subject": "Your KYC verification expires in {{days_left}} days",
        "html_body": (
            f'{_STYLE_WRAP}'
            '<h2 style="color:#111">KYC Expiry Reminder</h2>'
            '<p style="color:#555">Hi {{display_name}}, your identity verification expires in '
            '<strong>{{days_left}} days</strong>. Please re-verify to maintain your investment access.</p>'
            f'<a href="{{{{frontend_url}}}}/kyc" style="{_STYLE_BTN};margin-top:16px">Re-verify Now</a>'
            f'{_STYLE_FOOTER}'
        ),
        "description": "Sent when KYC is approaching expiry",
    },
    "wallet_linked": {
        "subject": "New wallet linked to your Cireta account",
        "html_body": (
            f'{_STYLE_WRAP}'
            '<h2 style="color:#111">Wallet Linked</h2>'
            '<p style="color:#555">Hi {{display_name}}, a new wallet has been linked to your account:</p>'
            f'<div style="{_STYLE_BOX}">'
            '<p style="font-family:monospace;font-size:14px;color:#333;word-break:break-all;margin:0">'
            '{{wallet_address}}</p></div>'
            '<p style="color:#888;font-size:13px">If you did not do this, please contact support@cireta.com immediately.</p>'
            f'{_STYLE_FOOTER}'
        ),
        "description": "Sent when a new wallet is linked to user account",
    },
    "tokens_claimed": {
        "subject": "You've claimed {{tokens_amount}} {{token_symbol}}",
        "html_body": (
            f'{_STYLE_WRAP}'
            '<h2 style="color:#111">Tokens Claimed</h2>'
            '<p style="color:#555">Hi {{display_name}}, you have successfully claimed '
            '<strong>{{tokens_amount}} {{token_symbol}}</strong>.</p>'
            f'<a href="{{{{frontend_url}}}}/portfolio" style="{_STYLE_BTN};margin-top:16px">View Portfolio</a>'
            f'{_STYLE_FOOTER}'
        ),
        "description": "Sent when investor claims tokens after a sale",
    },
    "refund_claimed": {
        "subject": "Your refund of {{amount}} USDC has been processed",
        "html_body": (
            f'{_STYLE_WRAP}'
            '<h2 style="color:#111">Refund Processed</h2>'
            '<p style="color:#555">Hi {{display_name}}, your refund of '
            '<strong>{{amount}} USDC</strong> has been processed and sent to your wallet.</p>'
            f'<a href="{{{{frontend_url}}}}/portfolio" style="{_STYLE_BTN};margin-top:16px">View Portfolio</a>'
            f'{_STYLE_FOOTER}'
        ),
        "description": "Sent when investor claims a refund from a failed sale",
    },
    "dividend_available": {
        "subject": "New dividend available for {{token_symbol}}",
        "html_body": (
            f'{_STYLE_WRAP}'
            '<h2 style="color:#111">Dividend Available</h2>'
            '<p style="color:#555">Hi {{display_name}}, a new dividend distribution is available for '
            '<strong>{{token_symbol}}</strong>.</p>'
            f'<div style="{_STYLE_BOX}">'
            '<table style="width:100%;color:#555;font-size:14px">'
            '<tr><td style="padding:6px 0;color:#888">Token</td>'
            '<td style="text-align:right;font-weight:600">{{token_symbol}}</td></tr>'
            '<tr><td style="padding:6px 0;color:#888">Amount</td>'
            '<td style="text-align:right;font-weight:600">{{dividend_amount}} USDC</td></tr>'
            '</table></div>'
            f'<a href="{{{{frontend_url}}}}/portfolio" style="{_STYLE_BTN};margin-top:16px">Claim Dividend</a>'
            f'{_STYLE_FOOTER}'
        ),
        "description": "Sent when a dividend distribution is available",
    },
    "issuer_approval_request": {
        "subject": "New issuer application: {{issuer_name}}",
        "html_body": (
            f'{_STYLE_WRAP}'
            '<h2 style="color:#111">New Issuer Application</h2>'
            '<p style="color:#555">A new issuer has applied for approval:</p>'
            f'<div style="{_STYLE_BOX}">'
            '<table style="width:100%;color:#555;font-size:14px">'
            '<tr><td style="padding:6px 0;color:#888">Name</td>'
            '<td style="text-align:right;font-weight:600">{{issuer_name}}</td></tr>'
            '<tr><td style="padding:6px 0;color:#888">Email</td>'
            '<td style="text-align:right;font-weight:600">{{issuer_email}}</td></tr>'
            '</table></div>'
            f'<a href="{{{{admin_url}}}}/issuers" style="{_STYLE_BTN};margin-top:16px">Review Application</a>'
            f'{_STYLE_FOOTER}'
        ),
        "description": "Sent to admin when a new issuer applies",
    },
    "user_error_report": {
        "subject": "User error report — {{function_name}}",
        "html_body": (
            f'{_STYLE_WRAP}'
            '<h2 style="color:#111">User Error Report</h2>'
            '<p style="color:#555">A user reported an error on the platform. Please investigate.</p>'
            f'<div style="{_STYLE_BOX}">'
            '<table style="width:100%;color:#555;font-size:13px">'
            '<tr><td style="padding:6px 0;color:#888;width:140px">User</td><td style="font-weight:600">{{user_email}}</td></tr>'
            '<tr><td style="padding:6px 0;color:#888">Wallet</td><td style="font-family:monospace;font-size:12px">{{wallet_address}}</td></tr>'
            '<tr><td style="padding:6px 0;color:#888">Page</td><td style="font-family:monospace;font-size:12px;word-break:break-all">{{page_url}}</td></tr>'
            '<tr><td style="padding:6px 0;color:#888">Function</td><td style="font-weight:600">{{function_name}}</td></tr>'
            '<tr><td style="padding:6px 0;color:#888">Tx hash</td><td style="font-family:monospace;font-size:12px;word-break:break-all">{{tx_hash}}</td></tr>'
            '<tr><td style="padding:6px 0;color:#888">Tx link</td><td><a href="{{tx_url}}" style="color:#13636F">{{tx_url}}</a></td></tr>'
            '<tr><td style="padding:6px 0;color:#888">Contract</td><td style="font-family:monospace;font-size:12px">{{contract_address}}</td></tr>'
            '<tr><td style="padding:6px 0;color:#888;vertical-align:top">Error</td><td style="font-family:monospace;font-size:12px;word-break:break-all"><strong>{{error_code}}</strong><br>{{error_message}}</td></tr>'
            '</table></div>'
            '<p style="color:#888;font-size:13px"><strong>User notes:</strong></p>'
            '<p style="color:#333;font-size:14px;background:#fffaeb;border-left:3px solid #f6c945;padding:12px;border-radius:4px;white-space:pre-wrap">{{additional_details}}</p>'
            '<p style="color:#888;font-size:11px;margin-top:24px">User-Agent: {{user_agent}}</p>'
            f'{_STYLE_FOOTER}'
        ),
        "description": "Sent to support email when a user clicks 'Report this issue' from the UI",
    },
    "sale_submitted_for_approval": {
        "subject": "Sale awaiting your approval: {{sale_title}}",
        "html_body": (
            f'{_STYLE_WRAP}'
            '<h2 style="color:#111">Sale Awaiting Approval</h2>'
            '<p style="color:#555">Hi {{display_name}},</p>'
            '<p style="color:#555"><strong>{{issuer_name}}</strong> has submitted '
            '<strong>{{sale_title}}</strong> for review.</p>'
            f'<a href="{{{{frontend_url}}}}/platform/sales/{{{{sale_id}}}}" style="{_STYLE_BTN};margin-top:16px">Open Sale</a>'
            f'{_STYLE_FOOTER}'
        ),
        "description": "Sent to platform admins when an issuer submits a sale for approval",
    },
    "sale_approved": {
        "subject": "Your sale {{sale_title}} has been approved",
        "html_body": (
            f'{_STYLE_WRAP}'
            '<h2 style="color:#111">Sale Approved</h2>'
            '<p style="color:#555">Hi {{display_name}}, your sale <strong>{{sale_title}}</strong> '
            'has been approved. Sign Activate Sale On-Chain in the issuer console to make it live.</p>'
            f'<a href="{{{{frontend_url}}}}/issuer/sales/{{{{sale_id}}}}" style="{_STYLE_BTN};margin-top:16px">Open Sale</a>'
            f'{_STYLE_FOOTER}'
        ),
        "description": "Sent to issuer when their sale is approved by admin",
    },
    "sale_rejected": {
        "subject": "Your sale {{sale_title}} was not approved",
        "html_body": (
            f'{_STYLE_WRAP}'
            '<h2 style="color:#111">Sale Not Approved</h2>'
            '<p style="color:#555">Hi {{display_name}}, your sale <strong>{{sale_title}}</strong> '
            'was not approved. Please review the feedback and resubmit.</p>'
            '<p style="color:#555;background:#f8f9fa;border-radius:8px;padding:12px;font-style:italic">{{reason}}</p>'
            f'<a href="{{{{frontend_url}}}}/issuer/sales" style="{_STYLE_BTN};margin-top:16px">Review &amp; Resubmit</a>'
            f'{_STYLE_FOOTER}'
        ),
        "description": "Sent to issuer when their sale is rejected by admin",
    },
    "sale_launched": {
        "subject": "{{sale_name}} is now live on Cireta!",
        "html_body": (
            f'{_STYLE_WRAP}'
            '<h2 style="color:#111">Sale is Live!</h2>'
            '<p style="color:#555">Hi {{display_name}}, great news — <strong>{{sale_name}}</strong> '
            'is now open for investment on the Cireta Launchpad.</p>'
            '<p style="color:#555">You signed up to be notified when this sale launched. '
            'Don\'t miss your chance to participate.</p>'
            f'<a href="{{{{frontend_url}}}}/projects" style="{_STYLE_BTN};margin-top:16px">View Sale</a>'
            f'{_STYLE_FOOTER}'
        ),
        "description": "Sent to subscribers when a coming-soon sale goes live",
    },
    "issuer_wallet_approved": {
        "subject": "Your issuer wallet has been approved",
        "html_body": (
            f'{_STYLE_WRAP}'
            '<h2 style="color:#111">Wallet Approved</h2>'
            '<p style="color:#555">Hi {{display_name}}, your issuer wallet has been approved. '
            'You can now create sales and manage tokens.</p>'
            f'<a href="{{{{admin_url}}}}/issuer/sales/new" style="{_STYLE_BTN};margin-top:16px">Create Sale</a>'
            f'{_STYLE_FOOTER}'
        ),
        "description": "Sent when issuer wallet is approved by admin",
    },
    "issuer_wallet_rejected": {
        "subject": "Your issuer wallet was not approved",
        "html_body": (
            f'{_STYLE_WRAP}'
            '<h2 style="color:#111">Wallet Not Approved</h2>'
            '<p style="color:#555">Hi {{display_name}}, your issuer wallet was not approved. '
            'Please submit a new wallet for review.</p>'
            '<p style="color:#555">Reason: {{rejection_reason}}</p>'
            f'<a href="{{{{admin_url}}}}/issuer/onboarding" style="{_STYLE_BTN};margin-top:16px">Submit New Wallet</a>'
            f'{_STYLE_FOOTER}'
        ),
        "description": "Sent when issuer wallet is rejected by admin",
    },
    "admin_sale_submitted": {
        "subject": "New sale submitted for approval: {{sale_name}}",
        "html_body": (
            f'{_STYLE_WRAP}'
            '<h2 style="color:#111">New Sale Submitted</h2>'
            '<p style="color:#555">A new sale has been submitted for review:</p>'
            f'<div style="{_STYLE_BOX}">'
            '<table style="width:100%;color:#555;font-size:14px">'
            '<tr><td style="padding:6px 0;color:#888">Sale</td>'
            '<td style="text-align:right;font-weight:600">{{sale_name}}</td></tr>'
            '<tr><td style="padding:6px 0;color:#888">Issuer</td>'
            '<td style="text-align:right;font-weight:600">{{issuer_name}}</td></tr>'
            '<tr><td style="padding:6px 0;color:#888">Token</td>'
            '<td style="text-align:right;font-weight:600">{{token_symbol}}</td></tr>'
            '</table></div>'
            f'<a href="{{{{admin_url}}}}/sales" style="{_STYLE_BTN};margin-top:16px">Review Sale</a>'
            f'{_STYLE_FOOTER}'
        ),
        "description": "Sent to admin when issuer submits a sale for approval",
    },
}

# Maps each template key to its available placeholder variables.
TEMPLATE_VARIABLES: dict[str, list[str]] = {
    "otp_code": ["code"],
    "welcome": ["display_name", "frontend_url"],
    "investment_confirmation": [
        "display_name", "token_name", "amount", "tokens_allocated",
        "payment_method", "tx_reference", "tx_url", "frontend_url",
    ],
    "kyc_approved": ["display_name", "frontend_url"],
    "kyc_rejected": ["display_name"],
    "kyb_approved": ["display_name", "company_name", "frontend_url"],
    "kyb_rejected": ["display_name", "company_name"],
    "issuer_approved": ["display_name", "admin_url"],
    "sale_finalized_success": ["display_name", "token_name", "frontend_url"],
    "sale_finalized_failed": ["display_name", "token_name", "frontend_url"],
    "redemption_fulfilled": ["display_name", "token_symbol", "frontend_url"],
    "kyc_expiry_warning": ["display_name", "days_left", "frontend_url"],
    "wallet_linked": ["display_name", "wallet_address"],
    "tokens_claimed": ["display_name", "tokens_amount", "token_symbol", "frontend_url"],
    "refund_claimed": ["display_name", "amount", "frontend_url"],
    "dividend_available": [
        "display_name", "token_symbol", "dividend_amount", "frontend_url",
    ],
    "issuer_approval_request": ["issuer_name", "issuer_email", "admin_url"],
    "user_error_report": [
        "user_email", "wallet_address", "page_url", "function_name",
        "tx_hash", "tx_url", "contract_address", "error_code", "error_message",
        "additional_details", "user_agent",
    ],
    "sale_submitted_for_approval": ["display_name", "sale_title", "issuer_name", "sale_id", "frontend_url"],
    "sale_approved": ["display_name", "sale_title", "sale_id", "frontend_url"],
    "sale_rejected": ["display_name", "sale_title", "reason", "frontend_url"],
    "issuer_wallet_approved": ["display_name", "admin_url"],
    "issuer_wallet_rejected": ["display_name", "rejection_reason", "admin_url"],
    "admin_sale_submitted": [
        "sale_name", "issuer_name", "token_symbol", "admin_url",
    ],
}


class EmailService:
    """Send transactional emails via Resend with DB-backed templates."""

    def __init__(self, db=None) -> None:
        self.db = db
        self._configured = bool(settings.resend_api_key)
        if self._configured:
            resend.api_key = settings.resend_api_key

    async def send(
        self,
        template_key: str,
        to_email: str,
        variables: dict[str, str] | None = None,
    ) -> dict:
        """Send an email using a template.

        Returns dict with status. In dev without Resend, logs the email instead.
        If template is inactive (is_active=False), email is silently skipped.
        """
        variables = variables or {}
        variables.setdefault("frontend_url", settings.frontend_url)
        variables.setdefault("admin_url", "https://admin.cireta.com")

        template = await self._get_template(template_key)
        if template is None:
            logger.info("Email skipped (inactive or missing): %s", template_key)
            return {"status": "skipped", "message": f"Template '{template_key}' inactive or not found"}

        subject = self._render(template["subject"], variables)
        html_body = self._render(template["html_body"], variables)

        # Dev mode without Resend: log and return.
        if not self._configured:
            logger.info(
                "DEV EMAIL [%s] to=%s subject='%s' %s",
                template_key, to_email, subject,
                f"code={variables.get('code')}" if "code" in variables else "",
            )
            return {"status": "dev_logged", "to": to_email, "subject": subject}

        try:
            response = resend.Emails.send({
                "from": settings.smtp_from,
                "to": [to_email],
                "subject": subject,
                "html": html_body,
            })
            logger.info("Email sent: %s to %s (id=%s)", template_key, to_email, response.get("id"))
            return {"status": "sent", "id": response.get("id")}
        except Exception:
            logger.exception("Failed to send email: %s to %s", template_key, to_email)
            return {"status": "error", "message": "Email send failed"}

    async def _get_template(self, key: str) -> dict[str, str] | None:
        """Load template from DB (if active), fall back to defaults.

        Returns None if template exists in DB but is_active=False.
        Gracefully falls back to defaults if DB query fails (e.g. missing column).
        """
        if self.db:
            try:
                from sqlalchemy import select

                from apps.api.models.email_template import EmailTemplate

                result = await self.db.execute(
                    select(EmailTemplate).where(EmailTemplate.key == key)
                )
                tmpl = result.scalar_one_or_none()
                if tmpl:
                    if not getattr(tmpl, "is_active", True):
                        return None
                    return {"subject": tmpl.subject, "html_body": tmpl.html_body}
            except Exception:
                logger.debug("DB template lookup failed for '%s', using default", key)

        default = DEFAULT_TEMPLATES.get(key)
        return {"subject": default["subject"], "html_body": default["html_body"]} if default else None

    async def get_all_templates(self) -> list[dict]:
        """Return all templates merged: DB overrides + defaults.

        Each entry includes key, subject, html_body, description, is_active,
        variables (list), and updated_at.
        """
        db_templates: dict[str, dict] = {}
        if self.db:
            try:
                from sqlalchemy import select

                from apps.api.models.email_template import EmailTemplate

                result = await self.db.execute(select(EmailTemplate))
                for tmpl in result.scalars().all():
                    db_templates[tmpl.key] = {
                        "key": tmpl.key,
                        "subject": tmpl.subject,
                        "html_body": tmpl.html_body,
                        "description": tmpl.description,
                        "is_active": getattr(tmpl, "is_active", True),
                        "variables": TEMPLATE_VARIABLES.get(tmpl.key, []),
                        "updated_at": tmpl.updated_at.isoformat() if tmpl.updated_at else None,
                        "is_custom": True,
                    }
            except Exception:
                logger.debug("DB template listing failed, using defaults only")

        merged: list[dict] = []
        for key, default in DEFAULT_TEMPLATES.items():
            if key in db_templates:
                merged.append(db_templates[key])
            else:
                merged.append({
                    "key": key,
                    "subject": default["subject"],
                    "html_body": default["html_body"],
                    "description": default.get("description"),
                    "is_active": True,
                    "variables": TEMPLATE_VARIABLES.get(key, []),
                    "updated_at": None,
                    "is_custom": False,
                })

        # Include DB-only templates not in defaults
        for key, data in db_templates.items():
            if key not in DEFAULT_TEMPLATES:
                merged.append(data)

        return merged

    async def get_template_by_key(self, key: str) -> dict | None:
        """Get a single template by key (DB or default)."""
        if self.db:
            from sqlalchemy import select

            from apps.api.models.email_template import EmailTemplate

            result = await self.db.execute(
                select(EmailTemplate).where(EmailTemplate.key == key)
            )
            tmpl = result.scalar_one_or_none()
            if tmpl:
                return {
                    "key": tmpl.key,
                    "subject": tmpl.subject,
                    "html_body": tmpl.html_body,
                    "description": tmpl.description,
                    "is_active": tmpl.is_active,
                    "variables": TEMPLATE_VARIABLES.get(tmpl.key, []),
                    "updated_at": tmpl.updated_at.isoformat() if tmpl.updated_at else None,
                    "is_custom": True,
                }

        default = DEFAULT_TEMPLATES.get(key)
        if default:
            return {
                "key": key,
                "subject": default["subject"],
                "html_body": default["html_body"],
                "description": default.get("description"),
                "is_active": True,
                "variables": TEMPLATE_VARIABLES.get(key, []),
                "updated_at": None,
                "is_custom": False,
            }
        return None

    async def reset_template(self, key: str) -> bool:
        """Delete DB row so template falls back to default.

        Returns True if a row was deleted, False if no DB row existed.
        """
        if not self.db:
            return False

        from sqlalchemy import delete

        from apps.api.models.email_template import EmailTemplate

        result = await self.db.execute(
            delete(EmailTemplate).where(EmailTemplate.key == key)
        )
        await self.db.commit()
        return result.rowcount > 0  # type: ignore[union-attr]

    def _render(self, text: str, variables: dict[str, str]) -> str:
        def replace_var(match: re.Match) -> str:
            return str(variables.get(match.group(1).strip(), match.group(0)))
        return re.sub(r"\{\{(\w+)\}\}", replace_var, text)


# ---------------------------------------------------------------------------
# Module-level convenience helpers (used by kyc_expiry_service lazy-import)
# ---------------------------------------------------------------------------

async def send_kyc_expiry_warning(to_email: str, days_left: int) -> dict:
    """Send a KYC expiry warning email (no DB session needed)."""
    svc = EmailService()
    return await svc.send(
        "kyc_expiry_warning",
        to_email,
        {"days_left": str(days_left), "display_name": to_email},
    )
