// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "hardhat/console.sol";
import "./IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract StochasticPay_VRF {
	address constant private SEP206Contract = address(uint160(0x2711));
	address constant private SEP101Contract = address(bytes20(uint160(0x2712)));
	bytes32 private constant SALT = keccak256(abi.encodePacked("StochasticPay_VRF"));
	address private constant VRF_PRECOMPILE = address(0x2713); // the VRF precompile contract's address 
	uint256 private constant CHAINID = 10000; // smartBCH mainnet
	string private constant EIP712_DOMAIN = "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)";
	bytes32 private constant EIP712_DOMAIN_TYPEHASH = keccak256(abi.encodePacked(EIP712_DOMAIN));
	bytes32 private constant DAPP_HASH = keccak256(abi.encodePacked("stochastic_payment"));
	bytes32 private constant VERSION_HASH = keccak256(abi.encodePacked("v0.1.0"));
	// SR: single receiver; the vrf-pubkey's owner decides whether the payment happens.
	bytes32 private constant TYPE_HASH_SR= keccak256(abi.encodePacked("Pay(uint256 payerSalt_pk0,uint256 pkTail,uint256 payeeAddr_dueTime64_prob32,uint160 seenNonces,uint256 sep20Contract_amount)"));
	// AB: two receivers, A and B; several vrf-pubkeys' owners decides whether the payment happens
	// usually A is an EOA and B is a contract whose beneficiary own the vrf-pubkeys
	bytes32 private constant TYPE_HASH_AB = keccak256(abi.encodePacked("Pay(uint256 payerSalt,bytes32 pkHashRoot,uint256 sep20Contract_dueTime64_prob32,uint160 seenNonces,uint256 payeeAddrA_amountA,uint256 amountB)"));

	mapping (address => mapping (address => uint)) walletMap;

	function registerVrfPubKey(bytes memory vrfPubKey) virtual external {
		require(vrfPubKey.length == 33, "INCORRECT_VRF_PK_LENGTH");
		bytes memory keyBz = abi.encodePacked(msg.sender);
		(bool success, /*bytes memory _notUsed*/) = SEP101Contract.delegatecall(
			abi.encodeWithSignature("set(bytes,bytes)", keyBz, vrfPubKey));
		require(success, "SEP101_SET_FAIL");
	}

	function unregisterVrfPubKey() virtual external {
		bytes memory keyBz = abi.encodePacked(msg.sender);
		(bool success, /*bytes memory _notUsed*/) = SEP101Contract.delegatecall(
			abi.encodeWithSignature("set(bytes,bytes)", keyBz, bytes32(0)));
		require(success, "SEP101_SET_FAIL");
	}

	function getVrfPubKeyByAddr(address addr) virtual public returns (bytes memory)  {
		bytes memory keyBz = abi.encodePacked(addr);
		(bool success, bytes memory data) = SEP101Contract.delegatecall(
			abi.encodeWithSignature("get(bytes)", keyBz));
		require(success, "SEP101_GET_FAIL");
		return data;
	}


	function safeReceive(address coinType, uint amount) internal returns (uint96) {
		uint realAmount = amount;
		if(coinType == SEP206Contract) {
			require(msg.value == amount, "value-mismatch");
		} else {
			require(msg.value == 0, "dont-send-bch");
			uint oldBalance = IERC20(coinType).balanceOf(address(this));
			IERC20(coinType).transferFrom(msg.sender, address(this), uint(amount));
			uint newBalance = IERC20(coinType).balanceOf(address(this));
			realAmount = uint96(newBalance - oldBalance);
		}
		return uint96(realAmount);
	}
	
	function safeTransfer(address coinType, address receiver, uint amount) internal {
		if(amount == 0) {
			return;
		}
		(bool success, bytes memory data) = coinType.call(
			abi.encodeWithSignature("transfer(address,uint256)", receiver, amount));
		bool ret = abi.decode(data, (bool));
		require(success && ret, "trans-fail");
	}

	function saveWallet(address token, address owner, uint160 nonces, uint96 balance) internal {
		uint wallet = uint(nonces)<<96 | balance;
		walletMap[token][owner] = wallet;
	}

	function loadWallet(address token, address owner) public view returns (uint160, uint96) {
		uint wallet = walletMap[token][owner];
		return (uint160(wallet>>96), uint96(wallet));
	}

	function deposit(address owner, uint sep20Contract_amount) public payable {
		address sep20Contract = address(uint160(sep20Contract_amount>>96));
		uint amount = uint96(sep20Contract_amount);
		safeReceive(sep20Contract, amount);
		(uint160 nonces, uint96 balance) = loadWallet(sep20Contract, owner);
		saveWallet(sep20Contract, owner, nonces, uint96(balance + amount));
	}

	function withdraw(uint sep20Contract_amount) public {
		address sep20Contract = address(uint160(sep20Contract_amount>>96));
		uint amount = uint96(sep20Contract_amount);
		(uint160 nonces, uint96 balance) = loadWallet(sep20Contract, msg.sender);
		require(balance >= amount, "NOT_ENOUGH_COINS");
		safeTransfer(sep20Contract, msg.sender, amount);
		saveWallet(sep20Contract, msg.sender, nonces, uint96(balance - amount));
	}

	function getEIP712Hash_sr(uint256 payerSalt_pk0,
			            //payerSalt: a random 240b number provided by payer, pk0: first byte of pk
			          uint256 pkTail, //The other bytes (1~32) of pk
			          uint256 payeeAddr_dueTime64_prob32, //payeeAddr: the address of payee
			            // dueTime64: when the payment commitment expires
			            // prob32: the probability of this payment
			          uint160 seenNonces, //the last status of nonces seen by the payer
			          uint256 sep20Contract_amount // which coin and how many coins 
		) public view returns (bytes32) {
		bytes32 DOMAIN_SEPARATOR = keccak256(abi.encode(
						     EIP712_DOMAIN_TYPEHASH,
						     DAPP_HASH,
						     VERSION_HASH,
						     CHAINID,
						     address(this),
						     SALT));
		return keccak256(abi.encodePacked(
			"\x19\x01",
			DOMAIN_SEPARATOR,
			keccak256(abi.encode(
				  TYPE_HASH_SR,
				  payerSalt_pk0,
				  pkTail,
				  payeeAddr_dueTime64_prob32,
				  seenNonces,
				  sep20Contract_amount
			))
		));
	}

	function getEIP712Hash_ab(uint256 payerSalt,
			          //payerSalt: a random 240b number provided by payer, pk0: first byte of pk
			          bytes32 pkHashRoot, //The merkle root of vrf pubkeys
			          uint256 sep20Contract_dueTime64_prob32,
			            // dueTime64: when the payment commitment expires
			            // prob32: the probability of this payment
			          uint160 seenNonces, //the last status of nonces seen by the payer
			          uint256 payeeAddrA_amountA,
			          uint256 amountB
		) public view returns (bytes32) {
		bytes32 DOMAIN_SEPARATOR = keccak256(abi.encode(
						     EIP712_DOMAIN_TYPEHASH,
						     DAPP_HASH,
						     VERSION_HASH,
						     CHAINID,
						     address(this),
						     SALT));
		return keccak256(abi.encodePacked(
			"\x19\x01",
			DOMAIN_SEPARATOR,
			keccak256(abi.encode(
				  TYPE_HASH_AB,
				  payerSalt,
				  pkHashRoot,
				  sep20Contract_dueTime64_prob32,
				  seenNonces,
				  payeeAddrA_amountA,
				  amountB
			))
		));
	}

	function getPayer_sr(uint256 payerSalt_pk0_v,
			     uint256 pkTail,
			     uint256 payeeAddr_dueTime64_prob32,
			     uint160 seenNonces,
			     uint256 sep20Contract_amount,
			     bytes32 r, bytes32 s) public view returns (address) {
		bytes32 eip712Hash = getEIP712Hash_sr(payerSalt_pk0_v>>8,
					              pkTail,
					              payeeAddr_dueTime64_prob32,
					              seenNonces,
					              sep20Contract_amount);
		uint8 v = uint8(payerSalt_pk0_v); //the lowest byte is v
		return ecrecover(eip712Hash, v, r, s);
	}

	function getPayer_ab(uint256 payerSalt,
			     bytes32 pkHashRoot,
			     uint256 sep20Contract_dueTime64_prob32,
			     uint160 seenNonces,
			     uint256 payeeAddrA_amountA,
			     uint256 amountB,
			     uint8 v,
			     bytes32 r, bytes32 s) public view returns (address) {
		bytes32 eip712Hash = getEIP712Hash_ab(payerSalt,
					              pkHashRoot,
					              sep20Contract_dueTime64_prob32,
					              seenNonces,
					              payeeAddrA_amountA,
					              amountB);
		return ecrecover(eip712Hash, v, r, s);
	}

	function getRand32_sr(uint256 payerSalt_pk0_v, uint256 pkTail, bytes calldata pi) virtual internal returns (uint) {
		(uint alpha, uint8 pk0) = (payerSalt_pk0_v>>16, uint8(payerSalt_pk0_v>>8));
		(bool ok, bytes memory beta) = address(VRF_PRECOMPILE).call(abi.encodePacked(alpha, pk0, pkTail, pi));
		require(ok, "VRF_FAIL");
		return (uint(uint8(beta[3]))<<24) | (uint(uint8(beta[2]))<<16) |
			 (uint(uint8(beta[1]))<<8) | (uint(uint8(beta[0])));
	}

	function getRandProb_sr(uint256 payerSalt_pk0_v, uint256 pkTail, bytes calldata pi, uint prob32) virtual internal returns (uint) {
		(uint alpha, uint8 pk0) = (payerSalt_pk0_v>>16, uint8(payerSalt_pk0_v>>8));
		(bool ok, bytes memory beta) = address(VRF_PRECOMPILE).call(abi.encodePacked(alpha, pk0, pkTail, pi));
		require(ok, "VRF_FAIL");
		uint rand256 = abi.decode(beta, (uint));
		uint mask = (1<<32)-1;
		uint randProb = 0;
		for(uint i = 0; i < 256; i += 32) {
			uint rand32 = (rand256>>i)&mask;
			if(rand32 < prob32) {
				randProb += rand32 & 0xFF;
			}
		}
		return randProb;
	}

	function getRand32_ab(uint256 alpha, uint8 pk0, uint256 pkTail, bytes calldata pi) virtual internal returns (uint) {
		(bool ok, bytes memory beta) = address(VRF_PRECOMPILE).call(abi.encodePacked(alpha, pk0, pkTail, pi));
		require(ok, "VRF_FAIL");
		require(beta.length > 3, "beta is invalid");
		return (uint(uint8(beta[3]))<<24) | (uint(uint8(beta[2]))<<16) |
			 (uint(uint8(beta[1]))<<8) | (uint(uint8(beta[0])));
	}

	struct Params_sr {
		uint256 payerSalt_pk0_v;
		uint256 pkTail;
		uint256 payeeAddr_dueTime64_prob32; //payeeAddr: the address of payee
		  // dueTime64: when the payment commitment expires
		  // prob32: the probability of this payment
		uint160 seenNonces; //payer's current allowance to this contract
		uint256 sep20Contract_amount; // which coin and how many coins 
		bytes32 r;
		bytes32 s;
	}

	//anyone can send this transaction and pay gas fee
	function payToSingleReciever(bytes calldata pi, Params_sr calldata params) external {
		uint64 dueTime64 = uint64(params.payeeAddr_dueTime64_prob32>>32);
		require(block.timestamp < dueTime64, "EXPIRED");
		uint prob32 = uint(uint32(params.payeeAddr_dueTime64_prob32));
		uint randProb = 0;
		if(params.payerSalt_pk0_v>>255 != 0) { // the highest bit is set
			uint rand32 = getRand32_sr(params.payerSalt_pk0_v, params.pkTail, pi);
			require(rand32 < prob32, "CANNOT_PAY");
		} else {
			randProb = getRandProb_sr(params.payerSalt_pk0_v, params.pkTail, pi, prob32);
			require(randProb != 0, "CANNOT_PAY");
		}
		address payerAddr = getPayer_sr(params.payerSalt_pk0_v,
					        params.pkTail,
					        params.payeeAddr_dueTime64_prob32,
					        params.seenNonces,
					        params.sep20Contract_amount,
					        params.r, params.s);
		address sep20Contract = address(bytes20(uint160(params.sep20Contract_amount>>96)));
		(uint160 nonces, uint96 balance) = loadWallet(sep20Contract, payerAddr);
		bool pass;
		(nonces, pass) = checkAndUpdateNonces(nonces, params.seenNonces, params.payerSalt_pk0_v>>16);
		require(pass, "INCORRECT_NONCES");
		address payeeAddr = address(bytes20(uint160(params.payeeAddr_dueTime64_prob32>>96)));
		uint amount = uint(uint96(params.sep20Contract_amount));
		if(randProb != 0) {
			amount = amount * randProb / (8*256);
		}
		saveWallet(sep20Contract, payerAddr, nonces, uint96(balance - amount));
		(nonces, balance) = loadWallet(sep20Contract, payeeAddr);
		saveWallet(sep20Contract, payeeAddr, nonces, uint96(balance + amount));
	}

	function checkAndUpdateNonces(uint160 currNonces, uint160 seenNonces, uint salt) pure public returns (uint160, bool) {
		unchecked {
			uint32 top32 = uint32(currNonces>>128);
			uint32 seenTop32 = uint32(seenNonces>>128);
			if(top32 - seenTop32 >= 0x10000) { // prevent wrapping of 16-bit nonces
				return (0, false);
			}
			uint160 allMasks = 0;
			bool anyMatch = false;
			uint160 newNonces = 0;
			for(uint i=0; i<3; i++) { // pick three nonces in a pseudo-random way
				uint shift = (salt&0x70);
				salt = salt >> 8;
				uint160 mask = uint160(0xFFFF << shift);
				if((currNonces&mask) == (seenNonces&mask)) {
					anyMatch = true;
				}
				allMasks = allMasks | mask;
				newNonces = newNonces | (((currNonces&mask) - mask)&mask);
			}
			if(!anyMatch) {
				return (0, false);
			}
			top32++;
			return ((uint160(top32)<<128) | newNonces | (currNonces&~allMasks), true);
		}
	}

	struct Params {
		uint256 payerSalt;
		uint256 pkX; uint256 pkY; // one of the ganychain validators' pubkeys
		bytes32 pkHashRoot; //merkle root of ganychain validators' pubkeys
		uint256 sep20Contract_dueTime64_prob32;
		uint160 seenNonces;
		uint256 payeeAddrA_amountA;
		uint256 amountB_v;
		bytes32 r;
		bytes32 s;
	}

	function payToAB(bytes32[] calldata proof, bytes calldata pi, Params calldata params) external {
		uint tmp = params.sep20Contract_dueTime64_prob32;
		address sep20Contract = address(bytes20(uint160(tmp>>96)));
		{
			uint64 dueTime64 = uint64(tmp>>32);
			require(block.timestamp < dueTime64, "EXPIRED");
			uint rand32 = getRand32_ab(params.payerSalt, uint8(2|(params.pkY&1)), params.pkX, pi);
			uint prob32 = uint(uint32(tmp));
			require(rand32 < prob32, "CANNOT_PAY");
		}

		bytes32 pubKeyXYHash = keccak256(abi.encodePacked(params.pkX, params.pkY));
		require(MerkleProof.verifyCalldata(proof, params.pkHashRoot, pubKeyXYHash), "VERIFY_FAILED");

		uint amountB = params.amountB_v>>8;
		address payerAddr = getPayer_ab(params.payerSalt,
					        params.pkHashRoot,
					        params.sep20Contract_dueTime64_prob32,
					        params.seenNonces,
					        params.payeeAddrA_amountA,
					        amountB,
					        uint8(params.amountB_v),
					        params.r, params.s);

		(uint160 nonces, uint96 balance) = loadWallet(sep20Contract, payerAddr);
		bool pass;
		(nonces, pass) = checkAndUpdateNonces(nonces, params.seenNonces, params.payerSalt);
		require(pass, "INCORRECT_NONCES");

		address payeeAddrA = address(bytes20(uint160(params.payeeAddrA_amountA>>96)));
		address payeeAddrB = address(uint160(uint256(pubKeyXYHash)));

		uint amountA = uint(uint96(params.payeeAddrA_amountA));
		saveWallet(sep20Contract, payerAddr, nonces, uint96(balance - amountA - amountB));
		if(amountA != 0) {
			(nonces, balance) = loadWallet(sep20Contract, payeeAddrA);
			saveWallet(sep20Contract, payeeAddrA, nonces, uint96(balance + amountA));
		}
		(nonces, balance) = loadWallet(sep20Contract, payeeAddrB);
		saveWallet(sep20Contract, payeeAddrB, nonces, uint96(balance + amountB));
	}
}

