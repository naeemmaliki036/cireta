# Round-5 Sale System Rewrite — Implementation Spec

Locked-in design for the breaking-change rewrite of the Cireta sale stack.
Built from the requirements + Q&A in [`SALE_SYSTEM_DEEP_DIVE.md`](./SALE_SYSTEM_DEEP_DIVE.md).
Deployed via [`FRESH_DEPLOY_PLAN.md`](./FRESH_DEPLOY_PLAN.md) — no upgrades to
existing testnet sales.

Status: planned, not yet implemented.
Decisions locked: 2026-04-10.

---

## 1. Goals

Round 5 closes the gap between the current sale stack and the full set of
business requirements documented in `SALE_SYSTEM_DEEP_DIVE.md`. The deltas:

1. **Total token supply tracking** — explicit field, not implicit from deposits
2. **Per-phase allocation mode** — Fixed | Remaining (replaces global SaleStructure)
3. **Open-ended sales** — `saleEndTime = 0` opt-in, with three guardrails
4. **Two-step activation** — admin approves, issuer activates
5. **ERC-1155 fraction tokens** — id 1 = USDC, id 2 = OTC
6. **Refund accounting fix** — only id-1 holders can claim USDC refunds
7. **Defer hardcap finalization** — flag + event, no inline `_finalize`
8. **Phase overlap detection**
9. **Phase extension** — `extendPhase(phaseId, newEndTime)`
10. **Per-phase top-up minimum** — `topUpMin` with $1000 hard floor
11. **"Last chunk" exception** to `BelowMinContribution`
12. **Refund admin activation gate**
13. **Whitelist locks once phase starts**
14. **Storage cleanup** — remove `Contribution.isOtc`, `totalOtcAllocated`, `vestingStart`
15. **Token decimals validation** — read from `IERC20Metadata` at init
16. **KYC re-verification on claim**

---

## 2. Storage layout (Sale.sol after round 5)

New fields appended (existing fields untouched, gap shrunk to compensate):

```solidity
// Existing (unchanged):
//   token, paymentToken, identityRegistry, issuer, factory, feeManager
//   softCap, hardCap, feeBasisPoints, feeCapUsdc
//   saleStartTime, saleEndTime  (round 4)
//   totalPhaseAllocation        (round 4 — DELETED in round 5, see Q2)
//   totalRaised
//   totalOtcAllocated           (round 5 — DELETED, see § blind spot B8)
//   platformFeeCollected
//   status
//   phases[]
//   whitelisted, contributions, totalContributed
//   otcAllocations              (round 5 — DELETED, replaced by ERC-1155 id 2 balance)
//   maxPerBlock, _blockContributions
//   saleMode, vault, fractionToken
//   otcToken
//   saleStructure               (round 5 — DELETED, replaced by per-phase allocationMode)
//   finalizedAt

// NEW in round 5:
uint256 public totalTokenSupply;          // declared at init, in token-decimal units
uint256 public totalTokenSold;            // running sum across all phases (USDC + OTC)
uint8 public tokenDecimals;               // read from IERC20Metadata at init, immutable
uint256 public lastPhaseAddedAt;          // timestamp; for inactivity timeout
bool public openEnded;                    // saleEndTime == 0
bool public approved;                     // admin approval gate
bool public finalizationPending;          // hardcap reached, awaiting manual finalize
bool public refundsActive;                // admin-activated refund gate
uint256 public usdcContributedTotal;      // strictly USDC, for fee calc clarity
mapping(address => uint256) public usdcContributed;  // strictly USDC per buyer
mapping(address => uint256) public otcContributed;   // strictly OTC voucher amount per buyer

uint256 public constant MAX_SALE_DURATION = 730 days;
uint256 public constant INACTIVITY_TIMEOUT = 180 days;
uint256 public constant TOP_UP_MIN_FLOOR = 1000 * 1e6;  // 1000 USDC (raw)
```

`__gap` shrinks by ~12 slots → `[31]`.

