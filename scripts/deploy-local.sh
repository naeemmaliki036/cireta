#!/usr/bin/env bash
# Deploy all Cireta contracts to local Hardhat node and update .env
#
# Prerequisites:
#   Start hardhat node first:  cd contracts && pnpm exec hardhat node
#
# Usage:
#   bash scripts/deploy-local.sh
#
# What it does:
#   1. Deploys all platform contracts to localhost:8545
#   2. Deploys SimpleIdentityRegistry + enables simple mode
#   3. Comments out Sepolia config, writes local addresses to .env
#   4. Backs up original .env to .env.sepolia.bak
#
# To restore Sepolia:  cp .env.sepolia.bak .env
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONTRACTS_DIR="$ROOT_DIR/contracts"
ENV_FILE="$ROOT_DIR/.env"

echo "============================================"
echo "CIRETA LOCAL DEPLOY — $(date '+%H:%M:%S')"
echo "============================================"

# Check hardhat node is running
if ! curl -s http://127.0.0.1:8545 -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' > /dev/null 2>&1; then
  echo "ERROR: Hardhat node not running on http://127.0.0.1:8545"
  echo "Start it with:  cd contracts && pnpm exec hardhat node"
  exit 1
fi
echo "Hardhat node running"

# ── Step 1: Deploy all platform contracts ──
echo ""
echo "=== Deploying platform contracts ==="
cd "$CONTRACTS_DIR"

# Remove existing local deployment to force fresh deploy
rm -f deployments/hardhat.json

pnpm exec hardhat run scripts/deploy.ts --network localhost

# Read deployed addresses
DEPLOY_FILE="$CONTRACTS_DIR/deployments/localhost.json"
if [ ! -f "$DEPLOY_FILE" ]; then
  echo "ERROR: Deployment file not created"
  exit 1
fi

echo ""
echo "=== Reading addresses ==="
IDENTITY_REGISTRY_STORAGE=$(python3 -c "import json; print(json.load(open('$DEPLOY_FILE'))['identityRegistryStorage'])")
TOKEN_FACTORY=$(python3 -c "import json; print(json.load(open('$DEPLOY_FILE'))['tokenFactory'])")
SALE_FACTORY=$(python3 -c "import json; print(json.load(open('$DEPLOY_FILE'))['saleFactory'])")

echo "  IdentityRegistryStorage: $IDENTITY_REGISTRY_STORAGE"
echo "  TokenFactory:            $TOKEN_FACTORY"
echo "  SaleFactory:             $SALE_FACTORY"

# ── Step 2: Deploy SimpleIdentityRegistry + enable simple mode ──
echo ""
echo "=== Deploying SimpleIdentityRegistry ==="
SIMPLE_OUTPUT=$(pnpm exec hardhat run scripts/deploy-simple-registry.ts --network localhost 2>&1)
SIMPLE_IR_ADDR=$(echo "$SIMPLE_OUTPUT" | grep "SIMPLE_IR_ADDRESS=" | cut -d= -f2)

if [ -n "$SIMPLE_IR_ADDR" ]; then
  echo "SimpleIdentityRegistry: $SIMPLE_IR_ADDR"

  echo ""
  echo "=== Enabling simple identity mode on factory ==="
  TOKEN_FACTORY_ADDRESS="$TOKEN_FACTORY" SIMPLE_IR_ADDRESS="$SIMPLE_IR_ADDR" \
    pnpm exec hardhat run scripts/setup-simple-mode.ts --network localhost
else
  echo "WARNING: Could not deploy SimpleIdentityRegistry"
  echo "$SIMPLE_OUTPUT"
fi

# ── Step 3: Update .env ──
echo ""
echo "=== Updating .env ==="
cd "$ROOT_DIR"

# Restore from backup if it exists (idempotent re-runs), then back up
if [ -f "${ENV_FILE}.sepolia.bak" ]; then
  cp "${ENV_FILE}.sepolia.bak" "$ENV_FILE"
fi
cp "$ENV_FILE" "${ENV_FILE}.sepolia.bak"

# Hardhat node account #0 (well-known, deterministic)
LOCAL_KEY="ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
LOCAL_ADDR="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"

# Comment out Sepolia values and add local ones
ENV_FILE="$ENV_FILE" \
LOCAL_KEY="$LOCAL_KEY" \
LOCAL_ADDR="$LOCAL_ADDR" \
TOKEN_FACTORY="$TOKEN_FACTORY" \
SALE_FACTORY="$SALE_FACTORY" \
IDENTITY_REGISTRY_STORAGE="$IDENTITY_REGISTRY_STORAGE" \
python3 << 'PYEOF'
import os, re

env_file = os.environ["ENV_FILE"]
local_key = os.environ["LOCAL_KEY"]
local_addr = os.environ["LOCAL_ADDR"]
token_factory = os.environ["TOKEN_FACTORY"]
sale_factory = os.environ["SALE_FACTORY"]
identity_registry_storage = os.environ["IDENTITY_REGISTRY_STORAGE"]

with open(env_file, "r") as f:
    content = f.read()

# Each tuple: (regex, replacement with original preserved in comment)
swaps = [
    ("CHAIN_ID", "8453"),
    ("WEB3_RPC_URL", "http://127.0.0.1:8545"),
    ("DEPLOYER_PRIVATE_KEY", local_key),
    ("PLATFORM_FEE_RECEIVER", local_addr),
    ("IDENTITY_FACTORY_ADDRESS", token_factory),
    ("IDENTITY_REGISTRY_ADDRESS", identity_registry_storage),
    ("IDENTITY_REGISTRY_STORAGE_ADDRESS", identity_registry_storage),
    ("TOKEN_FACTORY_ADDRESS", token_factory),
    ("SALE_FACTORY_ADDRESS", sale_factory),
    ("FRACTION_FACTORY_ADDRESS", ""),
]

for key, new_val in swaps:
    pattern = rf'^{key}=(.+)$'
    match = re.search(pattern, content, re.MULTILINE)
    if match:
        old_line = match.group(0)
        old_val = match.group(1)
        replacement = f"# {old_line}  # Sepolia — commented for local dev\n{key}={new_val}"
        content = content.replace(old_line, replacement, 1)

# Add IDENTITY_MODE if not present
if "IDENTITY_MODE=" not in content:
    content += "\n# Identity mode: simple (whitelist) or erc3643 (ONCHAINID)\nIDENTITY_MODE=simple\n"

with open(env_file, "w") as f:
    f.write(content)

print("  .env updated with local addresses")
PYEOF

echo ""
echo "============================================"
echo "LOCAL DEPLOY COMPLETE"
echo "============================================"
echo ""
echo "Deployed contracts:"
python3 -c "import json; [print(f'  {k}: {v}') for k,v in json.load(open('$DEPLOY_FILE')).items()]"
echo ""
echo "Local config:"
echo "  RPC:      http://127.0.0.1:8545"
echo "  Chain ID: 8453"
echo "  Deployer: $LOCAL_ADDR"
echo ""
echo "Sepolia backup: .env.sepolia.bak"
echo "Restore with:   cp .env.sepolia.bak .env"
