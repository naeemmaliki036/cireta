"use client";

import { useState } from "react";
import { isAddress, type Abi } from "viem";
import { useReadContracts } from "wagmi";
import { Button } from "@/components/atoms";
import { SIMPLE_IDENTITY_REGISTRY_ABI } from "@/lib/contracts/abis/simpleIdentityRegistry";

type RoleKey = "DEFAULT_ADMIN_ROLE" | "REGISTRAR_ROLE" | "COMPLIANCE_ROLE" | "AGENT_ROLE";

const ROLE_OPTIONS: { key: RoleKey; label: string; hash: `0x${string}` }[] = [
  {
    key: "DEFAULT_ADMIN_ROLE",
    label: "Default Admin",
    hash: "0x0000000000000000000000000000000000000000000000000000000000000000",
  },
  {
    key: "REGISTRAR_ROLE",
    label: "Registrar",
    hash: "0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6",
  },
  {
    key: "COMPLIANCE_ROLE",
    label: "Compliance",
    hash: "0x2427b1dcc74a5fd2e00a7cd1c578789d9a68f8a42a40e83b7c543bd98e4fc73a",
  },
  {
    key: "AGENT_ROLE",
    label: "Agent",
    hash: "0xcdbf1d1c64faad6046b5b53d6a6821b434c73ab58fcfa37f7fc6c8d3b8e7d68f",
  },
];

interface CheckRolesPanelProps {
  registryAddress: `0x${string}`;
}

export function CheckRolesPanel({ registryAddress }: CheckRolesPanelProps) {
  const [inputAddress, setInputAddress] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const checkedWallet =
    submitted && isAddress(inputAddress) ? (inputAddress as `0x${string}`) : null;

  const { data, isFetching } = useReadContracts({
    contracts:
      checkedWallet && registryAddress
        ? ROLE_OPTIONS.map(({ hash }) => ({
            address: registryAddress,
            abi: SIMPLE_IDENTITY_REGISTRY_ABI as unknown as Abi,
            functionName: "hasRole",
            args: [hash, checkedWallet],
          }))
        : [],
    query: { enabled: !!checkedWallet && !!registryAddress },
  });

  const inputClass =
    `flex-1 bg-box border rounded-lg px-3 py-2 text-text text-sm font-mono ` +
    (inputAddress && !isAddress(inputAddress) ? "border-red-300" : "border-black/10");

  return (
    <div className="bg-white rounded-lg border border-zinc-100 p-5 space-y-3">
      <h2 className="text-sm font-semibold text-zinc-900">Check Roles</h2>
      <p className="text-xs text-zinc-400">
        Look up all four roles for any wallet address — reads from chain, no transaction required.
      </p>

      <div className="flex gap-2">
        <input
          value={inputAddress}
          onChange={(e) => {
            setInputAddress(e.target.value.trim());
            setSubmitted(false);
          }}
          placeholder="0x…"
          maxLength={42}
          className={inputClass}
        />
        <Button
          variant="primary"
          size="sm"
          onClick={() => setSubmitted(true)}
          disabled={!isAddress(inputAddress)}
        >
          Check
        </Button>
      </div>

      {submitted && isAddress(inputAddress) && (
        <div className="flex flex-wrap gap-2 pt-1">
          {isFetching ? (
            <span className="text-xs text-zinc-400">Querying chain…</span>
          ) : (
            ROLE_OPTIONS.map(({ key, label }, i) => {
              const held = data?.[i]?.result === true;
              return held ? (
                <span
                  key={key}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700"
                >
                  &#10003; {label}
                </span>
              ) : (
                <span
                  key={key}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-100 text-zinc-400"
                >
                  {label}: Not held
                </span>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
