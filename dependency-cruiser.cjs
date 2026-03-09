module.exports = {
  forbidden: [
    {
      name: "no-service-import-pokerroom",
      comment: "Room services must not import PokerRoom directly",
      severity: "error",
      from: {
        path: "^src/rooms/room/(features/.*|PokerRoomAuthAdapter\\.ts|PokerRoomJoinService\\.ts|PokerRoomLeaveService\\.ts|PokerRoomLifecycle\\.ts|PokerRoomMessageRouter\\.ts|PokerRoomSessionManager\\.ts)$",
      },
      to: {
        path: "^src/rooms/PokerRoom\\.ts$",
      },
    },
  ],
};

