const { RpcProvider, Contract, Account, cairo, CallData } = require("starknet");
const ABI = require("../../config/ABI.json");

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const get_provider_and_account = () => {
  const RPC_URL = process.env.RPC_URL;
  const PRIVATE_KEY = process.env.ADMIN_CONTROL_PRIVATE_KEY;
  const ACCOUNT_ADDRESS = process.env.ADMIN_CONTROL_ACCOUNT_ADDRESS;

  const provider = new RpcProvider({ nodeUrl: `${RPC_URL}` });
  const account = new Account(provider, ACCOUNT_ADDRESS, PRIVATE_KEY);

  return { provider, account };
};

const get_contract_instance = () => {
  const { account, provider } = get_provider_and_account();
  const contract = new Contract(ABI, CONTRACT_ADDRESS, provider);
  // Connect account with the contract
  contract.connect(account);

  return { contract, provider };
};

const register_matches = async (matches) => {
  try {
    const { contract, provider } = get_contract_instance();
    if (!contract) {
      throw new Error("Contract instance not set");
    }

    const tx = await contract.register_matches(matches);

    const receipt = await provider.waitForTransaction(tx.transaction_hash);
    console.log(receipt);
    return tx.transaction_hash;
  } catch (error) {
    throw error;
  }
};

const register_scores = async (scores) => {
  try {
    const { contract, provider } = get_contract_instance();
    if (!contract) {
      throw new Error("Contract instance not set");
    }
    const tx = await contract.set_scores(scores);

    const receipt = await provider.waitForTransaction(tx.transaction_hash);
    console.log(receipt);
    return tx.transaction_hash;
  } catch (error) {
    throw error;
  }
};

function extractDecodedErrorReasons(errorMsg) {
  const hexMatches = errorMsg.match(/0x[0-9a-fA-F]{8,}/g);
  if (!hexMatches) return [];

  const decodeHex = (hex) => {
    hex = hex.replace(/^0x/, "");
    let decoded = "";
    for (let i = 0; i < hex.length; i += 2) {
      const charCode = parseInt(hex.slice(i, i + 2), 16);
      decoded +=
        charCode >= 32 && charCode <= 126 ? String.fromCharCode(charCode) : ""; // skip unreadable characters
    }
    return decoded;
  };

  const priorityOrder = [
    "PREDICTION_CLOSED",
    "NOT_REGISTERED",
    "INVALID_MATCH_ID",
    "MATCH_SCORED",
    "INVALID_PARAMS",
    "PREDICTED",
    "ALREADY_EXIST",
    "INVALID_PARAMS",
    "INVALID_ADDRESS",
  ];

  const decoded = hexMatches
    .map(decodeHex)
    .filter((str) => str && /^[A-Z0-9_\/-]{5,}$/.test(str)); // keep error-like strings

  return decoded.sort((a, b) => {
    const aIndex = priorityOrder.indexOf(a);
    const bIndex = priorityOrder.indexOf(b);
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
  });
}

const execute_contract_call = async (call) => {
  try {
    if (!call) {
      console.log("INVALID_CALL");
      return { success: false, data: {}, message: "Invalid call" };
    }

    if (
      !call.entrypoint ||
      !call.contractAddress ||
      (!call.calldata && !Array.isArray(call.calldata)) ||
      call.calldata.length < 6
    ) {
      console.log("INVALID_LENGTH");

      return { success: false, data: {}, message: "Invalid call" };
    }
    if (call.entrypoint !== "execute_from_outside_v2") {
      console.log("INVALID_ENTRYPOINT");

      return { success: false, data: {}, message: "Invalid call" };
    }

    if (call.calldata[5] !== CallData.compile([CONTRACT_ADDRESS])[0]) {
      console.log("INVALID_CONTRACT_ADDRESS");

      return { success: false, data: {}, message: "Invalid call" };
    }

    const { account } = get_provider_and_account();
    const tx = await account.execute(call);
    await account.waitForTransaction(tx.transaction_hash);
    return { success: true, data: tx, message: "Transaction successful" };
  } catch (error) {
    console.log(
      error.message,
      "======>>>>>>>>>\n\n\n\n\n\n\n\n\n========>>>>>>> END"
    );
    const match = error.message.match(/'([^']+)'/);

    const errMessage = extractDecodedErrorReasons(error.message);
    if (errMessage?.length) {
      return { success: false, data: {}, message: errMessage[0] };
    }

    // If a match is found, get the error message
    if (match) {
      const errorMessage = match[1];
      return { success: false, data: {}, message: errorMessage };
    }
    return { success: false, data: {}, message: error.message };
  }
};

const deploy_account = async (account_payload) => {
  try {
    if (!account_payload) {
      return { success: false, data: {}, message: "Invalid call" };
    }

    const { account } = get_provider_and_account();
    const tx = await account.deployAccount(account_payload);
    return { success: true, data: tx, message: "Deployment successful" };
  } catch (error) {
    return { success: false, data: {}, message: error.message };
  }
};

const get_user_points = async (id) => {
  try {
    const { contract } = get_contract_instance();
    const points = await contract.get_user_total_scores(cairo.felt(id));
    return points;
  } catch (error) {
    throw error;
  }
};

const get_matches_predictions = async (ids) => {
  try {
    const { contract } = get_contract_instance();
    const result = await contract.get_matches_predictions(ids);
    return result;
  } catch (error) {
    throw error;
  }
};

const get_first_position = async () => {
  try {
    const { contract } = get_contract_instance();
    const top = await contract.get_first_position();
    return top;
  } catch (error) {
    throw error;
  }
};

const get_current_round = async () => {
  try {
    const { contract } = get_contract_instance();
    const round = await contract.get_current_round();
    return round;
  } catch (error) {
    throw error;
  }
};

module.exports = {
  register_matches,
  register_scores,
  get_first_position,
  get_user_points,
  execute_contract_call,
  deploy_account,
  get_matches_predictions,
  get_current_round,
  get_provider_and_account,
};
