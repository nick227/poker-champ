declare module "pokersolver" {
  const pokersolver: {
    Hand: typeof Hand;
  };

  export class Hand {
    static solve(cards: string[]): Hand;
    static winners(hands: Hand[]): Hand[];
  }

  export default pokersolver;
}
