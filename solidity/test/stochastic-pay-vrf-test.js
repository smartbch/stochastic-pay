const { expect } = require("chai");
const { ethers } = require("hardhat");
const { TypedDataUtils } = require('ethers-eip712');

describe("StochasticPay_VRF", function () {
  const payerSalt = ethers.utils.id("payerSalt");
  const payeeASalt = ethers.utils.id("payeeASalt");
  const payeeBSalt = ethers.utils.id("payeeBSalt");
  const payeeASaltHash = ethers.utils.keccak256('0x00' + (BigInt(payeeASalt) >> 8n).toString(16));
  const payeeBSaltHash = ethers.utils.keccak256('0x00' + (BigInt(payeeBSalt) >> 8n).toString(16));

  const payerSalt240 = payerSalt.substring(0, 62)
  const payeeASalt240 = payeeASalt.substring(0, 62)
  const payeeBSalt240 = payeeBSalt.substring(0, 62)

  console.log('payerSalt:', payerSalt);
  console.log('payeeASalt:', payeeASalt);
  console.log('payeeBSalt:', payeeBSalt);
  console.log('payeeASaltHash:', payeeASaltHash);
  console.log('payeeBSaltHash:', payeeBSaltHash);
  console.log('payerSalt240:', payerSalt240);
  console.log('payeeASalt240:', payeeASalt240);
  console.log('payeeBSalt240:', payeeBSalt240);

  let payer, payeeA;
  let stochasticPayVrf;
  let myToken;
  let deployer;

  before(async function () {
    const [acc0] = await ethers.getSigners();
    deployer = acc0;
    console.log('deployer:', deployer.address);
    payer = new ethers.Wallet('82c149d8f7257a6ab690d351d482de51e3540a95859a72a96ef5d744e1f69d60', deployer.provider);
    payeeA= new ethers.Wallet('f37a49a536c941829424a502bb4579f2ab5451c7104c8541e7797798f3daf4ec', deployer.provider);
    console.log('payer:', payer.address);
    console.log('payeeA:', payeeA.address);
    await acc0.sendTransaction({to: payer.address, value: ethers.utils.parseEther("1.0")});

    const StochasticPayVrf = await ethers.getContractFactory("StochasticPay_VRF_forUT");
    stochasticPayVrf = await StochasticPayVrf.deploy();
    await stochasticPayVrf.deployed();

    const TestERC20 = await ethers.getContractFactory("TestERC20");
    myToken = await TestERC20.deploy('MYT', 100000000, 8);
    await myToken.deployed();
  });

  it("getEIP712Hash_sr", async function () {
    const dueTime64 = Math.floor(Date.now() / 1000) + 3600;
    const prob32 = 0x12345678;
    const seenNonces = 0x0000000000000000000000000000000000000000000000000000000000000000n  // 256 bits

    const payerSalt_pk0 = concatPayerSaltPk0(payerSalt240);
    const pkTail = getPkTail(ethers.utils.keccak256(payer.publicKey));
    console.log('payerSalt_pk0:', payerSalt_pk0);
    console.log('pkTail:', pkTail);

    const msg = {
      payerSalt_pk0: payerSalt_pk0,
      pkTail: pkTail,
      payeeAddr_dueTime64_prob32: concatPayeeAddrDueTime64Prob32(payeeA.address, dueTime64, prob32),
      seenNonces: seenNonces,
      sep20Contract_amount: concatSep20ContractAmount(myToken.address, 100),
    }

    const eip712HashSrSol = await getEIP712HashSrSol(stochasticPayVrf, msg);
    const eip712HashSrJS = getEIP712HashSrJS(stochasticPayVrf.address, msg);
    console.log('eip712HashSrSol:', eip712HashSrSol);
    console.log('eip712HashSrJS :', eip712HashSrJS);
    expect(eip712HashSrSol).to.equal(eip712HashSrJS);
  });

  it("getPayer_sr", async function () {
    const dueTime64 = Math.floor(Date.now() / 1000) + 3600;
    const prob32 = 0x12345678;
    const seenNonces = 0x0000000000000000000000000000000000000000000000000000000000000000n  // 256 bits

    const payerSalt_pk0 = concatPayerSaltPk0(payerSalt240);
    const pkTail = getPkTail(ethers.utils.keccak256(payer.publicKey));
    console.log('payerSalt_pk0:', payerSalt_pk0);
    console.log('pkTail:', pkTail);

    const msg = {
      payerSalt_pk0: payerSalt_pk0,
      pkTail: pkTail,
      payeeAddr_dueTime64_prob32: concatPayeeAddrDueTime64Prob32(payeeA.address, dueTime64, prob32),
      seenNonces: seenNonces,
      sep20Contract_amount: concatSep20ContractAmount(myToken.address, 100),
    }

    const [r, s, v] = signRawMsg(stochasticPayVrf.address, msg, payer);
    const payerAddr = await getPayer(stochasticPayVrf, msg, payerSalt_pk0, pkTail, r, s, v);
    expect(payerAddr).to.equal(payer.address);
  });

  it("payToSingleReciever:ok", async function () {
    const payerAllowance = 0x123456;
    const payAmount = 100;
    await myToken.connect(deployer).approve(stochasticPayVrf.address, payerAllowance);
    await depositSep20Tokens(stochasticPayVrf, payer.address, concatSep20ContractAmount(myToken.address, payAmount+1));

    const dueTime64 = Math.floor(Date.now() / 1000) + 3600;
    const prob32 = 0xFFFFFFFF;
    const seenNonces = 0x0000000000000000000000000000000000000000000000000000000000000000n  // 256 bits

    const payerSalt_pk0 = concatPayerSaltPk0(payerSalt240);
    const pkTail = getPkTail(ethers.utils.keccak256(payer.publicKey));

    const msg = {
      payerSalt_pk0: payerSalt_pk0,
      pkTail: pkTail,
      payeeAddr_dueTime64_prob32: concatPayeeAddrDueTime64Prob32(payeeA.address, dueTime64, prob32),
      seenNonces: seenNonces,
      sep20Contract_amount: concatSep20ContractAmount(myToken.address, payAmount),
    }

    const [r, s, v] = signRawMsg(stochasticPayVrf.address, msg, payer);
    await payToSingleReciever(stochasticPayVrf, msg, payerSalt_pk0, pkTail, r, s, v);

    let payerBalance = await getBalance(stochasticPayVrf,payer.address, myToken.address)
    let payeeABalance = await getBalance(stochasticPayVrf,payeeA.address, myToken.address)

    expect(payerBalance).to.equal(1);
    expect(payeeABalance).to.equal(payAmount);
  });

  it("payToSingleReciever:failed:EXPIRED", async function () {
    const payerAllowance = 0x123456;
    const payAmount = 100;
    await myToken.connect(deployer).approve(stochasticPayVrf.address, payerAllowance);
    await depositSep20Tokens(stochasticPayVrf, payer.address, concatSep20ContractAmount(myToken.address, payAmount+1));

    const dueTime64 = Math.floor(Date.now() / 1000) - 3600;
    const prob32 = 0xFFFFFFFF;
    const seenNonces = 0x0000000000000000000000000000000000000000000000000000000000000000n  // 256 bits

    const payerSalt_pk0 = concatPayerSaltPk0(payerSalt240);
    const pkTail = getPkTail(ethers.utils.keccak256(payer.publicKey));

    const msg = {
      payerSalt_pk0: payerSalt_pk0,
      pkTail: pkTail,
      payeeAddr_dueTime64_prob32: concatPayeeAddrDueTime64Prob32(payeeA.address, dueTime64, prob32),
      seenNonces: seenNonces,
      sep20Contract_amount: concatSep20ContractAmount(myToken.address, payAmount),
    }

    const [r, s, v] = signRawMsg(stochasticPayVrf.address, msg, payer);
    await expect(payToSingleReciever(stochasticPayVrf, msg, payerSalt_pk0, pkTail, r, s, v)).to.be.revertedWith("EXPIRED");
  });

  it("payToSingleReciever:failed:CANNOT_PAY", async function () {
    const payerAllowance = 0x123456;
    const payAmount = 100;
    await myToken.connect(deployer).approve(stochasticPayVrf.address, payerAllowance);
    await depositSep20Tokens(stochasticPayVrf, payer.address, concatSep20ContractAmount(myToken.address, payAmount+1));

    const dueTime64 = Math.floor(Date.now() / 1000) + 3600;
    const prob32 = 0x00000000;
    const seenNonces = 0x0000000000000000000000000000000000000000000000000000000000000000n  // 256 bits

    const payerSalt_pk0 = concatPayerSaltPk0(payerSalt240);
    const pkTail = getPkTail(ethers.utils.keccak256(payer.publicKey));

    const msg = {
      payerSalt_pk0: payerSalt_pk0,
      pkTail: pkTail,
      payeeAddr_dueTime64_prob32: concatPayeeAddrDueTime64Prob32(payeeA.address, dueTime64, prob32),
      seenNonces: seenNonces,
      sep20Contract_amount: concatSep20ContractAmount(myToken.address, payAmount),
    }

    const [r, s, v] = signRawMsg(stochasticPayVrf.address, msg, payer);
    await expect(payToSingleReciever(stochasticPayVrf, msg, payerSalt_pk0, pkTail, r, s, v)).to.be.revertedWith("CANNOT_PAY");
  });

  it("payToSingleReciever:failed:INCORRECT_NONCES", async function () {
    const payerAllowance = 0x123456;
    const payAmount = 100;
    await myToken.connect(deployer).approve(stochasticPayVrf.address, payerAllowance);
    await depositSep20Tokens(stochasticPayVrf, payer.address, concatSep20ContractAmount(myToken.address, payAmount+1));

    const dueTime64 = Math.floor(Date.now() / 1000) + 3600;
    const prob32 = 0xFFFFFFFF;
    const seenNonces = 0x1111111111111111111111111111111111111111111111111111111111111111n  // 256 bits

    const payerSalt_pk0 = concatPayerSaltPk0(payerSalt240);
    const pkTail = getPkTail(ethers.utils.keccak256(payer.publicKey));

    const msg = {
      payerSalt_pk0: payerSalt_pk0,
      pkTail: pkTail,
      payeeAddr_dueTime64_prob32: concatPayeeAddrDueTime64Prob32(payeeA.address, dueTime64, prob32),
      seenNonces: seenNonces,
      sep20Contract_amount: concatSep20ContractAmount(myToken.address, payAmount),
    }

    const [r, s, v] = signRawMsg(stochasticPayVrf.address, msg, payer);
    await expect(payToSingleReciever(stochasticPayVrf, msg, payerSalt_pk0, pkTail, r, s, v)).to.be.revertedWith("INCORRECT_NONCES");
  });
  // ----------------------------------------------------------------

});

