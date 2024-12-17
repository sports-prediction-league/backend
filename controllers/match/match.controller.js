const axios = require("axios");
const { Match } = require("../../models");
const { cairo } = require("starknet");
const { get_current_round } = require("../controller/contract.controller");
const { Op } = require("sequelize");
const dummyMatches = require("./dummy_match.json");
const groupByUTCHours = (
  arr,
  startHourUTC = 10,
  endHourUTC = 21,
  limit = 10
) => {
  const prioritizedTeamNames = [
    "manchester united",
    "real madrid",
    "barcelona",
    "bayern munich",
    "bayern",
    "liverpool",
    "paris saint-germain",
    "paris",
    "juventus",
    "chelsea",
    "manchester city",
    "arsenal",
    "ac milan",
    "ac",
    "inter milan",
    "inter",
    "atletico madrid",
    "atletico",
    "tottenham hotspur",
    "tottenham",
    "borussia dortmund",
    "dortmund",
    "ajax",
    "napoli",
    "as roma",
    "benfica",
    "sevilla",
    "leicester city",
    "leicester",
    "valencia",
    "lyon",
    "villarreal",
    "everton",
    "monaco",
    "porto",
    "wolfsburg",
    "aston villa",
    "aston",
    "west ham united",
    "west ham",
    "full ham",
    "monterrey",
    "roma",
  ];
  const groupedByHour = {};
  const prioritizedItems = [];
  const result = [];

  // Group the objects by the UTC hour of their fixture date
  for (const item of arr) {
    const date = new Date(item.fixture.date); // Access the date field
    const utcHours = date.getUTCHours();

    // Prioritize items where the team names match any in the prioritizedTeamNames array
    if (
      (prioritizedTeamNames.includes(
        item?.teams?.home?.name?.toLowerCase()?.trim()
      ) ||
        prioritizedTeamNames.includes(
          item?.teams?.away?.name?.toLowerCase()?.trim()
        )) &&
      item?.fixture?.status?.short === "NS"
    ) {
      prioritizedItems.push(item); // Add to prioritized list regardless of time range
    } else if (
      utcHours >= startHourUTC &&
      utcHours < endHourUTC &&
      item?.fixture?.status?.short === "NS"
    ) {
      // If this hour doesn't have a group yet, initialize it
      if (!groupedByHour[utcHours]) {
        groupedByHour[utcHours] = [];
      }
      groupedByHour[utcHours].push(item); // Push the entire object, not just the date
    }
  }

  // Add prioritized items first, but limit the total results to the given limit
  for (const item of prioritizedItems) {
    result.push(item);
    if (result.length === limit) {
      return result; // Stop if we reach the limit
    }
  }

  // Randomly pick items from each hour group until we have the limit
  while (result.length < limit) {
    for (const hour in groupedByHour) {
      const matches = groupedByHour[hour];

      // If there are still matches in this group, pick one
      if (matches.length > 0) {
        result.push(matches.shift()); // Remove the first match from the group and add to result

        if (result.length === limit) {
          break; // Stop when we reach the limit
        }
      }
    }

    // If we exhausted all groups and still don't have enough results, stop
    if (Object.values(groupedByHour).every((matches) => matches.length === 0)) {
      break;
    }
  }

  return result;
};

