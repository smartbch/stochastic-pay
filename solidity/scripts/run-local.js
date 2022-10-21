// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const { ethers } = require("hardhat");

async function main() {
    const [deployer, delegatedAccount] = await ethers.getSigners();
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
    const stochasticPayVrfAddr = "0xB034EEDA63199845fD7e96564E08a7a09A7d1C0c";
    const stochasticPayVrf = new ethers.Contract(stochasticPayVrfAddr, abi, provider).connect(deployer);

    const myTokenAddress = "0x35d2D8D0ad1d62BABB73991d2b70176476249547";
    const myToken = new ethers.Contract(myTokenAddress, tokenABI, provider).connect(deployer);

    // 1. approve allowance
    const payerAllowance = 10000;
    await myToken.connect(deployer).approve(stochasticPayVrf.address, payerAllowance, {gasPrice: 10000000000});

    // 2. deposit
    await stochasticPayVrf.deposit(delegatedAccount.address, concatAddressAmount(myToken.address, 100), {gasPrice: 10000000000});

    // 3. load payer wallet
    const payerBz = concatContractAddrAndOwnerAddr(myTokenAddress, delegatedAccount.address);
    console.log(payerBz);
    let [nonces, balance] = await stochasticPayVrf.loadWallet(payerBz);
    let noncesBz = ethers.utils.hexZeroPad(nonces.toHexString(), 32)
    console.log("Nonces: " + noncesBz, "Balance: " + balance)

    // 4. load payee wallet
    const payeeBz = concatContractAddrAndOwnerAddr(myTokenAddress, "0xE0F007dab8543052dfc4C23Cf8a3aDb848A875f9");
    console.log(payeeBz);
    [nonces, balance] = await stochasticPayVrf.loadWallet(payeeBz);
    noncesBz = ethers.utils.hexZeroPad(nonces.toHexString(), 32)
    console.log("Nonces: " + noncesBz, "Balance: " + balance)
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
