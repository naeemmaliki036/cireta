"""Add investor onboarding fields to users.

Revision ID: 021_investor_onboarding_fields
Revises: 020_super_admin
Create Date: 2026-03-31
"""

import sqlalchemy as sa
from alembic import op

revision = "021_investor_onboarding_fields"
down_revision = "020_super_admin"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("date_of_birth", sa.Date(), nullable=True))
    op.add_column("users", sa.Column("nationality", sa.String(100), nullable=True))
    op.add_column("users", sa.Column("country_of_residence", sa.String(100), nullable=True))
    op.add_column("users", sa.Column("company_name", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("company_registration_number", sa.String(100), nullable=True))
    op.add_column("users", sa.Column("company_jurisdiction", sa.String(100), nullable=True))
    op.add_column("users", sa.Column("onboarding_completed", sa.Boolean(), nullable=False, server_default="false"))


def downgrade() -> None:
    op.drop_column("users", "onboarding_completed")
    op.drop_column("users", "company_jurisdiction")
    op.drop_column("users", "company_registration_number")
    op.drop_column("users", "company_name")
    op.drop_column("users", "country_of_residence")
    op.drop_column("users", "nationality")
    op.drop_column("users", "date_of_birth")
