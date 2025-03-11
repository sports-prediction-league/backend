const axios = require("axios");
const { Match, sequelize } = require("../../models");
const {
  cairo,
  CairoOption,
  CairoOptionVariant,
  CairoCustomEnum,
} = require("starknet");
const {
  register_scores,
  get_matches_predictions,
  register_matches,
  get_current_round,
} = require("../contract/contract.controller");
const { Op } = require("sequelize");
const VIRTUAL_LEAGUES = require("../../config/virtual.json");
const {
  feltToString,
  formatUnits,
  parseUnits,
} = require("../../helpers/helpers");

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

const normalizeName = (name) => {
  // Convert to lowercase, and remove common suffixes like "FC", "SC", etc.
  return name
    .toLowerCase()
    .replace(/\s?(fc|sc|club|united|city)$/i, "")
    .trim();
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

    const exists = item.sport_event.competitors.some((competitor) =>
      prioritizedTeamNames.some(
        (team) => normalizeName(competitor.name) === normalizeName(team)
      )
    );

    if (
      exists &&
      item.sport_event_status.match_status === "not_started" &&
      item.sport_event.start_time_confirmed
    ) {
      prioritizedItems.push(format_match_data(item).match);
    } else if (
      utcHours >= startHourUTC &&
      utcHours < endHourUTC &&
      item.sport_event_status.match_status === "not_started" &&
      item.sport_event.start_time_confirmed
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
    // if (result.length === limit) {
    //   return result; // Stop if we reach the limit
    // }
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

function getGoalRange(score) {
  const totalGoals = score[0] + score[1];
  return totalGoals <= 2 ? "0-2" : "3+";
}

function calculateScore(goals, prediction) {
  if (!goals.home || !goals.away) return 0;
  let point = 0;
  const home = prediction.split(":")[0];
  const away = prediction.split(":")[1];
  // Calculate the goal range for the actual result and user prediction
  const actualGoalRange = getGoalRange([
    Number(goals.home.toString()),
    Number(goals.away.toString()),
  ]);
  const predictedGoalRange = getGoalRange([
    Number(home.toString().trim()),
    Number(away.toString().trim()),
  ]);

  // Determine if the actual match result is a draw or if one team scored more
  const actualResult =
    goals.home === goals.away
      ? "draw"
      : goals.home > goals.away
      ? "home"
      : "away";
  const predictedResult =
    home === away ? "draw" : home > away ? "home" : "away";

  // 5 Points: Exact score match and correct goal range
  if (
    goals?.home?.toString()?.trim() === home?.toString()?.trim() &&
    goals?.away?.toString()?.trim() === away?.toString()?.trim() &&
    actualGoalRange === predictedGoalRange
  ) {
    point = 5; // Exact match
  }
  // 3 Point: Correct match result and goal range, but incorrect exact score
  else if (
    predictedResult === actualResult &&
    actualGoalRange === predictedGoalRange
  ) {
    point = 3; // Correct result and goal range
  }
  // 2 Point: Correct match result only
  else if (predictedResult === actualResult) {
    point = 2; // Correct result but incorrect score and goal range
  }

  return point;
}

exports.update_past_or_current_matches = async () => {
  const transaction = await sequelize.transaction();
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

    if (!matches.length) {
      console.log("No matches to update.");
      await transaction.rollback();
      return [];
    }

    const ended_matches = [];
    const updated_matches = [];

    // Process matches in parallel
    await Promise.all(
      matches.map(async (match) => {
        try {
          const response = await get_api_matches_by_id(match.id);
          const { match: match_response, success } = format_match_data(
            response.data
          );

          if (success) {
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
                details: match_response,
                scored:
                  match_response.fixture.status.match_status === "ended"
                    ? true
                    : match.scored,
              },
              { transaction }
            );

            updated_matches.push(match);
          } else {
            console.log("no success ===>>>", match.dataValues);
          }
        } catch (error) {
          console.error(`Error updating match ID ${match.id}:`, error);
          throw error; // Ensure transaction rollback for any error
        }
      })
    );

    // Process ended matches
    if (ended_matches.length) {
      let construct = [];
      let calculated_construct = [];
      let reward_pool = 0;
      let total_contribution = 0;
      let winners_points = [];
      const percentage_cut = 0.02;
      let accumulated_precentage = 0;

      for (let i = 0; i < ended_matches.length; i++) {
        const ended_match = ended_matches[i];
        const response = await get_match_predictions(ended_match.match_id);
        construct.push(response);
      }

      for (let i = 0; i < construct.length; i++) {
        const element = construct[i];
        const pool = Number(element.match_pool);
        if (pool < 1) {
          continue;
        }
        for (let j = 0; j < element.predictions.length; j++) {
          const element_j = element.predictions[j];
          const user_address = `0x0${element_j.user.address.toString(16)}`;
          const prediction = `${Number(element_j.prediction.home)}:${Number(
            element_j.prediction.away
          )}`;
          const stake = Number(element_j.prediction.stake);
          if (stake < 1) {
            continue;
          }
          const goals = ended_matches[i];

          const user_point = calculateScore(goals, prediction);

          if (user_point === 0) {
            const perc_cal = stake * percentage_cut;
            reward_pool += stake - perc_cal;
            accumulated_precentage += perc_cal;
          } else {
            const perc_cal = stake * percentage_cut;
            accumulated_precentage += perc_cal;
            const contribution = (stake - perc_cal) * user_point;
            total_contribution += contribution;
            winners_points.push({
              user_address,
              contribution,
            });
          }
        }
      }
      const ACCOUNT_ADDRESS = process.env.ACCOUNT_ADDRESS;

      calculated_construct.push({
        reward: Math.round(accumulated_precentage),
        user: ACCOUNT_ADDRESS,
      });

      for (let i = 0; i < winners_points.length; i++) {
        const winner = winners_points[i];
        if (reward_pool > 0) {
          calculated_construct.push({
            reward: Math.round(
              (winner.contribution / total_contribution) * reward_pool
            ),
            user: winner.user_address,
          });
        }
      }

      const registerResult = await new Promise((resolve) =>
        register_scores(
          ended_matches,
          calculated_construct.filter((ft) => Boolean(ft.reward)),
          (callback) => resolve(callback)
        )
      );

      if (!registerResult?.success) {
        console.error("Failed to register scores, rolling back transaction.");
        await transaction.rollback();
        throw new Error("Score registration failed");
      }
    }

    // Commit transaction
    await transaction.commit();
    console.log("Transaction committed successfully.");
    return updated_matches;
  } catch (error) {
    console.error("Error in update_past_or_current_matches:", error);
    await transaction.rollback();
    throw error;
  }
};

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

    // console.log(response1.data);

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
    // console.log(JSON.stringify(response.data.response));
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

