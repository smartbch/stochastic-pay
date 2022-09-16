// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./stochasticpay_vrf.sol";

contract StochasticPay_VRF_forUT is StochasticPay_VRF {

    struct walletData {
        bytes val;
        bool isExist;
    }

    mapping(bytes => walletData) wallets;

    struct vrfPubKeyData {
        bytes val;
        bool isExist;
    }
    mapping(bytes => vrfPubKeyData) vrfPubKeyMap;

    function saveWallet(bytes memory keyBz, uint nonces, uint balance) override internal {
        bytes memory valueBz = abi.encode(nonces, balance);
        wallets[keyBz].isExist = true;
        wallets[keyBz].val = valueBz;
    }

    function loadWallet(bytes memory keyBz) override public view returns (uint nonces, uint balance) {
        if(!wallets[keyBz].isExist) {
            return (0, 0);
        }

        bytes memory valueBz = wallets[keyBz].val;
        return abi.decode(valueBz, (uint, uint));
    }

    function getRand32_sr(uint256 payerSalt_pk0_v, uint256 pkTail, bytes calldata pi) override internal pure returns (uint) {
        return 0; // return 0 and make sure the rand32 is lower than prob32
    }

    function getRand32_ab(uint256 alpha, uint8 pk0, uint256 pkTail, bytes calldata pi) override internal pure returns (uint) {
        return 0; // return 0 and make sure the rand32 is lower than prob32
    }

    function getRandProb_sr(uint256 payerSalt_pk0_v, uint256 pkTail, bytes calldata pi, uint prob32) override internal returns (uint) {
        return 0;
    }

    function getBalance(address owner, address sep20Contract) public view returns (uint) {
        bytes memory keyBz = abi.encode(sep20Contract, owner);
        (uint nonces, uint balance) = loadWallet(keyBz);
        return balance;
    }

    function registerVrfPubKey(bytes memory vrfPubKey) override external {
        require(vrfPubKey.length == 33, "INCORRECT_VRF_PK_LENGTH");
        bytes memory keyBz = abi.encodePacked(msg.sender);
        vrfPubKeyMap[keyBz].isExist = true;
        vrfPubKeyMap[keyBz].val = vrfPubKey;
    }

    function getVrfPubKeyByAddr(address addr) override public view returns (bytes memory)  {
        bytes memory keyBz = abi.encodePacked(addr);
        if(!vrfPubKeyMap[keyBz].isExist) {
            return "";
        }
        return vrfPubKeyMap[keyBz].val;
    }

    function unregisterVrfPubKey() override external {
        bytes memory keyBz = abi.encodePacked(msg.sender);
        if(!vrfPubKeyMap[keyBz].isExist) {
            return;
        }
        vrfPubKeyMap[keyBz].isExist = false;
    }
}