`Contribution` struct after round 5 (deleted: `isOtc`):
```solidity
struct Contribution {
    uint256 amount;            // RENAMED MEANING: total ALL contributions (USDC + OTC) — same as today, but no longer used for refund accounting
    uint256 tokensAllocated;
    bool claimed;
    bool refunded;
}
```

For refund accounting, the new mappings `usdcContributed[addr]` and
`otcContributed[addr]` are the source of truth.

`Phase` struct after round 5 (NEW: `allocationMode`, `topUpMin`):
```solidity
enum AllocationMode { Fixed, Remaining }

struct Phase {
    string name;
    uint256 pricePerToken;
    uint256 allocation;
    uint256 sold;
    uint256 minContribution;
    uint256 maxContribution;
    uint256 topUpMin;          // NEW — repeat buyer minimum
    uint256 startTime;
    uint256 endTime;
    bool whitelistOnly;
    AllocationMode allocationMode;  // NEW — Fixed cap or Remaining-of-supply
}
```

---

## 3. New / changed initialization

```solidity
function initialize(
    address _token,
    address _paymentToken,
    address _identityRegistry,
    address _issuer,
    address _factory,
    address _feeManager,
    uint256 _softCap,
    uint256 _hardCap,
    uint256 _feeBasisPoints,
    uint256 _feeCapUsdc,
    address _otcToken,
    uint256 _saleStartTime,
    uint256 _saleEndTime,        // 0 = open-ended
    uint256 _totalTokenSupply    // NEW
) external initializer {
    // ... existing zero-address + caps + fee + window checks ...

    // NEW: total supply must be > 0
    if (_totalTokenSupply == 0) revert ZeroTokenSupply();

    // NEW: open-ended detection
    openEnded = (_saleEndTime == 0);

    // NEW: if fixed-end, validate window stays inside MAX_SALE_DURATION
    if (!openEnded && _saleEndTime - _saleStartTime > MAX_SALE_DURATION)
        revert SaleWindowTooLong();

    // NEW: read token decimals
    try IERC20Metadata(_token).decimals() returns (uint8 d) {
        tokenDecimals = d;
    } catch {
        tokenDecimals = 18;  // fallback
    }

    // ... existing assignments ...
    totalTokenSupply = _totalTokenSupply;
    saleStartTime = _saleStartTime;
    saleEndTime = _saleEndTime;
    lastPhaseAddedAt = _saleStartTime;  // initialize for inactivity check
    status = SaleStatus.Draft;
}
```

New errors:
```solidity
error ZeroTokenSupply();
error SaleWindowTooLong();
error TokenSupplyExceeded();
error PhaseOverlap();
error CannotExtendEnded();
error ExtensionTooEarly();
error ExtensionOverlap();
error TopUpBelowFloor();
error TopUpBelowMin();
error NoActivePhase();
error PhaseStillActive();
error NotApproved();
error AlreadyApproved();
error InactivityNotReached();
error SafetyFloorNotReached();
error RefundsNotActive();
error LastChunkOnly();
error NotUSDCContributor();
```

---

## 4. Two-step activation

```solidity
function approveSale() external adminOnly onlyStatus(SaleStatus.Draft) {
    if (approved) revert AlreadyApproved();
    approved = true;
    emit SaleApproved();
}

function unapproveSale() external adminOnly onlyStatus(SaleStatus.Draft) {
    if (!approved) revert NotApproved();
    approved = false;
    emit SaleUnapproved();
}

function activate() external onlyIssuer onlyStatus(SaleStatus.Draft) {
    if (!approved) revert NotApproved();
    // existing checks: tokens deposited, phases.length > 0
    // ... existing body ...
    status = SaleStatus.Active;
    emit SaleStatusChanged(SaleStatus.Active);
}
```

`reject()` stays admin-only.

---

## 5. addPhase() — full check list (round 5)

