"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, TrendingUp, Coins } from "lucide-react";
import { Button, Badge, ProgressBar } from "@/components/atoms";
import { cn, formatCurrency } from "@/lib/utils";

export interface HoldingItem {
  id: string;
  tokenName: string;
  tokenSymbol: string;
  projectSlug: string;
  balance: number;
  value: number;
  claimable: number;
  vestingProgress: number;
  imageUrl?: string;
}

export interface PortfolioTableProps {
  holdings: HoldingItem[];
  className?: string;
}

export function PortfolioTable({ holdings, className }: PortfolioTableProps) {
  if (holdings.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-16 text-center bg-box rounded-3xl border border-darkBlack/10"
      >
        <div className="w-20 h-20 mb-6 rounded-full bg-darkAqua/10 flex items-center justify-center">
          <Coins className="w-10 h-10 text-darkAqua" />
        </div>
        <h3 className="text-xl font-semibold text-text mb-2">
          No Holdings Yet
        </h3>
        <p className="text-gray-500 max-w-md mb-6">
          You haven&apos;t invested in any projects yet. Explore available
          opportunities to start building your portfolio.
        </p>
        <Link href="/projects">
          <Button variant="primary">Explore Projects</Button>
        </Link>
      </motion.div>
    );
  }

  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full">
        <thead>
          <tr className="table-header">
            <th className="px-6 py-4 text-left rounded-tl-xl">Asset</th>
            <th className="px-6 py-4 text-right">Balance</th>
            <th className="px-6 py-4 text-right">Value</th>
            <th className="px-6 py-4 text-center">Vesting</th>
            <th className="px-6 py-4 text-right">Claimable</th>
            <th className="px-6 py-4 text-right rounded-tr-xl">Actions</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((holding, index) => (
            <motion.tr
              key={holding.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="table-row border-b border-darkBlack/5"
            >
              {/* Asset */}
              <td className="px-6 py-4">
                <Link
                  href={`/project/${holding.projectSlug}`}
                  className="flex items-center gap-3 group"
                >
                  <div className="w-10 h-10 rounded-full bg-darkAqua flex items-center justify-center text-white font-semibold">
                    {holding.tokenSymbol.slice(0, 2)}
                  </div>
                  <div>
                    <p className="font-medium text-text group-hover:text-darkAqua transition-colors">
                      {holding.tokenName}
                    </p>
                    <p className="text-sm text-gray-500">{holding.tokenSymbol}</p>
                  </div>
                </Link>
              </td>

              {/* Balance */}
              <td className="px-6 py-4 text-right">
                <span className="font-semibold">
                  {holding.balance.toLocaleString()}
                </span>
                <span className="text-gray-500 ml-1">{holding.tokenSymbol}</span>
              </td>

              {/* Value */}
              <td className="px-6 py-4 text-right">
                <span className="font-semibold">
                  {formatCurrency(holding.value)}
                </span>
              </td>

              {/* Vesting Progress */}
              <td className="px-6 py-4">
                <div className="flex items-center justify-center gap-2">
                  <ProgressBar
                    value={holding.vestingProgress}
                    size="sm"
                    animated={false}
                    className="w-20"
                  />
                  <span className="text-sm text-gray-500">
                    {holding.vestingProgress}%
                  </span>
                </div>
              </td>

              {/* Claimable */}
              <td className="px-6 py-4 text-right">
                {holding.claimable > 0 ? (
                  <Badge variant="success" size="sm">
                    <TrendingUp className="h-3 w-3 mr-1" />
                    {holding.claimable.toLocaleString()} available
                  </Badge>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>

              {/* Actions */}
              <td className="px-6 py-4 text-right">
                <div className="flex items-center justify-end gap-2">
                  {holding.claimable > 0 && (
                    <Link href={`/portfolio/claim/${holding.tokenSymbol.toLowerCase()}`}>
                      <Button variant="primary" size="sm">
                        Claim
                      </Button>
                    </Link>
                  )}
                  <Link href={`/project/${holding.projectSlug}`}>
                    <Button variant="ghost" size="sm">
                      <ArrowUpRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