exports.get_matches_events = async (ids) => {
  try {
    const matches = await Match.findAll({
      order: [["date", "ASC"]],

      where: {
        id: {
          [Op.in]: ids,
        },
        date: {
          [Op.lte]: Date.now(),
        },
        type: "VIRTUAL",
      },
    });
    return matches.map((match) => {
      return {
        ...match.toJSON(),
        details: match.getDetails(match.date > Date.now()),
      };
    });
  } catch (error) {
    console.log(error);
    return [];
  }
};

exports.get_matches = async (req, res) => {
  try {
    const [current_match, last_match] = await Promise.all([
      Match.findOne({
        where: {
          scored: false,
          date: {
            [Op.or]: [
              {
                [Op.lte]: Date.now(),
              },
              {
                [Op.gte]: Date.now() + 2 * 60 * 1000,
              },
            ],
          },
        },
        order: [["round", "ASC"]],
      }),
      Match.findOne({
        order: [["round", "DESC"]],
      }),
    ]);

    // const converted_round = Number(current_round);
    // const { round } = req.query;
    // if (round) {
    //   const matches = await Match.findAndCountAll({
    //     order: [["date", "ASC"]],

    //     where: {
    //       round: round,
    //     },
    //   });

    //   res.status(200).send({
    //     success: true,
    //     message: "Matches Fetched",
    //     data: { matches, current_round: round, total_rounds: last_match.round },
    //   });

    //   return;
    // }

    if (!current_match) {
      res.status(200).send({
        success: true,
        message: "Matches fetched",
        data: {
          matches: {
            virtual: [],
            live: [],
          },
          total_rounds: last_match?.round ?? 0,
          current_round: last_match?.round ?? 0,
        },
      });

      return;
    }
    const matches = await Match.findAll({
      order: [["date", "ASC"]],

      where: {
        round: {
          [Op.gte]: current_match.round,
          [Op.lt]: current_match.round + 3,
        },
        type: "VIRTUAL",
      },
    });

    res.status(200).send({
      success: true,
      message: "Matches Fetched",
      data: {
        matches: {
          virtual: matches.map((match) => {
            const now = Date.now();
            return {
              ...match.toJSON(),
              details: match.getDetails(match.date > now),
            };
          }),
          live: [],
        },

        total_rounds: last_match.round,
        current_round: current_match.round,
      },
    });
  } catch (error) {
    res
      .status(500)
      .send({ success: false, message: "Internal Server Error", data: {} });
    console.log(error);
  }
};

