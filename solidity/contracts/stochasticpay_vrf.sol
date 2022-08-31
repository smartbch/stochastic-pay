// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "./IERC20.sol";

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
	bytes32 private constant TYPE_HASH_SR= keccak256(abi.encodePacked("Pay(uint256 payerSalt_pk0,uint256 pkTail,uint256 payeeAddr_dueTime64_prob32,uint256 seenNonces,uint256 sep20Contract_amount)"));
	// AB: two receivers, A and B; several vrf-pubkeys' owners decides whether the payment happens
	// usually A is an EOA and B is a contract whose beneficiary own the vrf-pubkeys
	bytes32 private constant TYPE_HASH_AB = keccak256(abi.encodePacked("Pay(uint256 payerSalt,bytes32 pkHashRoot,uint256 sep20Contract_dueTime64_prob32,uint256 seenNonces,uint256 payeeAddrA_amountA,uint256 payeeAddrB_amountB)"));

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
	
	function safeTransfer(address coinType, address receiver, uint amount) internal virtual {
		if(amount == 0) {
			return;
		}
		(bool success, bytes memory data) = coinType.call(
			abi.encodeWithSignature("transfer(address,uint256)", receiver, amount));
		bool ret = abi.decode(data, (bool));
		require(success && ret, "trans-fail");
	}

	function saveWallet(bytes memory keyBz, uint nonces, uint balance) internal virtual {
		bytes memory valueBz = abi.encode(nonces, balance);
		(bool success, /*bytes memory _notUsed*/) = SEP101Contract.delegatecall(
			abi.encodeWithSignature("set(bytes,bytes)", keyBz, valueBz));
		require(success, "SEP101_SET_FAIL");
	}

	function loadWallet(bytes memory keyBz) internal virtual returns (uint nonces, uint balance) {
        	(bool success, bytes memory data) = SEP101Contract.delegatecall(
        		abi.encodeWithSignature("get(bytes)", keyBz));

        	require(success && (data.length == 32 * 2 || data.length == 32 * 4));
        	if (data.length == 32 * 2) {
        		return (0, 0);
        	}

		bytes memory valueBz;
		assembly {valueBz := add(data, 64)}
		return abi.decode(valueBz, (uint, uint));
	}

	function deposit(address owner, uint sep20Contract_amount) public payable {
		address sep20Contract = address(uint160(sep20Contract_amount>>96));
		uint amount = uint96(sep20Contract_amount);
		safeReceive(sep20Contract, amount);
		bytes memory keyBz = abi.encode(sep20Contract, owner);
		(uint nonces, uint balance) = loadWallet(keyBz);
		saveWallet(keyBz, nonces, balance + amount);
	}

	function withdraw(uint sep20Contract_amount) public {
		address sep20Contract = address(uint160(sep20Contract_amount>>96));
		uint amount = uint96(sep20Contract_amount);
		bytes memory keyBz = abi.encode(sep20Contract, msg.sender);
		(uint nonces, uint balance) = loadWallet(keyBz);
		require(balance >= amount, "NOT_ENOUGH_COINS");
		safeTransfer(sep20Contract, msg.sender, amount);
		saveWallet(keyBz, nonces, balance - amount);
	}

	function getEIP712Hash_sr(uint256 payerSalt_pk0,
			            //payerSalt: a random 240b number provided by payer, pk0: first byte of pk
			          uint256 pkTail, //The other bytes (1~32) of pk
			          uint256 payeeAddr_dueTime64_prob32, //payeeAddr: the address of payee
			            // dueTime64: when the payment commitment expires
			            // prob32: the probability of this payment
			          uint256 seenNonces, //the last status of nonces seen by the payer
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
			          uint256 seenNonces, //the last status of nonces seen by the payer
			          uint256 payeeAddrA_amountA,
			          uint256 payeeAddrB_amountB
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
				  payeeAddrB_amountB
			))
		));
	}

	function getPayer_sr(uint256 payerSalt_pk0_v,
			     uint256 pkTail,
			     uint256 payeeAddr_dueTime64_prob32,
			     uint256 seenNonces,
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
			     uint256 seenNonces,
			     uint256 payeeAddrA_amountA,
			     uint256 payeeAddrB_amountB,
			     uint8 v,
			     bytes32 r, bytes32 s) public view returns (address) {
		bytes32 eip712Hash = getEIP712Hash_ab(payerSalt,
					              pkHashRoot,
					              sep20Contract_dueTime64_prob32,
					              seenNonces,
					              payeeAddrA_amountA,
					              payeeAddrB_amountB);
		return ecrecover(eip712Hash, v, r, s);
	}

	function getRand32_sr(uint256 payerSalt_pk0_v, uint256 pkTail, bytes calldata pi) private returns (uint) {
		(uint alpha, uint8 pk0) = (payerSalt_pk0_v>>16, uint8(payerSalt_pk0_v>>8));
		bytes memory beta = verifyVRF(alpha, pk0, pkTail, pi);
		return (uint(uint8(beta[3]))<<24) | (uint(uint8(beta[2]))<<16) |
			 (uint(uint8(beta[1]))<<8) | (uint(uint8(beta[0])));
	}

	function getRand32_ab(uint256 alpha, uint8 pk0, uint256 pkTail, bytes calldata pi) private returns (uint) {
		bytes memory beta = verifyVRF(alpha, pk0, pkTail, pi);
		return (uint(uint8(beta[3]))<<24) | (uint(uint8(beta[2]))<<16) |
			 (uint(uint8(beta[1]))<<8) | (uint(uint8(beta[0])));
	}

	function verifyVRF(uint256 alpha, uint8 pk, uint256 pkTail, bytes calldata pi) internal virtual view returns (bytes memory) {
		(bool ok, bytes memory beta) = address(VRF_PRECOMPILE).staticcall(abi.encodePacked(alpha, pk, pkTail, pi));
		require(ok, "VRF_FAIL");
		// return abi.decode(beta, (uint));
		return beta;
	}

	struct Params_sr {
		uint256 payerSalt_pk0_v;
		uint256 pkTail;
		uint256 payeeAddr_dueTime64_prob32; //payeeAddr: the address of payee
		  // dueTime64: when the payment commitment expires
		  // prob32: the probability of this payment
		uint256 seenNonces; //payer's current allowance to this contract
		uint256 sep20Contract_amount; // which coin and how many coins 
		bytes32 r;
		bytes32 s;
	}

	//anyone can send this transaction and pay gas fee
	function payToSingleReciever(bytes calldata pi, Params_sr calldata params) external {
		uint64 dueTime64 = uint64(params.payeeAddr_dueTime64_prob32>>32);
		require(block.timestamp < dueTime64, "EXPIRED");
		uint rand32 = getRand32_sr(params.payerSalt_pk0_v, params.pkTail, pi);
		uint prob32 = uint(uint32(params.payeeAddr_dueTime64_prob32));
		require(rand32 < prob32, "CONNOT_PAY");
		address payerAddr = getPayer_sr(params.payerSalt_pk0_v,
					        params.pkTail,
					        params.payeeAddr_dueTime64_prob32,
					        params.seenNonces,
					        params.sep20Contract_amount,
					        params.r, params.s);
		address sep20Contract = address(bytes20(uint160(params.sep20Contract_amount>>96)));
		bytes memory keyBz = abi.encode(sep20Contract, payerAddr);
		(uint nonces, uint balance) = loadWallet(keyBz);
		bool pass;
		(nonces, pass) = checkAndUpdateNonces(nonces, params.seenNonces, params.payerSalt_pk0_v>>16);
		require(pass, "INCORRECT_NONCES");
		address payeeAddr = address(bytes20(uint160(params.payeeAddr_dueTime64_prob32>>96)));
		uint amount = uint(uint96(params.sep20Contract_amount));
		saveWallet(keyBz, nonces, balance - amount);
		keyBz = abi.encode(sep20Contract, payeeAddr);
		(nonces, balance) = loadWallet(keyBz);
		saveWallet(keyBz, nonces, balance + amount);
	}

	function verifyMerkle(bytes32[] memory proof, bytes32 root, bytes32 leaf, uint index) public pure returns (bool) {
		bytes32 hash = leaf;
		for (uint i = 0; i < proof.length; i++) {
			bytes32 proofElement = proof[i];
			if (index % 2 == 0) {
				hash = keccak256(abi.encodePacked(hash, proofElement));
			} else {
				hash = keccak256(abi.encodePacked(proofElement, hash));
			}
			index = index / 2;
		}
		return hash == root;
	}

	function checkAndUpdateNonces(uint currNonces, uint seenNonces, uint salt) pure public returns (uint, bool) {
		uint allMasks = 0;
		uint pick = (7<<5);
		bool anyMatch = false;
		for(uint i=0; i<8; i++) {
			uint shift = (salt&pick);
			salt = salt >> 8;
			uint mask = (0xFFFFFFFF << shift);
			if((currNonces&mask) == (seenNonces&mask)) {
				anyMatch = true;
			}
			allMasks = allMasks | mask;
		}
		if(!anyMatch) {
			return (0, false);
		}
		uint newNonces = currNonces - allMasks;
		return ((newNonces&allMasks)|(currNonces&~allMasks), true);
	}

	struct Params {
		uint256 payerSalt;
		uint256 pkTail;
		bytes32 pkHashRoot;
		uint256 index_pk0_v;
		uint256 sep20Contract_dueTime64_prob32;
		uint256 seenNonces;
		uint256 payeeAddrA_amountA;
		uint256 payeeAddrB_amountB;
		bytes32 r;
		bytes32 s;
	}

	function payToAB(bytes32[] calldata proof, bytes calldata pi, Params calldata params) external {
		uint tmp = params.sep20Contract_dueTime64_prob32;
		address sep20Contract = address(bytes20(uint160(tmp>>96)));
		{
			uint64 dueTime64 = uint64(tmp>>32);
			require(block.timestamp < dueTime64, "EXPIRED");
			uint rand32 = getRand32_ab(params.payerSalt, uint8(params.index_pk0_v>>8), params.pkTail, pi);
			uint prob32 = uint(uint32(tmp));
			require(rand32 < prob32, "CONNOT_PAY");
		}
		tmp = params.index_pk0_v;
		bytes32 leaf = keccak256(abi.encodePacked(uint8(tmp>>8), params.pkTail));
		require(verifyMerkle(proof, params.pkHashRoot, leaf, tmp>>16), "VERIFY_FAILED");

		address payerAddr = getPayer_ab(params.payerSalt,
					        params.pkHashRoot,
					        params.sep20Contract_dueTime64_prob32,
					        params.seenNonces,
					        params.payeeAddrA_amountA,
					        params.payeeAddrB_amountB,
					        uint8(tmp),
					        params.r, params.s);

		bytes memory keyBz = abi.encode(sep20Contract, payerAddr);
		(uint nonces, uint balance) = loadWallet(keyBz);
		bool pass;
		(nonces, pass) = checkAndUpdateNonces(nonces, params.seenNonces, params.payerSalt);
		require(pass, "INCORRECT_NONCES");

		address payeeAddrA = address(bytes20(uint160(params.payeeAddrA_amountA>>96)));
		uint amountA = uint(uint96(params.payeeAddrA_amountA));
		address payeeAddrB = address(bytes20(uint160(params.payeeAddrB_amountB>>96)));
		uint amountB = uint(uint96(params.payeeAddrB_amountB));
		saveWallet(keyBz, nonces, balance - amountA - amountB);
		if(amountA != 0) {
			keyBz = abi.encode(sep20Contract, payeeAddrA);
			(nonces, balance) = loadWallet(keyBz);
			saveWallet(keyBz, nonces, balance + amountA);
		}
		keyBz = abi.encode(sep20Contract, payeeAddrB);
		(nonces, balance) = loadWallet(keyBz);
		saveWallet(keyBz, nonces, balance + amountB);
	}
}

contract StochasticPay_VRF_forUT is StochasticPay_VRF {

	mapping(bytes => bytes) wallets;

	function saveWallet(bytes memory keyBz, uint nonces, uint balance) internal override {
		bytes memory valueBz = abi.encode(nonces, balance);
		wallets[keyBz] = valueBz;
	}

	function loadWallet(bytes memory keyBz) internal override view returns (uint nonces, uint balance) {
		bytes memory valueBz = wallets[keyBz];
		return abi.decode(valueBz, (uint, uint));
	}

	function verifyVRF(uint256 alpha, uint8 pk, uint256 pkTail, bytes calldata pi) internal override view returns (bytes memory) {
		// TODO
		return "1234567890";
	}


}
