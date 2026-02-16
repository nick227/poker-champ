import { EventEmitter } from "node:events";

type SessionEventMap = {
  "user.banned": { userId: string };
};

class SessionEvents extends EventEmitter {
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
