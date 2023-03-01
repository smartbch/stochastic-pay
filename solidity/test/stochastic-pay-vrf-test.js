const { expect } = require("chai");
const { ethers } = require("hardhat");
const { TypedDataUtils } = require('ethers-eip712');
const { MerkleTree } = require('merkletreejs');

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

  let payer, payeeA, payeeB;
  let deployer;
  let merkleTree;
  let validatorPkHashRoot;

  before(async function () {
    const [acc0] = await ethers.getSigners();
    deployer = acc0;
    console.log('deployer:', deployer.address);
    payer = new ethers.Wallet('82c149d8f7257a6ab690d351d482de51e3540a95859a72a96ef5d744e1f69d60', deployer.provider);
    payeeA = new ethers.Wallet('f37a49a536c941829424a502bb4579f2ab5451c7104c8541e7797798f3daf4ec', deployer.provider);
    payeeB = new ethers.Wallet('0d7dbbf080fb55ac6c70e8e953478466d4b9ad1a4d4149e84fb7d818c3cdd963', deployer.provider);
    console.log('payer:', payer.address);
    console.log('payeeA:', payeeA.address);
    console.log('payeeB:', payeeB.address);
    await acc0.sendTransaction({to: payer.address, value: ethers.utils.parseEther("1.0")});

    const validators = [payer.publicKey, payeeA.publicKey, payeeB.publicKey];
    console.log("validators: ", JSON.stringify(validators));
    const leafNodes = [extractPKXY(payer.publicKey), extractPKXY(payeeA.publicKey),extractPKXY(payeeB.publicKey)];
    merkleTree = new MerkleTree(leafNodes, ethers.utils.keccak256, { hashLeaves: true, sortPairs: true });
    console.log("---------");
    console.log("Merke Tree");
    console.log("---------");
    console.log(merkleTree.toString());
    console.log("---------");

    validatorPkHashRoot = '0x' + merkleTree.getRoot().toString('hex');
    console.log("validatorPkHashRoot: ", validatorPkHashRoot);
  });

  let stochasticPayVrf;
  let myToken;
  let payerAllowance;
  let payAmount;

  beforeEach(async function () {
    const StochasticPayVrf = await ethers.getContractFactory("StochasticPay_VRF_forUT");
    stochasticPayVrf = await StochasticPayVrf.deploy();
    await stochasticPayVrf.deployed();

    const TestERC20 = await ethers.getContractFactory("TestERC20");
    myToken = await TestERC20.deploy('MYT', 100000000, 8);
    await myToken.deployed();

    payerAllowance = 101;
    payAmount = 100;
    await myToken.connect(deployer).approve(stochasticPayVrf.address, payerAllowance);
    await depositSep20Tokens(stochasticPayVrf, payer.address, concatAddressAmount(myToken.address, payerAllowance));
  });


  it("loadWallet: OK", async function () {
    const [nonces, balance] = await stochasticPayVrf.loadWallet(myToken.address, payer.address);
    console.log("Nonces: " + nonces, "Balance: " + balance)
    expect(balance).to.equal(payerAllowance);
  });

  it("getEIP712Hash_sr", async function () {
    const dueTime64 = Math.floor(Date.now() / 1000) + 3600;
    const prob32 = 0x12345678;
    const seenNonces = 0x0000000000000000000000000000000000000000n  // 160 bits

    const payerPubKeyHash = ethers.utils.keccak256(payer.publicKey)
    const payerSalt_pk0 = concatPayerSaltPk0(payerSalt240, payerPubKeyHash);
    const pkTail = getPkTail(payerPubKeyHash);
    console.log('payerSalt_pk0:', payerSalt_pk0);
    console.log('pkTail:', pkTail);

    const msg = {
      payerSalt_pk0: payerSalt_pk0,
      pkTail: pkTail,
      payeeAddr_dueTime64_prob32: concatAddrDueTime64Prob32(payeeA.address, dueTime64, prob32),
      seenNonces: seenNonces,
      sep20Contract_amount: concatAddressAmount(myToken.address, 100),
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
    const seenNonces = 0x0000000000000000000000000000000000000000n  // 160 bits

    const payerPubKeyHash = ethers.utils.keccak256(payer.publicKey)
    const payerSalt_pk0 = concatPayerSaltPk0(payerSalt240, payerPubKeyHash);
    const pkTail = getPkTail(payerPubKeyHash);

    const msg = {
      payerSalt_pk0: payerSalt_pk0,
      pkTail: pkTail,
      payeeAddr_dueTime64_prob32: concatAddrDueTime64Prob32(payeeA.address, dueTime64, prob32),
      seenNonces: seenNonces,
      sep20Contract_amount: concatAddressAmount(myToken.address, payAmount),
    }

    const [r, s, v] = signRawMsgSr(stochasticPayVrf.address, msg, payer);
    const payerAddr = await getPayerSr(stochasticPayVrf, msg, payerSalt_pk0, pkTail, r, s, v);
    expect(payerAddr).to.equal(payer.address);
  });

  it("payToSingleReciever:ok", async function () {
    const dueTime64 = Math.floor(Date.now() / 1000) + 3600;
    const prob32 = 0xFFFFFFFF;
    const seenNonces = 0x0000000000000000000000000000000000000000n  // 160 bits

    const payerPubKeyHash = ethers.utils.keccak256(payer.publicKey)
    const payerSalt_pk0 = concatPayerSaltPk0(payerSalt240, payerPubKeyHash);
    const pkTail = getPkTail(payerPubKeyHash);

    const msg = {
      payerSalt_pk0: payerSalt_pk0,
      pkTail: pkTail,
      payeeAddr_dueTime64_prob32: concatAddrDueTime64Prob32(payeeA.address, dueTime64, prob32),
      seenNonces: seenNonces,
      sep20Contract_amount: concatAddressAmount(myToken.address, payAmount),
    }

    const [r, s, v] = signRawMsgSr(stochasticPayVrf.address, msg, payer);
    await payToSingleReciever(stochasticPayVrf, msg, payerSalt_pk0, pkTail, r, s, v);
    console.log("Pay SR done!");

    const [ payerNonce , payerBalance] = await stochasticPayVrf.loadWallet(myToken.address, payer.address);
    const [ payeeNonce , payeeABalance] = await stochasticPayVrf.loadWallet(myToken.address, payeeA.address);

    expect(payerBalance).to.equal(1);
    expect(payeeABalance).to.equal(payAmount);
  });

  it("payToSingleReciever:failed:EXPIRED", async function () {
    const dueTime64 = Math.floor(Date.now() / 1000) - 3600;
    const prob32 = 0xFFFFFFFF;
    const seenNonces = 0x0000000000000000000000000000000000000000n  // 160 bits

    const payerPubKeyHash = ethers.utils.keccak256(payer.publicKey)
    const payerSalt_pk0 = concatPayerSaltPk0(payerSalt240, payerPubKeyHash);
    const pkTail = getPkTail(payerPubKeyHash);

    const msg = {
      payerSalt_pk0: payerSalt_pk0,
      pkTail: pkTail,
      payeeAddr_dueTime64_prob32: concatAddrDueTime64Prob32(payeeA.address, dueTime64, prob32),
      seenNonces: seenNonces,
      sep20Contract_amount: concatAddressAmount(myToken.address, payAmount),
    }

    const [r, s, v] = signRawMsgSr(stochasticPayVrf.address, msg, payer);
    await expect(payToSingleReciever(stochasticPayVrf, msg, payerSalt_pk0, pkTail, r, s, v)).to.be.revertedWith("EXPIRED");
  });

  it("payToSingleReciever:failed:CANNOT_PAY", async function () {
    const dueTime64 = Math.floor(Date.now() / 1000) + 3600;
    const prob32 = 0x00000000;
    const seenNonces = 0x0000000000000000000000000000000000000000n  // 160 bits

    const payerPubKeyHash = ethers.utils.keccak256(payer.publicKey)
    const payerSalt_pk0 = concatPayerSaltPk0(payerSalt240, payerPubKeyHash);
    const pkTail = getPkTail(payerPubKeyHash);

    const msg = {
      payerSalt_pk0: payerSalt_pk0,
      pkTail: pkTail,
      payeeAddr_dueTime64_prob32: concatAddrDueTime64Prob32(payeeA.address, dueTime64, prob32),
      seenNonces: seenNonces,
      sep20Contract_amount: concatAddressAmount(myToken.address, payAmount),
    }

    const [r, s, v] = signRawMsgSr(stochasticPayVrf.address, msg, payer);
    await expect(payToSingleReciever(stochasticPayVrf, msg, payerSalt_pk0, pkTail, r, s, v)).to.be.revertedWith("CANNOT_PAY");
  });

  it("payToSingleReciever:failed:INCORRECT_NONCES", async function () {
    const dueTime64 = Math.floor(Date.now() / 1000) + 3600;
    const prob32 = 0xFFFFFFFF;
    const seenNonces = 0x1111111111111111111111111111111111111111n  // 160 bits

    const payerPubKeyHash = ethers.utils.keccak256(payer.publicKey)
    const payerSalt_pk0 = concatPayerSaltPk0(payerSalt240, payerPubKeyHash);
    const pkTail = getPkTail(payerPubKeyHash);

    const msg = {
      payerSalt_pk0: payerSalt_pk0,
      pkTail: pkTail,
      payeeAddr_dueTime64_prob32: concatAddrDueTime64Prob32(payeeA.address, dueTime64, prob32),
      seenNonces: seenNonces,
      sep20Contract_amount: concatAddressAmount(myToken.address, payAmount),
    }

    const [r, s, v] = signRawMsgSr(stochasticPayVrf.address, msg, payer);
    await expect(payToSingleReciever(stochasticPayVrf, msg, payerSalt_pk0, pkTail, r, s, v)).to.be.revertedWith("INCORRECT_NONCES");
  });

  // ----------------------------------------------------------------

  it("getEIP712Hash_ab", async function () {
    const dueTime64 = Math.floor(Date.now() / 1000) + 3600;
    const prob32 = 0x12345678;
    const seenNonces = 0x0000000000000000000000000000000000000000n  // 160 bits

    const msg = {
      payerSalt: payerSalt,
      pkHashRoot: validatorPkHashRoot,
      sep20Contract_dueTime64_prob32:concatAddrDueTime64Prob32(myToken.address, dueTime64, prob32),
      seenNonces: seenNonces,
      payeeAddrA_amountA: concatAddressAmount(payeeA.address, 50),
      amountB: wrapAmount(50),
    }

    const eip712HashAbSol = await getEIP712HashAbSol(stochasticPayVrf, msg);
    const eip712HashAbJS = getEIP712HashAbJS(stochasticPayVrf.address, msg);
    console.log('eip712HashAbSol:', eip712HashAbSol);
    console.log('eip712HashAbJS :', eip712HashAbJS);
    expect(eip712HashAbSol).to.equal(eip712HashAbJS);
  });

  it("getPayer_ab", async function () {
    const dueTime64 = Math.floor(Date.now() / 1000) + 3600;
    const prob32 = 0x12345678;
    const seenNonces = 0x0000000000000000000000000000000000000000n  // 160 bits

    const msg = {
      payerSalt: payerSalt,
      pkHashRoot: validatorPkHashRoot,
      sep20Contract_dueTime64_prob32:concatAddrDueTime64Prob32(myToken.address, dueTime64, prob32),
      seenNonces: seenNonces,
      payeeAddrA_amountA: concatAddressAmount(payeeA.address, 50),
      amountB: wrapAmount(50),
    }

    const [r, s, v] = signRawMsgAb(stochasticPayVrf.address, msg, payer);
    const payerAddr = await getPayerAb(stochasticPayVrf, msg, r, s, v);
    expect(payerAddr).to.equal(payer.address);
  });

  it("payToAB:ok", async function () {
    const dueTime64 = Math.floor(Date.now() / 1000) + 3600;
    const prob32 = 0xFFFFFFFF;
    const seenNonces = 0x0000000000000000000000000000000000000000n  // 160 bits

    const msg = {
      payerSalt: payerSalt,
      pkHashRoot: validatorPkHashRoot,
      sep20Contract_dueTime64_prob32: concatAddrDueTime64Prob32(myToken.address, dueTime64, prob32),
      seenNonces: seenNonces,
      payeeAddrA_amountA: concatAddressAmount(payeeA.address, 50),
      amountB: wrapAmount(50),
    }


    const payeeBPubKeyHash = ethers.utils.keccak256(extractPKXY(payeeB.publicKey));
    console.log("payeeBPubKeyHash: ", payeeBPubKeyHash);
    const proofHex = merkleTree.getHexProof(payeeBPubKeyHash);
    console.log("proof: ", proofHex);
    const [r, s, v] = signRawMsgAb(stochasticPayVrf.address, msg, payer);
    await payToAB(stochasticPayVrf, msg, proofHex, payeeB.publicKey, r, s, v);

    console.log("Pay AB done!");
    const [ payerNonce , payerBalance] = await stochasticPayVrf.loadWallet(myToken.address, payer.address);
    const [ payeeANonce , payeeABalance] = await stochasticPayVrf.loadWallet(myToken.address, payeeA.address);
    const [ payeeBNonce , payeeBBalance] = await stochasticPayVrf.loadWallet(myToken.address, payeeB.address);

    expect(payerBalance).to.equal(1);
    expect(payeeABalance).to.equal(50);
    expect(payeeBBalance).to.equal(50);
  });

  it("payToAB:EXPIRED", async function () {
    const dueTime64 = Math.floor(Date.now() / 1000) - 3600;
    const prob32 = 0xFFFFFFFF;
    const seenNonces = 0x0000000000000000000000000000000000000000n  // 160 bits

    const msg = {
      payerSalt: payerSalt,
      pkHashRoot: validatorPkHashRoot,
      sep20Contract_dueTime64_prob32: concatAddrDueTime64Prob32(myToken.address, dueTime64, prob32),
      seenNonces: seenNonces,
      payeeAddrA_amountA: concatAddressAmount(payeeA.address, 50),
      amountB: wrapAmount(50),
    }

    const payeeBPubKeyHash = ethers.utils.keccak256(extractPKXY(payeeB.publicKey));
    console.log("payeeBPubKeyHash: ", payeeBPubKeyHash);
    const proofHex = merkleTree.getHexProof(payeeBPubKeyHash);
    console.log("proof: ", proofHex);
    const [r, s, v] = signRawMsgAb(stochasticPayVrf.address, msg, payer);
    await expect(payToAB(stochasticPayVrf, msg, proofHex, payeeB.publicKey, r, s, v)).to.be.revertedWith("EXPIRED");
  });

  it("payToAB:CANNOT_PAY", async function () {
    const dueTime64 = Math.floor(Date.now() / 1000) + 3600;
    const prob32 = 0x00000000;
    const seenNonces = 0x0000000000000000000000000000000000000000n  // 160 bits

    const msg = {
      payerSalt: payerSalt,
      pkHashRoot: validatorPkHashRoot,
      sep20Contract_dueTime64_prob32: concatAddrDueTime64Prob32(myToken.address, dueTime64, prob32),
      seenNonces: seenNonces,
      payeeAddrA_amountA: concatAddressAmount(payeeA.address, 50),
      amountB: wrapAmount(50),
    }

    const payeeBPubKeyHash = ethers.utils.keccak256(extractPKXY(payeeB.publicKey));
    console.log("payeeBPubKeyHash: ", payeeBPubKeyHash);
    const proofHex = merkleTree.getHexProof(payeeBPubKeyHash);
    console.log("proof: ", proofHex);
    const [r, s, v] = signRawMsgAb(stochasticPayVrf.address, msg, payer);
    await expect(payToAB(stochasticPayVrf, msg, proofHex, payeeB.publicKey, r, s, v)).to.be.revertedWith("CANNOT_PAY");
  });

  it("payToAB:VERIFY_FAILED", async function () {
    const dueTime64 = Math.floor(Date.now() / 1000) + 3600;
    const prob32 = 0xFFFFFFFF;
    const seenNonces = 0x0000000000000000000000000000000000000000n  // 160 bits

    const msg = {
      payerSalt: payerSalt,
      pkHashRoot: validatorPkHashRoot,
      sep20Contract_dueTime64_prob32: concatAddrDueTime64Prob32(myToken.address, dueTime64, prob32),
      seenNonces: seenNonces,
      payeeAddrA_amountA: concatAddressAmount(payeeA.address, 50),
      amountB: wrapAmount(50),
    }

    const [r, s, v] = signRawMsgAb(stochasticPayVrf.address, msg, payer);
    await expect(payToAB(stochasticPayVrf, msg, [], payer.publicKey, r, s, v)).to.be.revertedWith("VERIFY_FAILED");
  });

  it("payToAB:INCORRECT_NONCES", async function () {
    const dueTime64 = Math.floor(Date.now() / 1000) + 3600;
    const prob32 = 0xFFFFFFFF;
    const seenNonces = 0x1111111111111111111111111111111111111111n  // 160 bits

    const msg = {
      payerSalt: payerSalt,
      pkHashRoot: validatorPkHashRoot,
      sep20Contract_dueTime64_prob32: concatAddrDueTime64Prob32(myToken.address, dueTime64, prob32),
      seenNonces: seenNonces,
      payeeAddrA_amountA: concatAddressAmount(payeeA.address, 50),
      amountB: wrapAmount(50),
    }

    const payeeBPubKeyHash = ethers.utils.keccak256(extractPKXY(payeeB.publicKey));
    console.log("payeeBPubKeyHash: ", payeeBPubKeyHash);
    const proofHex = merkleTree.getHexProof(payeeBPubKeyHash);
    console.log("proof: ", proofHex);
    const [r, s, v] = signRawMsgAb(stochasticPayVrf.address, msg, payer);
    await expect(payToAB(stochasticPayVrf, msg, proofHex, payeeB.publicKey, r, s, v)).to.be.revertedWith("INCORRECT_NONCES");
  });

  // ----------------------------------------------------------------

  it("registerVrfPubKey: OK", async function () {
    const vrfPubKey ="0x0379be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"
    await stochasticPayVrf.connect(payer).registerVrfPubKey(vrfPubKey);
    const pubKey = await stochasticPayVrf.getVrfPubKeyByAddr(payer.address);
    console.log("pubKey: ", pubKey);
    expect(vrfPubKey).to.equal(pubKey);
  });

  it("registerVrfPubKey: WRONG ADDR", async function () {
    const pubKey = await stochasticPayVrf.getVrfPubKeyByAddr(deployer.address);
    console.log("pubKey: ", pubKey);
    expect(pubKey.length === 2).to.be.ok; // empty bytes "0x"
  });

  it("unregisterVrfPubKey: OK", async function () {
    const vrfPubKey ="0x0379be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"
    await stochasticPayVrf.connect(payer).registerVrfPubKey(vrfPubKey);
    await stochasticPayVrf.connect(payer).unregisterVrfPubKey();
    const pubKey = await stochasticPayVrf.getVrfPubKeyByAddr(payer.address);
    console.log("pubKey: ", pubKey);
    expect(pubKey.length === 2).to.be.ok; // empty bytes "0x"
  });


  // ----------------------------------------------------------------

  it("testBytes32Split: OK", async function () {
    const beta ="0x0102030400000000000000000000000000000000000000000000000000000000"
    const betaInt32 = await stochasticPayVrf.connect(payer).testBytes32Split(beta);
    console.log("betaInt32: ", betaInt32);
  });

});

