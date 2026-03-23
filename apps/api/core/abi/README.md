# ABI Fallback Directory

Place compiled Hardhat ABI JSON files here as a fallback when
`contracts/artifacts/` is not available (e.g. in Docker images that
don't include the full Hardhat build output).

## How to populate

After running `npx hardhat compile` in the `contracts/` directory, copy
the relevant ABI files:

```bash
cp contracts/artifacts/contracts/src/token/CiretaToken.sol/CiretaToken.json apps/api/core/abi/
cp contracts/artifacts/contracts/src/platform/CiretaTokenFactory.sol/CiretaTokenFactory.json apps/api/core/abi/
cp contracts/artifacts/contracts/src/token/ModularCompliance.sol/ModularCompliance.json apps/api/core/abi/
```

The ContractRegistry accepts both raw ABI arrays (`[{...}]`) and
Hardhat artifact objects (`{"abi": [{...}], ...}`).
