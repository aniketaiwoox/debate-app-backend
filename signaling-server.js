const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["https://aiwoox.in"],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const userSocketMap = {}; // Maps userId -> socket.id
const callReadyMap = {}; // matchId -> Set of userIds

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("register", (userId) => {
    userSocketMap[userId] = socket.id;
    console.log(`User registered: ${userId} => ${socket.id}`);
  });

  socket.on("ready-for-call", ({ userId, partnerId }) => {
    const roomId = [userId, partnerId].sort().join("_"); // consistent for both users
    console.log(`[SIGNAL] ${userId} ready for room ${roomId}`);

    if (!callReadyMap[roomId]) callReadyMap[roomId] = new Set();
    callReadyMap[roomId].add(userId);

    if (callReadyMap[roomId].size === 2) {
      callReadyMap[roomId].forEach((uid) => {
        const sid = userSocketMap[uid];
        if (sid) {
          console.log(
            `[SIGNAL] Both ready for room ${roomId}, notifying clients`
          );
          io.to(sid).emit("both-ready");
        }
      });
    }
  });

  socket.on("call-user", ({ to, offer, from }) => {
    const targetSocketId = userSocketMap[to];
    if (targetSocketId) {
      io.to(targetSocketId).emit("incoming-call", { from, offer });
    }
  });

  socket.on("answer-call", ({ to, answer }) => {
    const targetSocketId = userSocketMap[to];
    if (targetSocketId) {
      io.to(targetSocketId).emit("call-answered", { answer });
    }
  });

  socket.on("ice-candidate", ({ to, candidate }) => {
    const targetSocketId = userSocketMap[to];
    if (targetSocketId) {
      io.to(targetSocketId).emit("ice-candidate", { candidate });
    }
  });

  socket.on("end-call", ({ to }) => {
    const targetSocketId = userSocketMap[to];
    if (targetSocketId) {
      io.to(targetSocketId).emit("call-ended");
    }
  });

  socket.on("disconnect", () => {
    const userId = Object.keys(userSocketMap).find(
      (key) => userSocketMap[key] === socket.id
    );
    if (userId) {
      delete userSocketMap[userId];
      console.log(`User disconnected: ${userId}`);

      // Cleanup callReadyMap entries
      for (const roomId in callReadyMap) {
        callReadyMap[roomId].delete(userId);
        if (callReadyMap[roomId].size === 0) {
          delete callReadyMap[roomId];
        }
      }
    }
    });
});

const PORT = 5050;
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});