function calculatePredictionOdds() {
  // Generate random odds within a realistic range
  const getRandomOdd = (min = 1.1, max = 6.0) => {
    return parseFloat((min + Math.random() * (max - min)).toFixed(1));
  };

  // Basic match result odds
  const odds = {
    home: getRandomOdd(),
    away: getRandomOdd(),
    draw: getRandomOdd(),
    // totalGoals: {
    //   under: getRandomOdd(),
    //   over: getRandomOdd(),
    // },
    // bothTeamsToScore: {
    //   yes: getRandomOdd(1.5, 2.5), // Odds for both teams scoring
    //   no: getRandomOdd(1.5, 2.5), // Odds for a clean sheet
    // },
    // firstTeamToScore: {
    //   home: getRandomOdd(1.5, 2.5),
    //   away: getRandomOdd(1.5, 2.5),
    //   noGoal: getRandomOdd(3.0, 5.0), // If no team scores
    // },
    // halftimeFulltime: {
    //   homeHome: getRandomOdd(2.0, 4.5), // Home leads at HT and wins FT
    //   homeDraw: getRandomOdd(4.0, 6.5), // Home leads HT but Draw FT
    //   homeAway: getRandomOdd(7.0, 12.0), // Home leads HT, Away wins FT
    //   drawHome: getRandomOdd(3.5, 5.5), // Draw HT, Home wins FT
    //   drawDraw: getRandomOdd(3.0, 4.5), // Draw HT, Draw FT
    //   drawAway: getRandomOdd(3.5, 5.5), // Draw HT, Away wins FT
    //   awayHome: getRandomOdd(7.0, 12.0), // Away leads HT, Home wins FT
    //   awayDraw: getRandomOdd(4.0, 6.5), // Away leads HT, Draw FT
    //   awayAway: getRandomOdd(2.0, 4.5), // Away leads HT and wins FT
    // },
    // handicap: {
    //   homeMinus1: getRandomOdd(2.0, 3.5), // Home wins by 2+ goals
    //   awayPlus1: getRandomOdd(1.8, 3.2), // Away loses by max 1 goal
    //   homeMinus2: getRandomOdd(3.5, 5.5), // Home wins by 3+ goals
    //   awayPlus2: getRandomOdd(2.5, 4.5), // Away loses by max 2 goals
    // },
  };

  return odds;
}

function generateGameScript(duration = 120, scores) {
  const script = generateBaseGameScript(duration, scores);
  const odds = calculatePredictionOdds();

  return {
    events: script,
    odds,
  };
}

