const { expect } = require("chai");
const { ethers } = require("hardhat");
const { TypedDataUtils } = require('ethers-eip712');

describe("StochasticPay", function () {

  let payer, payee;
  let stochasticPay;
  let myToken;

  before(async function () {
    // [payer, payee] = await ethers.getSigners();
    payer = new ethers.Wallet('82c149d8f7257a6ab690d351d482de51e3540a95859a72a96ef5d744e1f69d60');
    payee = new ethers.Wallet('f37a49a536c941829424a502bb4579f2ab5451c7104c8541e7797798f3daf4ec');
    // console.log('payer:', payer.address);
    // console.log('payee:', payee.address);

    const StochasticPay = await ethers.getContractFactory("StochasticPay");
    stochasticPay = await StochasticPay.deploy();
    await stochasticPay.deployed();

    const TestERC20 = await ethers.getContractFactory("TestERC20");
    myToken = await TestERC20.deploy('MYT', 100000000, 8);
    await myToken.deployed();
  });

  it("getEIP712Hash", async function () {
    const payerSalt = ethers.utils.id("payerSalt");
    const payeeSalt = ethers.utils.id("payeeSalt");
    const payeeSaltHash = ethers.utils.keccak256('0x00' + (BigInt(payeeSalt) >> 8n).toString(16));
    // console.log('payerSalt:', payerSalt);
    // console.log('payeeSalt:', payeeSalt);
    // console.log('payeeSaltHash:', payeeSaltHash);

    const dueTime64 = 1637579519;//Math.floor(Date.now() / 1000) + 3600;
    const prob32 = 0x12345678;
 
    const msg = {
      payerSalt: payerSalt,
      payeeSaltHash: payeeSaltHash,
      payeeAddr_dueTime64_prob32: concatPayeeAddrDueTime64Prob32(payee.address, dueTime64, prob32),
      payerAllowance: 0x1234,
      sep20Contract_amount: concatSep20ContractAmount(myToken.address, 100),
    }

    const eip712HashSol = await getEIP712HashSol(stochasticPay, msg);
    const eip712HashJS = getEIP712HashJS(stochasticPay.address, msg);
    // console.log('eip712HashSol:', eip712HashSol);
    // console.log('eip712HashJS :', eip712HashJS);
    expect(eip712HashSol).to.equal(eip712HashJS);
  });

  it("getPayer", async function () {
    const payerSalt = ethers.utils.id("payerSalt");
    const payeeSalt = ethers.utils.id("payeeSalt");
    const payeeSaltHash = ethers.utils.keccak256('0x00' + (BigInt(payeeSalt) >> 8n).toString(16));

    const dueTime64 = 1637579519;//Math.floor(Date.now() / 1000) + 3600;
    const prob32 = 0x12345678;
 
    const msg = {
      payerSalt: payerSalt,
      payeeSaltHash: payeeSaltHash,
      payeeAddr_dueTime64_prob32: concatPayeeAddrDueTime64Prob32(payee.address, dueTime64, prob32),
      payerAllowance: 0x1234,
      sep20Contract_amount: concatSep20ContractAmount(myToken.address, 100),
    }

    const [r, s, v] = signRawMsg(stochasticPay.address, msg, payer);
    // console.log('r:', r);
    // console.log('s:', s);
    // console.log('v:', v);
    const payerAddr = await getPayer(stochasticPay, msg, payeeSalt, r, s, v);
    // console.log('payerAddr:', payerAddr);
    expect(payerAddr).to.equal(payer.address);
  });

});

function getPayer(stochasticPay, msg, payeeSalt, r, s, v) {
  return stochasticPay.getPayer(
    concatPayeeSaltV(payeeSalt, v),
    msg.payerSalt,
    msg.payeeSaltHash,
    msg.payeeAddr_dueTime64_prob32,
    msg.payerAllowance,
    msg.sep20Contract_amount,
    r, s,
  );
}
function getEIP712HashSol(stochasticPay, msg) {
  return stochasticPay.getEIP712Hash(
    msg.payerSalt,
    msg.payeeSaltHash,
    msg.payeeAddr_dueTime64_prob32,
    msg.payerAllowance,
    msg.sep20Contract_amount,
  );
}

function concatPayeeAddrDueTime64Prob32(payeeAddr, dueTime64, prob32) {
  const n = BigInt(payeeAddr) << 96n
          | BigInt(dueTime64) << 32n
          | BigInt(prob32);
  return '0x' + n.toString(16);
}
function concatSep20ContractAmount(sep20Contract, amount) {
  const n = BigInt(sep20Contract) << 96n | BigInt(amount);
  return '0x' + n.toString(16);
}
function concatPayeeSaltV(payeeSalt, v) {
  const n = (BigInt(payeeSalt) >> 8n) << 8n | BigInt(v);
  return '0x' + n.toString(16);
}

function signRawMsg(verifyingContractAddr, msg, signer) {
  const typedData = getTypedData(verifyingContractAddr, msg);
  const digest = TypedDataUtils.encodeDigest(typedData);
  // const signature = await signer.signMessage(digest);
  // const r = signature.substring(0, 66);
  // const s = "0x" + signature.substring(66, 130);
  // const v = parseInt(signature.substring(130, 132), 16);
  // return [r, s, v];
  const signature = signer._signingKey().signDigest(digest);
  return [signature.r, signature.s, signature.v];
}

function getEIP712HashJS(verifyingContractAddr, msg) {
  const typedData = getTypedData(verifyingContractAddr, msg);
  const digest = TypedDataUtils.encodeDigest(typedData);
  const digestHex = ethers.utils.hexlify(digest);
  return digestHex;
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
        { name: "payerSalt", type: "uint256" },
        { name: "payeeSaltHash", type: "bytes32" },
        { name: "payeeAddr_dueTime64_prob32", type: "uint256" },
        { name: "payerAllowance", type: "uint256" },
        { name: "sep20Contract_amount", type: "uint256" },
      ]
    },
    primaryType: 'Pay',
    domain: {
      name: "example dapp",
      version: "v0.1.0",
      chainId: 10000,
      verifyingContract: verifyingContractAddr,
      salt: ethers.utils.id("StochasticPay"),
    },
    // message: {
    //   payerSalt: "",
    //   payeeSaltHash: "",
    //   payeeAddr_dueTime64_prob32: "",
    //   payerAllowance: "",
    //   sep20Contract_amount: "",
    // }
    message: msg,
  };
}
