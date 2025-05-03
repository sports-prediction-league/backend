const { TwitterApi } = require("twitter-api-v2");

class Twitter {
  constructor() {
    this.client = new TwitterApi({
      appKey: process.env.TWITTER_APP_KEY,
      appSecret: process.env.TWITTER_APP_SECRET,
      accessSecret: process.env.TWITTER_ACCESS_SECRET,
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
    });
  }

  async postTweet(text) {
    try {
      const result = await this.client.v2.tweet(text);
      console.log("Tweet successful:", result);
      return result;
    } catch (error) {
      console.error("Error posting tweet:", error);
      throw error;
    }
  }
}

module.exports = Twitter;