```solidity
function addPhase(
    string calldata name,
    uint256 pricePerToken,
    uint256 allocation,
    uint256 minContribution,
    uint256 maxContribution,
    uint256 topUpMin,             // NEW
    uint256 startTime,
    uint256 endTime,
    bool whitelistOnly,
    AllocationMode allocationMode  // NEW
) external onlyIssuer {
    if (status != SaleStatus.Draft && status != SaleStatus.Active) revert CannotAddPhase();

    // Existing round-4 checks
    if (pricePerToken == 0) revert ZeroPricePerToken();
    if (minContribution == 0) revert ZeroMinContribution();
    if (maxContribution != 0 && maxContribution < minContribution) revert InvalidContributionRange();
    if (startTime >= endTime) revert InvalidPhaseTimeRange();
    if (endTime <= block.timestamp) revert PhaseInPast();
    if (startTime < saleStartTime) revert PhaseOutsideSaleWindow();

    // NEW: if open-ended, only validate the lower bound; otherwise also upper bound
    if (!openEnded && endTime > saleEndTime) revert PhaseOutsideSaleWindow();

    // NEW: open-ended also has the safety floor
    if (openEnded && endTime > saleStartTime + MAX_SALE_DURATION) revert SaleWindowTooLong();

    // NEW: top-up minimum
    if (topUpMin < TOP_UP_MIN_FLOOR) revert TopUpBelowFloor();

    // NEW: phase overlap check (linear scan)
    for (uint256 i = 0; i < phases.length; i++) {
        Phase storage p = phases[i];
        // Two windows [a,b] and [c,d] overlap iff a < d && c < b
        if (startTime < p.endTime && p.startTime < endTime) revert PhaseOverlap();
    }

    // NEW: allocation mode validation
    if (allocationMode == AllocationMode.Fixed) {
        if (allocation == 0) revert ZeroPhaseAllocation();
        // Sum of all Fixed phase allocations + Remaining phases' max possible
        // The Fixed allocation must fit in remaining supply
        if (_totalFixedAllocations() + allocation > totalTokenSupply)
            revert TokenSupplyExceeded();
    } else {
        // Remaining: allocation field is informational; phase can buy up to
        // (totalTokenSupply - sumOfFixed - sumOfRemainingSold)
        // No upfront check needed; runtime check at buy time
    }

    phases.push(Phase({
        name: name,
        pricePerToken: pricePerToken,
        allocation: allocation,
        sold: 0,
        minContribution: minContribution,
        maxContribution: maxContribution,
        topUpMin: topUpMin,
        startTime: startTime,
        endTime: endTime,
        whitelistOnly: whitelistOnly,
        allocationMode: allocationMode
    }));
    lastPhaseAddedAt = block.timestamp;  // for inactivity timeout
    emit PhaseAdded(phases.length - 1, name, pricePerToken);
}

function _totalFixedAllocations() internal view returns (uint256 sum) {
    for (uint256 i = 0; i < phases.length; i++) {
        if (phases[i].allocationMode == AllocationMode.Fixed) {
            sum += phases[i].allocation;
        }
    }
}
```

---

## 6. extendPhase()

```solidity
function extendPhase(uint256 phaseId, uint256 newEndTime) external onlyIssuer {
    if (phaseId >= phases.length) revert InvalidPhase();
    Phase storage p = phases[phaseId];

    // Phase must be Active or Upcoming (not Ended)
    if (block.timestamp > p.endTime) revert CannotExtendEnded();

    // newEndTime must be strictly later
    if (newEndTime <= p.endTime) revert ExtensionTooEarly();

    // newEndTime must be in the future
    if (newEndTime <= block.timestamp) revert PhaseInPast();

    // Must not overlap next phase
    for (uint256 i = phaseId + 1; i < phases.length; i++) {
        if (phases[i].startTime < newEndTime) revert ExtensionOverlap();
    }

    // Must stay inside sale window (fixed-end only)
    if (!openEnded && newEndTime > saleEndTime) revert PhaseOutsideSaleWindow();

    // Open-ended safety floor
    if (openEnded && newEndTime > saleStartTime + MAX_SALE_DURATION) revert SaleWindowTooLong();

    p.endTime = newEndTime;
    emit PhaseExtended(phaseId, newEndTime);
}
```

