const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("Starting dataset environment setup...");

  const signers = await hre.ethers.getSigners();
  const deployer = signers[0];
  console.log("Deployer (Bridge Wallet):", deployer.address);

  // Deploy AKADollars
  const AKADollars = await hre.ethers.getContractFactory("AKADollars");
  const token = await AKADollars.deploy("AKADollars", "CHSD", 1000000);
  await token.deployed();
  console.log("AKADollars deployed to:", token.address);

  // Derive private keys from standard Hardhat mnemonic
  const mnemonic = "test test test test test test test test test test test junk";
  const hdNode = hre.ethers.utils.HDNode.fromMnemonic(mnemonic);
  
  const privateKeys = [];
  for (let i = 0; i < 20; i++) {
    const wallet = hdNode.derivePath(`m/44'/60'/0'/0/${i}`);
    privateKeys.push(wallet.privateKey);
  }

  // Transfer CHSD to all other accounts so they can generate traffic
  console.log("Funding 19 test accounts with 10,000 CHSD each...");
  const amount = hre.ethers.utils.parseEther("10000");
  for (let i = 1; i < 20; i++) {
    await token.transfer(signers[i].address, amount);
  }
  console.log("Funding complete.");

  // Generate .env.dataset content for the backend scripts
  const envContent = `ORIGIN_HTTPS_ENDPOINT=http://127.0.0.1:8545
ORIGIN_WSS_ENDPOINT=ws://127.0.0.1:8545
ORIGIN_TOKEN_CONTRACT_ADDRESS=${token.address}
BRIDGE_WALLET=${deployer.address}
DATASET_WALLET_KEYS=${privateKeys.join(",")}
`;

  const outPath = path.join(__dirname, "..", "..", "backend", ".env.dataset");
  fs.writeFileSync(outPath, envContent);
  console.log(`Generated configuration at ${outPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
