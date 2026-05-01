"use client";

import Link from "next/link";
import type { Column } from "@/components/molecules";
import { Badge, Button } from "@/components/atoms";

export interface IssuerRow {
  id: string;
  name: string;
  email: string;
  legalEntity: string;
  jurisdiction: string;
  wallet: string;
  walletStatus: string;
  identityStatus: string;
  issuerType: string;
  feeBps: number;
  status: "pending" | "active" | "suspended";
  tokens: number;
  projectCount: number;
  totalRaised: number;
  createdAt: string;
}

export type IssuerAction = "approve" | "fee" | "revoke" | "reactivate";

function MiniPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    approved: "bg-green-100 text-green-700",
    active: "bg-green-100 text-green-700",
    pending: "bg-amber-100 text-amber-700",
    pending_approval: "bg-amber-100 text-amber-700",
    rejected: "bg-red-100 text-red-700",
    suspended: "bg-red-100 text-red-700",
    none: "bg-zinc-100 text-zinc-500",
  };
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${colors[status] ?? colors.none}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

export function buildIssuerColumns(
  onAction: (issuer: IssuerRow, action: IssuerAction, fee?: number) => void,
): Column<IssuerRow>[] {
  return [
    {
      key: "name",
      header: "Issuer",
      render: (row) => (
        <Link href={`/platform/issuers/${row.id}`} className="hover:underline">
          <p className="font-semibold text-text">{row.name}</p>
          <p className="text-xs text-gray-500">{row.email}</p>
        </Link>
      ),
    },
    {
      key: "issuerType",
      header: "Type",
      render: (row) => (
        <span className="text-xs font-medium capitalize">{row.issuerType}</span>
      ),
    },
    {
      key: "projectCount",
      header: "Projects",
      render: (row) => (
        <span className="font-mono text-sm">{row.projectCount}</span>
      ),
    },
    {
      key: "walletStatus",
      header: "Wallet",
      render: (row) => <MiniPill status={row.walletStatus} />,
    },
    {
      key: "identityStatus",
      header: "Identity",
      render: (row) => <MiniPill status={row.identityStatus} />,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge
          variant={
            row.status === "active"
              ? "active"
              : row.status === "pending"
              ? "pending"
              : "error"
          }
          size="sm"
        >
          {row.status}
        </Badge>
      ),
    },
    {
      key: "feeBps",
      header: "Fee",
      render: (row) => (
        <span className="font-mono text-sm">{row.feeBps} bps</span>
      ),
    },
    {
      key: "id",
      header: "",
      render: (row) => (
        <div className="flex items-center gap-1.5">
          {row.status === "suspended" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onAction(row, "reactivate")}
            >
              Reactivate
            </Button>
          )}
          <Link href={`/platform/issuers/${row.id}`}>
            <Button variant="ghost" size="sm">View</Button>
          </Link>
        </div>
      ),
    },
  ];
}
