"""Email Service — sends transactional emails via Resend.

Loads templates from DB (admin-editable). Falls back to built-in defaults.
In dev mode without RESEND_API_KEY, logs emails and returns dev_otp for UI toast.
"""

import logging
import re

import resend

from packages.common.core.config import settings

logger = logging.getLogger(__name__)

DEFAULT_TEMPLATES: dict[str, dict[str, str]] = {
    "otp_code": {
        "subject": "Your Cireta verification code: {{code}}",
        "html_body": (
            '<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:40px 20px">'
            '<h2 style="color:#111">Your verification code</h2>'
            '<p style="color:#555;margin-bottom:24px">Enter this code to continue:</p>'
            '<div style="background:#f5f5f5;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">'
            '<span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#111">{{code}}</span></div>'
            '<p style="color:#888;font-size:13px">This code expires in 10 minutes.</p>'
            '<hr style="border:none;border-top:1px solid #eee;margin:24px 0">'
            '<p style="color:#aaa;font-size:12px">Cireta</p></div>'
        ),
        "description": "OTP code for login, register, email verification",
    },
    "welcome": {
        "subject": "Welcome to Cireta, {{display_name}}!",
        "html_body": (
            '<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:40px 20px">'
            '<h1 style="color:#111">Welcome to Cireta</h1>'
            '<p style="color:#555">Hi {{display_name}},</p>'
            '<p style="color:#555">Your email is verified and your account is ready.</p>'
            '<div style="background:#f8f9fa;border-radius:12px;padding:20px;margin:24px 0">'
            '<h3 style="color:#111;margin-top:0">Next Steps</h3>'
            '<ol style="color:#555;padding-left:20px">'
            '<li style="margin-bottom:8px"><strong>Complete KYC</strong> — 5-10 min, required before investing.</li>'
            '<li style="margin-bottom:8px"><strong>Connect wallet</strong> — Link your crypto wallet (optional).</li>'
            '<li style="margin-bottom:8px"><strong>Browse assets</strong> — Gold, copper, infrastructure.</li>'
            '</ol></div>'
            '<a href="{{frontend_url}}" style="display:inline-block;background:#111;color:#fff;padding:12px 24px;'
            'border-radius:8px;text-decoration:none;font-weight:600">Browse Assets</a>'
            '<hr style="border:none;border-top:1px solid #eee;margin:32px 0">'
            '<p style="color:#aaa;font-size:12px">Cireta — Regulated Commodity Tokenization</p></div>'
        ),
        "description": "Welcome email after email verification",
    },
    "investment_confirmation": {
        "subject": "Investment confirmed — {{token_name}}",
        "html_body": (
            '<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:40px 20px">'
            '<h2 style="color:#111">Investment Confirmed</h2>'
            '<p style="color:#555">Hi {{display_name}}, your investment has been recorded:</p>'
            '<div style="background:#f8f9fa;border-radius:12px;padding:20px;margin:24px 0">'
            '<table style="width:100%;color:#555;font-size:14px">'
            '<tr><td style="padding:6px 0;color:#888">Asset</td><td style="text-align:right;font-weight:600">{{token_name}}</td></tr>'
            '<tr><td style="padding:6px 0;color:#888">Amount</td><td style="text-align:right;font-weight:600">{{amount}} USDC</td></tr>'
            '<tr><td style="padding:6px 0;color:#888">Tokens</td><td style="text-align:right;font-weight:600">{{tokens_allocated}}</td></tr>'
            '</table></div>'
            '<a href="{{frontend_url}}/portfolio" style="display:inline-block;background:#111;color:#fff;padding:12px 24px;'
            'border-radius:8px;text-decoration:none;font-weight:600">View Portfolio</a>'
            '<hr style="border:none;border-top:1px solid #eee;margin:32px 0">'
            '<p style="color:#aaa;font-size:12px">Cireta</p></div>'
        ),
        "description": "Sent after successful investment",
    },
    "kyc_approved": {
        "subject": "KYC approved — You're ready to invest",
        "html_body": (
            '<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:40px 20px">'
            '<h2 style="color:#111">Identity Verified</h2>'
            '<p style="color:#555">Hi {{display_name}}, your identity verification is complete. You can now invest.</p>'
            '<a href="{{frontend_url}}" style="display:inline-block;background:#111;color:#fff;padding:12px 24px;'
            'border-radius:8px;text-decoration:none;font-weight:600;margin-top:16px">Browse Assets</a>'
            '<hr style="border:none;border-top:1px solid #eee;margin:32px 0">'
            '<p style="color:#aaa;font-size:12px">Cireta</p></div>'
        ),
        "description": "Sent when KYC approved",
    },
    "kyc_rejected": {
        "subject": "KYC verification update",
        "html_body": (
            '<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:40px 20px">'
            '<h2 style="color:#111">Verification Update</h2>'
            '<p style="color:#555">Hi {{display_name}}, we could not verify your identity. Please try again or contact support@cireta.com.</p>'
            '<hr style="border:none;border-top:1px solid #eee;margin:32px 0">'
            '<p style="color:#aaa;font-size:12px">Cireta</p></div>'
        ),
        "description": "Sent when KYC rejected",
    },
    "issuer_approved": {
        "subject": "Your issuer account is now active",
        "html_body": (
            '<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:40px 20px">'
            '<h2 style="color:#111">Issuer Account Activated</h2>'
            '<p style="color:#555">Hi {{display_name}}, your issuer account is approved. Create tokens and launch sales.</p>'
            '<a href="{{admin_url}}/issuer/sales/new" style="display:inline-block;background:#111;color:#fff;padding:12px 24px;'
            'border-radius:8px;text-decoration:none;font-weight:600;margin-top:16px">Create Your First Sale</a>'
            '<hr style="border:none;border-top:1px solid #eee;margin:32px 0">'
            '<p style="color:#aaa;font-size:12px">Cireta</p></div>'
        ),
        "description": "Sent when issuer activated by admin",
    },
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

        Returns dict with status. In dev without Resend, returns dev_otp for UI toast.
        """
        variables = variables or {}
        variables.setdefault("frontend_url", settings.frontend_url)
        variables.setdefault("admin_url", "https://admin.cireta.com")

        template = await self._get_template(template_key)
        if not template:
            logger.error("Email template not found: %s", template_key)
            return {"status": "error", "message": f"Template '{template_key}' not found"}

        subject = self._render(template["subject"], variables)
        html_body = self._render(template["html_body"], variables)

        # Dev mode: log and return OTP for UI notification
        if not self._configured:
            logger.info(
                "DEV EMAIL [%s] to=%s subject='%s' %s",
                template_key, to_email, subject,
                f"code={variables.get('code')}" if "code" in variables else "",
            )
            result: dict = {"status": "dev_logged", "to": to_email, "subject": subject}
            if "code" in variables:
                result["dev_otp"] = variables["code"]
            return result

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
        if self.db:
            from sqlalchemy import select
            from apps.api.models.email_template import EmailTemplate

            result = await self.db.execute(
                select(EmailTemplate).where(EmailTemplate.key == key)
            )
            tmpl = result.scalar_one_or_none()
            if tmpl:
                return {"subject": tmpl.subject, "html_body": tmpl.html_body}

        default = DEFAULT_TEMPLATES.get(key)
        return {"subject": default["subject"], "html_body": default["html_body"]} if default else None

    def _render(self, text: str, variables: dict[str, str]) -> str:
        def replace_var(match: re.Match) -> str:
            return str(variables.get(match.group(1).strip(), match.group(0)))
        return re.sub(r"\{\{(\w+)\}\}", replace_var, text)
