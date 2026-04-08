# ERC-3643 Identity System — Gas Cost Comparison (Base vs Ethereum L1)

## Per-Investor Operations

Every new investor who passes KYC triggers these on-chain operations:

| Operation | Gas Used | Base Cost | Ethereum L1 Cost |
|---|---|---|---|
| Deploy ONCHAINID contract | ~1,500,000 | $0.01 – $0.05 | $15 – $75 |
| addClaim (KYC, topic 1) | ~150,000 | $0.001 – $0.005 | $1.50 – $7.00 |
| addClaim (AML, topic 2) | ~150,000 | $0.001 – $0.005 | $1.50 – $7.00 |
| registerIdentity (per wallet) | ~80,000 | $0.001 – $0.003 | $0.80 – $3.50 |
| **Total (1 wallet)** | **~1,880,000** | **$0.01 – $0.06** | **$19 – $93** |
| **Total (5 wallets)** | **~2,200,000** | **$0.02 – $0.07** | **$22 – $107** |
| **Total (10 wallets)** | **~2,600,000** | **$0.02 – $0.09** | **$27 – $128** |

### Key Insight

- ONCHAINID deployment: **1 per investor** (most expensive, but only once)
- Claim signing: **1 per claim topic** (lives on the ONCHAINID, not per-wallet)
- Identity registration: **1 per wallet** (cheapest operation, ~80K gas each)

Adding 9 more wallets only costs ~720K extra gas ($0.01 on Base). The expensive part (ONCHAINID + claims) is done once.

---

## Per-Token Operations (Issuer)

When an issuer deploys a new token via the factory:

| Operation | Gas Used | Base Cost | Ethereum L1 Cost |
|---|---|---|---|
| CiretaTokenFactory.deployToken() | ~3,500,000 | $0.03 – $0.15 | $35 – $175 |
| Add compliance module (CountryAllow) | ~100,000 | $0.001 – $0.004 | $1 – $5 |
| Add compliance module (MaxHolder) | ~100,000 | $0.001 – $0.004 | $1 – $5 |
| **Total per token** | **~3,700,000** | **$0.03 – $0.16** | **$37 – $185** |

---

## Per-Sale Operations

| Operation | Gas Used | Base Cost | Ethereum L1 Cost |
|---|---|---|---|
| CiretaSaleFactory.deploySale() | ~2,500,000 | $0.02 – $0.10 | $25 – $125 |
| Investor contribute (buy tokens) | ~200,000 | $0.002 – $0.008 | $2 – $10 |
| Claim tokens after sale | ~150,000 | $0.001 – $0.006 | $1.50 – $7.50 |

---

## Monthly Cost Projections

### Base

| Scale | Investors/mo | Avg Wallets | Identity Cost | Token Deploys | Total/mo |
|---|---|---|---|---|---|
| Early stage | 50 | 1 | $1 – $3 | 2 | $1 – $4 |
| Growth | 500 | 2 | $10 – $40 | 5 | $11 – $45 |
| Scale | 2,000 | 3 | $40 – $150 | 10 | $45 – $165 |
| Large | 10,000 | 3 | $200 – $700 | 20 | $210 – $730 |

### Ethereum L1 (same scale for comparison)

| Scale | Investors/mo | Avg Wallets | Identity Cost | Token Deploys | Total/mo |
|---|---|---|---|---|---|
| Early stage | 50 | 1 | $950 – $4,650 | 2 | $1,025 – $5,020 |
| Growth | 500 | 2 | $11,000 – $53,500 | 5 | $11,185 – $54,425 |
| Scale | 2,000 | 3 | $54,000 – $256,000 | 10 | $54,370 – $257,850 |
| Large | 10,000 | 3 | $270,000 – $1,280,000 | 20 | $270,740 – $1,283,700 |

### The Verdict

| | Base | Ethereum L1 | Ratio |
|---|---|---|---|
| Per investor (1 wallet) | $0.01 – $0.06 | $19 – $93 | **~1500x cheaper** |
| 10K investors/month | $200 – $700 | $270K – $1.3M | **~1500x cheaper** |

---

## What Cireta Pays vs What Investors Pay

| Operation | Who Pays Gas |
|---|---|
| Deploy ONCHAINID | **Cireta** (backend relayer) |
| Add KYC/AML claims | **Cireta** (backend relayer) |
| Register identity | **Cireta** (backend relayer) |
| Deploy token | **Issuer** (via dApp) |
| Deploy sale | **Issuer** (via dApp) |
| Contribute to sale | **Investor** (via dApp) |
| Transfer tokens | **Sender** (via dApp) |

Cireta's claim signer wallet needs to stay funded with ETH on Base. At current prices, **$10 covers ~10,000 investor verifications**.

---

## Comparison with Off-Chain Costs

| Service | Cost per Investor |
|---|---|
| Sumsub KYC verification | $1.00 – $2.00 |
| Sumsub AML screening | $0.50 – $1.00 |
| On-chain identity (Base) | $0.01 – $0.06 |
| On-chain identity (Ethereum L1) | $19 – $93 |

The on-chain identity cost on Base is **50-200x cheaper than the Sumsub KYC check itself**. It's a rounding error in your operating costs.

---

## Multi-Wallet Cost Impact

Cireta supports up to **10 wallets per investor**. The cost impact is minimal because:

1. **ONCHAINID** — deployed once per investor (not per wallet)
2. **Claims** — added once to the ONCHAINID (not per wallet)
3. **registerIdentity** — the only per-wallet cost (~80K gas = $0.001 on Base)

| Wallets per Investor | Additional Cost vs 1 Wallet (Base) | Additional Cost vs 1 Wallet (L1) |
|---|---|---|
| 1 (baseline) | – | – |
| 3 | +$0.002 | +$3.50 |
| 5 | +$0.004 | +$7.00 |
| 10 | +$0.009 | +$14.00 |

Even at max 10 wallets, the extra cost on Base is under a penny.

---

## Gas Price Assumptions

| Network | Gas Price Used | Source |
|---|---|---|
| Base | 0.005 – 0.02 gwei | Base mainnet average (2025-2026) |
| Ethereum L1 | 10 – 50 gwei | ETH mainnet average (2025-2026) |
| ETH price | $2,000 – $3,500 | Used for USD conversion |

*Costs fluctuate with gas prices and ETH price. Base has been consistently under 0.05 gwei.*
