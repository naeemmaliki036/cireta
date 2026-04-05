# Identity Registry Architecture

## Why Per-Token Identity Registries Exist

ERC-3643 standard requires it. Each security token has its own compliance rules:

1. **Different KYC requirements per token** — A gold token might require accredited investors only (higher KYC tier), while a copper token might allow retail investors. Per-token registries let each token enforce different investor eligibility.

2. **Different country restrictions** — Token A might be restricted to GCC + EU investors, Token B might be open globally except sanctioned countries. The identity registry stores `(wallet → country)` mappings, and compliance modules check against allowed countries per token.

3. **Issuer isolation** — If Issuer A's token gets a regulatory freeze, only their registry is affected. Issuer B's investors are untouched.

4. **Regulatory compliance** — Different jurisdictions require different verification levels. A UAE-regulated token might need different checks than a EU-regulated one.

## Impact of ONE Platform-Wide Registry

### Pros
- Simpler UX — investor gets KYC'd once, whitelisted once, can participate in any sale/token
- No confusion about which registry to use for OTC tokens
- Auto-whitelist on KYC approval works across everything
- Less gas cost (one whitelist tx instead of per-token)

### Cons / Risks
- **All tokens share the same investor pool** — you can't restrict Token A to accredited investors while Token B allows retail
- **Country restrictions are global** — if you add country 784 (UAE) to the registry, ALL tokens accept UAE investors. You can't have one token UAE-only and another EU-only
- **Regulatory risk** — if one token faces regulatory action, the shared registry affects all tokens
- **Multi-issuer conflict** — Issuer A might want different KYC tiers than Issuer B

## Current Decision

For Cireta's current stage (single platform, controlled issuers, simple whitelist mode), **one platform-wide registry is the right call**. If you later need per-token restrictions, the `CountryAllowModule` on each token's compliance contract already handles country-level gating independently. The identity registry just answers "is this wallet KYC'd?" — the compliance modules handle the rest.

You can always migrate to per-token registries later when multi-issuer with different KYC tiers becomes a real requirement.

## How It Works

1. **User passes KYC** → auto-whitelisted in the platform registry via `SimpleIdentityBridgeService`
2. **User buys tokens** → Sale contract checks `identityRegistry.isVerified(buyer)` → passes because they're in the platform registry
3. **User receives OTC tokens** → OTC token's `_update()` checks `identityRegistry.isVerified(to)` → same registry, same check

One registry, one KYC verification, works across all tokens and OTC tokens on the platform.

## Migration Path to Per-Token Registries

If multi-issuer with different KYC tiers becomes a requirement:

1. Deploy new `SimpleIdentityRegistry` per token via `CiretaTokenFactory`
2. Each token references its own registry
3. `CountryAllowModule` already handles per-token country restrictions
4. Existing tokens keep the platform registry — no migration needed
5. New tokens can opt into per-token registries
