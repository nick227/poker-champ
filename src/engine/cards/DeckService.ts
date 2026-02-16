import { randomInt } from "node:crypto";

const RANKS = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"] as const;
const SUITS = ["c","d","h","s"] as const;

export class DeckService {
  private cards: string[] = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.cards = [];
    for (const r of RANKS) for (const s of SUITS) this.cards.push(`${r}${s}`);
  }

  shuffle() {
    // Fisher-Yates using crypto random
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  draw(): string {
    const c = this.cards.pop();
    if (!c) throw new Error("Deck empty");
    return c;
  }
}