function concatContractAddrAndOwnerAddr(contract, owner) {
  return ethers.utils.defaultAbiCoder.encode([ "address", "address" ], [contract, owner]);
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

function getEIP712HashAbSol(stochasticPayVrf, msg) {
  return stochasticPayVrf.getEIP712Hash_ab(
      msg.payerSalt,
      msg.pkHashRoot,
      msg.sep20Contract_dueTime64_prob32,
      msg.seenNonces,
      msg.payeeAddrA_amountA,
      msg.amountB,
  );
}

function getPayerSr(stochasticPayVrf, msg, payerSalt_pk0, pkTail, r, s, v) {
  return stochasticPayVrf.getPayer_sr(
      concatPayerSaltPk0V(payerSalt_pk0, v),
      msg.pkTail,
      msg.payeeAddr_dueTime64_prob32,
      msg.seenNonces,
      msg.sep20Contract_amount,
      r, s,
  );
}

function getPayerAb(stochasticPayVrf, msg, r, s, v) {
  return stochasticPayVrf.getPayer_ab(
      msg.payerSalt,
      msg.pkHashRoot,
      msg.sep20Contract_dueTime64_prob32,
      msg.seenNonces,
      msg.payeeAddrA_amountA,
      msg.amountB,
      v, r, s,
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

function payToAB(stochasticPayVrf, msg, proof, validatorPubKey, r, s, v) {
  pi = 0x00;
  const [pkX, pkY] = splitPKToXY(validatorPubKey);
  console.log("pkX: ", pkX);
  console.log("pkY: ", pkY);
  let params = {
    payerSalt: msg.payerSalt,
    pkX: pkX,
    pkY: pkY,
    pkHashRoot: msg.pkHashRoot,
    sep20Contract_dueTime64_prob32: msg.sep20Contract_dueTime64_prob32,
    seenNonces: msg.seenNonces,
    payeeAddrA_amountA: msg.payeeAddrA_amountA,
    amountB_v: concatAmountV(msg.amountB, v),
    r: r,
    s: s,
  }
  return stochasticPayVrf.payToAB(proof, pi, params);
}

function concatPayerSaltPk0V(payerSalt_pk0, v) {
  const n = BigInt(payerSalt_pk0) << 8n | BigInt(v);
  return '0x' + n.toString(16);
}

function concatPk0V(publicKey, v) {
    const n = BigInt('0x' + publicKey.substring(2, 4)) << 8n | BigInt(v);
    return '0x' + n.toString(16);
}

function concatPayerSaltPk0(payerSalt, publicKey) {
  const n = BigInt(payerSalt) << 8n | BigInt('0x' + publicKey.substring(2, 4));
  return '0x' + n.toString(16);
}

function getPkTail(publicKey) {
  return '0x' + publicKey.substring(4, publicKey.length)
}

function concatAddressAmount(address, amount) {
  const n = BigInt(address) << 96n | BigInt(amount);
  return '0x' + n.toString(16);
}

function wrapAmount(amount) {
  const n = BigInt(amount);
  return '0x' + n.toString(16);
}

function concatAmountV(amount, v) {
  const n = BigInt(amount) << 8n | BigInt(v);
  return '0x' + n.toString(16);
}


function splitPKToXY(publicKey) {
  const x = BigInt('0x' + publicKey.substring(4, 68));
  const y = BigInt('0x' + publicKey.substring(68, 132))
  return ['0x' + x.toString(16), '0x' + y.toString(16)];
}

function extractPKXY(publicKey) {
  const xy = BigInt('0x' + publicKey.substring(4, 132));
  return '0x' + xy.toString(16);
}


function concatAddrDueTime64Prob32(address, dueTime64, prob32) {
  const n = BigInt(address) << 96n
          | BigInt(dueTime64) << 32n
          | BigInt(prob32);
  return '0x' + n.toString(16);
}

function getBalance(stochasticPayVrf, owner, sep20Contract) {
  return stochasticPayVrf.getBalance(owner, sep20Contract);
}

function depositSep20Tokens(stochasticPayVrf, owner, sep20Contract_amount) {
  return stochasticPayVrf.deposit(owner, sep20Contract_amount)
}

function signRawMsgSr(verifyingContractAddr, msg, signer) {
  const typedData = getTypedDataSr(verifyingContractAddr, msg);
  const digest = TypedDataUtils.encodeDigest(typedData);
  const signature = signer._signingKey().signDigest(digest);
  return [signature.r, signature.s, signature.v];
}

function signRawMsgAb(verifyingContractAddr, msg, signer) {
  const typedData = getTypedDataAb(verifyingContractAddr, msg);
  const digest = TypedDataUtils.encodeDigest(typedData);
  const signature = signer._signingKey().signDigest(digest);
  return [signature.r, signature.s, signature.v];
}

function getEIP712HashSrJS(verifyingContractAddr, msg) {
  const typedData = getTypedDataSr(verifyingContractAddr, msg);
  const digest = TypedDataUtils.encodeDigest(typedData);
  return ethers.utils.hexlify(digest);
}

function getEIP712HashAbJS(verifyingContractAddr, msg) {
  const typedData = getTypedDataAb(verifyingContractAddr, msg);
  const digest = TypedDataUtils.encodeDigest(typedData);
  return ethers.utils.hexlify(digest);
}

function getTypedDataSr(verifyingContractAddr, msg) {
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
        { name: "seenNonces", type: "uint160" },
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

function getTypedDataAb(verifyingContractAddr, msg) {
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
        { name: "pkHashRoot", type: "bytes32" },
        { name: "sep20Contract_dueTime64_prob32", type: "uint256" },
        { name: "seenNonces", type: "uint160" },
        { name: "payeeAddrA_amountA", type: "uint256" },
        { name: "amountB", type: "uint256" },
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
