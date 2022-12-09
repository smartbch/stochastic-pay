const { MerkleTree } = require('merkletreejs');
const {ethers} = require("hardhat");

const leaves = [
    "0x0ea2f6db280907a6e5080d8266d65c047ce3a6c8357ad0f9af40320590b4b476e66ce4a2e0d1d88e8c8b4c072b05382b52ddbeeceae4cc9f39ef54ca097b12c1",
    "0xc7f48d5a54e2d84f0f1ef8e7f3b8f90f71e1d13fab6bc3e6380849076a9cee3fdf63589b9583a7ccc42f547469494dde13a65833caabc96278aad26a15383689",
    "0x9d596229cb1f3ace0135273d1f973f6b76b536b46c628aaedbb967e2711a4dc1d462ef288dd04b4b1fd49bda2f74c794c4f949a070133dc145fba0ac2ec83082",
    "0x30e71bff0e52e6a042c182ac2ca5e68496de17cae53ebf49ba63404379e577183d3018f79ccc5c14aa48487c25934dd3444a247d1581bc23f9117a97825e7a70",
];

const tree = new MerkleTree(leaves, ethers.utils.keccak256, {
   hashLeaves: true,
    sortPairs: true,
    sortLeaves: true,
});

const leaf = ethers.utils.keccak256(leaves[3]).toString('hex');
console.log("leaf: ", leaf);
const root = tree.getRoot().toString('hex');
console.log("root: ", '0x' + root);
const proof = tree.getProof(leaf);
const proofHex = tree.getHexProof(leaf);
console.log("proofHex: ", proofHex);
console.log(tree.verify(proof, leaf, root));

console.log("tree: ", tree.toString());