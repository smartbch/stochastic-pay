// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./stochasticpay_vrf.sol";

contract StochasticPay_VRF_forUT is StochasticPay_VRF {

    struct data {
        bytes val;
        bool isExist;
    }

    mapping(bytes => data) wallets;

    function saveWallet(bytes memory keyBz, uint nonces, uint balance) override internal {
        bytes memory valueBz = abi.encode(nonces, balance);
        wallets[keyBz].isExist = true;
        wallets[keyBz].val = valueBz;
    }

    function loadWallet(bytes memory keyBz) override internal view returns (uint nonces, uint balance) {
        if(!wallets[keyBz].isExist) {
            return (0, 0);
        }

        bytes memory valueBz = wallets[keyBz].val;
        return abi.decode(valueBz, (uint, uint));
    }

    function getRand32_sr(uint256 payerSalt_pk0_v, uint256 pkTail, bytes calldata pi) override internal pure returns (uint) {
        return 0; // return 0 and make sure the rand32 is lower than prob32
    }

    function getBalance(address owner, address sep20Contract) public view returns (uint) {
        bytes memory keyBz = abi.encode(sep20Contract, owner);
        (uint nonces, uint balance) = loadWallet(keyBz);
        return balance;
    }
}
