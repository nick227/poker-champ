import { nanoid } from "nanoid";

export function newBotId(): string {
  return `bot_${nanoid(10)}`;
}
