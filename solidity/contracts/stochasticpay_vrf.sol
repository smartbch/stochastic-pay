// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "./IERC20.sol";

contract StochasticPay_VRF {
	bytes32 private constant SALT = keccak256(abi.encodePacked("StochasticPay_VRF"));
	address private constant VRF_PRECOMPILE = address(0x2713); // the VRF precompile contract's address 
	uint256 private constant CHAINID = 10000; // smartBCH mainnet
	string private constant EIP712_DOMAIN = "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)";
	bytes32 private constant EIP712_DOMAIN_TYPEHASH = keccak256(abi.encodePacked(EIP712_DOMAIN));
	bytes32 private constant DAPP_HASH = keccak256(abi.encodePacked("stochastic_payment"));
	bytes32 private constant VERSION_HASH = keccak256(abi.encodePacked("v0.1.0"));
	bytes32 private constant TYPE_HASH = keccak256(abi.encodePacked("Pay(uint256 payerSalt_pk0,uint256 pkTail,uint256 payeeAddr_dueTime64_prob32,uint256 walletOldSatus,uint256 sep20Contract_amount)"));

	mapping(address => mapping(address => uint)) public wallets; //low 64 bits are nonce

	function deposit(address owner, uint sep20Contract_amount) public {
		address sep20Contract = address(uint160(sep20Contract_amount>>64));
		uint amount = uint96(sep20Contract_amount);
		IERC20(sep20Contract).transferFrom(msg.sender, address(this), amount);
		uint old = wallets[owner][sep20Contract];
		wallets[owner][sep20Contract] = old + (amount<<64);
	}

	function withdraw(uint sep20Contract_amount) public {
		address sep20Contract = address(uint160(sep20Contract_amount>>64));
		uint old = wallets[msg.sender][sep20Contract];
		uint amount = uint96(sep20Contract_amount);
		require((old>>64) >= amount, "NOT_ENOUGH_COINS");
		IERC20(sep20Contract).transfer(msg.sender, amount);
		wallets[msg.sender][sep20Contract] = old - (amount<<64);
	}

	function getEIP712Hash(uint256 payerSalt_pk0,
			       //payerSalt: a random 240b number provided by payer, pk0: first byte of pk
			       uint256 pkTail, //The other bytes (1~32) of pk
			       uint256 payeeAddr_dueTime64_prob32, //payeeAddr: the address of payee
			         // dueTime64: when the payment commitment expires
				 // prob32: the probability of this payment
			       uint256 walletOldSatus, //payer's current allowance to this contract
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
				payerSalt_pk0,
				pkTail,
				payeeAddr_dueTime64_prob32,
				walletOldSatus,
				sep20Contract_amount
			))
		));
	}

	function getPayer(uint256 payerSalt_pk0_v,
			  uint256 pkTail,
			  uint256 payeeAddr_dueTime64_prob32,
			  uint256 walletOldSatus,
			  uint256 sep20Contract_amount,
			  bytes32 r, bytes32 s) public view returns (address) {
		bytes32 eip712Hash = getEIP712Hash(payerSalt_pk0_v>>8,
					     pkTail,
					     payeeAddr_dueTime64_prob32,
					     walletOldSatus,
					     sep20Contract_amount);
		uint8 v = uint8(payerSalt_pk0_v); //the lowest byte is v
		return ecrecover(eip712Hash, v, r, s);
	}

	function getRand32(uint256 payerSalt_pk0_v, uint256 pkTail, bytes calldata pi) private returns (uint) {
		(uint alpha, uint8 pk0) = (payerSalt_pk0_v>>16, uint8(payerSalt_pk0_v>>8));
		(bool ok, bytes memory beta) = address(VRF_PRECOMPILE).call(abi.encodePacked(alpha, pk0, pkTail, pi));
		require(ok, "VRF_FAIL");
		return (uint(uint8(beta[3]))<<24) | (uint(uint8(beta[2]))<<16) |
			 (uint(uint8(beta[1]))<<8) | (uint(uint8(beta[0])));
	}

	function pay(uint256 payerSalt_pk0_v,
		     uint256 pkTail,
		     bytes calldata pi,
		     uint256 payeeAddr_dueTime64_prob32, //payeeAddr: the address of payee
		       // dueTime64: when the payment commitment expires
		       // prob32: the probability of this payment
		     uint256 walletOldSatus, //payer's current allowance to this contract
		     uint256 sep20Contract_amount, // which coin and how many coins 
		     bytes32 r, bytes32 s) external { //anyone can send this transaction and pay gas fee

		address payerAddr = getPayer(payerSalt_pk0_v,
					     pkTail,
					     payeeAddr_dueTime64_prob32,
					     walletOldSatus,
					     sep20Contract_amount,
					     r, s);

		address payeeAddr = address(bytes20(uint160(payeeAddr_dueTime64_prob32>>96)));
		address sep20Contract = address(bytes20(uint160(sep20Contract_amount>>96)));
		{
			uint64 dueTime64 = uint64(payeeAddr_dueTime64_prob32>>32);
			require(block.timestamp < dueTime64, "EXPIRED");
			uint rand32 = getRand32(payerSalt_pk0_v, pkTail, pi);
			uint prob32 = uint(uint32(payeeAddr_dueTime64_prob32));
			require(rand32 < prob32, "CONNOT_PAY");
		}
		uint old = wallets[payerAddr][sep20Contract];
		require(old == walletOldSatus, "WALLET_STATUS_MISMATCH"); //To prevent replay
		uint amount = uint(uint96(sep20Contract_amount));
		require((old>>64) >= amount, "NOT_ENOUGH_COINS");
		amount = amount<<64;
		wallets[payerAddr][sep20Contract] = old - amount;
		wallets[payeeAddr][sep20Contract] += amount;
	}
}