---

## 7. buy() — round 5

Same skeleton as today plus:

```solidity
function buy(uint256 phaseId, uint256 amount) external nonReentrant onlyStatus(SaleStatus.Active) {
    // ... existing phase-bounds + time-window + KYC + whitelist checks ...

    // First-time buyer minimum (existing)
    if (totalContributed[msg.sender] == 0) {
        if (amount < phase.minContribution) revert BelowMinContribution();
    } else {
        // NEW: repeat buyer must clear topUpMin
        if (amount < phase.topUpMin) revert TopUpBelowMin();
    }

    // Existing max contribution check
    if (phase.maxContribution > 0 && totalContributed[msg.sender] + amount > phase.maxContribution)
        revert ExceedsMaxContribution();

    // Existing hardcap + maxPerBlock + KYC checks
    if (totalRaised + amount > hardCap) revert ExceedsHardCap();

    // Token allocation
    uint256 tokensToAllocate = (amount * (10 ** tokenDecimals)) / phase.pricePerToken;
    if (tokensToAllocate == 0) revert AmountTooSmall();

    // NEW: total supply check
    if (totalTokenSold + tokensToAllocate > totalTokenSupply) revert TokenSupplyExceeded();

    // NEW: per-phase allocation check (only Fixed mode)
    if (phase.allocationMode == AllocationMode.Fixed) {
        if (phase.sold + tokensToAllocate > phase.allocation) revert ExceedsAllocation();
    }
    // For Remaining mode, no per-phase cap; only the global totalTokenSupply applies

    // NEW: "last chunk" exception — if remaining supply is < topUpMin / minContribution,
    // allow buying exactly what's left
    uint256 remaining = totalTokenSupply - totalTokenSold;
    bool isLastChunk = (
        amount < phase.minContribution &&
        totalContributed[msg.sender] == 0 &&
        tokensToAllocate >= remaining
    );
    if (amount < phase.minContribution && totalContributed[msg.sender] == 0 && !isLastChunk) {
        revert BelowMinContribution();  // already handled above, but explicit
    }

    // Effects
    phase.sold += tokensToAllocate;
    totalRaised += amount;
    totalTokenSold += tokensToAllocate;            // NEW
    totalContributed[msg.sender] += amount;
    usdcContributed[msg.sender] += amount;          // NEW: USDC-specific tracking
    usdcContributedTotal += amount;                 // NEW: for fee calc
    _blockContributions[block.number] += amount;
    contributions[msg.sender].amount += amount;
    contributions[msg.sender].tokensAllocated += tokensToAllocate;

    // Interactions
    paymentToken.safeTransferFrom(msg.sender, address(this), amount);

    if (saleMode == SaleMode.Direct) {
        IERC20(token).safeTransfer(msg.sender, tokensToAllocate);
        contributions[msg.sender].claimed = true;
    } else {
        // Vested mode — mint id 1 (USDC fractions)
        fractionToken.mint(msg.sender, 1, tokensToAllocate, "");
        vault.recordAllocation(msg.sender, 1, tokensToAllocate);
    }

    // CHANGED: defer finalize, just set the flag
    if (totalRaised >= hardCap || totalTokenSold >= totalTokenSupply) {
        finalizationPending = true;
        emit FinalizationPending(totalRaised, totalTokenSold);
    }

    emit Purchase(msg.sender, phaseId, amount, tokensToAllocate, false);
}
```

`buyOTC()` is symmetric — same checks, same defer-finalize, but mints id 2:

```solidity
fractionToken.mint(msg.sender, 2, tokensToAllocate, "");
vault.recordAllocation(msg.sender, 2, tokensToAllocate);
otcContributed[msg.sender] += amount;
```

The `usdcContributed` mapping is **not** incremented in `buyOTC()`. That's the
key fix for the refund bug.

---

