"use client";

import type { Column } from "@/components/molecules";
import { Badge, Button } from "@/components/atoms";
import { WalletBadge } from "@/components/molecules";
import { formatCurrency } from "@/lib/utils";

export interface IssuerRow {
  id: string;
  name: string;
  legalEntity: string;
  jurisdiction: string;
  wallet: string;
  feeBps: number;
  status: "pending" | "active" | "suspended";
  tokens: number;
  totalRaised: number;
  createdAt: string;
}

type Action = "approve" | "fee" | "revoke";

export function buildIssuerColumns(
  onAction: (issuer: IssuerRow, action: Action, fee?: number) => void,
): Column<IssuerRow>[] {
  return [
    {
      key: "name",
      header: "Issuer",
      render: (row) => (
        <div>
          <p className="font-semibold text-text">{row.name}</p>
          <p className="text-sm text-gray-500">{row.legalEntity}</p>
        </div>
      ),
    },
    {
      key: "jurisdiction",
      header: "Jurisdiction",
      render: (row) => <span className="text-gray-600">{row.jurisdiction}</span>,
    },
    {
      key: "wallet",
      header: "Wallet",
      render: (row) => <WalletBadge address={row.wallet} />,
    },
    {
      key: "feeBps",
      header: "Fee",
      render: (row) => <span className="font-mono text-sm">{row.feeBps} bps</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge variant={row.status === "active" ? "active" : row.status === "pending" ? "pending" : "error"} size="sm">
          {row.status}
        </Badge>
      ),
    },
    {
      key: "totalRaised",
      header: "Raised",
      render: (row) => <span>{formatCurrency(row.totalRaised)}</span>,
    },
    {
      key: "id",
      header: "Actions",
      render: (row) => (
        <div className="flex gap-2">
          {row.status === "pending" && (
            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onAction(row, "approve"); }}>
              Approve
            </Button>
          )}
          {row.status === "active" && (
            <>
              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onAction(row, "fee", row.feeBps); }}>
                Fee
              </Button>
              <Button variant="ghost" size="sm" className="text-red-500" onClick={(e) => { e.stopPropagation(); onAction(row, "revoke"); }}>
                Revoke
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];
}
