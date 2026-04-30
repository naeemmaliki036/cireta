"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount, useReadContract } from "wagmi";
import { formatUnits, type Abi } from "viem";
import { Plus, ArrowUpRight, Coins, Pause, Play, Shield, Copy, Rocket, LayoutGrid, List } from "lucide-react";
import { Button, Input, Badge, Spinner } from "@/components/atoms";
import { CopyableAddress } from "@/components/atoms/CopyableAddress";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { IssuerDashboardLayout } from "@/components/templates";
import { getTokens, type Token } from "@/lib/api/repositories/tokens";
import { getAccessToken } from "@/lib/api/client";
import { OTC_TOKEN_ABI } from "@/lib/contracts/abis/otcToken";
import { OTC_TOKEN_FACTORY_ABI } from "@/lib/contracts/abis/otcTokenFactory";
import { useContractAction } from "@/hooks/useContractAction";

function getToken() {
  return getAccessToken() ?? undefined;
}

/** Format supply with full thousand-separated digits, e.g. "2,882" or "1,000,000,000".
 *  Earlier we abbreviated to K/M/B which lost precision (2,882 → "3K"). */
function fmtSupply(raw: string | null | undefined): string {
  const n = parseFloat(raw ?? "0");
  if (!raw || isNaN(n)) return "—";
  // Use locale formatting throughout; even 1B prints as "1,000,000,000" which is
  // clearer than "1.0B" for issuers verifying their own numbers.
  return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

function SupplyCell({ token }: { token: Token }) {
  const current = token.current_supply ?? token.total_supply;
  const max = token.max_supply;
  const maxN = parseFloat(max ?? "0");
  const curN = parseFloat(current ?? "0");
  const maxReached = token.mintable && max && maxN > 0 && curN >= maxN;

  return (
    <div>
      {max ? (
        <p className="font-semibold text-text font-mono text-xs">
          {fmtSupply(current)} / {fmtSupply(max)}
        </p>
      ) : (
        <p className="font-semibold text-text font-mono text-xs">{fmtSupply(current)}</p>
      )}
      {maxReached && (
        <p className="text-[10px] text-amber-600 font-medium mt-0.5">Max reached</p>
      )}
    </div>
  );
}

function TokenCard({ token }: { token: Token }) {
  const addr = token.contract_address;
  const deployed = addr && addr !== "0x0000000000000000000000000000000000000000";
  const masked = deployed ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : null;

  return (
    <Link href={`/issuer/tokens/${token.id}`}
      className="block bg-white rounded-lg border border-zinc-100 hover:border-darkAqua/30 hover:shadow-sm transition-all group">
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-text text-sm">{token.name}</h3>
            <p className="text-xs text-black/40 mt-0.5">{token.symbol} · {token.asset_type} · {token.decimals} decimals</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            <Badge variant={token.mintable ? "default" : "active"} size="sm">
              {token.mintable ? "Mintable" : "Fixed"}
            </Badge>
            {token.is_paused ? (
              <Badge variant="pending" size="sm"><Pause className="h-3 w-3 mr-1" />Paused</Badge>
            ) : deployed ? (
              <Badge variant="active" size="sm"><Play className="h-3 w-3 mr-1" />Active</Badge>
            ) : (
              <Badge variant="pending" size="sm">Not Deployed</Badge>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs mb-3">
          <div className="bg-zinc-50 rounded-md px-3 py-2">
            <p className="text-black/40 mb-0.5">{token.max_supply ? "Supply" : "Total Supply"}</p>
            <SupplyCell token={token} />
          </div>
          <div className="bg-zinc-50 rounded-md px-3 py-2">
            <p className="text-black/40 mb-0.5">Contract</p>
            {masked ? (
              <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigator.clipboard.writeText(addr!); }}
                className="flex items-center gap-1 font-mono font-semibold text-text hover:text-darkAqua transition-colors cursor-pointer text-xs">
                {masked} <Copy className="h-3 w-3 text-black/20" />
              </button>
            ) : (
              <p className="font-semibold text-black/30">—</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-black/30">
            {deployed && <span className="flex items-center gap-1"><Shield className="h-3 w-3" /> ERC-3643</span>}
          </div>
          <ArrowUpRight className="h-4 w-4 text-black/15 group-hover:text-darkAqua transition-colors" />
        </div>
      </div>
    </Link>
  );
}

/** On-chain reads for an OTC token, shared by card + row variants */
function useOTCTokenInfo(otcAddr: string) {
  const abi = OTC_TOKEN_ABI as unknown as Abi;
  const addr = otcAddr as `0x${string}`;
  const { data: name } = useReadContract({ address: addr, abi, functionName: "name" });
  const { data: symbol } = useReadContract({ address: addr, abi, functionName: "symbol" });
  const { data: decimalsRaw } = useReadContract({ address: addr, abi, functionName: "decimals" });
  const { data: totalSupplyRaw } = useReadContract({ address: addr, abi, functionName: "totalSupply" });
  const decimals = typeof decimalsRaw === "number" ? decimalsRaw : 18;
  const totalSupply = totalSupplyRaw ? formatUnits(totalSupplyRaw as bigint, decimals) : "0";
  return {
    name: (name as string) || "OTC Token",
    symbol: (symbol as string) || "OTC",
    totalSupply,
  };
}

/** Single OTC token card with on-chain data */
function OTCTokenCard({ address: otcAddr }: { address: string }) {
  const { name, symbol, totalSupply } = useOTCTokenInfo(otcAddr);

  return (
    <div className="bg-white rounded-lg border border-zinc-100 p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-text text-sm">{name}</h3>
          <p className="text-xs text-black/40">{symbol}</p>
        </div>
        <Badge variant="active" size="sm"><Coins className="h-3 w-3 mr-1" />Deployed</Badge>
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs mb-3">
        <div className="bg-zinc-50 rounded-md px-3 py-2">
          <p className="text-black/40 mb-0.5">Total Minted</p>
          <p className="font-semibold text-text font-mono">{parseFloat(totalSupply).toLocaleString()}</p>
        </div>
        <div className="bg-zinc-50 rounded-md px-3 py-2">
          <p className="text-black/40 mb-0.5">Contract</p>
          <CopyableAddress address={otcAddr} truncate className="text-xs text-text" />
        </div>
      </div>
      <p className="text-[11px] text-black/30 mb-3">Link to a sale via OTC config, then mint from the sale page.</p>
    </div>
  );
}

/** Single OTC token row for list view */
function OTCTokenRow({ address: otcAddr }: { address: string }) {
  const { name, symbol, totalSupply } = useOTCTokenInfo(otcAddr);
  return (
    <tr className="border-b border-zinc-50 hover:bg-zinc-50">
      <td className="px-5 py-3">
        <p className="font-medium text-sm">{name}</p>
        <p className="text-xs text-zinc-400">{symbol}</p>
      </td>
      <td className="px-5 py-3 text-sm font-mono">{parseFloat(totalSupply).toLocaleString()}</td>
      <td className="px-5 py-3">
        <CopyableAddress address={otcAddr} truncate className="text-xs text-zinc-700" />
      </td>
      <td className="px-5 py-3">
        <Badge variant="active" size="sm"><Coins className="h-3 w-3 mr-1" />Deployed</Badge>
      </td>
    </tr>
  );
}

/** OTC Token section — multiple OTC tokens per issuer, one per sale */
function OTCTokenSection() {
  const { address: walletAddress } = useAccount();
  const factoryAddr = process.env.NEXT_PUBLIC_OTC_TOKEN_FACTORY_ADDRESS as `0x${string}` | undefined;
  const platformIR = process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS as `0x${string}` | undefined;
  const deployAction = useContractAction();
  const [otcName, setOtcName] = useState("");
  const [otcSymbol, setOtcSymbol] = useState("");
  const [showDeploy, setShowDeploy] = useState(false);
  const [otcViewMode, setOtcViewMode] = useState<"list" | "grid">("list");

  // Read all issuer OTC tokens from factory
  const { data: otcTokenAddrs, refetch: refetchOtc } = useReadContract({
    address: factoryAddr!,
    abi: OTC_TOKEN_FACTORY_ABI as unknown as Abi,
    functionName: "getIssuerOTCTokens",
    args: walletAddress ? [walletAddress] : undefined,
    query: { enabled: !!factoryAddr && !!walletAddress },
  });

  const otcList = (otcTokenAddrs as string[] | undefined)?.filter(
    (a) => a !== "0x0000000000000000000000000000000000000000"
  ) ?? [];

  const handleDeploy = async () => {
    if (!factoryAddr || !walletAddress || !otcName || !otcSymbol || !platformIR) return;
    const receipt = await deployAction.execute({
      address: factoryAddr,
      abi: OTC_TOKEN_FACTORY_ABI as unknown as Abi,
      functionName: "deployOTCToken",
      args: [otcName, otcSymbol, walletAddress, platformIR],
    });
    if (receipt) {
      refetchOtc();
      setShowDeploy(false);
      setOtcName("");
      setOtcSymbol("");
    }
  };

  if (!factoryAddr || !walletAddress) {
    return <p className="text-center py-6 text-sm text-black/30">Connect your wallet to manage OTC tokens.</p>;
  }

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs text-blue-700">
        <strong>How OTC works:</strong> Deploy an OTC receipt token for each sale that accepts off-platform payments (bank transfers, crypto).
        Mint OTC tokens to buyers after receiving payment. They can use OTC tokens to purchase project tokens at the sale price.
        Only KYC-verified wallets can receive OTC tokens — verified through the Cireta platform identity registry.
      </div>

      {otcList.length > 0 && (
        <div className="flex justify-end">
          <div className="flex items-center bg-zinc-100 rounded-md p-0.5">
            <button onClick={() => setOtcViewMode("list")}
              className={`p-1.5 rounded-md transition-colors ${otcViewMode === "list" ? "bg-white text-text shadow-sm" : "text-black/40 hover:text-text"}`}
              title="List view">
              <List className="h-4 w-4" />
            </button>
            <button onClick={() => setOtcViewMode("grid")}
              className={`p-1.5 rounded-md transition-colors ${otcViewMode === "grid" ? "bg-white text-text shadow-sm" : "text-black/40 hover:text-text"}`}
              title="Card view">
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {otcList.length > 0 ? (
        otcViewMode === "list" ? (
          <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-zinc-500 uppercase border-b border-zinc-100">
                  <th className="px-5 py-3">Token</th>
                  <th className="px-5 py-3">Total Minted</th>
                  <th className="px-5 py-3">Contract</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {otcList.map((addr) => <OTCTokenRow key={addr} address={addr} />)}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {otcList.map((addr) => <OTCTokenCard key={addr} address={addr} />)}
          </div>
        )
      ) : (
        <p className="text-sm text-black/30 py-2">No OTC tokens deployed yet.</p>
      )}

      {/* Deploy new */}
      {!showDeploy ? (
        <Button variant="outline" size="sm" onClick={() => setShowDeploy(true)} leftIcon={<Plus className="h-4 w-4" />}>
          Deploy New OTC Token
        </Button>
      ) : (
        <div className="bg-white rounded-lg border border-zinc-100 p-5 space-y-3">
          <h3 className="font-semibold text-text text-sm">Deploy New OTC Token</h3>
          <p className="text-xs text-black/40">Deploy one OTC receipt token per sale. Link it to the sale via OTC configuration.</p>
          <div className="grid grid-cols-2 gap-3">
            <Input label="OTC Token Name" value={otcName} onChange={(e) => setOtcName(e.target.value)} placeholder="e.g. Gold OTC Receipt" />
            <Input label="Symbol" value={otcSymbol} onChange={(e) => setOtcSymbol(e.target.value)} placeholder="e.g. gOTC" />
          </div>
          <p className="text-xs text-black/30">OTC tokens are minted on-demand to individual buyers after receiving off-platform payment — no initial supply needed. Uses the Cireta platform identity registry.</p>
          <div className="flex items-center gap-2">
            <Button variant="primary" size="sm" onClick={handleDeploy}
              disabled={!otcName || !otcSymbol || !platformIR || deployAction.isPending || deployAction.isConfirming}
              isLoading={deployAction.isPending || deployAction.isConfirming}>
              <Rocket className="h-4 w-4 mr-1" /> Deploy
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowDeploy(false)}>Cancel</Button>
          </div>
          <TransactionStatus isPending={deployAction.isPending} isConfirming={deployAction.isConfirming}
            isConfirmed={deployAction.isConfirmed} txHash={deployAction.txHash} txUrl={deployAction.txUrl}
            error={deployAction.error} successMessage="OTC token deployed!" />
        </div>
      )}
    </div>
  );
}

function TokenRow({ token }: { token: Token }) {
  const router = useRouter();
  const addr = token.contract_address;
  const deployed = addr && addr !== "0x0000000000000000000000000000000000000000";
  const masked = deployed ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : null;

  const supplyText = (() => {
    const cur = fmtSupply(token.current_supply ?? token.total_supply);
    if (token.max_supply) return `${cur} / ${fmtSupply(token.max_supply)}`;
    return cur;
  })();

  return (
    <tr
      onClick={() => router.push(`/issuer/tokens/${token.id}`)}
      className="bg-white border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50/50 transition-colors cursor-pointer group"
    >
      <td className="px-4 py-3 align-top">
        <p className="font-semibold text-text text-sm">{token.name}</p>
        <p className="text-xs text-black/40 mt-0.5">
          {token.symbol} · {token.asset_type} · {token.decimals} dec
        </p>
      </td>
      <td className="px-4 py-3 align-top">
        <p className="font-mono text-sm text-text">{supplyText}</p>
        <p className="text-[10px] text-black/40 mt-0.5">{token.max_supply ? "current / max" : "total supply"}</p>
      </td>
      <td className="px-4 py-3 align-top">
        <Badge variant={token.mintable ? "default" : "active"} size="sm">
          {token.mintable ? "Mintable" : "Fixed"}
        </Badge>
      </td>
      <td className="px-4 py-3 align-top">
        {masked ? (
          <button
            onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(addr!); }}
            className="flex items-center gap-1.5 font-mono text-xs text-text hover:text-darkAqua transition-colors"
            title={addr!}
          >
            {masked}
            <Copy className="h-3 w-3 text-black/30" />
          </button>
        ) : (
          <span className="text-xs text-black/30">Not Deployed</span>
        )}
      </td>
      <td className="px-4 py-3 align-top">
        {token.is_paused ? (
          <Badge variant="pending" size="sm"><Pause className="h-3 w-3 mr-1" />Paused</Badge>
        ) : deployed ? (
          <Badge variant="active" size="sm"><Play className="h-3 w-3 mr-1" />Active</Badge>
        ) : (
          <Badge variant="pending" size="sm">Not Deployed</Badge>
        )}
      </td>
      <td className="px-4 py-3 align-top text-right">
        <ArrowUpRight className="h-4 w-4 text-black/20 group-hover:text-darkAqua transition-colors inline-block" />
      </td>
    </tr>
  );
}

export default function TokensPage() {
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await getTokens(1, 50, undefined, getToken());
        setTokens(data.items);
      } catch (err) { console.error("Failed to load tokens:", err); }
      finally { setLoading(false); }
    })();
  }, []);

  const sanitizedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").trim();
  const filtered = tokens.filter((t) =>
    !sanitizedSearch ||
    t.name.toLowerCase().includes(sanitizedSearch.toLowerCase()) ||
    t.symbol.toLowerCase().includes(sanitizedSearch.toLowerCase()) ||
    t.contract_address?.toLowerCase().includes(sanitizedSearch.toLowerCase()),
  );

  const deployed = tokens.filter((t) => t.contract_address && t.contract_address !== "0x0000000000000000000000000000000000000000");

  return (
    <IssuerDashboardLayout title="Tokens" description="Deploy and manage your ERC-3643 security tokens"
      actions={
        <Link href="/issuer/tokens/new">
          <Button variant="primary" size="sm" leftIcon={<Plus className="h-4 w-4" />}>Create Token</Button>
        </Link>
      }
    >
      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {[
          { label: "Security Tokens", value: tokens.length, color: "text-darkAqua", bg: "bg-darkAqua/10" },
          { label: "Deployed On-Chain", value: deployed.length, color: "text-green-600", bg: "bg-green-50" },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="bg-white rounded-md px-4 py-3.5 border border-zinc-100">
            <div className="flex items-center gap-2 mb-1.5">
              <div className={`w-7 h-7 rounded-md ${s.bg} flex items-center justify-center ${s.color}`}>
                <Coins className="h-4 w-4" />
              </div>
              <p className="text-[11px] font-medium text-black/40 uppercase tracking-wide">{s.label}</p>
            </div>
            <p className="text-xl font-bold text-text">{s.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Search + View Toggle */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex-1 max-w-xs">
          <Input placeholder="Search by name, symbol, or address…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center bg-zinc-100 rounded-md p-0.5">
          <button onClick={() => setViewMode("list")}
            className={`p-1.5 rounded-md transition-colors ${viewMode === "list" ? "bg-white text-text shadow-sm" : "text-black/40 hover:text-text"}`}>
            <List className="h-4 w-4" />
          </button>
          <button onClick={() => setViewMode("grid")}
            className={`p-1.5 rounded-md transition-colors ${viewMode === "grid" ? "bg-white text-text shadow-sm" : "text-black/40 hover:text-text"}`}>
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Security Tokens Grid */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg border border-zinc-100">
          <div className="w-14 h-14 rounded-lg bg-zinc-100 flex items-center justify-center mx-auto mb-3">
            <Coins className="h-7 w-7 text-zinc-300" />
          </div>
          <p className="text-black/40 text-sm mb-1">{tokens.length === 0 ? "No tokens yet" : "No matching tokens"}</p>
          <p className="text-black/25 text-xs mb-4">
            {tokens.length === 0 ? "Create your first ERC-3643 security token" : "Try adjusting your search"}
          </p>
          {tokens.length === 0 && (
            <Link href="/issuer/tokens/new">
              <Button variant="primary" size="sm" leftIcon={<Plus className="h-4 w-4" />}>Create Token</Button>
            </Link>
          )}
        </div>
      ) : (
        viewMode === "list" ? (
          <div className="overflow-x-auto bg-white rounded-lg border border-zinc-100">
            <table className="w-full">
              <thead className="bg-zinc-50 border-b border-zinc-100">
                <tr className="text-left text-[11px] font-semibold text-black/50 uppercase tracking-wider">
                  <th className="px-4 py-2.5">Name</th>
                  <th className="px-4 py-2.5">Supply</th>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5">Contract Address</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((token) => (
                  <TokenRow key={token.id} token={token} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((token, i) => (
              <motion.div key={token.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <TokenCard token={token} />
              </motion.div>
            ))}
          </div>
        )
      )}

      {/* OTC Token Section — independent of sales */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold text-black/60 uppercase tracking-wide mb-4">OTC Receipt Token</h2>
        <OTCTokenSection />
      </div>
    </IssuerDashboardLayout>
  );
}
