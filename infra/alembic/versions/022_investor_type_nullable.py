"""Make investor_type nullable — NULL means not yet chosen."""

revision = "022_investor_type_nullable"
down_revision = "021_investor_onboarding_fields"

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    # Make column nullable
    op.alter_column("users", "investor_type", existing_type=sa.String(20), nullable=True)
    # Reset to NULL for users who haven't completed onboarding (type was never explicitly chosen)
    op.execute("UPDATE users SET investor_type = NULL WHERE onboarding_completed = false")


def downgrade() -> None:
    # Set NULLs back to default
    op.execute("UPDATE users SET investor_type = 'individual' WHERE investor_type IS NULL")
    op.alter_column("users", "investor_type", existing_type=sa.String(20), nullable=False, server_default="individual")
