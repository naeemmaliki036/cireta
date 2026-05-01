/**
 * Re-export barrel for address-based compliance module config panels.
 * Each panel lives in its own focused file to stay under 300 LOC.
 */

export { LockConfig } from "./LockModuleConfig";
export { WhitelistConfig } from "./WhitelistModuleConfig";
export { TransferRestrictConfig, ConditionalTransferConfig } from "./ApprovalModuleConfig";
