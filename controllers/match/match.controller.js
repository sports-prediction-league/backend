const { Match } = require("../../models");
const {
  cairo,
  CairoOption,
  CairoOptionVariant,
  CairoCustomEnum,
} = require("starknet");
const { Op } = require("sequelize");
const VIRTUAL_LEAGUES = require("../../config/virtual.json");
const {
  feltToString,
  formatUnits,
  parseUnits,
  findParentPath,
  flattenObject,
} = require("../../helpers/helpers");
const {
  register_scores,
  register_matches,
  get_current_round,
} = require("../contract/contract.controller");

/**
 * CONSTANTS
 */
const GAME_DURATION = 120; // Duration of a game in minutes
const MINUTES_BETWEEN_LEAGUES = 2; // Minutes between league schedules
const DEFAULT_MATCH_ROUNDS = 4; // Default number of match rounds to generate
const MIN_ODD = 1.1;
const MAX_ODD = 6.0;

/**
 * Match Service - Handles fetching and processing matches
 */
class MatchService {
  /**
   * Get match events by IDs
   * @param {Array} ids - Match IDs to fetch
   * @returns {Array} Matches with details
   */
  static async getMatchesEventsByIds(ids) {
    try {
      const matches = await Match.findAll({
        order: [["date", "ASC"]],
        where: {
          id: { [Op.in]: ids },
          date: { [Op.lte]: Date.now() },
          type: "VIRTUAL",
        },
      });

      return matches.map((match) => ({
        ...match.toJSON(),
        details: match.getDetails(match.date > Date.now()),
      }));
    } catch (error) {
      console.error("Error fetching matches by IDs:", error);
      return [];
    }
  }

  /**
   * API endpoint to get current matches
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async getMatches(req, res) {
    try {
      const now = Date.now();
      const matches = await Match.findAll({
        order: [["date", "ASC"]],
        where: {
          date: {
            [Op.gte]: now - 2 * 60 * 1000,
          },
          scored: false,
          type: "VIRTUAL",
        },
      });

      res.status(200).send({
        success: true,
        message: "Matches Fetched",
        data: {
          matches: {
            virtual: matches.map((match) => ({
              ...match.toJSON(),
              details: match.getDetails(match.date > now),
            })),
            live: [],
          },
        },
      });
    } catch (error) {
      console.error("Error fetching matches:", error);
      res.status(500).send({
        success: false,
        message: "Internal Server Error",
        data: {},
      });
    }
  }

  /**
   * Check and score completed matches
   * @returns {Array} Newly created matches
   */
  static async checkAndScore() {
    try {
      const pastTime = Date.now() - 2 * 60 * 1000;
      const finishedMatches = await Match.findAll({
        where: {
          scored: false,
          date: { [Op.lte]: pastTime },
        },
      });

      let newMatches = [];

      const [currentMatch, lastMatch] = await Promise.all([
        Match.findOne({
          where: { scored: false },
          order: [["round", "ASC"]],
        }),
        Match.findOne({
          order: [["createdAt", "DESC"]],
        }),
      ]);

      const diff =
        Number(lastMatch.round) -
        Number(currentMatch?.round ?? lastMatch.round);
      // Generate new matches if needed
      if (diff < 3) {
        newMatches = await this.generateAdditionalRounds(lastMatch, diff);
        console.log("INITIALIZED MATCHES");
      }

      if (finishedMatches.length) {
        // Process finished matches
        await this.processFinishedMatches(finishedMatches);
        console.log("SCORED MATCHES");
      }

      return newMatches;
    } catch (error) {
      console.error("Error in checkAndScore:", error);
      throw error;
    }
  }