## 8. ERC-1155 fraction token

New file `contracts/src/fraction/CiretaFractionToken1155.sol`. Replaces the
existing ERC-20 `CiretaFractionToken.sol`.

```solidity
contract CiretaFractionToken1155 is
    Initializable,
    ERC1155Upgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    uint256 public constant ID_USDC = 1;
    uint256 public constant ID_OTC  = 2;

    IIdentityRegistry public identityRegistry;
    address public projectToken;
    address public vault;
    uint8 public tokenDecimals;  // matches project token

    error RecipientNotVerified(address to);
    error ZeroAmount();
    error InvalidId();

    function initialize(
        address _identityRegistry,
        address _projectToken,
        address _vault,
        uint8 _decimals,
        string memory _uri
    ) public initializer {
        __ERC1155_init(_uri);
        // ... role grants, address checks ...
    }

    function mint(address to, uint256 id, uint256 amount, bytes memory data)
        external onlyRole(MINTER_ROLE)
    {
        if (id != ID_USDC && id != ID_OTC) revert InvalidId();
        if (amount == 0) revert ZeroAmount();
        _mint(to, id, amount, data);
    }

    function burn(address from, uint256 id, uint256 amount)
        external onlyRole(BURNER_ROLE)
    {
        if (amount == 0) revert ZeroAmount();
        _burn(from, id, amount);
    }

    /// Soul-bound: disable peer transfers, allow only mint/burn
    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal override {
        if (from != address(0) && to != address(0)) {
            revert("Fractions are non-transferable");
        }
        super._update(from, to, ids, values);
    }
}
```

Soul-bound by design — closes blind spot B3 (fractions transfers don't follow
vault accounting).

---

## 9. Vault — round 5

`recordAllocation` gains the `id` param:

```solidity
struct InvestorVesting {
    uint256 totalUsdcFractions;   // id 1
    uint256 totalOtcFractions;    // id 2
    uint256 claimedUsdc;
    uint256 claimedOtc;
}

function recordAllocation(address investor, uint256 id, uint256 amount)
    external onlySale
{
    if (id == 1) {
        investorVesting[investor].totalUsdcFractions += amount;
    } else if (id == 2) {
        investorVesting[investor].totalOtcFractions += amount;
    } else {
        revert InvalidId();
    }
    totalLocked += amount;
}
```

`claim()` releases both ids together (or separately, see below):

```solidity
function claim() external nonReentrant {
    if (!finalized) revert NotFinalized();
    // KYC re-check (closes blind spot B6)
    if (!IIdentityRegistry(identityRegistry).isVerified(msg.sender)) revert KYCRequired();

    InvestorVesting storage iv = investorVesting[msg.sender];
    uint256 claimableUsdc = _calculateVested(iv.totalUsdcFractions, iv.claimedUsdc);
    uint256 claimableOtc = _calculateVested(iv.totalOtcFractions, iv.claimedOtc);
    uint256 total = claimableUsdc + claimableOtc;
    if (total == 0) revert NothingToClaim();

    iv.claimedUsdc += claimableUsdc;
    iv.claimedOtc += claimableOtc;
    totalReleased += total;

    if (claimableUsdc > 0) fractionToken.burn(msg.sender, 1, claimableUsdc);
    if (claimableOtc > 0) fractionToken.burn(msg.sender, 2, claimableOtc);

    projectToken.safeTransfer(msg.sender, total);
    emit TokensClaimed(msg.sender, claimableUsdc, claimableOtc);
}
```

Same vesting math for both ids — no functional difference between USDC and OTC
fractions at claim time.

---

## 10. Refund — round 5 (the big fix)

