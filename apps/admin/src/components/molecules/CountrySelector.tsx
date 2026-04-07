"use client";

import { useState, useMemo } from "react";
import { CheckSquare, Square, MinusSquare, Search, AlertTriangle, Globe } from "lucide-react";

export interface Country {
  code: number;
  name: string;
  region: string;
  sanctioned?: boolean;
}

const COUNTRIES: Country[] = [
  // System
  { code: 0, name: "System (Contracts)", region: "System" },

  // GCC
  { code: 48, name: "Bahrain", region: "GCC" },
  { code: 368, name: "Iraq", region: "GCC" },
  { code: 400, name: "Jordan", region: "GCC" },
  { code: 414, name: "Kuwait", region: "GCC" },
  { code: 422, name: "Lebanon", region: "GCC" },
  { code: 512, name: "Oman", region: "GCC" },
  { code: 275, name: "Palestine", region: "GCC" },
  { code: 634, name: "Qatar", region: "GCC" },
  { code: 682, name: "Saudi Arabia", region: "GCC" },
  { code: 784, name: "UAE", region: "GCC" },
  { code: 887, name: "Yemen", region: "GCC" },

  // Europe
  { code: 8, name: "Albania", region: "Europe" },
  { code: 20, name: "Andorra", region: "Europe" },
  { code: 40, name: "Austria", region: "Europe" },
  { code: 56, name: "Belgium", region: "Europe" },
  { code: 70, name: "Bosnia and Herzegovina", region: "Europe" },
  { code: 100, name: "Bulgaria", region: "Europe" },
  { code: 191, name: "Croatia", region: "Europe" },
  { code: 196, name: "Cyprus", region: "Europe" },
  { code: 203, name: "Czech Republic", region: "Europe" },
  { code: 208, name: "Denmark", region: "Europe" },
  { code: 233, name: "Estonia", region: "Europe" },
  { code: 246, name: "Finland", region: "Europe" },
  { code: 250, name: "France", region: "Europe" },
  { code: 268, name: "Georgia", region: "Europe" },
  { code: 276, name: "Germany", region: "Europe" },
  { code: 300, name: "Greece", region: "Europe" },
  { code: 348, name: "Hungary", region: "Europe" },
  { code: 352, name: "Iceland", region: "Europe" },
  { code: 372, name: "Ireland", region: "Europe" },
  { code: 380, name: "Italy", region: "Europe" },
  { code: 428, name: "Latvia", region: "Europe" },
  { code: 438, name: "Liechtenstein", region: "Europe" },
  { code: 440, name: "Lithuania", region: "Europe" },
  { code: 442, name: "Luxembourg", region: "Europe" },
  { code: 470, name: "Malta", region: "Europe" },
  { code: 498, name: "Moldova", region: "Europe" },
  { code: 492, name: "Monaco", region: "Europe" },
  { code: 499, name: "Montenegro", region: "Europe" },
  { code: 528, name: "Netherlands", region: "Europe" },
  { code: 807, name: "North Macedonia", region: "Europe" },
  { code: 578, name: "Norway", region: "Europe" },
  { code: 616, name: "Poland", region: "Europe" },
  { code: 620, name: "Portugal", region: "Europe" },
  { code: 642, name: "Romania", region: "Europe" },
  { code: 688, name: "Serbia", region: "Europe" },
  { code: 703, name: "Slovakia", region: "Europe" },
  { code: 705, name: "Slovenia", region: "Europe" },
  { code: 724, name: "Spain", region: "Europe" },
  { code: 752, name: "Sweden", region: "Europe" },
  { code: 756, name: "Switzerland", region: "Europe" },
  { code: 792, name: "Turkey", region: "Europe" },
  { code: 804, name: "Ukraine", region: "Europe" },
  { code: 826, name: "United Kingdom", region: "Europe" },

  // Asia Pacific
  { code: 4, name: "Afghanistan", region: "Asia Pacific" },
  { code: 36, name: "Australia", region: "Asia Pacific" },
  { code: 50, name: "Bangladesh", region: "Asia Pacific" },
  { code: 96, name: "Brunei", region: "Asia Pacific" },
  { code: 116, name: "Cambodia", region: "Asia Pacific" },
  { code: 156, name: "China", region: "Asia Pacific" },
  { code: 242, name: "Fiji", region: "Asia Pacific" },
  { code: 344, name: "Hong Kong", region: "Asia Pacific" },
  { code: 356, name: "India", region: "Asia Pacific" },
  { code: 360, name: "Indonesia", region: "Asia Pacific" },
  { code: 392, name: "Japan", region: "Asia Pacific" },
  { code: 398, name: "Kazakhstan", region: "Asia Pacific" },
  { code: 410, name: "South Korea", region: "Asia Pacific" },
  { code: 418, name: "Laos", region: "Asia Pacific" },
  { code: 446, name: "Macao", region: "Asia Pacific" },
  { code: 458, name: "Malaysia", region: "Asia Pacific" },
  { code: 462, name: "Maldives", region: "Asia Pacific" },
  { code: 496, name: "Mongolia", region: "Asia Pacific" },
  { code: 524, name: "Nepal", region: "Asia Pacific" },
  { code: 554, name: "New Zealand", region: "Asia Pacific" },
  { code: 586, name: "Pakistan", region: "Asia Pacific" },
  { code: 608, name: "Philippines", region: "Asia Pacific" },
  { code: 702, name: "Singapore", region: "Asia Pacific" },
  { code: 144, name: "Sri Lanka", region: "Asia Pacific" },
  { code: 158, name: "Taiwan", region: "Asia Pacific" },
  { code: 764, name: "Thailand", region: "Asia Pacific" },
  { code: 860, name: "Uzbekistan", region: "Asia Pacific" },
  { code: 704, name: "Vietnam", region: "Asia Pacific" },

  // Americas
  { code: 32, name: "Argentina", region: "Americas" },
  { code: 44, name: "Bahamas", region: "Americas" },
  { code: 52, name: "Barbados", region: "Americas" },
  { code: 84, name: "Belize", region: "Americas" },
  { code: 68, name: "Bolivia", region: "Americas" },
  { code: 76, name: "Brazil", region: "Americas" },
  { code: 124, name: "Canada", region: "Americas" },
  { code: 152, name: "Chile", region: "Americas" },
  { code: 170, name: "Colombia", region: "Americas" },
  { code: 188, name: "Costa Rica", region: "Americas" },
  { code: 214, name: "Dominican Republic", region: "Americas" },
  { code: 218, name: "Ecuador", region: "Americas" },
  { code: 222, name: "El Salvador", region: "Americas" },
  { code: 320, name: "Guatemala", region: "Americas" },
  { code: 332, name: "Haiti", region: "Americas" },
  { code: 340, name: "Honduras", region: "Americas" },
  { code: 388, name: "Jamaica", region: "Americas" },
  { code: 484, name: "Mexico", region: "Americas" },
  { code: 558, name: "Nicaragua", region: "Americas" },
  { code: 591, name: "Panama", region: "Americas" },
  { code: 600, name: "Paraguay", region: "Americas" },
  { code: 604, name: "Peru", region: "Americas" },
  { code: 630, name: "Puerto Rico", region: "Americas" },
  { code: 780, name: "Trinidad and Tobago", region: "Americas" },
  { code: 840, name: "United States", region: "Americas" },
  { code: 858, name: "Uruguay", region: "Americas" },

  // Africa
  { code: 12, name: "Algeria", region: "Africa" },
  { code: 24, name: "Angola", region: "Africa" },
  { code: 72, name: "Botswana", region: "Africa" },
  { code: 120, name: "Cameroon", region: "Africa" },
  { code: 818, name: "Egypt", region: "Africa" },
  { code: 231, name: "Ethiopia", region: "Africa" },
  { code: 288, name: "Ghana", region: "Africa" },
  { code: 384, name: "Ivory Coast", region: "Africa" },
  { code: 404, name: "Kenya", region: "Africa" },
  { code: 434, name: "Libya", region: "Africa" },
  { code: 450, name: "Madagascar", region: "Africa" },
  { code: 504, name: "Morocco", region: "Africa" },
  { code: 508, name: "Mozambique", region: "Africa" },
  { code: 516, name: "Namibia", region: "Africa" },
  { code: 566, name: "Nigeria", region: "Africa" },
  { code: 646, name: "Rwanda", region: "Africa" },
  { code: 686, name: "Senegal", region: "Africa" },
  { code: 710, name: "South Africa", region: "Africa" },
  { code: 834, name: "Tanzania", region: "Africa" },
  { code: 788, name: "Tunisia", region: "Africa" },
  { code: 800, name: "Uganda", region: "Africa" },
  { code: 894, name: "Zambia", region: "Africa" },
  { code: 716, name: "Zimbabwe", region: "Africa" },

  // Sanctioned (OFAC / EU as of 2026)
  { code: 112, name: "Belarus", region: "Sanctioned", sanctioned: true },
  { code: 192, name: "Cuba", region: "Sanctioned", sanctioned: true },
  { code: 364, name: "Iran", region: "Sanctioned", sanctioned: true },
  { code: 104, name: "Myanmar", region: "Sanctioned", sanctioned: true },
  { code: 408, name: "North Korea", region: "Sanctioned", sanctioned: true },
  { code: 643, name: "Russia", region: "Sanctioned", sanctioned: true },
  { code: 706, name: "Somalia", region: "Sanctioned", sanctioned: true },
  { code: 728, name: "South Sudan", region: "Sanctioned", sanctioned: true },
  { code: 729, name: "Sudan", region: "Sanctioned", sanctioned: true },
  { code: 760, name: "Syria", region: "Sanctioned", sanctioned: true },
  { code: 862, name: "Venezuela", region: "Sanctioned", sanctioned: true },
];

