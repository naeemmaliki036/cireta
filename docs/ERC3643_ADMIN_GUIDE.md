# ERC-3643 — The Plain English Guide for Platform Admins & Issuers

## What Problem Does It Solve?

Regular tokens (like USDC) can be sent to **anyone**. That's fine for utility tokens, but **illegal for securities**. If you're selling tokenized gold or copper futures, regulators require you to:

- Know who holds the tokens (KYC)
- Block transfers to sanctioned/restricted people
- Enforce country restrictions
- Limit holder counts
- Freeze tokens if needed

**ERC-3643 bakes all of this into the token itself.** Every transfer is checked automatically on-chain. No one can bypass it — not even you.

---

## Think of It Like a Nightclub

| Real World | ERC-3643 Equivalent |
|---|---|
| The nightclub | Your token (TGLD, TCPR, etc.) |
| Bouncer at the door | `IdentityRegistry.isVerified()` |
| Government-issued ID | ONCHAINID (on-chain passport) |
| ID stamps (age verified, not banned) | Claims on the ONCHAINID |
| The authority that issued the ID | ClaimIssuer (Cireta) |
| Guest list | IdentityRegistryStorage |
| House rules (max capacity, dress code) | Compliance modules |

**No ID with valid stamps + not on guest list = you don't get in (can't hold tokens).**

---

## The 3 Layers You Need to Know

### Layer 1: The Token (CiretaToken)

This is the actual security token investors buy. It looks like a normal ERC-20 (balances, transfers, approvals) but with one key difference:

> **Every transfer checks: "Is the receiver allowed to hold this?"**

If the answer is no, the transaction reverts. Period. No exceptions. This happens at the smart contract level — nobody can bypass it, not even the deployer.

As **issuer**, you can:
- Mint new tokens (supply management)
- Freeze/unfreeze specific wallets
- Pause all transfers (emergency)
- Force-transfer tokens (regulatory recovery)

### Layer 2: Identity (ONCHAINID + Claims)

This is the "passport system" for investors.

**ONCHAINID** = A smart contract deployed for each investor. Think of it as their on-chain identity card. It holds "claims" — verified statements about the person.

**Claims** = Proof that something is true about an investor:
- Claim topic 1: "This person passed KYC"
- Claim topic 2: "This person passed AML screening"
- Claim topic 3: "This person is an accredited investor" (optional)

**Who signs claims?** Cireta does, via the **ClaimIssuer** contract. When Sumsub approves someone's KYC, our backend:
1. Deploys an ONCHAINID for the investor (if they don't have one)
2. Signs a KYC claim with our private key
3. Attaches that claim to their ONCHAINID
4. Registers them in the identity registry

**As admin, you don't do this manually** — it happens automatically when Sumsub webhook fires. But you should know it's happening.

### Layer 3: Compliance (Rules Engine)

These are pluggable modules that add transfer restrictions per token:

| Module | What It Does | Example |
|---|---|---|
| CountryAllowModule | Only allows investors from specific countries | Allow UAE, US, UK — block sanctioned countries |
| MaxHolderCountModule | Caps total number of token holders | Max 500 holders for this gold token |

As **issuer**, you attach these modules to your token and configure them. You can add/remove modules later.

---

## What Happens When Someone Tries to Transfer Tokens

```
Alice sends 100 TGLD to Bob:

  1. Is Alice frozen?              → No, continue
  2. Is Bob frozen?                → No, continue
  3. Does Alice have enough?       → Yes, continue
  4. Is Bob verified?
     → Does Bob have an ONCHAINID? → Yes
     → Does it have a KYC claim?   → Yes
     → Was it signed by Cireta?    → Yes (trusted issuer)
     → Is the claim still valid?   → Yes (not revoked)
  5. Compliance check:
     → Is Bob's country allowed?   → Yes (UAE = 784)
     → Under max holders?          → Yes (400/500)
  6. Transfer goes through ✓
```

If Bob failed step 4 (no KYC claim), the transaction **reverts** — tokens stay with Alice. This is enforced by the blockchain, not by your server.

---

## The Shared vs Per-Token Split

This is important to understand:

**Shared across ALL tokens (deployed once by Cireta):**
- **IdentityRegistryStorage** — the master list of "wallet → ONCHAINID" mappings
- **ClaimTopicsRegistry** — what claims are required (KYC, AML)
- **TrustedIssuersRegistry** — who can issue claims (Cireta's ClaimIssuer)
- **CiretaTokenFactory** — deploys new tokens
- **CiretaSaleFactory** — deploys new sales

**Per token (deployed by factory when issuer creates a token):**
- **IdentityRegistry** — points to the shared storage but is owned by the issuer
- **ModularCompliance** — issuer configures their own transfer rules
- **CiretaToken** — the actual token contract

**Why this matters:** An investor who passes KYC once is verified for **every token on the platform**. They don't need to re-verify for each new token. The ONCHAINID + claims are universal. Only the compliance rules (country restrictions, holder limits) vary per token.

---

## Your Role as Platform Admin

| Task | How |
|---|---|
| Approve/reject issuers | Admin portal → Issuers page → approve |
| View investor KYC status | Admin portal → Users page |
| See who has on-chain identity | Users with `onchain_id` populated = on-chain verified |
| Revoke someone's KYC | Revoke the claim → they can't transfer anymore |
| Add a new trusted claim issuer | Rare — only if you partner with another KYC provider |
| Emergency: freeze all transfers | Call `token.pause()` on specific token |
| Emergency: freeze one wallet | Call `token.setAddressFrozen(wallet, true)` |

## Your Role as Issuer

| Task | How |
|---|---|
| Deploy a new token | Admin portal → New Token → factory deploys everything |
| Set country restrictions | Add CountryAllowModule → configure allowed countries |
| Set holder limit | Add MaxHolderCountModule → set max (e.g., 500) |
| Mint tokens | `token.mint(investorWallet, amount)` — only works if investor is verified |
| Create a sale | Sale factory deploys a Sale contract linked to your token |
| Freeze a bad actor | `token.setAddressFrozen(wallet, true)` |
| Force recover tokens | `token.forcedTransfer(from, to, amount)` — regulatory use only |

---

## The KYC → On-Chain Bridge (The Magic Part)

This is what the `IdentityBridgeService` does:

```
Investor signs up → completes Sumsub KYC → Sumsub says "APPROVED"
                                                    ↓
                                        Webhook hits our backend
                                                    ↓
                                    IdentityBridgeService kicks in:
                                                    ↓
                            1. Deploy ONCHAINID contract for investor
                            2. Sign KYC claim with our private key
                            3. Attach claim to their ONCHAINID
                            4. Register in IdentityRegistryStorage
                                                    ↓
                            Investor can now buy/hold/transfer ANY
                            security token on the Cireta platform
```

**If KYC expires or is revoked:** We revoke the claim on-chain. The investor's tokens are effectively frozen — they can't send them anywhere because `isVerified()` will return false.

---

## Key Things to Remember

1. **You never manually whitelist investors** — KYC approval triggers automatic on-chain identity provisioning
2. **One KYC = access to all tokens** — shared identity storage means verify once, trade everywhere
3. **Compliance is on-chain and unstoppable** — even you can't bypass transfer checks (that's the point, regulators love it)
4. **The claim signer key is the most sensitive thing** — it's the key that says "Cireta vouches for this investor." Protect it like a bank vault key
5. **Freezing is instant** — one transaction and a wallet can't move tokens
6. **Country codes matter** — they're set during identity registration and used by compliance modules. Get them right from Sumsub data
