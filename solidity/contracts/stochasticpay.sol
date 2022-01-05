// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "./IERC20.sol";

contract StochasticPay {
	bytes32 private constant SALT = keccak256(abi.encodePacked("StochasticPay"));
	uint256 private constant CHAINID = 10000; // smartBCH mainnet
	string private constant EIP712_DOMAIN = "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)";
	bytes32 private constant EIP712_DOMAIN_TYPEHASH = keccak256(abi.encodePacked(EIP712_DOMAIN));
	bytes32 private constant DAPP_HASH = keccak256(abi.encodePacked("example dapp"));
	bytes32 private constant VERSION_HASH = keccak256(abi.encodePacked("v0.1.0"));
	bytes32 private constant TYPE_HASH = keccak256(abi.encodePacked("Pay(uint256 payerSalt,bytes32 payeeSaltHash,uint256 payeeAddr_dueTime64_prob32,uint256 payerAllowance,uint256 sep20Contract_amount)"));

	function getEIP712Hash(uint256 payerSalt, //a random number provided by payer
			       bytes32 payeeSaltHash, //the hash of a random number provided by payee
			       uint256 payeeAddr_dueTime64_prob32, //payeeAddr: the address of payee
			         // dueTime64: when the payment commitment expires
				 // prob32: the probability of this payment
			       uint256 payerAllowance, //payer's current allowance to this contract
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
				TYPE_HASH,
				payerSalt,
				payeeSaltHash,
				payeeAddr_dueTime64_prob32,
				payerAllowance,
				sep20Contract_amount
			))
		));
	}

	function getPayer(uint256 payeeSalt_v,
			  uint256 payerSalt,
			  bytes32 payeeSaltHash,
			  uint256 payeeAddr_dueTime64_prob32,
			  uint256 payerAllowance,
			  uint256 sep20Contract_amount,
			  bytes32 r, bytes32 s) public view returns (address) {
		bytes32 eip712Hash = getEIP712Hash(payerSalt,
					     payeeSaltHash,
					     payeeAddr_dueTime64_prob32,
					     payerAllowance,
					     sep20Contract_amount);
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
		     bytes32 r, bytes32 s) external {

		address payerAddr = getPayer(payeeSalt_v,
					     payerSalt,
					     payeeSaltHash,
					     payeeAddr_dueTime64_prob32,
					     payerAllowance,
					     sep20Contract_amount,
					     r, s);

		address payeeAddr = address(bytes20(uint160(payeeAddr_dueTime64_prob32>>96)));
		uint32 prob32 = uint32(payeeAddr_dueTime64_prob32);
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
		bytes32 saltSumHash = keccak256(abi.encodePacked(payerSalt+payeeSalt_v));
		require(uint32(uint(saltSumHash)) < prob32, "CONNOT_PAY");
		IERC20(sep20Contract).transferFrom(payerAddr, payeeAddr, amount);
	}

	function payXY(uint256 payeeSalt_v, //payeeSalt: a random number provided by payee, v: the "v" of signature
		       uint256 payeeXAddr_payerSalt96, //payeeXAddr: the address of payeeX
		         //payerSalt96: a random number provided by payer
		       bytes32 payeeSaltHash, //the hash of a random number provided by payee
		       uint256 payeeYAddr_dueTime64_prob32, //payeeYddr: the address of payeeY
		         // dueTime64: when the payment commitment expires
		         // prob32: the probability of this payment
		       uint256 payerAllowance, //payer's current allowance to this contract
		       uint256 sep20Contract_amount, // which coin and how many coins 
		       bytes32 r, bytes32 s) external {

		address payerAddr = getPayer(payeeSalt_v,
					     payeeXAddr_payerSalt96,
					     payeeSaltHash,
					     payeeYAddr_dueTime64_prob32,
					     payerAllowance,
					     sep20Contract_amount,
					     r, s);

		address payeeAddr = address(bytes20(uint160(payeeYAddr_dueTime64_prob32>>96)));
		uint prob32 = uint32(payeeYAddr_dueTime64_prob32);
		address sep20Contract = address(bytes20(uint160(sep20Contract_amount>>96)));
		uint amount = uint(uint96(sep20Contract_amount));
		{
			uint64 dueTime64 = uint64(payeeYAddr_dueTime64_prob32>>32);
			require(block.timestamp < dueTime64, "EXPIRED");
			uint allowance = IERC20(sep20Contract).allowance(payerAddr, address(this));
			require(allowance == payerAllowance, "ALLOWANCE_MISMATCH"); //To prevent replay
		}
		payeeSalt_v >>= 8; //remove the v
		require(payeeSaltHash == keccak256(abi.encodePacked(payeeSalt_v)), "INCORRECT_SALT");
		uint saltSumHash = uint(keccak256(abi.encodePacked(payeeXAddr_payerSalt96, payeeSalt_v)));
		require(uint(uint128(saltSumHash))%10000 < (prob32&0xFFFF)%10000, "CONNOT_PAY");
		if((saltSumHash>>128)%10000 < (prob32>>16)%10000) {//switch payee from Y to X
			payeeAddr = address(bytes20(uint160(payeeXAddr_payerSalt96>>96)));
		}
		IERC20(sep20Contract).transferFrom(payerAddr, payeeAddr, amount);
	}
}

