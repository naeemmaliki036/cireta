/**
 * useOnChainSaleStats — read sale + per-phase stats directly from the
 * Sale contract so the UI never depends on stale DB columns.
 *
 * Returns:
 * - totalRaised:        Sale.totalRaised() in whole USDC (decimals = 6)
 * - hardCap:            Sale.hardCap()     in whole USDC
 * - softCap:            Sale.softCap()     in whole USDC
 * - totalTokenSold:     Sale.totalTokenSold() in whole project tokens
 * - totalTokenSupply:   Sale.totalTokenSupply() in whole project tokens
 * - tokenDecimals:      Sale.tokenDecimals()
 * - phases:             one entry per phase, [{ allocation, sold, remaining }]
 * - loading / ready:    indicates whether the contract reads have arrived
 *
 * Caller is responsible for passing a non-null sale contract address.
 * When the address is null/undefined, all queries are disabled and the
 * hook returns zeros + ready=false.
 */
import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import { SALE_ABI } from "@/lib/contracts/saleAbi";

const USDC_DECIMALS = 6;

interface PhaseStat {
  /** Whole-token allocation for this phase. */
  allocation: number;
  /** Whole-token amount already sold. */
  sold: number;
  /** Whole-token amount still available (allocation - sold). */
  remaining: number;
}

export interface OnChainSaleStats {
  totalRaised: number;
  hardCap: number;
  softCap: number;
  totalTokenSold: number;
  totalTokenSupply: number;
  tokenDecimals: number;
  phases: PhaseStat[];
  ready: boolean;
}

const ZERO: OnChainSaleStats = {
  totalRaised: 0,
  hardCap: 0,
  softCap: 0,
  totalTokenSold: 0,
  totalTokenSupply: 0,
  tokenDecimals: 6,
  phases: [],
  ready: false,
};

const SALE_VIEW_ABI = SALE_ABI;

export function useOnChainSaleStats(
  saleAddress: `0x${string}` | null | undefined,
  phaseCount: number = 0,
): OnChainSaleStats {
  const enabled = !!saleAddress;

  // Sale-level scalar views — fetched in one batched multicall.
  const { data: scalars } = useReadContracts({
    contracts: enabled
      ? [
          { address: saleAddress!, abi: SALE_VIEW_ABI, functionName: "totalRaised" },
          { address: saleAddress!, abi: SALE_VIEW_ABI, functionName: "totalTokenSold" },
          { address: saleAddress!, abi: SALE_VIEW_ABI, functionName: "totalTokenSupply" },
          { address: saleAddress!, abi: SALE_VIEW_ABI, functionName: "tokenDecimals" },
        ]
      : [],
    query: { enabled },
  });

  // softCap / hardCap aren't currently in the frontend ABI; read via inline ABI
  // so we don't have to ship the whole struct.
  const { data: capScalars } = useReadContracts({
    contracts: enabled
      ? [
          {
            address: saleAddress!,
            abi: [
              {
                name: "softCap",
                type: "function",
                stateMutability: "view",
                inputs: [],
                outputs: [{ name: "", type: "uint256" }],
              },
            ] as const,
            functionName: "softCap",
          },
          {
            address: saleAddress!,
            abi: [
              {
                name: "hardCap",
                type: "function",
                stateMutability: "view",
                inputs: [],
                outputs: [{ name: "", type: "uint256" }],
              },
            ] as const,
            functionName: "hardCap",
          },
        ]
      : [],
    query: { enabled },
  });

  // getPhase(i) for every phase the caller knows about — also batched.
  const phaseContracts = useMemo(() => {
    if (!enabled || phaseCount <= 0) return [];
    return Array.from({ length: phaseCount }, (_, i) => ({
      address: saleAddress!,
      abi: SALE_VIEW_ABI,
      functionName: "getPhase" as const,
      args: [BigInt(i)] as const,
    }));
  }, [enabled, phaseCount, saleAddress]);

  const { data: phaseData } = useReadContracts({
    contracts: phaseContracts,
    query: { enabled: phaseContracts.length > 0 },
  });

  return useMemo(() => {
    if (!enabled || !scalars || scalars.some((r) => r.status !== "success")) {
      return ZERO;
    }
    const totalRaisedRaw = scalars[0]!.result as bigint;
    const totalTokenSoldRaw = scalars[1]!.result as bigint;
    const totalTokenSupplyRaw = scalars[2]!.result as bigint;
    const tokenDecimals = Number(scalars[3]!.result as number);

    const softCapRaw = capScalars?.[0]?.status === "success" ? (capScalars[0].result as bigint) : 0n;
    const hardCapRaw = capScalars?.[1]?.status === "success" ? (capScalars[1].result as bigint) : 0n;

    const phases: PhaseStat[] = (phaseData ?? []).map((entry) => {
      if (entry.status !== "success") {
        return { allocation: 0, sold: 0, remaining: 0 };
      }
      const tup = entry.result as { allocation: bigint; sold: bigint };
      const divisor = BigInt(10) ** BigInt(tokenDecimals);
      const allocation = Number(tup.allocation / divisor);
      const sold = Number(tup.sold / divisor);
      return { allocation, sold, remaining: Math.max(0, allocation - sold) };
    });

    return {
      totalRaised: Number(formatUnits(totalRaisedRaw, USDC_DECIMALS)),
      hardCap: Number(formatUnits(hardCapRaw, USDC_DECIMALS)),
      softCap: Number(formatUnits(softCapRaw, USDC_DECIMALS)),
      totalTokenSold: Number(totalTokenSoldRaw / BigInt(10) ** BigInt(tokenDecimals)),
      totalTokenSupply: Number(totalTokenSupplyRaw / BigInt(10) ** BigInt(tokenDecimals)),
      tokenDecimals,
      phases,
      ready: true,
    };
  }, [enabled, scalars, capScalars, phaseData]);
}