// Game script generator function remains the same...
function generateBaseGameScript(duration = 120, scores) {
  const script = [];
  const totalGoals = scores.home + scores.away;
  const halfTime = duration / 2;

  // Add second half event
  script.push({
    time: halfTime,
    type: "second-half",
    position: {
      x: 50,
      y: 50,
    },
  });

  function createSequence(
    startTime,
    isHome,
    shouldScore,
    maxDuration,
    isLastScoring
  ) {
    const events = [];
    let currentTime = startTime;

    const startX = 30 + Math.random() * 40;
    const startY = 20 + Math.random() * 60;
    const remainingTime = maxDuration - currentTime;

    const minMovements = shouldScore ? 2 : 3;
    const maxMovements = shouldScore
      ? Math.min(5, Math.floor(remainingTime / 2))
      : Math.min(8, Math.floor(remainingTime / 3));

    const movementCount = Math.max(
      minMovements,
      Math.min(3 + Math.floor(Math.random() * 3), maxMovements)
    );

    let timePerMove;
    if (shouldScore) {
      const requiredTime = isLastScoring
        ? remainingTime
        : Math.min(remainingTime, 15);
      timePerMove = Math.max(1, requiredTime / (movementCount + 2));
    } else {
      timePerMove = Math.max(1, remainingTime / (movementCount + 1));
    }

    events.push({
      time: currentTime,
      type: "move",
      position: { x: startX, y: startY },
    });

    for (let i = 1; i < movementCount; i++) {
      currentTime += timePerMove;
      if (currentTime >= maxDuration) break;

      let targetX, targetY;

      if (shouldScore) {
        const progressRatio = i / movementCount;
        targetX = isHome
          ? startX + (95 - startX) * progressRatio
          : startX - (startX - 5) * progressRatio;
        targetY = 40 + Math.random() * 20;
      } else {
        const previousX = events[events.length - 1].position.x;
        const previousY = events[events.length - 1].position.y;

        const moveType = Math.random();
        if (moveType < 0.4) {
          targetX = Math.max(
            5,
            Math.min(95, previousX + (Math.random() - 0.5) * 30)
          );
          targetY = previousY + (Math.random() - 0.5) * 10;
        } else {
          targetX = Math.max(5, Math.min(95, 20 + Math.random() * 60));
          targetY = Math.max(5, Math.min(95, 20 + Math.random() * 60));
        }
      }

      events.push({
        time: currentTime,
        type: "move",
        position: { x: targetX, y: targetY },
      });
    }

    if (shouldScore && currentTime + timePerMove <= maxDuration) {
      currentTime += timePerMove;
      events.push({
        time: currentTime,
        type: "goal",
        position: { x: isHome ? 95 : 5, y: 50 },
        team: isHome ? "home" : "away",
      });

      if (currentTime + timePerMove <= maxDuration) {
        currentTime += timePerMove;
        events.push({
          time: currentTime,
          type: "move",
          position: { x: 50, y: 50 },
        });
      }
    }

    return { events, endTime: currentTime };
  }

  let currentTime = 0;
  let homeGoalsLeft = scores.home;
  let awayGoalsLeft = scores.away;

  if (totalGoals > 0) {
    const approxTimePerGoal = duration / (totalGoals + 1);

    while (homeGoalsLeft > 0 || awayGoalsLeft > 0) {
      const homeTeamAttacks =
        Math.random() < homeGoalsLeft / (homeGoalsLeft + awayGoalsLeft);
      const isLastScore = homeGoalsLeft + awayGoalsLeft === 1;

      // If we're approaching half time, delay the sequence to after half time
      if (currentTime < halfTime && currentTime + 15 > halfTime) {
        currentTime = halfTime + 5;
      }

      const sequence = createSequence(
        currentTime,
        homeTeamAttacks,
        true,
        duration,
        isLastScore
      );

      script.push(...sequence.events);

      if (homeTeamAttacks) homeGoalsLeft--;
      else awayGoalsLeft--;

      currentTime = sequence.endTime + Math.min(5, approxTimePerGoal * 0.2);
    }
  }

  while (currentTime < duration) {
    const isHome = Math.random() < 0.5;
    const remainingTime = duration - currentTime;

    // If we're approaching half time, delay the sequence to after half time
    if (currentTime < halfTime && currentTime + 10 > halfTime) {
      currentTime = halfTime + 5;
      continue;
    }

    if (remainingTime < 3) {
      script.push({
        time: currentTime,
        type: "move",
        position: { x: 45 + Math.random() * 10, y: 45 + Math.random() * 10 },
      });
      break;
    }

    const sequence = createSequence(
      currentTime,
      isHome,
      false,
      duration,
      false
    );
    script.push(...sequence.events);
    currentTime = sequence.endTime + Math.min(2, remainingTime * 0.1);
  }

  return script
    .filter((event) => event.time <= duration)
    .sort((a, b) => a.time - b.time);
}

const shuffleTeams = (teams) => {
  const shuffledTeams = [...teams];
  for (let i = shuffledTeams.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledTeams[i], shuffledTeams[j]] = [shuffledTeams[j], shuffledTeams[i]];
  }
  return shuffledTeams;
};

