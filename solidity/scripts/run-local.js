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

    const abi = [
        "function deposit(address owner, uint sep20Contract_amount) public payable",
        "function withdraw(uint sep20Contract_amount) public",
        "function loadWallet(bytes memory keyBz) public view returns (uint nonces, uint balance)"
    ];

    const tokenABI = [
        "function approve(address spender, uint256 amount) external returns (bool)"
    ]

    const provider = ethers.getDefaultProvider("http://192.168.64.4:8545");
    const stochasticPayVrfAddr = "0x92dEa0f49E533F119d95354b22faE86eafd0dB47";
    const stochasticPayVrf = new ethers.Contract(stochasticPayVrfAddr, abi, provider).connect(deployer);

    const myTokenAddress = "0x09b23F6c5e254603C57b1e12B1AdB8EaCd837216";
    const myToken = new ethers.Contract(myTokenAddress, tokenABI, provider).connect(deployer);

    // 1. approve allowance
    const payerAllowance = 101;
    await myToken.connect(deployer).approve(stochasticPayVrf.address, payerAllowance, {gasPrice: 10000000000});

    // 2. deposit
    await stochasticPayVrf.deposit(deployer.address, concatAddressAmount(myToken.address, payerAllowance), {gasPrice: 10000000000});

    // 3. load wallet
    const keyBz = concatContractAddrAndOwnerAddr(myTokenAddress, deployer.address);
    console.log(keyBz);
    const [nonces, balance] = await stochasticPayVrf.loadWallet(keyBz);
    console.log("Nonces: " + nonces, "Balance: " + balance)
}


function concatAddressAmount(address, amount) {
    const n = BigInt(address) << 96n | BigInt(amount);
    return '0x' + n.toString(16);
}

function concatContractAddrAndOwnerAddr(contract, owner) {
    return ethers.utils.defaultAbiCoder.encode([ "address", "address" ], [ contract, owner]);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
