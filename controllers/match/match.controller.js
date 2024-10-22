const axios = require("axios");
const { Match } = require("../../models");
const formatDateFromString = (dateString) => {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0"); // getMonth() is zero-based
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

async function get_matches(date) {
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

exports.set_next_matches = async (callback, current_round) => {
  try {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const response = await get_matches(tomorrow.toString());

    let structure = [];

    if (response.data?.response?.length) {
      for (let i = 0; i < response.data.response.length && i < 100; i++) {
        const element = response.data.response[i];
        await Match.create({
          id: element.fixture.id.toString(),
          date: element.fixture.date,
          round: current_round + 1,
          details: {
            fixture: element.fixture,
            league: element.league,
            teams: element.teams,
          },
        });

        structure.push({
          inputed: true,
          id: element.fixture.id.toString().trim(),
          timestamp: Math.floor(
            new Date(element.fixture.date).getTime() / 1000
          ),
        });
      }
    }

    callback({ success: true, msg: "Matches pulled", data: structure });
  } catch (error) {
    callback({ success: false, msg: JSON.stringify(error), data: {} });
  }
};

exports.set_scores = async (callback, current_round) => {
  try {
    const matches = await Match.findAll({
      where: {
        round: current_round,
      },
    });

    let broken = false;
    let structure = [];

    if (matches.length) {
      const match = matches[0];
      const response = await get_matches(match.date);
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
    if (broken) return;
    await callback({ success: true, msg: "Scored pulled", data: structure });
  } catch (error) {
    await callback({ success: false, msg: JSON.stringify(error), data: {} });
  }
};
