"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Globe,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Search,
  Lock,
  Unlock,
} from "lucide-react";
import { Button, Badge } from "@/components/atoms";
import { DataTable, type Column, WalletBadge } from "@/components/molecules";
import { PlatformAdminLayout } from "@/components/templates";

interface FrozenAddress {
  address: string;
  token: string;
  reason: string;
  frozenBy: string;
  frozenAt: string;
}

interface CountryRule {
  country: string;
  code: string;
  status: "allowed" | "blocked";
  tokens: number;
}

const MOCK_FROZEN: FrozenAddress[] = [
  { address: "0x1234567890abcdef1234567890abcdef12345678", token: "WAGR", reason: "Suspected fraud", frozenBy: "Issuer: Gold Reserve Holdings", frozenAt: "2024-03-01" },
  { address: "0xabcdef1234567890abcdef1234567890abcdef12", token: "CFQ2", reason: "AML investigation", frozenBy: "Platform Admin", frozenAt: "2024-02-28" },
];

const MOCK_COUNTRIES: CountryRule[] = [
  { country: "United States", code: "US", status: "allowed", tokens: 5 },
  { country: "United Kingdom", code: "GB", status: "allowed", tokens: 5 },
  { country: "Germany", code: "DE", status: "allowed", tokens: 4 },
  { country: "Singapore", code: "SG", status: "allowed", tokens: 5 },
  { country: "North Korea", code: "KP", status: "blocked", tokens: 0 },
  { country: "Iran", code: "IR", status: "blocked", tokens: 0 },
  { country: "Russia", code: "RU", status: "blocked", tokens: 0 },
];

export default function PlatformCompliancePage() {
  const [activeTab, setActiveTab] = useState<"frozen" | "countries">("frozen");
  const [searchQuery, setSearchQuery] = useState("");

  const frozenColumns: Column<FrozenAddress>[] = [
    {
      key: "address",
      header: "Address",
      render: (row) => <WalletBadge address={row.address} />,
    },
    {
      key: "token",
      header: "Token",
      render: (row) => <Badge variant="outline" size="sm">{row.token}</Badge>,
    },
    {
      key: "reason",
      header: "Reason",
      render: (row) => <span className="text-gray-600">{row.reason}</span>,
    },
    {
      key: "frozenBy",
      header: "Frozen By",
      render: (row) => <span className="text-sm text-gray-500">{row.frozenBy}</span>,
    },
    {
      key: "frozenAt",
      header: "Date",
      render: (row) => <span className="text-sm text-gray-500">{row.frozenAt}</span>,
    },
    {
      key: "actions",
      header: "",
      render: () => (
        <Button variant="ghost" size="sm">
          <Unlock className="h-4 w-4 mr-1" />
          Unfreeze
        </Button>
      ),
    },
  ];

  const countryColumns: Column<CountryRule>[] = [
    {
      key: "country",
      header: "Country",
      render: (row) => (
        <div className="flex items-center gap-3">
          <span className="text-2xl">{getCountryFlag(row.code)}</span>
          <span className="font-medium">{row.country}</span>
        </div>
      ),
    },
    {
      key: "code",
      header: "Code",
      render: (row) => <code className="text-sm bg-box px-2 py-1 rounded">{row.code}</code>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge variant={row.status === "allowed" ? "success" : "error"} size="sm">
          {row.status === "allowed" ? (
            <><CheckCircle2 className="h-3 w-3 mr-1" /> Allowed</>
          ) : (
            <><XCircle className="h-3 w-3 mr-1" /> Blocked</>
          )}
        </Badge>
      ),
    },
    {
      key: "tokens",
      header: "Tokens Using",
      render: (row) => <span className="text-gray-600">{row.tokens}</span>,
    },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <Button variant="ghost" size="sm">
          {row.status === "allowed" ? "Block" : "Allow"}
        </Button>
      ),
    },
  ];

  return (
    <PlatformAdminLayout
      title="Global Compliance"
      description="Manage platform-wide compliance settings and frozen addresses"
    >
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl p-6 border border-darkBlack/10"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center">
              <Lock className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Frozen Addresses</p>
              <p className="text-2xl font-bold text-text">{MOCK_FROZEN.length}</p>
            </div>
          </div>
          <p className="text-sm text-gray-500">Across all tokens</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-3xl p-6 border border-darkBlack/10"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
              <Globe className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Allowed Countries</p>
              <p className="text-2xl font-bold text-text">
                {MOCK_COUNTRIES.filter((c) => c.status === "allowed").length}
              </p>
            </div>
          </div>
          <p className="text-sm text-gray-500">Active jurisdictions</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-3xl p-6 border border-darkBlack/10"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-gold/10 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-gold" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Blocked Countries</p>
              <p className="text-2xl font-bold text-text">
                {MOCK_COUNTRIES.filter((c) => c.status === "blocked").length}
              </p>
            </div>
          </div>
          <p className="text-sm text-gray-500">Sanctioned regions</p>
        </motion.div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab("frozen")}
          className={`px-6 py-3 rounded-xl font-medium transition-colors ${
            activeTab === "frozen"
              ? "bg-darkAqua text-white"
              : "bg-white text-gray-500 hover:text-text border border-darkBlack/10"
          }`}
        >
          <Lock className="h-4 w-4 inline mr-2" />
          Frozen Addresses
        </button>
        <button
          onClick={() => setActiveTab("countries")}
          className={`px-6 py-3 rounded-xl font-medium transition-colors ${
            activeTab === "countries"
              ? "bg-darkAqua text-white"
              : "bg-white text-gray-500 hover:text-text border border-darkBlack/10"
          }`}
        >
          <Globe className="h-4 w-4 inline mr-2" />
          Country Rules
        </button>
      </div>

      {/* Search */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white rounded-3xl p-6 border border-darkBlack/10 mb-6"
      >
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder={activeTab === "frozen" ? "Search addresses..." : "Search countries..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field pl-12"
            />
          </div>
          {activeTab === "frozen" && (
            <Button variant="outline" leftIcon={<Lock className="h-4 w-4" />}>
              Freeze New Address
            </Button>
          )}
          {activeTab === "countries" && (
            <Button variant="outline" leftIcon={<Globe className="h-4 w-4" />}>
              Add Country Rule
            </Button>
          )}
        </div>
      </motion.div>

      {/* Tables */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        {activeTab === "frozen" && (
          <DataTable
            columns={frozenColumns}
            data={MOCK_FROZEN}
            emptyMessage="No frozen addresses"
          />
        )}
        {activeTab === "countries" && (
          <DataTable
            columns={countryColumns}
            data={MOCK_COUNTRIES}
            emptyMessage="No country rules configured"
          />
        )}
      </motion.div>
    </PlatformAdminLayout>
  );
}

function getCountryFlag(code: string): string {
  const flags: Record<string, string> = {
    US: "\u{1F1FA}\u{1F1F8}",
    GB: "\u{1F1EC}\u{1F1E7}",
    DE: "\u{1F1E9}\u{1F1EA}",
    SG: "\u{1F1F8}\u{1F1EC}",
    KP: "\u{1F1F0}\u{1F1F5}",
    IR: "\u{1F1EE}\u{1F1F7}",
    RU: "\u{1F1F7}\u{1F1FA}",
  };
  return flags[code] || "\u{1F3F3}";
}