function getBalance(stochasticPayVrf, owner, sep20Contract) {
  return stochasticPayVrf.getBalance(owner, sep20Contract);
}

function depositSep20Tokens(stochasticPayVrf, owner, sep20Contract_amount) {
  return stochasticPayVrf.deposit(owner, sep20Contract_amount)
}

function signRawMsg(verifyingContractAddr, msg, signer) {
  const typedData = getTypedData(verifyingContractAddr, msg);
  const digest = TypedDataUtils.encodeDigest(typedData);
  const signature = signer._signingKey().signDigest(digest);
  return [signature.r, signature.s, signature.v];
}

function getPayer(stochasticPayVrf, msg, payerSalt_pk0, pkTail, r, s, v) {
  return stochasticPayVrf.getPayer_sr(
      concatPayerSaltPk0V(payerSalt_pk0, v),
      msg.pkTail,
      msg.payeeAddr_dueTime64_prob32,
      msg.seenNonces,
      msg.sep20Contract_amount,
      r, s,
  );
}

function payToSingleReciever(stochasticPayVrf, msg, payerSalt_pk0, pkTail, r, s, v) {
  pi = 0x00;
  let params = {
    payerSalt_pk0_v: concatPayerSaltPk0V(payerSalt_pk0, v),
    pkTail: msg.pkTail,
    payeeAddr_dueTime64_prob32: msg.payeeAddr_dueTime64_prob32,
    seenNonces: msg.seenNonces,
    sep20Contract_amount: msg.sep20Contract_amount,
    r: r,
    s: s,
  }
  return stochasticPayVrf.payToSingleReciever(pi, params);
}

