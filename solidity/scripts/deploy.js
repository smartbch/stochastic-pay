// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);
  const balance = await deployer.getBalance()
  console.log("Account balance: ", ethers.utils.formatEther(balance));

  const StochasticPayVrf = await ethers.getContractFactory("StochasticPay_VRF");
  // const StochasticPayVrf = await ethers.getContractFactory("StochasticPay_VRF_forUT");
  const stochasticPayVrf = await StochasticPayVrf.deploy({gasPrice: 10000000000});
  await stochasticPayVrf.deployed();
  console.log("StochasticPayVrf deployed to:", stochasticPayVrf.address);

  // const TestERC20 = await ethers.getContractFactory("TestERC20");
  // const myToken = await TestERC20.deploy('MYT', 100000000, 8, {gasPrice: 10000000000});
  // await myToken.deployed();
  // console.log("TestERC20 deployed to:", myToken.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
