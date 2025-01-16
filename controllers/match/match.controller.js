const axios = require("axios");
const { Match, sequelize } = require("../../models");
const { cairo } = require("starknet");
const {
  get_current_round,
  register_scores,
} = require("../contract/contract.controller");
const { Op } = require("sequelize");
const dummyMatches = require("./dummy_match.json");

const format_match_data = (match) => {
  const home_team = match.sport_event.competitors.find(
    (fd) => fd.qualifier === "home"
  );
  const away_team = match.sport_event.competitors.find(
    (fd) => fd.qualifier === "away"
  );

  if (home_team && away_team) {
    return {
      success: true,
      match: {
        fixture: {
          id: match.sport_event.id.split(":").pop(),
          date: match.sport_event.start_time,
          status: {
            match_status: match.sport_event_status.match_status,
            status: match.sport_event_status.status,
          },
        },
        league: {
          id: match.sport_event.sport_event_context.competition.id
            .split(":")
            .pop(),
          name: match.sport_event.sport_event_context.competition.name,
          season: match.sport_event.sport_event_context.season,
          round: match.sport_event.sport_event_context.round.number,
        },
        goals:
          match.sport_event_status.home_score ||
          match.sport_event_status.away_score
            ? {
                home: match.sport_event_status.home_score,
                away: match.sport_event_status.away_score,
              }
            : undefined,
        teams: {
          home: {
            id: home_team.id.split(":").pop(),
            name: home_team.name,
          },
          away: {
            id: away_team.id.split(":").pop(),
            name: away_team.name,
          },
        },

        statistics: match.statistics,
      },
    };
  }

  return { success: false, match: null };
};

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
    const date = new Date(item.sport_event.start_time); // Access the date field
    const utcHours = date.getUTCHours();

    // Prioritize items where the team names match any in the prioritizedTeamNames array

    // for (let i = 0; i < item.sport_event.conpetitors.length; i++) {
    //   const competitor = item.sport_event.conpetitors[i];
    //   if(prio)

    // }

    // dummyMatches.schedules[0].sport_event_status.

    const exists = item.sport_event.competitors.some((competitor) =>
      prioritizedTeamNames.includes(competitor)
    );

    if (exists && item.sport_event_status.match_status === "not_started") {
      prioritizedItems.push(format_match_data(item).match);
    } else if (
      utcHours >= startHourUTC &&
      utcHours < endHourUTC &&
      item.sport_event_status.match_status === "not_started"
    ) {
      // If this hour doesn't have a group yet, initialize it
      if (!groupedByHour[utcHours]) {
        groupedByHour[utcHours] = [];
      }
      groupedByHour[utcHours].push(format_match_data(item).match); // Push the entire object, not just the date
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

async function get_api_matches_by_date(date) {
  try {
    const SPORT_RADAR_API_KEY = process.env.SPORT_RADAR_API_KEY;
    const response = await axios.get(
      `https://api.sportradar.com/soccer-extended/trial/v4/en/schedules/${formatDateFromString(
        date.trim()
      )}/schedules.json?api_key=${SPORT_RADAR_API_KEY}`
    );
    return response;
  } catch (error) {
    throw error;
  }
}

async function get_api_matches_by_id(id) {
  try {
    const SPORT_RADAR_API_KEY = process.env.SPORT_RADAR_API_KEY;
    const response = await axios.get(
      `https://api.sportradar.com/soccer-extended/trial/v4/en/sport_events/sr%3Asport_event%3A${id}/summary.json?api_key=${SPORT_RADAR_API_KEY}`
    );
    return response;
  } catch (error) {
    throw error;
  }
}

exports.update_past_or_current_matches = async () => {
  const transaction = await sequelize.transaction();
  let signed_db_tx = false;
  try {
    const currentDateUtc = new Date().toISOString();
    const matches = await Match.findAll({
      where: {
        scored: false,
        date: {
          [Op.lte]: currentDateUtc,
        },
      },
    });
    let ended_matches = [];

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const response = await get_api_matches_by_id(match.id);
      const { match: match_response, success } = format_match_data(
        response.data
      );
      if (success) {
        console.log(match_response);
        if (match_response.fixture.status.match_status === "ended") {
          ended_matches.push({
            inputed: true,
            match_id: match_response.fixture.id,
            home: Number(match_response.goals?.home ?? 0),
            away: Number(match_response.goals?.away ?? 0),
          });
        }
        await match.update(
          {
            ...match,
            details: match_response,
            scored:
              match_response.fixture.status.match_status === "ended"
                ? true
                : match.scored,
          },
          {
            transaction,
          }
        );
        if (!signed_db_tx) {
          signed_db_tx = true;
        }
      }
    }

    await register_scores(ended_matches, async (callback) => {
      if (callback?.success) {
        if (signed_db_tx) {
          await transaction.commit();
        }
      } else {
        if (signed_db_tx) {
          await transaction.rollback();
        }
      }
    });
  } catch (error) {
    console.log(error);
    if (signed_db_tx) {
      await transaction.rollback();
    }
    throw error;
  }
};