function concatPayerSaltPk0V(payerSalt_pk0, v) {
  const n = BigInt(payerSalt_pk0) << 8n | BigInt(v);
  return '0x' + n.toString(16);
}

function getEIP712HashSrSol(stochasticPayVrf, msg) {
  return stochasticPayVrf.getEIP712Hash_sr(
    msg.payerSalt_pk0,
    msg.pkTail,
    msg.payeeAddr_dueTime64_prob32,
    msg.seenNonces,
    msg.sep20Contract_amount,
  );
}

function concatPayerSaltPk0(payerSalt) {
  const n = BigInt(payerSalt) << 8n | BigInt(0x04);
  return '0x' + n.toString(16);
}

function getPkTail(publicKey) {
  return '0x' + publicKey.substring(4, publicKey.length)
}


function concatSep20ContractAmount(sep20Contract, amount) {
  const n = BigInt(sep20Contract) << 96n | BigInt(amount);
  return '0x' + n.toString(16);
}

function concatSep20ContractPayerAddress(sep20Contract, payerAddr) {
  const n = BigInt(sep20Contract) << 20n | BigInt(payerAddr);
  return '0x' + n.toString(16);
}

function concatPayeeAddrDueTime64Prob32(payeeAddr, dueTime64, prob32) {
  const n = BigInt(payeeAddr) << 96n
          | BigInt(dueTime64) << 32n
          | BigInt(prob32);
  return '0x' + n.toString(16);
}

function getEIP712HashSrJS(verifyingContractAddr, msg) {
  const typedData = getTypedData(verifyingContractAddr, msg);
  const digest = TypedDataUtils.encodeDigest(typedData);
  return ethers.utils.hexlify(digest);
}

function getTypedData(verifyingContractAddr, msg) {
  return {
    types: {
      EIP712Domain: [
        {name: "name", type: "string"},
        {name: "version", type: "string"},
        {name: "chainId", type: "uint256"},
        {name: "verifyingContract", type: "address"},
        {name: "salt", type: "bytes32"},
      ],
      Pay: [
        { name: "payerSalt_pk0", type: "uint256" },
        { name: "pkTail", type: "uint256" },
        { name: "payeeAddr_dueTime64_prob32", type: "uint256" },
        { name: "seenNonces", type: "uint256" },
        { name: "sep20Contract_amount", type: "uint256" },
      ]
    },
    primaryType: 'Pay',
    domain: {
      name: "stochastic_payment",
      version: "v0.1.0",
      chainId: 10000,
      verifyingContract: verifyingContractAddr,
      salt: ethers.utils.id("StochasticPay_VRF"),
    },
    message: msg,
  };
}