const REGION_ORDER = ["System", "GCC", "Europe", "Asia Pacific", "Americas", "Africa", "Sanctioned"];

interface CountrySelectorProps {
  selected: Set<number>;
  onChange: (selected: Set<number>) => void;
  alreadyAllowed: number[];
}

export function CountrySelector({ selected, onChange, alreadyAllowed }: CountrySelectorProps) {
  const [search, setSearch] = useState("");
  const [collapsedRegions, setCollapsedRegions] = useState<Set<string>>(new Set(["Sanctioned"]));

  const allowedSet = new Set(alreadyAllowed);

  // Filter out already-allowed countries
  const available = useMemo(() =>
    COUNTRIES.filter((c) => !allowedSet.has(c.code)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [alreadyAllowed.join(",")]
  );

  // Group by region
  const grouped = useMemo(() => {
    const groups: Record<string, Country[]> = {};
    for (const c of available) {
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) continue;
      if (!groups[c.region]) groups[c.region] = [];
      groups[c.region]!.push(c);
    }
    return groups;
  }, [available, search]);

  const toggleCountry = (code: number) => {
    const next = new Set(selected);
    if (next.has(code)) next.delete(code); else next.add(code);
    onChange(next);
  };

  const toggleRegion = (region: string) => {
    const regionCodes = (grouped[region] ?? []).filter((c) => !c.sanctioned).map((c) => c.code);
    const allSelected = regionCodes.every((c) => selected.has(c));
    const next = new Set(selected);
    if (allSelected) {
      regionCodes.forEach((c) => next.delete(c));
    } else {
      regionCodes.forEach((c) => next.add(c));
    }
    onChange(next);
  };

  const selectAllNonSanctioned = () => {
    const next = new Set(selected);
    available.filter((c) => !c.sanctioned).forEach((c) => next.add(c.code));
    onChange(next);
  };

  const removeSanctioned = () => {
    const next = new Set(selected);
    COUNTRIES.filter((c) => c.sanctioned).forEach((c) => next.delete(c.code));
    onChange(next);
  };

  const clearAll = () => onChange(new Set());

  const toggleCollapse = (region: string) => {
    setCollapsedRegions((prev) => {
      const next = new Set(prev);
      if (next.has(region)) next.delete(region); else next.add(region);
      return next;
    });
  };

  const hasSanctioned = Array.from(selected).some((code) => COUNTRIES.find((c) => c.code === code)?.sanctioned);

  return (
    <div className="space-y-3">
      {/* Quick actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={selectAllNonSanctioned} className="text-xs text-darkAqua hover:underline font-medium">
          Select All (excl. sanctioned)
        </button>
        <span className="text-zinc-300">|</span>
        <button onClick={removeSanctioned} className="text-xs text-red-600 hover:underline font-medium">
          Remove Sanctioned
        </button>
        <span className="text-zinc-300">|</span>
        <button onClick={clearAll} className="text-xs text-zinc-500 hover:underline">
          Clear All
        </button>
        <span className="ml-auto text-xs text-zinc-400">{selected.size} selected</span>
      </div>

      {/* Sanctioned warning */}
      {hasSanctioned && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          You have sanctioned countries selected. These are blocked by OFAC/EU regulations.
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-400" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search countries..."
          className="w-full pl-8 pr-3 py-2 rounded-lg border border-zinc-200 text-xs focus:outline-none focus:ring-2 focus:ring-darkAqua/30" />
      </div>

      {/* Region groups */}
      <div className="max-h-72 overflow-y-auto border border-zinc-200 rounded-lg divide-y divide-zinc-100">
        {REGION_ORDER.filter((r) => grouped[r]?.length).map((region) => {
          const countries = grouped[region] ?? [];
          const isSanctionedRegion = region === "Sanctioned";
          const regionCodes = countries.filter((c) => !c.sanctioned).map((c) => c.code);
          const allSelected = regionCodes.length > 0 && regionCodes.every((c) => selected.has(c));
          const someSelected = regionCodes.some((c) => selected.has(c));
          const isCollapsed = collapsedRegions.has(region);

          return (
            <div key={region}>
              {/* Region header */}
              <button onClick={() => toggleCollapse(region)}
                className="w-full flex items-center gap-2 px-3 py-2 bg-zinc-50 hover:bg-zinc-100 transition-colors text-left">
                {!isSanctionedRegion && (
                  <span onClick={(e) => { e.stopPropagation(); toggleRegion(region); }} className="cursor-pointer">
                    {allSelected ? <CheckSquare className="h-3.5 w-3.5 text-darkAqua" />
                      : someSelected ? <MinusSquare className="h-3.5 w-3.5 text-darkAqua" />
                      : <Square className="h-3.5 w-3.5 text-zinc-300" />}
                  </span>
                )}
                {isSanctionedRegion && <AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
                <Globe className="h-3 w-3 text-zinc-400" />
                <span className={`text-xs font-semibold ${isSanctionedRegion ? "text-red-600" : "text-zinc-700"}`}>
                  {region}
                </span>
                <span className="text-[10px] text-zinc-400 ml-auto">{countries.length}</span>
              </button>

              {/* Countries */}
              {!isCollapsed && (
                <div className="px-1 py-1">
                  {countries.map((c) => {
                    const checked = selected.has(c.code);
                    return (
                      <button key={c.code} onClick={() => toggleCountry(c.code)}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-left transition-colors ${
                          checked ? "bg-darkAqua/10 text-darkAqua font-medium"
                          : c.sanctioned ? "text-red-500 hover:bg-red-50"
                          : "text-zinc-600 hover:bg-zinc-50"
                        }`}>
                        {checked ? <CheckSquare className="h-3 w-3 flex-shrink-0" /> : <Square className="h-3 w-3 flex-shrink-0 text-zinc-300" />}
                        {c.name}
                        {c.sanctioned && <AlertTriangle className="h-3 w-3 text-red-400 ml-1" />}
                        <span className="text-zinc-400 ml-auto text-[10px]">{c.code}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { COUNTRIES };
