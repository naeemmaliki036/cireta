"""Token compliance schemas for request/response validation."""

from pydantic import BaseModel, Field, field_validator

from web3 import Web3


class ModuleConfigResponse(BaseModel):
    """Configuration data for a compliance module."""

    allowed_countries: list[int] | None = None
    max_holder_count: int | None = None
    current_holder_count: int | None = None


class ComplianceModuleResponse(BaseModel):
    """Response for a single compliance module."""

    address: str
    name: str
    config: ModuleConfigResponse


class ComplianceStatusResponse(BaseModel):
    """Response for compliance status of a token."""

    compliance_address: str
    token_address: str | None
    modules: list[ComplianceModuleResponse]


class AddModuleRequest(BaseModel):
    """Request to attach a compliance module."""

    module_address: str = Field(
        ..., description="Deployed module contract address"
    )

    @field_validator("module_address")
    @classmethod
    def validate_address(cls, v: str) -> str:
        if not Web3.is_address(v):
            raise ValueError("Invalid Ethereum address")
        return Web3.to_checksum_address(v)


class CountryAllowRequest(BaseModel):
    """Request to add/remove allowed countries."""

    module_address: str = Field(
        ..., description="CountryAllowModule contract address"
    )
    add_countries: list[int] = Field(
        default_factory=list,
        description="ISO 3166-1 numeric country codes to allow",
    )
    remove_countries: list[int] = Field(
        default_factory=list,
        description="ISO 3166-1 numeric country codes to disallow",
    )

    @field_validator("module_address")
    @classmethod
    def validate_address(cls, v: str) -> str:
        if not Web3.is_address(v):
            raise ValueError("Invalid Ethereum address")
        return Web3.to_checksum_address(v)

    @field_validator("add_countries", "remove_countries")
    @classmethod
    def validate_codes(cls, v: list[int]) -> list[int]:
        for code in v:
            if code < 1 or code > 999:
                raise ValueError(
                    f"Invalid country code {code}: must be 1-999"
                )
        return v


class MaxHolderCountRequest(BaseModel):
    """Request to set max holder count."""

    module_address: str = Field(
        ..., description="MaxHolderCountModule contract address"
    )
    max_count: int = Field(
        ..., gt=0, description="Maximum number of token holders"
    )

    @field_validator("module_address")
    @classmethod
    def validate_address(cls, v: str) -> str:
        if not Web3.is_address(v):
            raise ValueError("Invalid Ethereum address")
        return Web3.to_checksum_address(v)


class ComplianceTxResponse(BaseModel):
    """Response for a compliance transaction."""

    success: bool
    tx_hash: str
    message: str
