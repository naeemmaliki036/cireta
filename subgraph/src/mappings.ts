import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import { Transfer as TransferEvent } from "../generated/CiretaToken/CiretaToken";
import { AddressFrozen as FreezeEventContract } from "../generated/CiretaToken/CiretaToken";
import { Contributed as ContributedEvent } from "../generated/Sale/Sale";
import { DividendClaimed as DividendClaimedEvent } from "../generated/DividendDistributor/DividendDistributor";
import {
  Transfer,
  FreezeEvent,
  SaleContribution,
  DividendClaim,
  TokenStats,
  SaleStats,
  DividendStats,
} from "../generated/schema";

// ============ Token Transfer Handler ============

export function handleTransfer(event: TransferEvent): void {
  let entity = new Transfer(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );

  entity.from = event.params.from;
  entity.to = event.params.to;
  entity.value = event.params.value;
  entity.token = event.address;
  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();

  // Update token stats
  let stats = TokenStats.load(event.address);
  if (stats == null) {
    stats = new TokenStats(event.address);
    stats.totalTransfers = BigInt.fromI32(0);
    stats.totalVolume = BigInt.fromI32(0);
    stats.holderCount = BigInt.fromI32(0);
    stats.frozenCount = BigInt.fromI32(0);
  }
  stats.totalTransfers = stats.totalTransfers.plus(BigInt.fromI32(1));
  stats.totalVolume = stats.totalVolume.plus(event.params.value);
  stats.save();
}

// ============ Freeze/Unfreeze Handler ============

export function handleFreeze(event: FreezeEventContract): void {
  let entity = new FreezeEvent(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );

  entity.wallet = event.params._userAddress;
  entity.frozen = event.params._isFrozen;
  entity.token = event.address;
  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();

  // Update frozen count in stats
  let stats = TokenStats.load(event.address);
  if (stats == null) {
    stats = new TokenStats(event.address);
    stats.totalTransfers = BigInt.fromI32(0);
    stats.totalVolume = BigInt.fromI32(0);
    stats.holderCount = BigInt.fromI32(0);
    stats.frozenCount = BigInt.fromI32(0);
  }
  if (event.params._isFrozen) {
    stats.frozenCount = stats.frozenCount.plus(BigInt.fromI32(1));
  } else {
    stats.frozenCount = stats.frozenCount.minus(BigInt.fromI32(1));
  }
  stats.save();
}

// ============ Sale Contribution Handler ============

export function handleContributed(event: ContributedEvent): void {
  let entity = new SaleContribution(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );

  entity.contributor = event.params.contributor;
  entity.sale = event.address;
  entity.amount = event.params.amount;
  entity.tokensAllocated = event.params.tokensAllocated;
  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();

  // Update sale stats
  let stats = SaleStats.load(event.address);
  if (stats == null) {
    stats = new SaleStats(event.address);
    stats.totalContributions = BigInt.fromI32(0);
    stats.totalRaised = BigInt.fromI32(0);
    stats.contributorCount = BigInt.fromI32(0);
  }
  stats.totalContributions = stats.totalContributions.plus(BigInt.fromI32(1));
  stats.totalRaised = stats.totalRaised.plus(event.params.amount);
  stats.contributorCount = stats.contributorCount.plus(BigInt.fromI32(1));
  stats.save();
}

// ============ Dividend Claim Handler ============

export function handleClaimed(event: DividendClaimedEvent): void {
  let entity = new DividendClaim(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );

  entity.holder = event.params.holder;
  entity.epoch = event.params.epoch;
  entity.amount = event.params.amount;
  entity.distributor = event.address;
  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();

  // Update dividend stats
  let stats = DividendStats.load(event.address);
  if (stats == null) {
    stats = new DividendStats(event.address);
    stats.totalClaimed = BigInt.fromI32(0);
    stats.claimCount = BigInt.fromI32(0);
  }
  stats.totalClaimed = stats.totalClaimed.plus(event.params.amount);
  stats.claimCount = stats.claimCount.plus(BigInt.fromI32(1));
  stats.save();
}
