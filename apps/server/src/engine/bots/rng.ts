import type { BotActionContext } from "./botContext.js";

export interface BrainRng {
  next(): number; // [0, 1)
}

export class SeededRng implements BrainRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
    if (this.state === 0) this.state = 0x9e3779b9;
  }

  next(): number {
    // xorshift32
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 0x1_0000_0000;
  }
}

export function nextRandom(ctx: BotActionContext): number {
  return ctx.rng?.next() ?? Math.random();
}

