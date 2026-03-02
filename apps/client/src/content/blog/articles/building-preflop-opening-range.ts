import type { BlogArticleMeta } from "../blog.types";

export const meta: BlogArticleMeta = {
  slug: "building-preflop-opening-range",
  title: "Building a Preflop Opening Range (6-Max)",
  summary: "Which hands to open and from where isn’t random. Here’s how to build a range that makes money instead of giving it back.",
  publishedAt: "2025-02-28",
  relatedLessonIds: ["L1_open_raise_position_6max"],
  featureLobby: true,
  relatedArticleSlugs: ["why-position-matters-6max", "3bet-or-fold-stop-flat-calling", "pot-odds-plain-english"],
};

export const body = `## From “I’ll play anything that looks good” to a real range

I used to open based on mood. Ace-ten? Sure. King-jack offsuit from early position? Why not. I had a vague sense that position mattered, but I didn’t have a **range**—a set of hands I’d open from each seat. So I’d open too much from UTG and get squeezed or outplayed postflop. Or I’d open too little from the button and leave value on the table. My win rate was flat. I was working hard and going nowhere.

The change came when I sat down and wrote out, seat by seat, what I’d open. Not from a book—from first principles: *In early position I have to act first on every street, so I need hands that can stand that pressure. In late position I act last, so I can open wider and steal more.* I tightened up front and loosened in back. Within a few weeks, my preflop felt calmer. I was in fewer marginal spots and in more spots where I had a clear edge. That’s the power of **building a range** instead of playing by instinct.

## What an “opening range” is

Your **opening range** (or RFI—raise first in) is the set of hands you’re willing to open (first to put money in) from each position when everyone has folded to you. It’s not a fixed list you memorize once. It’s a **framework**: early position = tighter, late position = wider, and the button is your widest spot because you have position on everyone postflop.

Rough idea for 6-max:

- **UTG / LJ (early)** — Only your strongest hands: big pairs, big aces, strong broadways. You’re going to act first on the flop, turn, and river, so you want hands that can win without perfect flops.
- **CO (cutoff)** — A bit wider. You have position on the blinds and only UTG/LJ left to act. Add more suited connectors and suited aces, and some offsuit broadways.
- **BTN (button)** — Widest. You have position on everyone. You can open for value and to steal. This is where you add small pairs, suited gappers, and more speculative hands.
- **SB** — Often a separate strategy (open or fold, sometimes limp in some games). Many players use a “min-raise or fold” or “open or fold” approach from the small blind with a range between CO and BTN width.

You don’t have to get it perfect. You have to **stop opening the same hands from every seat**. Tighten in front, loosen in back. That alone fixes a huge chunk of preflop leaks.

## Why “just play good hands” isn’t enough

“Good hands” depend on position. AJo from the button is a clear open. AJo from UTG is often a fold in tough games—you’re going to be out of position and dominated by better aces and bigger pairs. So the **same hand** is in your range in one seat and out of it in another. If you don’t define that, you’ll either over-open early (the most common leak) or under-open late (leaving money on the table).

Building a range also forces you to think in **combos** and **frequency**. You’re not just “playing tight” or “playing loose.” You’re playing a percentage of hands from each seat, and that percentage goes up as you get closer to the button. That’s the structure. The heart of it is: **fewer hands from early position, more from late.**

## How to build yours

1. **Start from the button** — What do you open on the button when it’s folded to you? Write down a list (or use a range chart). That’s your widest range.
2. **Work backward** — From the cutoff, remove the bottom of your button range. From LJ, remove more. From UTG, keep only the strongest hands. You’ll end up with a ladder: tightest at UTG, widest at BTN.
3. **Use one source of truth** — A coach, a chart, or a training lesson. Don’t mix three different systems. Pick one and stick to it until it’s automatic.
4. **Review and adjust** — If you’re getting 3-bet too much from early position, you might still be too wide. If you never get action from the button, you might be too tight. Ranges aren’t set in stone; they’re a baseline you refine with experience.

## Lock it in with practice

Our **Open-Raise Discipline by Position** lesson walks you through exactly which hands to open from each seat and grades your choices. You’ll see the feedback and build the habit.

[Train your opening range in Poker School](/lesson/L1_open_raise_position_6max) · [See all lessons](/lessons) · [Play at the table](/lobby)`;
