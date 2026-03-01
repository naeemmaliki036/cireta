"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Button, Spinner } from "@/components/atoms";
import { ProjectCard } from "@/components/molecules";
import { Navbar, Footer } from "@/components/organisms";
import { cn } from "@/lib/utils";

const ASSET_TYPES = ["All", "Gold", "Copper", "Commodities", "Futures"];
const STATUS_FILTERS = ["All", "Active", "Upcoming", "Completed"];

const MOCK_PROJECTS = [
  {
    id: "1",
    title: "West African Gold Reserve",
    slug: "west-african-gold",
    imageUrl: "",
    assetType: "Gold",
    fundingRound: "Seed",
    currentRaised: 2450000,
    targetAmount: 5000000,
    investorCount: 847,
  },
  {
    id: "2",
    title: "Chilean Copper Fund",
    slug: "chilean-copper",
    imageUrl: "",
    assetType: "Copper",
    fundingRound: "Series A",
    currentRaised: 8200000,
    targetAmount: 10000000,
    investorCount: 1234,
  },
  {
    id: "3",
    title: "Moroccan Steel Manufacturing",
    slug: "moroccan-steel",
    imageUrl: "",
    assetType: "Commodities",
    fundingRound: "Seed",
    currentRaised: 1800000,
    targetAmount: 3500000,
    investorCount: 523,
  },
  {
    id: "4",
    title: "South American Silver",
    slug: "south-american-silver",
    imageUrl: "",
    assetType: "Commodities",
    fundingRound: "Pre-Seed",
    currentRaised: 450000,
    targetAmount: 2000000,
    investorCount: 234,
  },
  {
    id: "5",
    title: "Australian Mining Futures",
    slug: "australian-mining",
    imageUrl: "",
    assetType: "Futures",
    fundingRound: "Seed",
    currentRaised: 3100000,
    targetAmount: 4000000,
    investorCount: 678,
  },
  {
    id: "6",
    title: "Asian Precious Metals",
    slug: "asian-metals",
    imageUrl: "",
    assetType: "Gold",
    fundingRound: "Series A",
    currentRaised: 12500000,
    targetAmount: 15000000,
    investorCount: 2100,
  },
];

export default function ExplorePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [assetType, setAssetType] = useState("All");
  const [status, setStatus] = useState("All");
  const [isLoading] = useState(false);

  const filteredProjects = MOCK_PROJECTS.filter((project) => {
    const matchesSearch = project.title
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesAsset =
      assetType === "All" || project.assetType === assetType;
    return matchesSearch && matchesAsset;
  });

  return (
    <div className="min-h-screen bg-white">
      <Navbar variant="light" />
      <div className="pt-20">

      {/* Hero */}
      <div className="max-w-7xl mx-auto px-6 pt-8 pb-6">
        <h1 className="text-3xl font-bold text-darkBlack tracking-tight mb-2">Explore Projects</h1>
        <p className="text-base text-darkBlack/60">Discover tokenized real-world assets from verified institutional issuers</p>
      </div>


      {/* Filters */}
      <section className="bg-box border-b border-darkBlack/5 sticky top-0 z-30 py-4">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            {/* Search */}
            <div className="relative w-full md:w-96">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 rounded-xl bg-white border border-darkBlack/10 focus:border-darkAqua focus:ring-1 focus:ring-darkAqua outline-none text-text"
              />
            </div>

            {/* Asset Type Filter Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 w-full md:w-auto">
              {ASSET_TYPES.map((type) => (
                <button
                  key={type}
                  onClick={() => setAssetType(type)}
                  className={cn(
                    "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors border",
                    assetType === type
                      ? "bg-darkAqua text-white border-darkAqua"
                      : "bg-white text-text border-darkAqua/30 hover:bg-darkAqua/10"
                  )}
                >
                  {type}
                </button>
              ))}
            </div>

            {/* Status Filter */}
            <div className="hidden lg:flex items-center gap-2">
              {STATUS_FILTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={cn(
                    "px-4 py-2 rounded-full text-sm font-medium transition-colors border",
                    status === s
                      ? "bg-darkBlack text-white border-darkBlack"
                      : "bg-white text-gray-500 border-darkBlack/10 hover:text-text hover:border-darkBlack/30"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Results */}
      <section className="pt-6 pb-8 px-6">
        <div className="max-w-7xl mx-auto">
          {/* Results Header */}
          <div className="flex items-center justify-between mb-6">
            <p className="text-gray-500">
              Showing{" "}
              <span className="font-semibold text-text">
                {filteredProjects.length}
              </span>{" "}
              projects
            </p>
          </div>

          {/* Projects Grid */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Spinner size="lg" />
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-24 h-24 mb-6 rounded-full bg-darkAqua/10 flex items-center justify-center">
                <Search className="w-12 h-12 text-darkAqua/40" />
              </div>
              <h3 className="text-xl font-semibold text-text mb-2">
                No Projects Found
              </h3>
              <p className="text-gray-500 max-w-md">
                Try adjusting your filters or search query to find more
                projects.
              </p>
              <Button
                variant="outline"
                className="mt-6"
                onClick={() => {
                  setSearchQuery("");
                  setAssetType("All");
                  setStatus("All");
                }}
              >
                Clear Filters
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProjects.map((project, index) => (
                <ProjectCard key={project.id} {...project} index={index} />
              ))}
            </div>
          )}
        </div>
      </section>

      </div>
      <Footer />
    </div>
  );
}
