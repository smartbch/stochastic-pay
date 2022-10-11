// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "./IERC20.sol";

contract StochasticPay_3rd {
	uint256 private constant RAND_DIV = 50000;
	address private constant VRF_PRECOMPILE = address(0x2713); // the VRF precompile contract's address 
	bytes32 private constant SALT = keccak256(abi.encodePacked("StochasticPay"));
	uint256 private constant CHAINID = 10000; // smartBCH mainnet
	string private constant EIP712_DOMAIN = "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)";
	bytes32 private constant EIP712_DOMAIN_TYPEHASH = keccak256(abi.encodePacked(EIP712_DOMAIN));
	bytes32 private constant DAPP_HASH = keccak256(abi.encodePacked("example dapp"));
	bytes32 private constant VERSION_HASH = keccak256(abi.encodePacked("v0.1.0"));
	bytes32 private constant TYPE_HASH = keccak256(abi.encodePacked("Pay(uint256 payerSalt,bytes32 payeeSaltHash,uint256 payeeAddr_dueTime64_prob32,uint256 payerAllowance,uint256 sep20Contract_amount,bytes pk)"));

	function getEIP712Hash(uint256 payerSalt, //a random number provided by payer
			       bytes32 payeeSaltHash, //the hash of a random number provided by payee
			       uint256 payeeAddr_dueTime64_prob32, //payeeAddr: the address of payee
			         // dueTime64: when the payment commitment expires
				 // prob32: the probability of this payment
			       uint256 payerAllowance, //payer's current allowance to this contract
			       uint256 sep20Contract_amount, // which coin and how many coins 
			       bytes calldata pk //sender's VRF public key
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
				TYPE_HASH,
				payerSalt,
				payeeSaltHash,
				payeeAddr_dueTime64_prob32,
				payerAllowance,
				sep20Contract_amount,
				pk
			))
		));
	}

	function getPayer(uint256 payeeSalt_v,
			  uint256 payerSalt,
			  bytes32 payeeSaltHash,
			  uint256 payeeAddr_dueTime64_prob32,
			  uint256 payerAllowance,
			  uint256 sep20Contract_amount,
			  bytes calldata pk,
			  bytes32 r, bytes32 s) public view returns (address) {
		bytes32 eip712Hash = getEIP712Hash(payerSalt,
					     payeeSaltHash,
					     payeeAddr_dueTime64_prob32,
					     payerAllowance,
					     sep20Contract_amount,
					     pk);
		uint8 v = uint8(payeeSalt_v); //the lowest byte is v
		return ecrecover(eip712Hash, v, r, s);
	}

	function pay(uint256 payeeSalt_v, //payeeSalt: a random number provided by payee, v: the "v" of signature
		     uint256 payerSalt, //a random number provided by payer
		     bytes32 payeeSaltHash, //the hash of a random number provided by payee
		     uint256 payeeAddr_dueTime64_prob32, //payeeAddr: the address of payee
		       // dueTime64: when the payment commitment expires
		       // prob32: the probability of this payment
		     uint256 payerAllowance, //payer's current allowance to this contract
		     uint256 sep20Contract_amount, // which coin and how many coins 
		     bytes calldata pk_and_pi,
		     bytes32 r, bytes32 s) external {

		address payerAddr = getPayer(payeeSalt_v,
					     payerSalt,
					     payeeSaltHash,
					     payeeAddr_dueTime64_prob32,
					     payerAllowance,
					     sep20Contract_amount,
					     pk_and_pi[0:33],
					     r, s);

		address payeeAddr = address(bytes20(uint160(payeeAddr_dueTime64_prob32>>96)));
		uint prob = uint(uint32(payeeAddr_dueTime64_prob32));
		address sep20Contract = address(bytes20(uint160(sep20Contract_amount>>96)));
		uint amount = uint(uint96(sep20Contract_amount));
		{
			uint64 dueTime64 = uint64(payeeAddr_dueTime64_prob32>>32);
			require(block.timestamp < dueTime64, "EXPIRED");
			uint allowance = IERC20(sep20Contract).allowance(payerAddr, address(this));
			require(allowance == payerAllowance, "ALLOWANCE_MISMATCH"); //To prevent replay
		}
		payeeSalt_v >>= 8; //remove the v
		require(payeeSaltHash == keccak256(abi.encodePacked(payeeSalt_v)), "INCORRECT_SALT");
		uint saltSumHash = uint(keccak256(abi.encodePacked(payerSalt+payeeSalt_v)));
		require(saltSumHash%RAND_DIV < uint16(prob), "CONNOT_PAY");
		if(switchPayee(payerSalt, prob>>16, pk_and_pi)) {
			payeeAddr = msg.sender;
		}
		IERC20(sep20Contract).transferFrom(payerAddr, payeeAddr, amount);
	}

	function switchPayee(uint256 payerSalt, uint256 prob, bytes calldata pk_and_pi) private returns (bool) {
		if(pk_and_pi.length > 33) { // pay to the 3rd party, instead of payer-specified payee
			(bool ok, bytes memory beta) = address(VRF_PRECOMPILE).call(abi.encodePacked(payerSalt, pk_and_pi));
			require(ok, "VRF_FAIL");
			uint rand = abi.decode(beta, (uint));
			if(rand%RAND_DIV < prob) {
				return true;
			}
		}
		return false;
	}
}