```solidity
function activateRefunds() external onlyIssuerOrAdmin {
    // Allowed when status is FinalizedFailed or stale (open-ended timeout/floor)
    if (status != SaleStatus.FinalizedFailed) revert InvalidStatus();
    if (refundsActive) revert AlreadyApproved();  // reuse error
    refundsActive = true;
    emit RefundsActivated();
}

function claimRefund() external nonReentrant {
    if (!refundsActive) revert RefundsNotActive();
    if (status != SaleStatus.FinalizedFailed) revert InvalidStatus();

    // Only USDC contributors get refunds
    uint256 refundAmount = usdcContributed[msg.sender];
    if (refundAmount == 0) revert NotUSDCContributor();
    if (contributions[msg.sender].refunded) revert AlreadyClaimed();

    contributions[msg.sender].refunded = true;
    usdcContributed[msg.sender] = 0;  // zero out to prevent double-spend

    // Burn the investor's id-1 fractions (vested mode only)
    if (saleMode == SaleMode.Vested) {
        uint256 fractionBalance = fractionToken.balanceOf(msg.sender, 1);
        if (fractionBalance > 0) {
            fractionToken.burn(msg.sender, 1, fractionBalance);
        }
        // OTC fractions (id 2) stay with the investor — they're worthless
        // but the contract doesn't burn them. Off-chain refund handles OTC.
    }

    paymentToken.safeTransfer(msg.sender, refundAmount);
    emit RefundClaimed(msg.sender, refundAmount);
}
```

OTC contributors who try to call `claimRefund()` will revert with
`NotUSDCContributor()`. They get a clear error and the off-chain refund flow
takes over.

---

## 11. closeSale() — open-ended sales

```solidity
function closeSale(bool failed) external nonReentrant {
    if (status != SaleStatus.Active && status != SaleStatus.Paused) revert InvalidStatus();
    if (phases.length == 0) revert NoActivePhase();

    // No phase currently active
    for (uint256 i = 0; i < phases.length; i++) {
        Phase storage p = phases[i];
        if (block.timestamp >= p.startTime && block.timestamp <= p.endTime) {
            revert PhaseStillActive();
        }
    }

    // Authorization
    bool isOwner = msg.sender == issuer || _isAdmin(msg.sender);
    bool safetyFloorReached = openEnded &&
        block.timestamp >= saleStartTime + MAX_SALE_DURATION;
    bool inactivityTimeoutReached = openEnded &&
        block.timestamp >= lastPhaseAddedAt + INACTIVITY_TIMEOUT &&
        totalRaised < softCap;

    if (!isOwner && !safetyFloorReached && !inactivityTimeoutReached) {
        revert NotIssuerOrAdmin();
    }

    // Choose finalize branch
    if (failed) {
        _finalize(false);  // explicit failure
    } else if (safetyFloorReached || inactivityTimeoutReached) {
        // Anyone-callable path: finalize based on actual cap state
        _finalize(totalRaised >= softCap);
    } else {
        // Issuer/admin path with success preference: finalize as success if
        // soft cap met, otherwise failed
        _finalize(totalRaised >= softCap);
    }
}
```

`_finalize()` becomes parameterized (today it derives from `totalRaised >=
softCap` internally; round 5 it accepts an explicit branch param).

---

## 12. finalizeSale() — round 5

```solidity
function finalizeSale() external onlyIssuerOrAdmin nonReentrant {
    if (status != SaleStatus.Active && status != SaleStatus.Paused) revert InvalidStatus();
    // Allowed only if hardcap reached, all tokens sold, or sale window ended
    bool canFinalize =
        finalizationPending ||
        (saleEndTime > 0 && block.timestamp >= saleEndTime);
    if (!canFinalize) revert CannotFinalize();
    _finalize(totalRaised >= softCap);
}
```

For open-ended sales, `finalizeSale()` is unreachable (the only path is
`closeSale()`). For fixed-end sales, the issuer/admin can call after the
window expires or after the hardcap flag fires.

---

## 13. Whitelist locking

```solidity
function setWhitelist(uint256 phaseId, address[] calldata addresses, bool allow)
    external onlyIssuer
{
    if (status == SaleStatus.Rejected) revert InvalidStatus();
    if (phaseId >= phases.length) revert InvalidPhase();
    // NEW: locked once phase has started
    if (block.timestamp >= phases[phaseId].startTime) revert PhaseStillActive();
    for (uint256 i = 0; i < addresses.length; i++) {
        whitelisted[phaseId][addresses[i]] = allow;
    }
    emit WhitelistUpdated(phaseId, addresses.length, allow);
}
```

