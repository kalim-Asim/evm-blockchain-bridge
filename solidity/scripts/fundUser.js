const hre = require("hardhat");

async function main() {
  const deployer = (await hre.ethers.getSigners())[0];
  console.log("Deployer address:", deployer.address);
  
  const tokenAddress = "0xB1fB5Da188a7f8dB473F3Ac5aaD7420AAfD3e199";
  
  const userWallet = new hre.ethers.Wallet("f39a4b9b77fa154134e363de87e0332ba554b82d17820869ed8fd7b74381e90c");
  console.log("User wallet address:", userWallet.address);

  const Token = await hre.ethers.getContractFactory("AKADollars");
  const token = Token.attach(tokenAddress);

  const balance = await token.balanceOf(deployer.address);
  console.log("Deployer CHSD balance:", hre.ethers.utils.formatEther(balance));

  if (balance.eq(0)) {
    console.log("Deployer has no CHSD! Make sure the token address is correct.");
    return;
  }

  console.log("Transferring 10,000 CHSD to User Wallet...");
  const tx = await token.transfer(userWallet.address, hre.ethers.utils.parseEther("10000"));
  await tx.wait();
  
  const newBalance = await token.balanceOf(userWallet.address);
  console.log("✅ Success! User wallet new balance:", hre.ethers.utils.formatEther(newBalance), "CHSD");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
