import { EventEmitter } from "node:events";

type SessionEventMap = {
  "user.banned": { userId: string };
};

class SessionEvents extends EventEmitter {
  constructor() {
    super();
    // One listener per active PokerRoom is expected; this emitter fans out global auth events.
    this.setMaxListeners(0);
  }

  emit<K extends keyof SessionEventMap>(event: K, payload: SessionEventMap[K]): boolean {
    return super.emit(event, payload);
  }

  on<K extends keyof SessionEventMap>(event: K, listener: (payload: SessionEventMap[K]) => void): this {
    return super.on(event, listener);
  }

  off<K extends keyof SessionEventMap>(event: K, listener: (payload: SessionEventMap[K]) => void): this {
    return super.off(event, listener);
  }
}

export const sessionEvents = new SessionEvents();