const getFutureDays = (numOfDays, start_date) => {
  const daysArray = [];
  const today = start_date ? new Date(start_date) : new Date();

  for (let i = 0; i <= numOfDays; i++) {
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
    const [response1, response2, response3, response4, response5] =
      await Promise.all([
        get_api_matches_by_date(futureDays[0]),
        // get_api_matches_by_date(futureDays[1]),
        // get_api_matches_by_date(futureDays[2]),
        // get_api_matches_by_date(futureDays[3]),
        // get_api_matches_by_date(futureDays[4]),
      ]);
    /// TEST
    // const { response1, response2, response3, response4, response5 } =
    //   dummyMatches;

    /// TEST
    // const response = {
    //   data: {
    //     response: [
    //       ...(response1.length
    //         ? groupByUTCHours(
    //             response1.map((mp, index) => {
    //               const baseDate = new Date();
    //               baseDate.setHours(baseDate.getHours() + 1);

    //               // Add extra minutes based on the index
    //               baseDate.setMinutes(baseDate.getMinutes() + index);

    //               // Format the date to ISO string with time zone
    //               const formattedDate = baseDate.toISOString();

    //               return {
    //                 ...mp,

    //                 fixture: {
    //                   ...mp.fixture,
    //                   id: Math.floor(1000000 + Math.random() * 9000000),
    //                   date: formattedDate,
    //                 },
    //               };
    //             })
    //           )
    //         : []),
    //       ...(response2.length
    //         ? groupByUTCHours(
    //             response2.map((mp, index) => {
    //               const baseDate = new Date();
    //               baseDate.setHours(baseDate.getHours() + 1);

    //               // Add extra minutes based on the index
    //               baseDate.setMinutes(baseDate.getMinutes() + index);

    //               // Format the date to ISO string with time zone
    //               const formattedDate = baseDate.toISOString();

    //               return {
    //                 ...mp,
    //                 fixture: {
    //                   ...mp.fixture,
    //                   id: Math.floor(1000000 + Math.random() * 9000000),
    //                   date: formattedDate,
    //                 },
    //               };
    //             })
    //           )
    //         : []),
    //       ...(response3.length
    //         ? groupByUTCHours(
    //             response3.map((mp, index) => {
    //               const baseDate = new Date();
    //               baseDate.setHours(baseDate.getHours() + 1);

    //               // Add extra minutes based on the index
    //               baseDate.setMinutes(baseDate.getMinutes() + index);

    //               // Format the date to ISO string with time zone
    //               const formattedDate = baseDate.toISOString();

    //               return {
    //                 ...mp,
    //                 fixture: {
    //                   ...mp.fixture,
    //                   id: Math.floor(1000000 + Math.random() * 9000000),
    //                   date: formattedDate,
    //                 },
    //               };
    //             })
    //           )
    //         : []),
    //       ...(response4.length
    //         ? groupByUTCHours(
    //             response4.map((mp, index) => {
    //               const baseDate = new Date();
    //               baseDate.setHours(baseDate.getHours() + 1);

    //               // Add extra minutes based on the index
    //               baseDate.setMinutes(baseDate.getMinutes() + index);

    //               // Format the date to ISO string with time zone
    //               const formattedDate = baseDate.toISOString();

    //               return {
    //                 ...mp,
    //                 fixture: {
    //                   ...mp.fixture,
    //                   id: Math.floor(1000000 + Math.random() * 9000000),
    //                   date: formattedDate,
    //                 },
    //               };
    //             })
    //           )
    //         : []),
    //       ...(response5.length
    //         ? groupByUTCHours(
    //             response5.map((mp, index) => {
    //               const baseDate = new Date();
    //               baseDate.setHours(baseDate.getHours() + 1);

    //               // Add extra minutes based on the index
    //               baseDate.setMinutes(baseDate.getMinutes() + index);

    //               // Format the date to ISO string with time zone
    //               const formattedDate = baseDate.toISOString();

    //               return {
    //                 ...mp,
    //                 fixture: {
    //                   ...mp.fixture,
    //                   id: Math.floor(1000000 + Math.random() * 9000000),
    //                   date: formattedDate,
    //                 },
    //               };
    //             })
    //           )
    //         : []),
    //     ],
    //   },
    // };

    ///REAL
    const response = {
      data: {
        response: [
          ...(response1.data.schedules?.length
            ? groupByUTCHours(response1.data.schedules)
            : []),
          // ...(response2.data.schedules?.length
          //   ? groupByUTCHours(response2.data.schedules)
          //   : []),
          // ...(response3.data.schedules?.length
          //   ? groupByUTCHours(response3.data.schedules)
          //   : []),
          // ...(response4.data.schedules?.length
          //   ? groupByUTCHours(response4.data.schedules)
          //   : []),
          // ...(response5.data.schedules?.length
          //   ? groupByUTCHours(response5.data.schedules)
          //   : []),
        ],
      },
    };

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
      const response = await get_api_matches_by_date(
        matches[0].date.toString()
      );
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
