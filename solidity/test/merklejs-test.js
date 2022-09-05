const { MerkleTree } = require('merkletreejs');
const keccak256 = require('keccak256');

const leaves = [
    "a",
    "b",
    "c",
    "d"
];

const tree = new MerkleTree(leaves, keccak256, {
   hashLeaves: true,
});

const leaf = keccak256(leaves[0]).toString('hex');
console.log("leaf: ", leaf);
const root = tree.getRoot().toString('hex');
console.log("root: ", root);
const proof = tree.getProof(leaf);
const proofHex = tree.getHexProof(leaf);
console.log("proofHex: ", proofHex);
console.log(tree.verify(proof, leaf, root));