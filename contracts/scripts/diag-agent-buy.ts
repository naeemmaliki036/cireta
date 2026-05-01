import { ethers } from "hardhat";

async function main() {
  const provider = ethers.provider;
  const investorPk = process.env.INVESTOR_PRIVATE_KEY!;
  const investor = new ethers.Wallet(investorPk, provider);
  const saleAddr = "0xDD9BBC3E";  // truncated; full address read from manifest below

  // Look up the most recently deployed sale for AGENT via the factory
  const tokenAddr = "0xAc55eBBefc0277eb217Bd6d5bAC89b59361b0337";
  const saleFactory = await ethers.getContractAt("CiretaSaleFactory", "0xFfC765aB999CF3D718Aa81869DE3D32Ff3E0d2d9", investor);
  const sales = await saleFactory.getSalesForToken(tokenAddr) as string[];
  const fullSaleAddr = sales[sales.length - 1]!;
  const saleC = await ethers.getContractAt("Sale", fullSaleAddr, investor);
  const fractionAddr = await saleC.fractionToken();
  const vaultAddr = await saleC.vault();

  console.log("Sale:", fullSaleAddr);
  console.log("Token:", tokenAddr);
  console.log("Fraction:", fractionAddr);
  console.log("Vault:", vaultAddr);
  console.log("Investor:", investor.address);

  const sale = await ethers.getContractAt("Sale", fullSaleAddr, investor);
  const status = await sale.status();
  const phaseCount = await sale.getPhaseCount();
  const tokenDecimals = await sale.tokenDecimals();
  const totalRaised = await sale.totalRaised();
  const hardCap = await sale.hardCap();
  console.log("\nSale state:");
  console.log("  status:", status, "(0=Draft, 1=Active, 2=Paused, 3=FinalizedSuccess, 4=FinalizedFailure, 5=Rejected)");
  console.log("  phaseCount:", phaseCount);
  console.log("  tokenDecimals:", tokenDecimals);
  console.log("  totalRaised:", totalRaised);
  console.log("  hardCap:", hardCap);

  // Check identity registry for investor
  const sir = await ethers.getContractAt("SimpleIdentityRegistry", "0x5B344d1E07B57D36B8FD99b2e241dd7E8674d7BE", investor);
  const verified = await sir.isVerified(investor.address);
  const fractionVerified = await sir.isVerified(fractionAddr);
  const vaultVerified = await sir.isVerified(vaultAddr);
  const saleVerified = await sir.isVerified(fullSaleAddr);
  const tokenVerified = await sir.isVerified(tokenAddr);
  console.log("\nWhitelist status (SIR):");
  console.log("  investor:", verified);
  console.log("  fractionToken:", fractionVerified);
  console.log("  vault:", vaultVerified);
  console.log("  sale:", saleVerified);
  console.log("  AGENT token:", tokenVerified);

  // Try staticCall to get revert reason
  try {
    await sale.buy.staticCall(0, 100n);
    console.log("\nstaticCall buy(0, 100) → would succeed");
  } catch (e: any) {
    console.log("\nstaticCall buy(0, 100) → reverts");
    console.log("  message:", e.message?.slice(0, 300));
    if (e.data) console.log("  data:", e.data);
    if (e.shortMessage) console.log("  shortMessage:", e.shortMessage);
    if (e.reason) console.log("  reason:", e.reason);

    // Try parsing as a custom error
    const saleIface = (await ethers.getContractFactory("Sale")).interface;
    if (e.data) {
      try {
        const parsed = saleIface.parseError(e.data);
        console.log("  customError:", parsed?.name, parsed?.args);
      } catch {
        // try ModularCompliance error
        try {
          const mcIface = (await ethers.getContractFactory("ModularCompliance")).interface;
          const parsed = mcIface.parseError(e.data);
          console.log("  ModularCompliance error:", parsed?.name, parsed?.args);
        } catch {
          console.log("  (could not decode)");
        }
      }
    }
  }
}

main().catch(console.error);
