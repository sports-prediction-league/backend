const axios = require("axios");
const { Match } = require("../../models");
const { cairo } = require("starknet");
const { get_current_round } = require("../controller/contract.controller");
const { Op } = require("sequelize");

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
    "liverpool",
    "paris saint-germain",
    "juventus",
    "chelsea",
    "manchester city",
    "arsenal",
    "ac milan",
    "inter milan",
    "atletico madrid",
    "tottenham hotspur",
    "borussia dortmund",
    "ajax",
    "napoli",
    "as roma",
    "benfica",
    "sevilla",
    "leicester city",
    "valencia",
    "lyon",
    "villarreal",
    "everton",
    "monaco",
    "porto",
    "wolfsburg",
    "aston villa",
    "west ham united",
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
      prioritizedTeamNames.some((team) =>
        item?.teams?.home?.name?.toLowerCase()?.includes(team)
      ) ||
      prioritizedTeamNames.some((team) =>
        item?.teams?.away?.name?.toLowerCase()?.includes(team)
      )

      // prioritizedTeamNames.includes(item.teams.home.name.toLowerCase()) ||
      // prioritizedTeamNames.includes(item.teams.away.name.toLowerCase())
    ) {
      prioritizedItems.push(item); // Add to prioritized list regardless of time range
    } else if (utcHours >= startHourUTC && utcHours < endHourUTC) {
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

exports.set_next_matches = async (callback, current_round) => {
  try {
    const last_match = await Match.findOne({
      order: [["date", "DESC"]],
    });

    const futureDays = last_match
      ? getFutureDays(5, last_match.date)
      : getFutureDays(5, null);
    const [response1, response2, response3, response4, response5] =
      await Promise.all([
        get_api_matches(futureDays[0]),
        get_api_matches(futureDays[1]),
        get_api_matches(futureDays[2]),
        get_api_matches(futureDays[3]),
        get_api_matches(futureDays[4]),
      ]);

    console.log(response1.data);

    const response = {
      data: {
        response: [
          ...(response1.data.response?.length
            ? groupByUTCHours(response1.data.response)
            : []),
          ...(response2.data.response?.length
            ? groupByUTCHours(response2.data.response)
            : []),
          ...(response3.data.response?.length
            ? groupByUTCHours(response3.data.response)
            : []),
          ...(response4.data.response?.length
            ? groupByUTCHours(response4.data.response)
            : []),
          ...(response5.data.response?.length
            ? response5.data.response.slice(-10)
            : []),
        ],
      },
    };

    let structure = [];

    if (response.data?.response?.length) {
      for (let i = 0; i < response.data.response.length; i++) {
        const element = response.data.response[i];
        await Match.create({
          id: element.fixture.id.toString(),
          date: element.fixture.date,
          round: current_round + 1,
          dateCompare: formatDateFromString(element.fixture.date),
          details: {
            fixture: element.fixture,
            league: element.league,
            teams: element.teams,
          },
        });

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
    callback({ success: false, msg: error, data: {} });
  }
};

exports.set_scores = async (callback) => {
  try {
    // Calculate the start and end of yesterday
    const startOfYesterday = new Date(today.setHours(0, 0, 0, 0) - 86400000); // Midnight of yesterday
    const endOfYesterday = new Date(today.setHours(23, 59, 59, 999)); // End of yesterday

    const matches = await Match.findAll({
      where: {
        scored: false,
        date: {
          [Op.gte]: startOfYesterday, // Greater than or equal to the start of yesterday
          [Op.lte]: endOfYesterday, // Less than or equal to the end of yesterday
        },
      },
    });

    let broken = false;
    let structure = [];

    if (matches.length) {
      const match = matches[0];
      const response = await get_api_matches(match.date.toString());
      for (let i = 0; i < response.data.response.length && i < 100; i++) {
        const element = response.data.response[i];
        const _match = matches[i];

        if (
          element.fixture.id.toString().trim() !== _match.id.toString().trim()
        ) {
          await callback({ success: false, msg: "Data corrupted", data: {} });
          broken = true;
          break;
        } else {
          if (
            Date.now() / 1000 <
            Math.floor(new Date(_match.date).getTime() / 1000) + 5400
          ) {
            callback({ success: false, msg: "Match not ended", data: {} });
            broken = true;
            break;
          } else {
            await _match.update({
              scored: true,
              details: {
                ..._match.details,
                goals: element.goals,
              },
            });

            structure.push({
              inputed: true,
              match_id: _match.id.toString().trim(),
              home: Number(element?.goals?.home ?? 0),
              away: Number(element?.goals?.away ?? 0),
            });
          }
        }
      }
    }
    if (broken) return;
    await callback({ success: true, msg: "Scored pulled", data: structure });
  } catch (error) {
    await callback({ success: false, msg: error, data: {} });
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
