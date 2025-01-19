const axios = require("axios");
const { User } = require("../../models");
const is_production = process.env.NODE_ENV === "production";
const BOT_TOKEN = is_production
  ? process.env.PROD_BOT_TOKEN
  : process.env.NODE_ENV === "test"
  ? process.env.TEST_BOT_TOKEN
  : process.env.DEV_BOT_TOKEN;

const process_image = async (userId, type) => {
  try {
    const profilePhotosResponse = await axios.get(
      is_production
        ? `https://api.telegram.org/bot${BOT_TOKEN}/getUserProfilePhotos?user_id=${userId}`
        : `https://api.telegram.org/bot${BOT_TOKEN}/test/getUserProfilePhotos?user_id=${userId}`
    );
    if (profilePhotosResponse.data.result.total_count > 0) {
      const fileId = profilePhotosResponse.data.result.photos[0][0].file_id;

      const fileResponse = await axios.get(
        is_production
          ? `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`
          : `https://api.telegram.org/bot${BOT_TOKEN}/test/getFile?file_id=${fileId}`
      );

      const filePath = fileResponse.data.result.file_path;

      const photoResponse = await axios({
        url: is_production
          ? `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`
          : `https://api.telegram.org/file/bot${BOT_TOKEN}/test/${filePath}`,
        method: "GET",
        responseType: type, // Stream the file content
      });

      return photoResponse;
    }
  } catch (error) {
    throw error;
  }
};

exports.get_profile_pic = async (req, res) => {
  try {
    const userId = req.query.userId;
    const user = await User.findOne({
      where: {
        id: userId,
      },
    });

    if (!user) {
      return res
        .status(400)
        .send({ success: false, message: "User not found" });
    }

    res.status(200).send({ success: true, data: user });
    // const photoResponse = await process_image(userId, "stream");
    // if (!photoResponse) {
    //   res.status(500).send({
    //     success: false,
    //     message: "Invalid response data: Unable to pipe to response.",
    //     data: {},
    //   });
    //   return;
    // }
    // photoResponse?.data.pipe(res);
  } catch (error) {
    console.log(error);
    res.status(500).send({ success: false, message: "server error", data: {} });
  }
};

exports.get_leaderboard_images = async (_, res) => {
  try {
    // let response = [];

    const users = await User.findAll({
      order: [["createdAt", "ASC"]],
    });

    // for (let i = 0; i < users.length; i++) {
    //   const element = users[i];
    //   const photoResponse = await process_image(element.id, "arraybuffer");
    //   if (photoResponse) {
    //     const base64 = Buffer.from(photoResponse.data, "binary").toString(
    //       "base64"
    //     );
    //     response.push({
    //       username: element.username,
    //       image: base64,
    //     });
    //   }
    // }

    res.status(200).send({ success: true, message: "Fetched", data: users });
  } catch (error) {
    console.log(error);
    res.status(500).send({ success: false, message: "server error", data: {} });
  }
};

exports.register_user = async (msg) => {
  try {
    const user = await User.findByPk(msg.from.id.toString());

    if (!user) {
      let profile_picture = null;
      const photoResponse = await process_image(
        msg.from.id.toString(),
        "arraybuffer"
      );
      if (photoResponse) {
        const base64 = Buffer.from(photoResponse.data, "binary").toString(
          "base64"
        );
        profile_picture = base64;
      }

      await User.create({
        username: msg.from.username,
        id: msg.from.id.toString(),
        chatId: msg.chat.id.toString(),
        profile_picture,
      });
    }
  } catch (error) {
    console.log(error);
  }
};

exports.get_user_by_id = async (id) => {
  try {
    const user = await User.findByPk(id.toString());
    return user;
  } catch (error) {
    console.log(error);
  }
};
