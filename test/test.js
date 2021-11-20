const ethUtil = require("ethereumjs-util")
const sigUtil = require("eth-sig-util")
const ethers = require("ethers")

const check_eip712Hash = true

const ABI = [
"function getEIP712Hash(uint256 payerSalt, bytes32 payeeSaltHash, uint256 payeeAddr_dueTime64_prob32, uint256 payerAllowance, uint256 sep20Contract_amount) public view returns (bytes32)",
"function getPayer(uint256 payeeSalt_v, uint256 payerSalt, bytes32 payeeSaltHash, uint256 payeeAddr_dueTime64_prob32, uint256 payerAllowance, uint256 sep20Contract_amount, bytes32 r, bytes32 s) public view returns (address)",
"function pay(uint256 payeeSalt_v, uint256 payerSalt, bytes32 payeeSaltHash, uint256 payeeAddr_dueTime64_prob32, uint256 payerAllowance, uint256 sep20Contract_amount, bytes32 r, bytes32 s) external"
]

const sep20ABI = [
"function approve(address spender, uint256 amount) external returns (bool)",
"function balanceOf(address account) external view returns (uint256)",
"function allowance(address owner, address spender) external view returns (uint256)"
]

const provider = new ethers.providers.JsonRpcProvider("http://127.0.0.1:7545")
const payeeKeyHex = "" // Account 2
const payerKeyHex = "" // Account 3
const payee = new ethers.Wallet("0x"+payeeKeyHex, provider)
const payer = new ethers.Wallet("0x"+payerKeyHex, provider)
const abiCoder = ethers.utils.defaultAbiCoder

const twoPow32 = ethers.BigNumber.from(2).pow(32)
const twoPow96 = ethers.BigNumber.from(2).pow(96)

const tokenContract = "0x822C524218aBaD5FE9555f4E7F7E05DDa290915e"
const verifyingContract = "0xdB8079Df9F2a60fF085098c1aef0D2abF1bf4eFC"

const bytecode = "0x608060405234801561001057600080fd5b50610847806100206000396000f3fe608060405234801561001057600080fd5b50600436106100415760003560e01c80630cc922cc146100465780633b03b2ff1461005b578063d870d4a41461008b575b600080fd5b61005961005436600461067f565b6100ac565b005b61006e61006936600461067f565b610376565b6040516001600160a01b0390911681526020015b60405180910390f35b61009e6100993660046106d4565b6103f8565b604051908152602001610082565b60006100be8989898989898989610376565b9050606086811c90879086901c6bffffffffffffffffffffffff8716602083901c67ffffffffffffffff811642106101275760405162461bcd60e51b81526020600482015260076024820152661156141254915160ca1b60448201526064015b60405180910390fd5b604051636eb1769f60e11b81526001600160a01b0387811660048301523060248301526000919085169063dd62ed3e9060440160206040518083038186803b15801561017257600080fd5b505afa158015610186573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906101aa919061070f565b90508a81146101f05760405162461bcd60e51b815260206004820152601260248201527108298989eae829c868abe9a92a69a82a886960731b604482015260640161011e565b50506040805160089e909e1c60208f018190529d01604051602081830303815290604052805190602001208b1461025a5760405162461bcd60e51b815260206004820152600e60248201526d125390d3d4949150d517d4d0531560921b604482015260640161011e565b60006102668e8e610728565b60405160200161027891815260200190565b6040516020818303038152906040528051906020012090508363ffffffff168160001c63ffffffff16106102db5760405162461bcd60e51b815260206004820152600a602482015269434f4e4e4f545f50415960b01b604482015260640161011e565b6040516323b872dd60e01b81526001600160a01b0387811660048301528681166024830152604482018490528416906323b872dd90606401602060405180830381600087803b15801561032d57600080fd5b505af1158015610341573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190610365919061074e565b505050505050505050505050505050565b60008061038689898989896103f8565b60408051600081526020810180835283905260ff8d169181019190915260608101869052608081018590529091508a9060019060a0016020604051602081039080840390855afa1580156103de573d6000803e3d6000fd5b5050604051601f1901519c9b505050505050505050505050565b6000806040518060800160405280605f81526020016107b3605f91396040516020016104249190610777565b6040516020818303038152906040528051906020012060405160200161045c906b06578616d706c6520646170760a41b8152600c0190565b6040516020818303038152906040528051906020012060405160200161048e9065076302e312e360d41b815260060190565b60405160208183030381529060405280519060200120612710306040516020016104cb906c53746f6368617374696350617960981b8152600d0190565b60408051601f19818403018152828252805160209182012090830197909752810194909452606084019290925260808301526001600160a01b031660a082015260c081019190915260e001604051602081830303815290604052805190602001209050806040516020016105e0907f5061792875696e7432353620706179657253616c742c6279746573333220706181527f79656553616c74486173682c75696e74323536207061796565416464725f647560208201527f6554696d6536345f70726f6233322c75696e74323536207061796572416c6c6f60408201527f77616e63652c75696e74323536207365703230436f6e74726163745f616d6f756060820152626e742960e81b608082015260830190565b60408051601f198184030181528282528051602091820120908301528101899052606081018890526080810187905260a0810186905260c0810185905260e0016040516020818303038152906040528051906020012060405160200161065d92919061190160f01b81526002810192909252602282015260420190565b6040516020818303038152906040528051906020012091505095945050505050565b600080600080600080600080610100898b03121561069c57600080fd5b505086359860208801359850604088013597606081013597506080810135965060a0810135955060c0810135945060e0013592509050565b600080600080600060a086880312156106ec57600080fd5b505083359560208501359550604085013594606081013594506080013592509050565b60006020828403121561072157600080fd5b5051919050565b6000821982111561074957634e487b7160e01b600052601160045260246000fd5b500190565b60006020828403121561076057600080fd5b8151801515811461077057600080fd5b9392505050565b6000825160005b81811015610798576020818601810151858301520161077e565b818111156107a7576000828501525b50919091019291505056fe454950373132446f6d61696e28737472696e67206e616d652c737472696e672076657273696f6e2c75696e7432353620636861696e49642c6164647265737320766572696679696e67436f6e74726163742c627974657333322073616c7429a2646970667358221220c834478ee7b0334c9e2b48c6cbce10efdc914fb144062c8ef16d0165d1497f1564736f6c63430008090033"

