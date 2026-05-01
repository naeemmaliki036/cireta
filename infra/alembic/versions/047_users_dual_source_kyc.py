"""Track self-reported and Sumsub-verified KYC fields separately on users.

Compliance officers need to compare what the user typed at signup against
what Sumsub extracted from their ID — discrepancies are how we catch fraud
and honest mistakes. So we never overwrite one with the other.

This migration:
  - Adds users.phone_number (self-reported, was missing entirely)
  - Adds users.verified_* mirror columns for every personal field that
    Sumsub returns (date_of_birth, nationality, country_of_residence,
    phone_number, full_name)
  - Adds users.verified_company_* mirror columns for KYB (company_name,
    registration_number, jurisdiction, beneficial_owners JSONB)
  - Adds users.kyc_synced_at — when the verified_* fields were last touched

verified_* values are alpha-3 ISO codes (Sumsub's default). self-reported
country fields stay as whatever the user typed (alpha-2 legacy or alpha-3
post-overhaul); the frontend handles both at read time.

Revision ID: 047_users_dual_source_kyc
Revises: 046_error_reports_and_support_email
Create Date: 2026-05-01
"""

import sqlalchemy as sa
from alembic import op

revision = "047_users_dual_source_kyc"
down_revision = "046_error_reports_and_support_email"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Self-reported phone — was missing from the schema entirely
    op.add_column("users", sa.Column("phone_number", sa.String(32), nullable=True))
    op.create_index("ix_users_phone_number", "users", ["phone_number"])

    # Sumsub-verified mirror — personal (Individual KYC)
    op.add_column("users", sa.Column("verified_full_name", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("verified_date_of_birth", sa.Date(), nullable=True))
    op.add_column("users", sa.Column("verified_nationality", sa.String(3), nullable=True))
    op.add_column("users", sa.Column("verified_country_of_residence", sa.String(3), nullable=True))
    op.add_column("users", sa.Column("verified_phone_number", sa.String(32), nullable=True))

    # Sumsub-verified mirror — corporate (KYB)
    op.add_column("users", sa.Column("verified_company_name", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("verified_company_registration_number", sa.String(100), nullable=True))
    op.add_column("users", sa.Column("verified_company_jurisdiction", sa.String(3), nullable=True))
    op.add_column(
        "users",
        sa.Column("verified_beneficial_owners", sa.dialects.postgresql.JSONB(), nullable=True),
    )

    # When did Sumsub last write any of the above
    op.add_column("users", sa.Column("kyc_synced_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "kyc_synced_at")
    op.drop_column("users", "verified_beneficial_owners")
    op.drop_column("users", "verified_company_jurisdiction")
    op.drop_column("users", "verified_company_registration_number")
    op.drop_column("users", "verified_company_name")
    op.drop_column("users", "verified_phone_number")
    op.drop_column("users", "verified_country_of_residence")
    op.drop_column("users", "verified_nationality")
    op.drop_column("users", "verified_date_of_birth")
    op.drop_column("users", "verified_full_name")
    op.drop_index("ix_users_phone_number", table_name="users")
    op.drop_column("users", "phone_number")
