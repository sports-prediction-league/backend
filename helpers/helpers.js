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
