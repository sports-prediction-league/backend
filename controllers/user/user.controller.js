const axios = require("axios");
const { User } = require("../../models");
const BOT_TOKEN =
  process.env.NODE_ENV === "production"
    ? process.env.BOT_TOKEN
    : process.env.TEST_BOT_TOKEN;
exports.get_profile_pic = async (req, res) => {
  try {
    const userId = req.query.userId;
    const profilePhotosResponse = await axios.get(
      `https://api.telegram.org/bot${BOT_TOKEN}/getUserProfilePhotos?user_id=${userId}`
    );
    if (profilePhotosResponse.data.result.total_count > 0) {
      const fileId = profilePhotosResponse.data.result.photos[0][0].file_id;

      const fileResponse = await axios.get(
        `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`
      );

      const filePath = fileResponse.data.result.file_path;

      const photoResponse = await axios({
        url: `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`,
        method: "GET",
        responseType: "stream", // Stream the file content
      });

      photoResponse.data.pipe(res);
    }
  } catch (error) {
    console.log(error);
    res.status(500).send("server error");
  }
};

exports.register_user = async (msg) => {
  try {
    const user = await User.findByPk(msg.from.id.toString());

    if (!user) {
      await User.create({
        username: msg.from.username,
        id: msg.from.id.toString(),
      });
    }
  } catch (error) {
    console.log(error);
  }
};
