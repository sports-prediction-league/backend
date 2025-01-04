const { RpcProvider, Contract, Account, cairo } = require("starknet");
const ABI = require("../../config/ABI.json");

const get_provider_and_account = () => {
  const RPC_URL = process.env.RPC_URL;
  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  const ACCOUNT_ADDRESS = process.env.ACCOUNT_ADDRESS;

  const provider = new RpcProvider({ nodeUrl: `${RPC_URL}` });
  const account = new Account(provider, ACCOUNT_ADDRESS, PRIVATE_KEY);

  return { provider, account };
};

const get_contract_instance = () => {
  const CONTRACT_ADDRESS =
    process.env.NODE_ENV === "production"
      ? process.env.PROD_CONTRACT_ADDRESS
      : process.env.NODE_ENV === "test"
      ? process.env.TEST_CONTRACT_ADDRESS
      : process.env.DEV_CONTRACT_ADDRESS;
  const { account, provider } = get_provider_and_account();
  const contract = new Contract(ABI, CONTRACT_ADDRESS, provider);
  // Connect account with the contract
  contract.connect(account);

  return contract;
};

const register_matches = async (matches, callback) => {
  try {
    const contract = get_contract_instance();
    if (!contract) {
      throw new Error("Contract instance not set");
    }

    const tx = await contract.register_matches(matches);

    callback({ success: true, msg: "Matches registered", data: tx });
    return true;
  } catch (error) {
    // await callback({ success: false, msg: error, data: {} });
    throw error;
  }
};

const register_scores = async (scores, callback) => {
  try {
    const contract = get_contract_instance();
    if (!contract) {
      throw new Error("Contract instance not set");
    }

    const tx = await contract.set_scores(scores);

    callback({ success: true, msg: "Scores set", data: tx });
    return true;
  } catch (error) {
    // await callback({ success: false, msg: error, data: {} });
    throw error;
  }
};

const execute_contract_call = async (call) => {
  try {
    const { account } = get_provider_and_account();

    const tx = await account.execute([call]);
    return { success: true, data: tx, message: "Registration successful" };
  } catch (error) {
    console.log(error);
    return { success: false, data: {}, message: error.message };
  }
};

const get_current_round = async () => {
  try {
    const contract = get_contract_instance();
    const round = await contract.get_current_round();
    return round;
  } catch (error) {
    throw error;
  }
};

const get_user_points = async (id) => {
  try {
    const contract = get_contract_instance();
    const points = await contract.get_user_total_scores(cairo.felt(id));
    return points;
  } catch (error) {
    throw error;
  }
};

const get_first_position = async () => {
  try {
    const contract = get_contract_instance();
    const top = await contract.get_first_position();
    return top;
  } catch (error) {
    throw error;
  }
};

module.exports = {
  register_matches,
  get_current_round,
  register_scores,
  get_first_position,
  get_user_points,
  execute_contract_call,
};
