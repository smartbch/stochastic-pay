require("@nomiclabs/hardhat-waffle");
/** @type import('hardhat/config').HardhatUserConfig */

// my testnet private key, generated by local sbch
const MY_KEY = "85d8e1398312704c5edff03f626d00556620d041d3f86bab2e943a7fe2b31611";
const DELEGATED_KEY = "0eec7081343dba52a5e117f82f58fe7a2bc1fd156e1e858ff52aea5b121746cd"

module.exports = {
  solidity: "0.8.9",
  networks: {
    local: {
      url: "http://192.168.64.4:8545",
      accounts: [MY_KEY, DELEGATED_KEY]
    }
  }
};