const formatDateFromString = (dateString) => {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0"); // getMonth() is zero-based
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

async function get_api_matches(date) {
  try {
    const FIXTURE_API = process.env.FIXTURE_API;
    const FIXTURE_API_KEY = process.env.FIXTURE_API_KEY;
    const options = {
      method: "GET",
      url: `${FIXTURE_API}/fixtures`,
      params: {
        date: formatDateFromString(date.trim()),
      },
      headers: {
        "x-rapidapi-host": FIXTURE_API,
        "x-rapidapi-key": FIXTURE_API_KEY,
      },
    };

    const response = await axios.request(options);
    return response;
  } catch (error) {
    throw error;
  }
}

const getFutureDays = (numOfDays, start_date) => {
  const daysArray = [];
  const today = start_date ? new Date(start_date) : new Date();

  for (let i = 1; i <= numOfDays; i++) {
    const futureDate = new Date(today);
    futureDate.setDate(today.getDate() + i); // Add i days to today's date
    daysArray.push(futureDate.toDateString()); // You can format this as you like
  }

  return daysArray;
};

exports.set_next_matches = async (transaction, callback, current_round) => {
  try {
    const last_match = await Match.findOne({
      order: [["date", "DESC"]],
    });

    // Get the current date
    // const today = new Date();

    // // Create a new Date object for yesterday by subtracting one day (24 hours)
    // const yesterday = new Date(today);
    // yesterday.setDate(today.getDate() - 2);

    // console.log("Yesterday's date:", yesterday);

    const futureDays = last_match
      ? getFutureDays(5, last_match.date)
      : getFutureDays(5, null);
    ///REAL
    // const [response1, response2, response3, response4, response5] =
    //   await Promise.all([
    //     get_api_matches(futureDays[0]),
    //     get_api_matches(futureDays[1]),
    //     get_api_matches(futureDays[2]),
    //     get_api_matches(futureDays[3]),
    //     get_api_matches(futureDays[4]),
    //   ]);
    /// TEST
    const { response1, response2, response3, response4, response5 } =
      dummyMatches;

    /// TEST
    const response = {
      data: {
        response: [
          ...(response1.length ? groupByUTCHours(response1) : []),
          ...(response2.length ? groupByUTCHours(response2) : []),
          ...(response3.length ? groupByUTCHours(response3) : []),
          ...(response4.length ? groupByUTCHours(response4) : []),
          ...(response5.length ? groupByUTCHours(response5) : []),
        ],
      },
    };

    ///REAL
    // const response = {
    //   data: {
    //     response: [
    //       ...(response1.data.response?.length
    //         ? groupByUTCHours(response1.data.response)
    //         : []),
    //       ...(response2.data.response?.length
    //         ? groupByUTCHours(response2.data.response)
    //         : []),
    //       ...(response3.data.response?.length
    //         ? groupByUTCHours(response3.data.response)
    //         : []),
    //       ...(response4.data.response?.length
    //         ? groupByUTCHours(response4.data.response)
    //         : []),
    //       ...(response5.data.response?.length
    //         ? response5.data.response.slice(-10)
    //         : []),
    //     ],
    //   },
    // };

    let structure = [];

    if (response.data?.response?.length) {
      for (let i = 0; i < response.data.response.length; i++) {
        const element = response.data.response[i];
        await Match.create(
          {
            id: element.fixture.id.toString(),
            date: element.fixture.date,
            round: current_round + 1,
            dateCompare: formatDateFromString(element.fixture.date),
            details: {
              fixture: element.fixture,
              league: element.league,
              teams: element.teams,
            },
          },
          { transaction }
        );

        structure.push({
          inputed: true,
          id: cairo.felt(element.fixture.id.toString().trim()),
          timestamp: Math.floor(
            new Date(element.fixture.date).getTime() / 1000
          ),
          round: cairo.uint256(current_round + 1),
        });
      }
    }

    callback({ success: true, msg: "Matches pulled", data: structure });
  } catch (error) {
    // await callback({ success: false, msg: error, data: {} });
    throw error;
  }
};

exports.set_scores = async (transaction, callback) => {
  try {
    // Calculate the start and end of yesterday
    const now = new Date();
    const yesterdayStart = new Date();
    yesterdayStart.setDate(now.getDate() - 1);
    yesterdayStart.setHours(0, 0, 0, 0); // Set to the start of the day

    const yesterdayEnd = new Date();
    yesterdayEnd.setDate(now.getDate() - 1);
    yesterdayEnd.setHours(23, 59, 59, 999); // Set to the end of the day
    const matches = await Match.findAll({
      where: {
        scored: false,
        date: {
          [Op.between]: [yesterdayStart, yesterdayEnd], // Greater than or equal to the start of yesterday
          // [Op.lte]: endOfYesterday, // Less than or equal to the end of yesterday
        },
      },
    });

    let structure = [];

    if (matches.length) {
      const response = await get_api_matches(matches[0].date.toString());
      const api_matches = response.data?.response ?? [];
      for (let i = 0; i < matches.length; i++) {
        const match = matches[i];

        if (
          Date.now() / 1000 >=
          Math.floor(new Date(match.date).getTime() / 1000) + 5400
        ) {
          const find = api_matches.find(
            (fd) =>
              fd.fixture.id.toString().trim() === match.id.toString().trim()
          );
          if (find) {
            await match.update(
              {
                scored: true,
                details: {
                  ...match.details,
                  goals: find.goals,
                },
              },
              { transaction }
            );

            structure.push({
              inputed: true,
              match_id: match.id.toString().trim(),
              home: Number(find?.goals?.home ?? 0),
              away: Number(find?.goals?.away ?? 0),
            });
          } else {
            console.log("not found");
          }
        } else {
          console.log("not completed");
        }
      }
    } else {
      console.log("empty");
    }

    console.log(structure);
    await callback({ success: true, msg: "Scored pulled", data: structure });
  } catch (error) {
    // await callback({ success: false, msg: error, data: {} });
    throw error;
  }
};

exports.get_matches = async (req, res) => {
  try {
    const current_round = await get_current_round();
    const match = await Match.findOne({
      order: [["date", "ASC"]],

      where: {
        scored: false,
      },
    });
    const converted_round = Number(current_round);
    const { round } = req.query;
    if (round) {
      const matches = await Match.findAndCountAll({
        order: [["date", "ASC"]],

        where: {
          round: round,
        },
      });

      res.status(200).send({
        success: true,
        message: "Matches Fetched",
        data: { matches, current_round: round, total_rounds: converted_round },
      });

      return;
    }

    const matches = await Match.findAndCountAll({
      order: [["date", "ASC"]],

      where: {
        round: match?.round ?? converted_round,
      },
    });

    res.status(200).send({
      success: true,
      message: "Matches Fetched",
      data: {
        matches,
        total_rounds: converted_round,
        current_round: match?.round ?? 0,
      },
    });
  } catch (error) {
    res
      .status(500)
      .send({ success: false, message: "Internal Server Error", data: {} });
    console.log(error);
  }
};
