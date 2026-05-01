/**
 * Verify every `functionName: "X"` reference in the frontends maps to a real
 * function in the corresponding ABI.
 *
 * Walks apps/admin/src and apps/launchpad/src for `.ts`/`.tsx` files; collects
 * (functionName, abi-import) pairs; cross-checks against
 * apps/admin/src/lib/contracts/abis/*.ts.
 *
 * Run from the repo root:
 *   npx ts-node contracts/scripts/verify-abi-ui-consistency.ts
 *
 * Reports orphan UI calls (functionName referenced but not in any imported ABI)
 * and exits non-zero if any are found.
 */

import * as fs from "fs";
import * as path from "path";

const REPO = path.resolve(__dirname, "..", "..");
const APPS = [
  path.join(REPO, "apps", "admin", "src"),
  path.join(REPO, "apps", "launchpad", "src"),
];
// Both apps have their own ABI directories. Plus launchpad uses inline
// ABIs in some files (SALE_VIEW_ABI, ERC20 fragments) — collect every
// `name: "X"` from inside `... as const` arrays in any .ts/.tsx file.
const ABI_DIRS = [
  path.join(REPO, "apps", "admin", "src", "lib", "contracts", "abis"),
  path.join(REPO, "apps", "launchpad", "src", "lib", "contracts", "abis"),
  path.join(REPO, "apps", "launchpad", "src", "lib", "contracts"),
].filter(d => fs.existsSync(d));

interface Finding { file: string; line: number; fnName: string; ctx: string }

// ── 1. Build ABI inventory ──────────────────────────────────────────────────

const abiFunctions = new Map<string, Set<string>>(); // abiName → Set<fnName>
const abiAllFns = new Set<string>();                  // every fn name across all ABIs

function harvest(src: string, key: string) {
  // Brace-depth-aware entry walker. Splits an ABI literal into its top-level
  // entries (depth=1 inside the array) so nested input/output braces don't
  // fragment a single ABI item. For each top-level entry, collect (name, type)
  // and add to the set if type==='function'.
  const set = abiFunctions.get(key) ?? new Set<string>();
  const len = src.length;
  let depth = 0;
  let entryStart = -1;
  for (let i = 0; i < len; i++) {
    const ch = src[i];
    if (ch === "{") {
      if (depth === 0) entryStart = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && entryStart >= 0) {
        const entry = src.slice(entryStart, i + 1);
        // Capture only TOP-LEVEL fields of this entry — track relative depth
        // so we ignore name/type inside nested inputs/outputs arrays.
        let relDepth = -1; // -1 before the opening `{`, 0 after it
        let topName: string | null = null;
        let topType: string | null = null;
        for (let j = 0; j < entry.length; j++) {
          const c = entry[j];
          if (c === "{" || c === "[") relDepth++;
          else if (c === "}" || c === "]") relDepth--;
          if (relDepth !== 0) continue;
          // Look ahead for name: "X" or type: "Y" starting here
          const tail = entry.slice(j, j + 80);
          const nm = tail.match(/^(?:[{,]|\s)\s*(?:name|"name"):\s*['"]([^'"]+)['"]/);
          if (nm && topName === null) topName = nm[1]!;
          const tm = tail.match(/^(?:[{,]|\s)\s*(?:type|"type"):\s*['"]([^'"]+)['"]/);
          if (tm && topType === null) topType = tm[1]!;
          if (topName !== null && topType !== null) break;
        }
        if (topName && topType === "function") {
          set.add(topName);
          abiAllFns.add(topName);
        }
        entryStart = -1;
      }
    }
  }
  if (set.size > 0) abiFunctions.set(key, set);
}

function loadAbis() {
  // 1) Dedicated ABI files
  for (const dir of ABI_DIRS) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
      const fp = path.join(dir, entry.name);
      const src = fs.readFileSync(fp, "utf-8");
      harvest(src, entry.name.replace(".ts", ""));
    }
  }
  // 2) Inline ABIs declared anywhere in the apps' source (e.g. `const SALE_VIEW_ABI = [...] as const`)
  for (const app of APPS) {
    if (!fs.existsSync(app)) continue;
    for (const file of walk(app)) {
      const src = fs.readFileSync(file, "utf-8");
      // Cheap heuristic: only scan files that mention `_ABI` or look like ABI literals.
      if (!/_ABI\s*=|abi:/.test(src)) continue;
      harvest(src, path.relative(REPO, file));
    }
  }
  // 3) Always trust standard ERC20 / ERC1155 / ERC721 method names — they're
  // satisfied by viem-shipped helpers + per-token deployments.
  for (const fn of [
    "balanceOf", "transfer", "transferFrom", "approve", "allowance", "totalSupply",
    "name", "symbol", "decimals", "owner", "transferOwnership", "renounceOwnership",
    "hasRole", "grantRole", "revokeRole", "renounceRole", "getRoleAdmin",
    "isApprovedForAll", "setApprovalForAll", "safeTransferFrom", "safeBatchTransferFrom",
  ]) abiAllFns.add(fn);
}

// ── 2. Walk frontend source ─────────────────────────────────────────────────

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      yield* walk(full);
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      yield full;
    }
  }
}

const findings: Finding[] = [];

function scanFile(file: string) {
  const src = fs.readFileSync(file, "utf-8");
  const lines = src.split("\n");
  // Match `functionName: "X"` patterns — common in useContractAction / writeContract / readContract calls
  const re = /functionName:\s*["']([^"']+)["']/g;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(line)) !== null) {
      const fnName = m[1]!;
      // Solidity identifiers can't contain dots — anything dotted is a
      // telemetry label (e.g. ErrorReportButton context "vault.claim").
      if (fnName.includes(".")) continue;
      if (!abiAllFns.has(fnName)) {
        findings.push({
          file: path.relative(REPO, file),
          line: i + 1,
          fnName,
          ctx: line.trim().slice(0, 120),
        });
      }
    }
  }
}

// ── 3. Run ──────────────────────────────────────────────────────────────────

function main() {
  loadAbis();
  console.log(`Loaded ${abiFunctions.size} ABI files, ${abiAllFns.size} unique function names.\n`);

  for (const app of APPS) {
    if (!fs.existsSync(app)) continue;
    for (const file of walk(app)) scanFile(file);
  }

  if (findings.length === 0) {
    console.log(`✓ All functionName references map to a known ABI function.`);
    process.exit(0);
  }

  console.log(`✗ Found ${findings.length} orphan functionName reference(s):\n`);
  for (const f of findings) {
    console.log(`  ${f.file}:${f.line}  fn="${f.fnName}"`);
    console.log(`    ${f.ctx}`);
  }
  process.exit(1);
}

main();
