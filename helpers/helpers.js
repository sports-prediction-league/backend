exports.parse_data_into_table_structure = (data, message) => {
  let table = "";
  // console.log(message);
  // console.log(data, typeof message);
  // Add message at the top if provided
  if (message) {
    table +=
      typeof message === "object"
        ? JSON.stringify(message, null, 2)
        : message + "\n\n"; // Add a new line after the message for spacing
  }
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return "No data available.";
    }
    // Get column headers from the first object in the array
    const headers = Object.keys(data[0]);

    // Prepare the header row
    table += headers.join(" | ") + "\n";
    table += "-".repeat(table.length) + "\n"; // Add a separator line

    // Add each row of data
    data.forEach((row) => {
      const values = headers.map((header) => row[header] || ""); // Handle missing keys gracefully
      table += values.join(" | ") + "\n";
    });
  } else if (typeof data === "object" && data !== null) {
    // Handle the case where data is a single object
    const headers = Object.keys(data);
    // console.log(table);

    // Prepare the header row
    table += headers.join(" | ") + "\n";
    table += "-".repeat(table.length) + "\n"; // Add a separator line

    // Prepare the data row
    const values = headers.map((header) => data[header] || "");
    table += values.join(" | ") + "\n";
  } else {
    table = "Invalid data format.";
  }

  return table;
};

exports.feltToString = (felt) =>
  felt
    // To hex
    .toString(16)
    // Split into 2 chars
    .match(/.{2}/g)
    // Get char from code
    .map((c) => String.fromCharCode(parseInt(c, 16)))
    // Join to a string
    .join("");

exports.parseUnits = (value, decimals = 18) => {
  const [integerPart, fractionalPart = ""] = value.split(".");

  // Pad fractional part to the right with zeros up to `decimals`
  const paddedFraction = fractionalPart
    .padEnd(decimals, "0")
    .slice(0, decimals);

  // Combine integer and fractional parts and convert to BigInt
  return BigInt(integerPart + paddedFraction);
};

exports.flattenObject = (obj, result = {}) => {
  for (const key in obj) {
    if (typeof obj[key] === "object" && obj[key] !== null) {
      flattenObject(obj[key], result); // Recursively flatten
    } else if (key === "id" && obj[key]) {
      result[obj[key]] = obj.odd; // Store `odd` with `id` as the key
    }
  }
  return result;
};

exports.findParentPath = (obj, targetId, path = "") => {
  for (const key in obj) {
    if (typeof obj[key] === "object" && obj[key] !== null) {
      // Build the current path
      const newPath = path ? `${path}/${key}` : key;

      // If the object has an id and it matches the target id, return the path
      if (obj[key].id === targetId) {
        return newPath;
      }

      // Recursively search deeper
      const found = findParentPath(obj[key], targetId, newPath);
      if (found) return found;
    }
  }
  return null; // Return null if not found
};

exports.formatUnits = (value, decimals = 18) => {
  const bigValue = BigInt(value); // Convert to BigInt for precision
  const divisor = BigInt(10 ** decimals); // 10^decimals
  const integerPart = bigValue / divisor;
  const fractionalPart = bigValue % divisor;

  // Pad fractional part with leading zeros
  const fractionalString = fractionalPart.toString().padStart(decimals, "0");

  // Remove trailing zeros and return
  return `${integerPart}.${fractionalString}`.replace(/\.?0+$/, "");
};
