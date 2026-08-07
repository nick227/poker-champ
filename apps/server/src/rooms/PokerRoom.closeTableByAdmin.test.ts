import { describe, expect, it, vi } from "vitest";
import { PokerRoom } from "./PokerRoom.js";
import { PokerState } from "../state/PokerState.js";
import { PlayerState } from "../state/PlayerState.js";

/**
 * Unit tests for PokerRoom.closeTableByAdmin(), the room-level RPC backing
 * the admin `/api/admin/tables/:roomId/close` route. Mirrors the lightweight
 * "new PokerRoom() as any, stub the collaborators" style already used by
 * session-policy.test.ts for kickUserByAdmin, so this stays isolated from
 * full onCreate()/Colyseus server wiring.
 */
describe("PokerRoom.closeTableByAdmin", () => {
  function makePlayer(id: string, kind: "HUMAN" | "BOT", seat: number): PlayerState {
    const player = new PlayerState();
    player.id = id;
    player.kind = kind;
    player.seat = seat;
    return player;
  }

  it("kicks every seated human player, purges bots, and disconnects the room", async () => {
    const room = new PokerRoom() as any;
    room.state = new PokerState();
    room.state.playersById.set("u1", makePlayer("u1", "HUMAN", 0));
    room.state.playersById.set("u2", makePlayer("u2", "HUMAN", 1));
    room.state.playersById.set("bot_1", makePlayer("bot_1", "BOT", 2));

    const kickUserByAdmin = vi.fn().mockResolvedValue(undefined);
    room.kickUserByAdmin = kickUserByAdmin;
    room.updateMetadataCounts = vi.fn();
    room.clients = [];
    room.disconnect = vi.fn();

    const result = await room.closeTableByAdmin("ADMIN_CLOSED");

    expect([...result.kickedUserIds].sort()).toEqual(["u1", "u2"]);
    expect(kickUserByAdmin).toHaveBeenCalledTimes(2);
    expect(kickUserByAdmin).toHaveBeenCalledWith("u1", "ADMIN_CLOSED");
    expect(kickUserByAdmin).toHaveBeenCalledWith("u2", "ADMIN_CLOSED");

    // Bots are synthetic and are purged directly rather than kicked.
    expect(kickUserByAdmin).not.toHaveBeenCalledWith("bot_1", expect.anything());
    expect(room.state.playersById.has("bot_1")).toBe(false);

    expect(room.disconnect).toHaveBeenCalledTimes(1);
    expect(room.isDeletingInternal).toBe(true);
  });

  it("defaults the kick reason to ADMIN_CLOSED and works with an empty table", async () => {
    const room = new PokerRoom() as any;
    room.state = new PokerState();

    const kickUserByAdmin = vi.fn().mockResolvedValue(undefined);
    room.kickUserByAdmin = kickUserByAdmin;
    room.updateMetadataCounts = vi.fn();
    room.clients = [];
    room.disconnect = vi.fn();

    const result = await room.closeTableByAdmin();

    expect(result.kickedUserIds).toEqual([]);
    expect(kickUserByAdmin).not.toHaveBeenCalled();
    expect(room.disconnect).toHaveBeenCalledTimes(1);
  });
});