  /**
   * Generate additional rounds of matches
   * @param {Object} lastMatch - The last match in the database
   * @param {Number} diff - Difference in rounds
   * @returns {Array} New matches
   */
  static async generateAdditionalRounds(lastMatch, diff) {
    try {
      let prepared = [];
      const currentRound = await get_current_round();

      for (let i = 0; i < 3 - diff; i++) {
        const startTime = prepared.length
          ? prepared[prepared.length - 1].date + 2 * 60 * 1000
          : Number(lastMatch?.date) + 4 * 60 * 1000 < Date.now()
          ? Date.now() + 4 * 60 * 1000
          : Number(lastMatch?.date) + 4 * 60 * 1000;

        const round = prepared.length
          ? prepared[prepared.length - 1].round + 1
          : Number(currentRound || 0) + 1;

        const newSchedule = GameGenerator.scheduleAllLeagues(
          VIRTUAL_LEAGUES,
          startTime,
          round
        );
        prepared.push(...newSchedule);
      }

      // Register matches with contract
      await this.registerMatchesWithContract(prepared);

      // Save to database
      await Match.bulkCreate(prepared);

      return prepared;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Process finished matches and register scores
   * @param {Array} finishedMatches - Array of finished matches
   */
  static async processFinishedMatches(finishedMatches) {
    const scores = finishedMatches.map((match) => {
      const matchDetails = match.getDetails(false);

      let winner_odds = [];
      if (Number(matchDetails.goals.home) > Number(matchDetails.goals.away)) {
        winner_odds.push(cairo.felt(matchDetails.odds.home.id));
      } else if (
        Number(matchDetails.goals.home) < Number(matchDetails.goals.away)
      ) {
        winner_odds.push(cairo.felt(matchDetails.odds.away.id));
      } else {
        winner_odds.push(cairo.felt(matchDetails.odds.draw.id));
      }
      return {
        match_id: cairo.felt(match.id),
        inputed: true,
        home: Number(matchDetails.goals.home),
        away: Number(matchDetails.goals.away),
        winner_odds,
      };
    });

    console.log("Processing scores:", scores);

    // Register scores and rewards with contracts
    await register_scores(scores);

    // Remove processed matches
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000; // 1 day ago
    const matchUpdate = Match.update(
      { scored: true },
      {
        where: {
          id: {
            [Op.in]: finishedMatches.map((match) => match.id),
          },
        },
      }
    );
    const deleteMatch = Match.destroy({
      where: {
        date: {
          [Op.lte]: oneDayAgo, // Matches 1 day or more old
        },
      },
    });

    await Promise.all([matchUpdate, deleteMatch]);
    // await Promise.all(
    //   finishedMatches.map((match) => match.update({ scored: true }))
    // );
  }

  /**
   * Calculate rewards for predictions
   * @param {Array} matchPredictions - Match predictions from contract
   * @param {Array} finishedMatches - Finished match objects
   * @returns {Array} Rewards to be distributed
   */
  static calculateRewards(matchPredictions, finishedMatches) {
    const rewards = [];

    for (const prediction of matchPredictions) {
      const match = finishedMatches.find(
        (match) =>
          cairo.felt(match.id) === cairo.felt(prediction.prediction.match_id)
      );

      if (!match) continue;

      const predictionId = feltToString(prediction.prediction.id);
      const stake = formatUnits(prediction.prediction.stake, 18);

      const result = BettingValidator.checkWin(
        predictionId,
        match.details.goals,
        match.details.odds,
        stake
      );

      if (result.won && Math.round(result.payout) > 0) {
        rewards.push({
          user: BigInt(prediction.user.address.toString()),
          reward: parseUnits(Math.round(result.payout.toString())),
          point: result.odd,
          match_id: match.id,
        });
      }
    }

    return rewards;
  }

  static decimalToScaledInt(str, decimals = 2) {
    const [whole, frac = ""] = str.split(".");
    const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
    return BigInt(whole + fracPadded);
  }

  /**
   * Initialize matches for a new league
   * @param {Number} lastRound - Last round number
   */
  static async initializeMatches(lastRound = null) {
    try {
      if (!lastRound) {
        const currentRound = await get_current_round();
        if (Number(currentRound) > 0) {
          console.log("Matches already initialized");
          return;
        }
      }

      let prepared = [];

      for (let i = 0; i < DEFAULT_MATCH_ROUNDS; i++) {
        const startTime = prepared.length
          ? prepared[prepared.length - 1].date + 2 * 60 * 1000
          : Date.now() + 2 * 60 * 1000;

        const round = prepared.length
          ? prepared[prepared.length - 1].round + 1
          : (lastRound ?? i) + 1;

        const newSchedule = GameGenerator.scheduleAllLeagues(
          VIRTUAL_LEAGUES,
          startTime,
          round
        );
        prepared.push(...newSchedule);
      }

      await this.registerMatchesWithContract(prepared);
      await Match.bulkCreate(prepared);
    } catch (error) {
      console.error("Error initializing matches:", error);
      throw error;
    }
  }

  /**
   * Register matches with blockchain contract
   * @param {Array} matches - Matches to register
   */
  static async registerMatchesWithContract(matches) {
    try {
      const contractMatches = matches.map((match) => {
        let odds = [];
        for (let i = 0; i < Object.keys(match.details.odds).length; i++) {
          const element = Object.keys(match.details.odds)[i];
          const odd_details = match.details.odds[element];
          odds.push({
            id: cairo.felt(odd_details.id),
            value: cairo.uint256(
              this.decimalToScaledInt(
                Number(odd_details.odd).toFixed(2).toString(),
                2
              )
            ),
          });
        }
        return {
          id: cairo.felt(match.id),
          timestamp: Math.floor(match.details.fixture.timestamp / 1000),
          round: new CairoOption(CairoOptionVariant.Some, match.round),
          home: new CairoCustomEnum({
            Team: {
              id: cairo.felt(match.details.teams.home.id),
              goals: new CairoOption(CairoOptionVariant.None),
            },
          }),
          away: new CairoCustomEnum({
            Team: {
              id: cairo.felt(match.details.teams.away.id),
              goals: new CairoOption(CairoOptionVariant.None),
            },
          }),
          match_type: new CairoCustomEnum({ Virtual: {} }),
          odds,
        };
      });

      // Group by round
      const grouped = Object.values(
        contractMatches.reduce((acc, obj) => {
          const roundKey = obj.round.Some || "None";
          acc[roundKey] = acc[roundKey] || [];
          acc[roundKey].push(obj);
          return acc;
        }, {})
      );

      //  Register matches by round
      for (const roundMatches of grouped) {
        await register_matches(roundMatches);
      }

      // const { account } = get_provider_and_account();

      // const tx = await account.execute(grouped);

      // await account.waitForTransaction(tx.transaction_hash);
    } catch (error) {
      throw error;
    }
  }
}

/**
 * BettingValidator - Validates bets and predictions
 */
class BettingValidator {
  /**
   * Check if a prediction is a winning bet
   * @param {String} predictionId - Prediction ID
   * @param {Object} matchScore - Match score object
   * @param {Object} odds - Odds object
   * @param {Number} stake - Bet stake
   * @returns {Object} Result object with won status and payout
   */
  static checkWin(predictionId, matchScore, odds, stake) {
    const path = findParentPath(odds, predictionId);
    const currentOdds = flattenObject(odds)[predictionId];

    if (path === null || !currentOdds) {
      return { won: false, payout: 0 };
    }

    // Validate the prediction
    const isWinningBet = this.validatePrediction(path, matchScore);

    return isWinningBet
      ? { won: true, payout: stake * currentOdds, odd: Number(currentOdds) }
      : { won: false, payout: 0 };
  }

  /**
   * Validate different bet types
   * @param {String} userPrediction - User's prediction type
   * @param {Object} matchScore - Match score object
   * @returns {Boolean} Whether prediction is correct
   */
  static validatePrediction(userPrediction, matchScore) {
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
  }
}

/**
 * GameGenerator - Generates virtual games and odds
 */
class GameGenerator {
  /**
   * Calculate prediction odds
   * @returns {Object} Odds object
   */
  static calculatePredictionOdds() {
    // Function heavily skewed toward generating values below 2.0
    const getRandomOdd = (min = MIN_ODD, max = MAX_ODD) => {
      // Multiple approaches to ensure low values dominate
      const approach = Math.floor(Math.random() * 5);
      let value;

      switch (approach) {
        case 0:
          // Exponential distribution - heavily weights toward minimum
          value = min + (max - min) * Math.pow(Math.random(), 4.5);
          break;

        case 1:
          // Logistic function centered around 1.7
          const x = Math.random() * 6 - 3; // Range from -3 to 3
          const logistic = 1 / (1 + Math.exp(-x));
          // Scale to be mostly below 2.0
          value = min + logistic * (2.2 - min);
          break;

        case 2:
          // Direct manipulation - 85% chance of below 2.0
          if (Math.random() < 0.85) {
            // Generate in range [min, 2.0)
            value = min + Math.random() * (2.0 - min);
          } else {
            // Generate in range [2.0, max)
            value = 2.0 + Math.random() * (max - 2.0);
          }
          break;

        case 3:
          // Square root transformation skewed toward low values
          const r = Math.random();
          // Apply stronger transformation to further bias toward lower values
          value = min + Math.sqrt(r) * (2.0 - min) * 0.9;
          break;

        case 4:
          // Beta-like distribution peaking around 1.3 to 1.8
          const u = Math.random();
          const v = Math.random();
          // Beta(2,5)-like shape - peaks below 2.0 and falls off rapidly
          const beta = Math.pow(u, 1.5) * Math.pow(1 - v, 4);
          value = min + beta * (max - min) * 1.5;
          // Extra clamp for outliers
          value = Math.min(value, max);
          break;
      }

      // Extra safety bias - 25% chance to force below 2.0 if still high
      if (value >= 2.0 && Math.random() < 0.25) {
        value = min + Math.random() * (2.0 - min);
      }

      // Random precision (1 or 2 decimal places)
      const precision = Math.random() > 0.5 ? 2 : 1;
      return parseFloat(value.toFixed(precision));
    };

    // Generate unique IDs
    const generateId = () => Math.random().toString(36).substring(2, 12);

    // Create odds with significant bias toward low values
    return {
      home: {
        odd: getRandomOdd(),
        id: generateId(),
      },
      away: {
        odd: getRandomOdd(),
        id: generateId(),
      },
      draw: {
        odd: getRandomOdd(),
        id: generateId(),
      },
    };
  }

  /**
   * Generate game script with odds
   * @param {Number} duration - Game duration
   * @param {Object} scores - Game scores
   * @returns {Object} Game script with events and odds
   */
  static generateGameScript(duration = GAME_DURATION, scores) {
    const script = this.generateBaseGameScript(duration, scores);
    const odds = this.calculatePredictionOdds();

    return {
      events: script,
      odds,
    };
  }

  /**
   * Generate base game script
   * @param {Number} duration - Game duration
   * @param {Object} scores - Game scores
   * @returns {Array} Game events
   */
  static generateBaseGameScript(duration = GAME_DURATION, scores) {
    const script = [];
    const totalGoals = scores.home + scores.away;
    const halfTime = duration / 2;

    // Add second half event
    script.push({
      time: halfTime,
      type: "second-half",
      position: { x: 50, y: 50 },
    });

    let currentTime = 0;
    let homeGoalsLeft = scores.home;
    let awayGoalsLeft = scores.away;

    if (totalGoals > 0) {
      const approxTimePerGoal = duration / (totalGoals + 1);

      while (homeGoalsLeft > 0 || awayGoalsLeft > 0) {
        const homeTeamAttacks =
          Math.random() < homeGoalsLeft / (homeGoalsLeft + awayGoalsLeft);
        const isLastScore = homeGoalsLeft + awayGoalsLeft === 1;

        // If approaching half time, delay to after half time
        if (currentTime < halfTime && currentTime + 15 > halfTime) {
          currentTime = halfTime + 5;
        }

        const sequence = this.createSequence(
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

    // Fill in remaining time with non-scoring moves
    while (currentTime < duration) {
      const isHome = Math.random() < 0.5;
      const remainingTime = duration - currentTime;

      // If approaching half time, delay to after half time
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

      const sequence = this.createSequence(
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

  /**
   * Create a sequence of game events
   * @param {Number} startTime - Start time of sequence
   * @param {Boolean} isHome - Whether home team is attacking
   * @param {Boolean} shouldScore - Whether sequence should end with goal
   * @param {Number} maxDuration - Maximum duration of game
   * @param {Boolean} isLastScoring - Whether this is the last scoring sequence
   * @returns {Object} Events and end time
   */
  static createSequence(
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

  /**
   * Shuffle teams for matchmaking
   * @param {Array} teams - Teams array
   * @returns {Array} Shuffled teams
   */
  static shuffleTeams(teams) {
    const shuffledTeams = [...teams];
    for (let i = shuffledTeams.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledTeams[i], shuffledTeams[j]] = [
        shuffledTeams[j],
        shuffledTeams[i],
      ];
    }
    return shuffledTeams;
  }

  /**
   * Generate league matches
   * @param {Object} league - League object
   * @param {Number} round - Round number
   * @param {Number} startTime - Start time
   * @returns {Array} Generated matches
   */
  static generateLeagueMatches(league, round, startTime) {
    const shuffledTeams = this.shuffleTeams(league.teams);
    const matches = [];

    // Ensure even number of teams
    const teamsToPair =
      shuffledTeams.length % 2 === 0
        ? shuffledTeams
        : shuffledTeams.slice(0, -1);

    for (let i = 0; i < teamsToPair.length; i += 2) {
      const fixtureDate = new Date(startTime);

      const matchId = Math.random().toString(36).substring(2, 12);
      const targetScore = {
        home: Math.floor(Math.random() * 7),
        away: Math.floor(Math.random() * 7),
      };
      const script = this.generateGameScript(GAME_DURATION, targetScore);

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
  }

  /**
   * Schedule all leagues
   * @param {Array} leagues - Leagues array
   * @param {Number} now - Current timestamp
   * @param {Number} round - Round number
   * @returns {Array} All matches
   */
  static scheduleAllLeagues(leagues, now = Date.now(), round) {
    const allMatches = [];
    leagues.forEach((league, index) => {
      const leagueStartTime = now + index * MINUTES_BETWEEN_LEAGUES * 60 * 1000;
      const leagueMatches = this.generateLeagueMatches(
        league,
        round,
        leagueStartTime
      );
      allMatches.push(...leagueMatches);
    });

    return allMatches;
  }
}

// Export public methods for API routes
module.exports = {
  getMatchesEventsByIds: MatchService.getMatchesEventsByIds.bind(MatchService),
  getMatches: MatchService.getMatches.bind(MatchService),
  checkAndScore: MatchService.checkAndScore.bind(MatchService),
  initializeMatches: MatchService.initializeMatches.bind(MatchService),
};