// Generate matches
const generateLeagueMatches = (league, round, startTime) => {
  const shuffledTeams = shuffleTeams(league.teams);
  const matches = [];

  // const matchId = Math.floor(10000000 + Math.random() * 90000000);
  // Ensure an even number of teams
  const teamsToPair =
    shuffledTeams.length % 2 === 0 ? shuffledTeams : shuffledTeams.slice(0, -1);

  for (let i = 0; i < teamsToPair.length; i += 2) {
    const fixtureDate = new Date(startTime); // Spread matches 10 mins apart
    const matchId = Math.random().toString(36).substring(2, 12);
    const targetScore = {
      home: Math.floor(Math.random() * 7),
      away: Math.floor(Math.random() * 7),
    };
    const script = generateGameScript(120, targetScore);

    matches.push({
      details: {
        fixture: {
          id: matchId,
          date: fixtureDate.getTime(),
          timestamp: fixtureDate.getTime(),
        },
        ...script,
        league: { ...league, teams: undefined },
        teams: {
          home: teamsToPair[i],
          away: teamsToPair[i + 1],
        },
        goals: targetScore,
      },
      type: "VIRTUAL",
      date: fixtureDate.getTime(),
      round,
      id: matchId,
    });
  }
  return matches;
};

// Schedule all leagues with a 2-minute gap
const scheduleAllLeagues = (leagues, now = Date.now(), round) => {
  const allMatches = [];
  leagues.forEach((league, index) => {
    const leagueStartTime = now + index * 2 * 60 * 1000; // 2 min after each other
    const leagueMatches = generateLeagueMatches(league, round, leagueStartTime);
    allMatches.push(...leagueMatches);
  });

  return allMatches;
};

// const getByJsonPointer = (obj, pointer) => {
//   return pointer.split("/").reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
// };

const checkWin = (userPrediction, matchScore, odds, stake) => {
  // Convert "totalGoals/over" → ["totalGoals", "over"]
  const predictionKeys = userPrediction.split("/");

  let currentOdds = odds;

  // Traverse nested keys to find the correct odds value
  for (let key of predictionKeys) {
    if (currentOdds[key] === undefined) return { won: false, payout: 0 };
    currentOdds = currentOdds[key];
  }

  // Validate the prediction
  const isWinningBet = validatePrediction(userPrediction, matchScore);

  // Calculate payout
  return isWinningBet
    ? { won: true, payout: stake * currentOdds, odd: currentOdds }
    : { won: false, payout: 0 };
};

// ✅ Updated function to validate different bet types
const validatePrediction = (userPrediction, matchScore) => {
  switch (userPrediction) {
    case "home":
      return matchScore.home > matchScore.away;
    case "away":
      return matchScore.away > matchScore.home;
    case "draw":
      return matchScore.home === matchScore.away;
    default:
      return false;
  }
};