---

## 14. New events

```solidity
event SaleApproved();
event SaleUnapproved();
event PhaseExtended(uint256 indexed phaseId, uint256 newEndTime);
event FinalizationPending(uint256 totalRaised, uint256 totalTokenSold);
event RefundsActivated();
event SaleClosed(bool failed, address closer, string reason);
event TokensClaimed(address indexed claimer, uint256 usdcFractions, uint256 otcFractions);  // CHANGED: split
```

---

## 15. Backend changes (mirror of contract changes)

`apps/api/services/web3_sale_service.py`:
- `deploy_sale*` takes new `total_token_supply` param
- Encodes the new 14-arg `initialize()`

`apps/api/api/v1/endpoints/sales.py`:
- `add_phase` validates `top_up_min`, `allocation_mode`, computes the same checks the contract does
- `deploy_sale` derives `total_token_supply` from the issuer's input on the sale (new field on `token_sales` DB row)
- New endpoints: `POST /sales/{id}/approve` (admin), `POST /sales/{id}/activate` (issuer)
- New endpoint: `POST /sales/{id}/extend-phase` with `phase_id` + `new_end_time`
- New endpoint: `POST /sales/{id}/close` (open-ended only) with `failed: bool`
- New endpoint: `POST /sales/{id}/activate-refunds`

`apps/api/schemas/sale.py`:
- `SalePhaseCreate` gains `top_up_min: Decimal = Field(..., gt=999, ...)` (1000 USDC floor)
- `SalePhaseCreate` gains `allocation_mode: Literal["fixed", "remaining"]`
- `SaleCreateRequest` gains `total_token_supply: Decimal`
- `SaleCreateRequest` gains `sale_end_time: datetime | None` (None = open-ended)

`apps/api/models/token_sale.py`:
- New columns: `total_token_supply: Numeric`, `is_open_ended: bool`, `approved_at: datetime`, `activated_at: datetime`, `refunds_activated_at: datetime`, `last_phase_added_at: datetime`

`apps/api/models/sale_phase.py`:
- New columns: `top_up_min: Numeric`, `allocation_mode: Enum("fixed","remaining")`

`apps/api/models/contribution.py`:
- New columns: `usdc_amount: Numeric`, `otc_amount: Numeric` (split out from existing `amount`)

Alembic migration: `alembic revision -m "round5 sale schema"` adds all new columns.

---

## 16. Frontend changes

`apps/admin`:
- Sale create form gains `Total token supply` field, `Sale end date (optional)` checkbox + datepicker
- Phase add form gains `Top up minimum` field, `Allocation mode` radio (Fixed | Use remaining supply)
- New "Approve sale" button on the sale detail page (admin only)
- New "Activate sale" button on the sale detail page (issuer only, post-approval)
- New "Extend phase" button on each active/upcoming phase
- New "Close sale" button (open-ended sales only, when no phase active)
- New "Activate refunds" button (failed sales only)

`apps/launchpad`:
- Project page status pill: `Active — open-ended`, `Active — closes Apr 30`, `Stale — refund open`, `Closed — successful`, `Closed — refund available`
- Project page shows current active phase end time as primary countdown (no sale-level countdown)
- "Awaiting next phase from issuer" state when no phase active in open-ended sale
- "Issuer activity" indicator: `Last phase added: 5 days ago`
- Safety floor display for open-ended: `If soft cap not met by Aug 2028, refunds open automatically`
- New "Pending launch" tile for approved-but-not-activated sales, with subscribe CTA
- Failed sale label: `Closed — refund available` instead of `Failed`
- Refund flow: only id-1 holders can claim; OTC holders see "Contact issuer for OTC refund"
- Vested claim flow updated for ERC-1155 (single `claim()` releases both ids)

