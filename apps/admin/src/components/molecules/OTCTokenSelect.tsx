"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAccount, useReadContract } from "wagmi";
import { isAddress } from "viem";
import type { Abi } from "viem";
import { Input } from "@/components/atoms";
import { OTC_TOKEN_FACTORY_ABI } from "@/lib/contracts/abis/otcTokenFactory";

const ERC20_NAME_SYMBOL_ABI = [
  { name: "name", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

interface Props {
  value: string;
  onChange: (address: string) => void;
  required?: boolean;
}

function maskAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

interface IssuerOTCToken {
  address: `0x${string}`;
  name?: string;
  symbol?: string;
}

function useIssuerOTCTokens(walletAddress: `0x${string}` | undefined): IssuerOTCToken[] {
  const factoryAddr = process.env.NEXT_PUBLIC_OTC_TOKEN_FACTORY_ADDRESS as `0x${string}` | undefined;
  const { data: tokenAddrs } = useReadContract({
    address: factoryAddr,
    abi: OTC_TOKEN_FACTORY_ABI as unknown as Abi,
    functionName: "getIssuerOTCTokens",
    args: walletAddress ? [walletAddress] : undefined,
    query: { enabled: !!factoryAddr && !!walletAddress },
  });
  return useMemo(() => {
    return ((tokenAddrs as `0x${string}`[] | undefined) ?? [])
      .filter((a) => a !== "0x0000000000000000000000000000000000000000")
      .map((address) => ({ address }));
  }, [tokenAddrs]);
}

function OTCTokenLabel({ address, onLabel }: { address: `0x${string}`; onLabel: (label: string) => void }) {
  const { data: name } = useReadContract({
    address, abi: ERC20_NAME_SYMBOL_ABI, functionName: "name",
  });
  const { data: symbol } = useReadContract({
    address, abi: ERC20_NAME_SYMBOL_ABI, functionName: "symbol",
  });
  useEffect(() => {
    if (name && symbol) {
      onLabel(`${name} (${symbol}) — ${maskAddress(address)}`);
    }
  }, [name, symbol, address, onLabel]);
  return null;
}

export function OTCTokenSelect({ value, onChange, required }: Props) {
  const { address: walletAddress } = useAccount();
  const issuerTokens = useIssuerOTCTokens(walletAddress as `0x${string}` | undefined);

  // Hold async-loaded labels keyed by address
  const [labels, setLabels] = useState<Record<string, string>>({});
  const setLabel = (addr: string, label: string) =>
    setLabels((prev) => (prev[addr] === label ? prev : { ...prev, [addr]: label }));

  const [mode, setMode] = useState<"preset" | "custom">("preset");
  const [customValue, setCustomValue] = useState("");
  const [hydrated, setHydrated] = useState(false);

  // Decide initial mode once we know the issuer's tokens — if value isn't in
  // the list, switch to custom and prefill the input.
  useEffect(() => {
    if (hydrated || !value) return;
    const matches = issuerTokens.some((t) => t.address.toLowerCase() === value.toLowerCase());
    if (issuerTokens.length === 0) {
      // Don't decide yet if list is still loading. Once loaded with empty array,
      // any preset value can't be in the list, so switch to custom.
      setMode("custom");
      setCustomValue(value);
      setHydrated(true);
    } else if (!matches) {
      setMode("custom");
      setCustomValue(value);
      setHydrated(true);
    } else {
      setHydrated(true);
    }
  }, [value, issuerTokens, hydrated]);

  const selectValue = mode === "custom" ? "__custom__" : value;
  const showEmptyHint =
    !issuerTokens.length && !!walletAddress && mode === "preset" && !value;

  return (
    <div className="space-y-2">
      <label className="input-label">
        OTC Token Contract Address{required ? " *" : " (optional)"}
      </label>
      {/* Hidden mounts that report each address's name/symbol once loaded */}
      {issuerTokens.map((t) => (
        <OTCTokenLabel
          key={t.address}
          address={t.address}
          onLabel={(label) => setLabel(t.address, label)}
        />
      ))}
      <select
        className="input-field appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%230C0C0C%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_1rem_center] bg-[length:1rem] pr-10"
        value={selectValue}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__custom__") {
            setMode("custom");
            onChange(isAddress(customValue) ? customValue : "");
          } else if (v === "") {
            setMode("preset");
            onChange("");
          } else {
            setMode("preset");
            onChange(v);
          }
        }}
      >
        <option value="">Select OTC token…</option>
        {issuerTokens.map((t) => (
          <option key={t.address} value={t.address}>
            {labels[t.address] ?? maskAddress(t.address)}
          </option>
        ))}
        <option value="__custom__">Custom address…</option>
      </select>
      {mode === "custom" && (
        <Input
          placeholder="0x..."
          value={customValue}
          maxLength={42}
          onChange={(e) => {
            const v = e.target.value.trim();
            setCustomValue(v);
            onChange(isAddress(v) ? v : "");
          }}
          error={customValue && !isAddress(customValue) ? "Invalid EVM address" : undefined}
          helperText="Paste any deployed OTC token contract address."
        />
      )}
      {showEmptyHint && (
        <p className="text-xs text-zinc-500">
          You haven&apos;t deployed any OTC tokens yet — deploy one at{" "}
          <Link href="/issuer/tokens" className="underline">Tokens</Link>, or pick &quot;Custom address…&quot;.
        </p>
      )}
    </div>
  );
}
