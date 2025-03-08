const { Server } = require("socket.io");
const { get_matches_events } = require("../controllers/match/match.controller");

class ServerSocket {
  /** Master list of all connected users */

  constructor(server) {
    ServerSocket.instance = this;
    this.io = new Server(server, {
      serveClient: false,
      pingInterval: 10000,
      pingTimeout: 5000,
      cookie: false,
      cors: {
        origin: "*",
      },
    });

    this.io.on("connect", this.StartListeners);
  }

  StartListeners = (socket) => {
    console.info("Message received from " + socket.id);

    socket.on("match-events-request", async (ids) => {
      let matches = await get_matches_events(ids);
      socket.emit("match-events-response", matches);
    });
    // socket.emit('me', socket.id)
    // socket.on("handshake", async ({ userId }) => {
    //   if (userId) {
    //     const user = await UserEntity.getUserByCustomArgs({
    //       where: {
    //         uid: userId,
    //       },
    //       attributes: {
    //         exclude: [
    //           "password",
    //           "updatedAt",
    //           "createdAt",
    //           "wallet",
    //           "subscriptionExpiry",
    //           "suspended",
    //           "seen",
    //           "otp",
    //         ],
    //       },
    //     });
    //     if (user) {
    //       const rawVideos = await PostService.getAllPostsVideos(userId, 0, 10);
    //       const rawTestimonies = await TestimonyService.getAllTestimonies(
    //         0,
    //         10
    //       );
    //       const testimonies = rawTestimonies?.data?.rows?.map((mp) => {
    //         return {
    //           ...mp.dataValues,
    //           user: {
    //             ...mp.dataValues.user.dataValues,
    //             topics: mp.dataValues.user.dataValues.topics?.split(";"),
    //             password: undefined,
    //             createdAt: undefined,
    //             updatedAt: undefined,
    //             wallet: undefined,
    //             subscriptionExpiry: undefined,
    //             suspended: undefined,
    //             seen: undefined,
    //             otp: undefined,
    //           },
    //           createdAt: undefined,
    //           updatedAt: undefined,
    //           id: undefined,
    //           userId: undefined,
    //         };
    //       });
    //       const videos =
    //         rawVideos?.data?.rows?.map((mp) => {
    //           return {
    //             ...mp.dataValues,
    //             media_url: [mp.dataValues.media_url],
    //             user: {
    //               ...mp.dataValues.user.dataValues,
    //               topics: mp.dataValues.user.dataValues.topics?.split(";"),
    //               password: undefined,
    //               createdAt: undefined,
    //               updatedAt: undefined,
    //               wallet: undefined,
    //               subscriptionExpiry: undefined,
    //               suspended: undefined,
    //               seen: undefined,
    //               otp: undefined,
    //             },
    //             createdAt: undefined,
    //             suspended: undefined,
    //             updatedAt: undefined,
    //             promotionExpiresAt: undefined,
    //             promotionPrice: undefined,
    //           };
    //         }) ?? [];

    //       socket.join(userId);
    //       this.userJoin(
    //         {
    //           ...user.dataValues,
    //           topics: user.dataValues.topics?.split(";"),
    //           password: undefined,
    //           createdAt: undefined,
    //           updatedAt: undefined,
    //           wallet: undefined,
    //           subscriptionExpiry: undefined,
    //           suspended: undefined,
    //           seen: undefined,
    //           otp: undefined,
    //         },
    //         userId,
    //         socket.id
    //       );
    //       socket.broadcast.emit("new-connection", {
    //         ...user.dataValues,
    //         topics: user.dataValues.topics?.split(";"),
    //         password: undefined,
    //         createdAt: undefined,
    //         updatedAt: undefined,
    //         wallet: undefined,
    //         subscriptionExpiry: undefined,
    //         suspended: undefined,
    //         seen: undefined,
    //         otp: undefined,
    //       });
    //       socket.emit("handshake", {
    //         activeUsers: {
    //           count: this.activeUsers.length,
    //           rows: this.activeUsers.slice(0, 50),
    //         },
    //         featuredVideos: videos,
    //         testimonies: testimonies ?? [],
    //         socketId: socket.id,
    //       });
    //     }
    //   }
    // });
    // socket.on("post-like", async ({ postId, userId, type }) => {
    //   await PostService.likePost(postId, userId, type);
    // });

    // socket.on("poll-vote", async ({ postId, voterId, option }) => {
    //   await PostService.votePoll(postId, voterId, option);
    // });

    // socket.on("post-save", async ({ postId, userId }) => {
    //   await PostService.savePost(postId, userId);
    // });

    // socket.on("repost", async ({ postId, userId, post }) => {
    //   await PostService.repost(postId, userId, post);
    // });

    // socket.on("toggle-user-chat-status", async ({ toggglevalue, userId }) => {
    //   await UsersService.updateUser(userId, {
    //     user_to_user_chat: toggglevalue,
    //   });
    // });

    // socket.on(
    //   "comment",
    //   async ({
    //     postId,
    //     posterId,
    //     content,
    //     date,
    //     type,
    //     id,
    //     media,
    //     filename,
    //   }) => {
    //     await CommentService.addComment({
    //       postId,
    //       posterId,
    //       content,
    //       date,
    //       type,
    //       id,
    //       media,
    //       filename,
    //     });
    //   }
    // );

    // socket.on("new-message", async (data) => {
    //   // const { message, type, chat_id, senderUid, receiverUid, date, user } = data
    //   await ChatService.sendMessage(data);
    //   this.io.to(data.receiverUid).emit("new-message", data);
    //   this.io.to(data.senderUid).emit("sync-message", {
    //     ...data,
    //     user: data.sender,
    //     sender: undefined,
    //     socketId: socket.id,
    //   });
    // });

    // socket.on("bulk-message", async (data) => {
    //   // const { message, type, chat_id, senderUid, receiverUid, date, user } = data
    //   for (let index = 0; index < data.receiversUid.length; index++) {
    //     const receiverUid = data.receiversUid[index];

    //     await ChatService.sendMessage({
    //       ...data,
    //       chat_id: data.chatIds[index],
    //       receiverUid,
    //       senders: undefined,
    //       users: undefined,
    //       receiversUid: undefined,
    //     });
    //     this.io.to(data.receiverUid).emit("new-message", {
    //       ...data,
    //       chat_id: data.chatIds[index],
    //       receiverUid,
    //       senders: undefined,
    //       users: undefined,
    //       receiversUid: undefined,
    //     });
    //     this.io.to(data.senderUid).emit("sync-message", {
    //       ...data,
    //       chat_id: data.chatIds[index],
    //       receiverUid,
    //       user: data.senders[index],
    //       socketId: socket.id,
    //       senders: undefined,
    //       users: undefined,
    //       receiversUid: undefined,
    //     });
    //   }
    // });

    // socket.on("rate-professional", async (data) => {
    //   const { proId, ratedBy, rate } = data;
    //   await UsersService.rateProfessional(proId, ratedBy, rate);
    // });

    // socket.on("delete-notification", async (id) => {
    //   await NotificationService.delete(id);
    // });

    // socket.on("wall-interest", async ({ userId, wall }) => {
    //   await WallService.toggleWallInterest(userId, wall);
    // });

    // socket.on("wall-like", async ({ userId, wall }) => {
    //   await WallService.toggleWallLike(userId, wall);
    // });

    // socket.on("block", async ({ userId, blockId }) => {
    //   await BlockService.block(userId, blockId);
    // });

    // socket.on("toggle-follow", async ({ userId, unfollowId }) => {
    //   await UnfollowService.followToggle(userId, unfollowId);
    // });

    // socket.on("seen-message", async ({ senderUid, receiverUid }) => {
    //   await ChatService.seenMessage(senderUid, receiverUid);
    // });

    // socket.on(
    //   "react-message",
    //   async ({ userId, reaction, messageId, data }) => {
    //     await ChatService.messageReact(userId, reaction, messageId);
    //     this.io
    //       .to(data.receiverUid == userId ? data.senderUid : data.receiverUid)
    //       .emit("new-message-reaction", data);
    //     this.io.to(userId).emit("sync-message-reaction", {
    //       ...data,
    //       user: data.sender,
    //       sender: undefined,
    //       socketId: socket.id,
    //     });
    //   }
    // );

    // socket.on("call-user", ({ caller, calleeId, roomId }) => {
    //   this.io.to(calleeId).emit("call-user", { caller, roomId });
    // });

    // socket.on("answerCall", (data) => {
    //     this.io.to(data.to).emit("callAccepted", data.signal)
    // })

    socket.on("disconnect", () => {
      //   console.info("Disconnect received from: " + socket.id);
      //   this.leave();
      //   this.io.emit("activeUsers", this.activeUsers);
    });
  };

  //   userJoin(user, userId, socket_id) {
  //     const check = this.activeUsers.find((fd) => fd.uid === userId);
  //     if (!check) {
  //       this.activeUsers.push({ ...user, socket_id });
  //     }
  //     // console.log(this.activeUsers)
  //   }

  //   leave(socket_id) {
  //     const index = this.activeUsers.findIndex((fd) => fd.socket_id == socket_id);
  //     this.activeUsers.splice(index, 1);
  //     // console.log(this.activeUsers)
  //   }
}

module.exports = ServerSocket;
