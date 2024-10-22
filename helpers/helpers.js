exports.parse_data_into_table_structure = (data, message) => {
  let table = "";
  // Add message at the top if provided
  if (message) {
    table += message + "\n\n"; // Add a new line after the message for spacing
  }
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return "No data available.";
    }
    // Get column headers from the first object in the array
    const headers = Object.keys(data[0]);

    // Prepare the header row
    table = headers.join(" | ") + "\n";
    table += "-".repeat(table.length) + "\n"; // Add a separator line

    // Add each row of data
    data.forEach((row) => {
      const values = headers.map((header) => row[header] || ""); // Handle missing keys gracefully
      table += values.join(" | ") + "\n";
    });
  } else if (typeof data === "object" && data !== null) {
    // Handle the case where data is a single object
    const headers = Object.keys(data);

    // Prepare the header row
    table = headers.join(" | ") + "\n";
    table += "-".repeat(table.length) + "\n"; // Add a separator line

    // Prepare the data row
    const values = headers.map((header) => data[header] || "");
    table += values.join(" | ") + "\n";
  } else {
    table = "Invalid data format.";
  }

  return table;
};
