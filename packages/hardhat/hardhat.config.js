require('@nomicfoundation/hardhat-toolbox');

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: '0.8.24',
  networks: {
    hardhat: {},
    hederaTestnet: {
      url: 'https://testnet.hashio.io/api',
      chainId: 296,
    },
  },
};
