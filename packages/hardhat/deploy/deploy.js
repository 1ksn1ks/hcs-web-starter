/**
 * HCS does not need a contract deploy.
 * This script exists so `npm run hardhat:deploy` is a valid workspace command.
 */
async function main() {
  console.log('No Solidity deploy required. Use create_topic() in lib/hedera.js.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
