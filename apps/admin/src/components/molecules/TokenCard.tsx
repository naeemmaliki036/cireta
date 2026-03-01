"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Coins, TrendingUp, Users, Pause, Play } from "lucide-react";
import { Badge, ProgressBar } from "@/components/atoms";
import { cn, formatCurrency } from "@/lib/utils";

export interface TokenCardProps {
  id: string;
  name: string;
  symbol: string;
  assetType: "commodity" | "futures";
  totalSupply: number;
  currentPrice: number;
  holders: number;
  isPaused: boolean;
  raised?: number;
  target?: number;
  className?: string;
}

export function TokenCard({
  id,
  name,
  symbol,
  assetType,
  totalSupply,
  currentPrice,
  holders,
  isPaused,
  raised,
  target,
  className,
}: TokenCardProps) {
  const progress = raised && target ? (raised / target) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
    >
      <Link
        href={`/issuer/tokens/${id}`}
        className={cn(
          "block bg-white rounded-3xl p-6 border border-darkBlack/10 hover:shadow-card transition-shadow duration-300",
          className
        )}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-darkAqua/10 flex items-center justify-center">
              <Coins className="h-6 w-6 text-darkAqua" />
            </div>
            <div>
              <h3 className="font-semibold text-text">{name}</h3>
              <p className="text-sm text-gray-500">{symbol}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={assetType === "commodity" ? "default" : "outline"} size="sm">
              {assetType}
            </Badge>
            {isPaused ? (
              <Badge variant="error" size="sm">
                <Pause className="h-3 w-3 mr-1" />
                Paused
              </Badge>
            ) : (
              <Badge variant="success" size="sm">
                <Play className="h-3 w-3 mr-1" />
                Active
              </Badge>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">Total Supply</p>
            <p className="font-semibold text-text">{totalSupply.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Price</p>
            <p className="font-semibold text-text">{formatCurrency(currentPrice)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Holders</p>
            <p className="font-semibold text-text flex items-center gap-1">
              <Users className="h-4 w-4 text-gray-400" />
              {holders.toLocaleString()}
            </p>
          </div>
        </div>

        {raised !== undefined && target !== undefined && (
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-500">Raised</span>
              <span className="font-semibold text-darkAqua flex items-center gap-1">
                <TrendingUp className="h-4 w-4" />
                {formatCurrency(raised)} / {formatCurrency(target)}
              </span>
            </div>
            <ProgressBar value={progress} size="sm" />
          </div>
        )}
      </Link>
    </motion.div>
  );
}