async function deploy(bytecode) {
  const abi = [ "constructor() public" ];
  
  try {
    const factory = new ethers.ContractFactory(abi, bytecode, payee)
    const contract = await factory.deploy();
    console.log("address:", contract.address)
    const receipt = await contract.deployTransaction.wait();
    console.log(receipt)
  } catch(e) {
    alert("Error! "+e.toString())
  }
}

async function approve() {
	const sep20Contract = new ethers.Contract(tokenContract, sep20ABI, provider).connect(payer)
	const tx = await sep20Contract.approve(verifyingContract, ethers.utils.parseUnits("10000"))
	const receipt = await tx.wait()
	console.log("receipt", receipt)
}


async function run() {
	const domainData = {
	    name: "example dapp",
	    version: "v0.1.0",
	    chainId: 10000,
	    verifyingContract: verifyingContract,
	    salt: ethers.utils.id("StochasticPay"),
	};

	const domainHash = ethers.utils.id("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)")
	const appName = ethers.utils.id(domainData.name)
	const version = ethers.utils.id(domainData.version)
	const chainId = ethers.BigNumber.from(10000)
	const encDomainData = abiCoder.encode(['bytes32','bytes32','bytes32','uint256','address','bytes32'],
		[domainHash, appName, version, chainId, verifyingContract, domainData.salt])


	const typeHash = ethers.utils.id("Pay(uint256 payerSalt,bytes32 payeeSaltHash,uint256 payeeAddr_dueTime64_prob32,uint256 payerAllowance,uint256 sep20Contract_amount)")

	const payerSalt = ethers.utils.id("payerSalt") 
	const payeeSalt = ethers.utils.id("payeeSalt") 
	var payeeSaltClearLowestByte = payeeSalt.substr(2,62)
	var payeeSalt_v = "0x"+payeeSaltClearLowestByte
	payeeSaltClearLowestByte = "0x00"+payeeSaltClearLowestByte
	const payeeSaltHash = ethers.utils.keccak256(payeeSaltClearLowestByte)

	var block = await provider.getBlock(await provider.getBlockNumber())
	var payeeAddr = await payee.getAddress()
	var payeeAddr_dueTime64_prob32 = ethers.BigNumber.from(payeeAddr).mul(twoPow96)
	const dueTime64 = ethers.BigNumber.from(block.timestamp+24*60*60).mul(twoPow32)
	payeeAddr_dueTime64_prob32 = payeeAddr_dueTime64_prob32.add(dueTime64)
	const prob32 = 0xFF010001 // very likely
	payeeAddr_dueTime64_prob32 = payeeAddr_dueTime64_prob32.add(ethers.BigNumber.from(prob32))

	const sep20Contract = new ethers.Contract(tokenContract, sep20ABI, provider)
	const payerAddr = await payer.getAddress()
	const payerAllowance = await sep20Contract.allowance(payerAddr, verifyingContract)
	//console.log("payerAllowance", ethers.utils.formatUnits(payerAllowance))

	var sep20Contract_amount = ethers.BigNumber.from(tokenContract).mul(twoPow96)
	sep20Contract_amount = sep20Contract_amount.add(ethers.utils.parseUnits("2"))

	const domain = [
	    { name: "name", type: "string" },
	    { name: "version", type: "string" },
	    { name: "chainId", type: "uint256" },
	    { name: "verifyingContract", type: "address" },
	    { name: "salt", type: "bytes32" },
	];
	const pay = [
	    { name: "payerSalt", type: "uint256" },
	    { name: "payeeSaltHash", type: "bytes32" },
	    { name: "payeeAddr_dueTime64_prob32", type: "uint256" },
	    { name: "payerAllowance", type: "uint256" },
	    { name: "sep20Contract_amount", type: "uint256" },
	];

	var message = {
		payerSalt: payerSalt,
		payeeSaltHash: payeeSaltHash,
		payeeAddr_dueTime64_prob32: payeeAddr_dueTime64_prob32.toHexString(),
		payerAllowance: payerAllowance.toHexString(),
		sep20Contract_amount: sep20Contract_amount.toHexString(),
	};

	const data = {
	    types: {
		EIP712Domain: domain,
		Pay: pay,
	    },
	    domain: domainData,
	    primaryType: "Pay",
	    message: message
	}

	const digest = sigUtil.TypedDataUtils.sign(data)
	const digestHex = ethers.utils.hexlify(digest)

	const contract = new ethers.Contract(verifyingContract, ABI, provider).connect(payee)

	if(check_eip712Hash) {
		const eip712Hash = await contract.getEIP712Hash(payerSalt, payeeSaltHash, payeeAddr_dueTime64_prob32, payerAllowance, sep20Contract_amount)
		if(eip712Hash !== digestHex) {
			console.log("Error! eip712Hash !== digestHex", eip712Hash)
		}

		const hash0 = ethers.utils.keccak256(encDomainData)
		const typeList = ['bytes32', 'uint256', 'bytes32', 'uint256', 'uint256', 'uint256']
		const encMessage = abiCoder.encode(typeList, [
			typeHash,
			payerSalt,
			payeeSaltHash,
			payeeAddr_dueTime64_prob32,
			payerAllowance,
			sep20Contract_amount])

		const hash1 = ethers.utils.keccak256(encMessage)
		const hashToSign = ethers.utils.keccak256("0x1901"+hash0.substr(2)+hash1.substr(2))
		if(hashToSign !== digestHex) {
			console.log("Error! hashToSign !== digestHex", hashToSign)
		}
	}
	
	//const sig = await payer._signTypedData(domain, pay, data.message) // this function does not work...
	const sig = sigUtil.signTypedData_v4(Buffer.from(payerKeyHex, "hex"), {data: data})
	const r = sig.substr(0, 66)
	const s = "0x"+sig.substr(66, 64)
	const v = "0x"+sig.substr(66+64)
	payeeSalt_v = payeeSalt_v+sig.substr(66+64)
	//console.log("r", r)
	//console.log("s", s)
	//console.log("v", v)

	const recAddr = await contract.getPayer(payeeSalt_v, payerSalt, payeeSaltHash, payeeAddr_dueTime64_prob32, payerAllowance, sep20Contract_amount, r, s)
	console.log("recAddr", recAddr)
	console.log("payer", payerAddr)

	const tx = await contract.pay(payeeSalt_v, payerSalt, payeeSaltHash, payeeAddr_dueTime64_prob32, payerAllowance, sep20Contract_amount, r, s)
	const receipt = await tx.wait()
	console.log("receipt", receipt)
}


//deploy(bytecode)

//approve()

run()

