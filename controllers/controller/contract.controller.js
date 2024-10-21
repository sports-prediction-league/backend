const { RpcProvider, Contract, Account, ec, json } = require("starknet");
const ABI = require("../../config/ABI.json");

get_contract_instance = () => {
  const RPC_URL = process.env.RPC_URL;
  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  const ACCOUNT_ADDRESS = process.env.ACCOUNT_ADDRESS;
  const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
  const provider = new RpcProvider({ nodeUrl: `${RPC_URL}` });
  const account = new Account(provider, ACCOUNT_ADDRESS, PRIVATE_KEY);
  const contract = new Contract(ABI, CONTRACT_ADDRESS, provider);
  // Connect account with the contract
  contract.connect(account);
  return contract;
};

exports.register_matches = async (matches, callback) => {
  try {
    const contract = get_contract_instance();
    if (!contract) {
      callback({ success: false, msg: "Contract instance not set", data: {} });
      return;
    }

    const tx = await contract.register_matches(matches);

    callback({ success: true, msg: "Matches registered", data: tx });
  } catch (error) {
    console.log(error);
    callback({ success: false, msg: JSON.stringify(error), data: {} });
  }
};
