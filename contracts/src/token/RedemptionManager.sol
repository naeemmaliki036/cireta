// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title RedemptionManager
 * @dev Per-token contract that manages redemption requests.
 * Investors burn tokens; the issuer fulfils in cash or physical delivery.
 */
contract RedemptionManager is
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    ReentrancyGuard
{
    using SafeERC20 for IERC20;

    enum RedemptionStatus { Pending, Processing, Fulfilled, Cancelled }
    enum FulfillmentMethod { Cash, Physical }

    struct RedemptionRequest {
        address investor;
        uint256 amount;
        FulfillmentMethod method;
        RedemptionStatus status;
        uint256 createdAt;
        uint256 fulfilledAt;
    }

    IERC20 public token;
    uint256 public requestCount;
    mapping(uint256 => RedemptionRequest) public requests;
    mapping(address => uint256[]) public investorRequests;

    event RedemptionRequested(uint256 indexed id, address indexed investor, uint256 amount);
    event RedemptionFulfilled(uint256 indexed id, address indexed investor);
    event RedemptionCancelled(uint256 indexed id);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(address _token, address initialOwner) public initializer {
        __Ownable_init(initialOwner);
        // ReentrancyGuard has no init (non-upgradeable)
        token = IERC20(_token);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    /**
     * @dev Investor submits a redemption request.
     * Tokens are transferred from investor to this contract (held until fulfilled).
     */
    function requestRedemption(
        uint256 amount,
        FulfillmentMethod method
    ) external nonReentrant returns (uint256 id) {
        require(amount > 0, "zero amount");
        token.safeTransferFrom(msg.sender, address(this), amount);

        id = requestCount++;
        requests[id] = RedemptionRequest({
            investor: msg.sender,
            amount: amount,
            method: method,
            status: RedemptionStatus.Pending,
            createdAt: block.timestamp,
            fulfilledAt: 0
        });
        investorRequests[msg.sender].push(id);

        emit RedemptionRequested(id, msg.sender, amount);
    }

    /**
     * @dev Issuer marks a redemption as fulfilled (off-chain delivery confirmed).
     * Held tokens are burned.
     */
    function fulfil(uint256 id) external onlyOwner nonReentrant {
        RedemptionRequest storage req = requests[id];
        require(req.status == RedemptionStatus.Pending || req.status == RedemptionStatus.Processing, "invalid status");
        req.status = RedemptionStatus.Fulfilled;
        req.fulfilledAt = block.timestamp;
        emit RedemptionFulfilled(id, req.investor);
    }

    /**
     * @dev Investor or issuer cancels a pending request. Tokens returned.
     */
    function cancel(uint256 id) external nonReentrant {
        RedemptionRequest storage req = requests[id];
        require(req.status == RedemptionStatus.Pending, "not pending");
        require(msg.sender == req.investor || msg.sender == owner(), "not authorised");
        req.status = RedemptionStatus.Cancelled;
        token.safeTransfer(req.investor, req.amount);
        emit RedemptionCancelled(id);
    }

    function getInvestorRequests(address investor) external view returns (uint256[] memory) {
        return investorRequests[investor];
    }
}