---

## 17. Open issues to track but NOT fix in round 5

These are blind spots from `SALE_SYSTEM_DEEP_DIVE.md` Part 3 that we're
explicitly deferring:

- **B11 — Cliff release semantics** — keep current "delayed start of linear" interpretation. Document.
- **B12 — Max wallets per investor / sybil resistance** — out of scope, lives in registry layer
- **B5 — Token decimals validation** — closed in round 5 (`tokenDecimals` field read from `IERC20Metadata`)
- **B6 — KYC re-verification on claim** — closed in round 5 (vault.claim re-checks)
- **B2 — Per-investor `vestingStart`** — removed (dead code)
- **B8 — `totalOtcAllocated` dead state** — removed
- **B1 — `Contribution.isOtc` flag** — removed (replaced by `otcContributed > 0` check)
- **B3 — Fraction transferability** — fractions are now soul-bound (ERC-1155 `_update` reverts on peer transfer)
- **B9 — Whitelist mid-phase mutation** — closed (locked once phase starts)
- **B10 — `OTCAllocation` event dead** — verify and remove if unused

---

## 18. Implementation order

Round 5 lands as **one breaking-change PR**, deployed as part of the
`FRESH_DEPLOY_PLAN.md` fresh redeploy. Stages within the PR (for review
sanity, not separate commits):

1. **Storage layout + new types** — update Sale.sol structs, errors, constants
2. **`initialize()` rewrite** — new params, new validation
3. **Two-step activation** — `approveSale`, `unapproveSale`, `activate` flip
4. **`addPhase()` rewrite** — overlap check, top-up min, allocation mode
5. **`extendPhase()`** — new function
6. **`buy()` + `buyOTC()` rewrite** — new accounting splits, defer-finalize, last-chunk
7. **`closeSale()`** — new function for open-ended
8. **`finalizeSale()`** — accept the deferred-finalize path
9. **Refund rewrite** — `activateRefunds`, `claimRefund` with id-1-only logic
10. **Vault rewrite** — id 1 / id 2 split
11. **CiretaFractionToken1155** — new file replacing ERC-20 fraction token
12. **Factory updates** — fraction factory deploys ERC-1155, sale factory passes new init params
13. **Storage cleanup** — remove dead state (B1, B2, B8)
14. **Whitelist lock** — `setWhitelist` post-start check
15. **Backend deploy script + endpoint updates**
16. **Pydantic schema + DB migration**
17. **Admin UI updates**
18. **Launchpad UI updates**
19. **Tests** — contract unit tests for every new revert path
20. **Doc updates** — `BUY_FLOW_USDC_AND_OTC.md`, `CONTRACT_VALIDATION_AUDIT.md`, mark round 5 status

---

## 19. Deploy

- Compile contracts
- Run all existing contract tests + new round-5 tests
- Run `scripts/deploy_clean_testnet.py` (or extend `deploy_round4_impls.py`)
- Update `contracts/deployments/base-sepolia.json`
- Update `.env` + Railway env vars
- Wipe DB tables that reference old chain state
- Run round-5 Alembic migration
- Smoke test end-to-end via the launchpad

This deploy is the one described in `FRESH_DEPLOY_PLAN.md` — round 5 + fresh
deploy land together as one event.

---

## 20. Effort estimate

| Stage | Effort |
| --- | --- |
| Contracts (Sale + Vault + Fraction1155 + factories) | 1.5 days |
| Backend (web3 service + endpoints + Pydantic + migration) | 1 day |
| Admin UI (sale create form, approve/activate/extend/close buttons) | 1 day |
| Launchpad UI (status pills, open-ended states, refund flow, claim ERC-1155) | 1 day |
| Tests (contract unit + integration) | 1 day |
| Fresh deploy execution + smoke test | 0.5 day |
| **Total** | **~6 days** |

Single breaking-change PR. Fresh deploy at the end. No upgrade dance on
existing testnet sales.
