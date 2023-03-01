// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./StochasticPayVRF.sol";
import "hardhat/console.sol";

contract StochasticPay_VRF_forUT is StochasticPay_VRF {
    struct vrfPubKeyData {
        bytes val;
        bool isExist;
    }
    mapping(bytes => vrfPubKeyData) vrfPubKeyMap;

    function getRand32_sr(uint256 payerSalt_pk0_v, uint256 pkTail, bytes calldata pi) override internal pure returns (uint) {
        return 0; // return 0 and make sure the rand32 is lower than prob32
    }

    function getRand32_ab(uint256 alpha, uint8 pk0, uint256 pkTail, bytes calldata pi) override internal pure returns (uint) {
        return 0; // return 0 and make sure the rand32 is lower than prob32
    }

    function getRandProb_sr(uint256 payerSalt_pk0_v, uint256 pkTail, bytes calldata pi, uint prob32) override internal returns (uint) {
        return 0;
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

    function testBytes32Split(bytes memory beta) public view returns (uint) {
        require(beta.length == 32, "BETA_IS_INVALID");
        return (uint(uint8(beta[3]))<<24) | (uint(uint8(beta[2]))<<16) |
        (uint(uint8(beta[1]))<<8) | (uint(uint8(beta[0])));
    }
}