exports.checkAndScore = async () => {
  try {
    const pastTime = Date.now() - 2 * 60 * 1000;

    const finished_matches = await Match.findAll({
      where: {
        scored: false,
        date: {
          [Op.lte]: pastTime,
        },
      },
    });

    let new_matches = [];

    if (finished_matches.length) {
      const [current_match, last_match] = await Promise.all([
        Match.findOne({
          where: {
            scored: false,
          },
          order: [["round", "ASC"]],
        }),
        Match.findOne({
          order: [["round", "DESC"]],
        }),
      ]);

      let diff = Number(last_match.round) - Number(current_match.round);

      console.log("diff==========>>>", diff);

      if (diff < 3) {
        console.log(
          "refill ==========================================================>>>>>>>>>",
          3 - diff
        );
        let prepared = [];
        for (let i = 0; i < 3 - diff; i++) {
          const new_schedule = scheduleAllLeagues(
            VIRTUAL_LEAGUES,
            prepared.length
              ? prepared[prepared.length - 1].date + 2 * 60 * 1000
              : Number(last_match?.date) + 4 * 60 * 1000,
            prepared.length
              ? prepared[prepared.length - 1].round + 1
              : Number(last_match?.round) + 1
          );

          console.log(new_schedule.length);
          console.log(new_schedule.map((mp) => mp.date));
          prepared.push(...new_schedule);
        }

        let contract_matches = [];
        for (let i = 0; i < prepared.length; i++) {
          const element = prepared[i];
          let match_construct = {
            inputed: true,
            id: cairo.felt(element.id),
            timestamp: Math.floor(element.details.fixture.timestamp / 1000),
            round: new CairoOption(CairoOptionVariant.Some, element.round),
            match_type: new CairoCustomEnum({ Virtual: {} }),
          };
          contract_matches.push(match_construct);
        }

        const grouped = Object.values(
          contract_matches.reduce((acc, obj) => {
            acc[obj.round.Some] = acc[obj.round.Some] || [];
            acc[obj.round.Some].push(obj);
            return acc;
          }, {})
        );

        for (let i = 0; i < grouped.length; i++) {
          const element = grouped[i];
          await register_matches(element);
        }

        // console.log(JSON.stringify(prepared, null, 2));
        await Match.bulkCreate(prepared);
        new_matches = prepared;
      }

      let rewards = [];

      let scores = finished_matches.map((mp) => {
        return {
          match_id: cairo.felt(mp.id),
          inputed: true,
          home: cairo.uint256(mp.getDetails(false).goals.home),
          away: cairo.uint256(mp.getDetails(false).goals.away),
        };
      });

      console.log(scores);

      const match_predictions = await get_matches_predictions(
        finished_matches.map((mp) => cairo.felt(mp.id))
      );
      for (let i = 0; i < match_predictions.length; i++) {
        const match = finished_matches.find(
          (fd) =>
            cairo.felt(fd.id) ===
            cairo.felt(match_predictions[i].prediction.match_id)
        );
        const prediction_detail = match_predictions[i];
        const check_win = checkWin(
          feltToString(prediction_detail.prediction.odds),
          match.details.goals,
          match.details.odds,
          formatUnits(prediction_detail.prediction.stake, 18)
        );
        if (check_win.won && Math.round(check_win.payout) > 0) {
          let reward_construct = {
            user: BigInt(prediction_detail.user.address.toString()),
            reward: parseUnits(Math.round(check_win.payout.toString())),
            point: check_win.odd,
            match_id: match.id,
          };

          rewards.push(reward_construct);
        }
      }

      console.log("rewards========>>>>", rewards, "<<<<<<<<<========= rewards");

      await register_scores(scores, rewards);

      /// call smart-contract

      await Promise.all(finished_matches.map((mp) => mp.destroy()));
    } else {
      const last_match = await Match.findOne({
        order: [["round", "DESC"]],
      });
      if (!last_match) {
        const last_round = await get_current_round();

        await this.initializeMatches(Number(last_round));
        console.log("INITIALIZED=================>>>>>>>>>>>>>");
      }
      console.log("OOOPPPSSS=================>>>>>>>>>>>>>");
    }

    return new_matches;
  } catch (error) {
    console.log("error");
    throw error;
  }
};

exports.initializeMatches = async (last_round = null) => {
  try {
    if (!last_round) {
      const find_match = await Match.findOne();
      if (find_match) {
        console.log("Nope");
        return;
      }
    }
    console.log("prepared");
    let prepared = [];

    for (let i = 0; i < 4; i++) {
      const new_schedule = scheduleAllLeagues(
        VIRTUAL_LEAGUES,
        prepared.length
          ? prepared[prepared.length - 1].date + 2 * 60 * 1000
          : Date.now() + 2 * 60 * 1000,
        prepared.length
          ? prepared[prepared.length - 1].round + 1
          : (last_round ?? i) + 1
      );

      prepared.push(...new_schedule);
    }
    let contract_matches = [];
    for (let i = 0; i < prepared.length; i++) {
      const element = prepared[i];
      let match_construct = {
        inputed: true,
        id: cairo.felt(element.id),
        timestamp: Number(Math.floor(element.details.fixture.timestamp / 1000)),
        round: new CairoOption(CairoOptionVariant.None),
        match_type: new CairoCustomEnum({ Virtual: {} }),
      };
      contract_matches.push(match_construct);
    }
    const grouped = Object.values(
      contract_matches.reduce((acc, obj) => {
        acc[obj.round.Some] = acc[obj.round.Some] || [];
        acc[obj.round.Some].push(obj);
        return acc;
      }, {})
    );

    for (let i = 0; i < grouped.length; i++) {
      const element = grouped[i];
      await register_matches(element);
    }

    await Match.bulkCreate(prepared);
  } catch (error) {
    console.log(error);
    throw error;
  }
};
