// Funny table name generator service
// Combines random adjectives, nouns, and poker terms for humorous results

const ADJECTIVES = [
  "Salty", "Lucky", "Drunk", "Broke", "Rich", "Crazy", "Wild", "Chill", "Sweaty", 
  "Nervous", "Brave", "Silent", "Loud", "Happy", "Grumpy", "Sleepy", "Hungry", 
  "Thirsty", "Bored", "Excited", "Calm", "Mad", "Cool", "Hot", "Cold", "Wet",
  "Dry", "Fast", "Slow", "Big", "Small", "Tall", "Short", "Fat", "Skinny", "Rotting", "Bloodstained", "Neon-Lit", "Filthy", "Broken", "Cracked", "Haunted",
  "Bleeding", "Drugged", "Feral", "Rusty", "Paranoid", "Burnt", "Scorched", "Grimy",
  "Twisted", "Cursed", "Wasted", "Savage", "Deranged", "Hollow", "Vicious", "Rabid",
  "Twitching", "Doomed", "Slick", "Blackened", "Skeletal", "Contaminated", "Diseased",
  "Fractured", "Sin-Soaked", "Forgotten", "Decaying", 
  "Opium-Dreamed", "Gin-Soaked", "Smoke-Stained", "Needle-Worn", "Rum-Burned",
  "Absinthe-Washed", "Cocaine-Dusted", "Heroin-Hazed", "Bourbon-Bleached",
  "Morphine-Softened", "Tequila-Slick", "Whiskey-Tongued", "Pill-Fogged",
  "Tobacco-Bitter", "Ether-Drunk", "Laudanum-Laced", "Barroom-Broken",
  "Powder-Pale", "Glass-Eyed", "Dope-Laced", "Sedated", "Narcotic",
  "Intoxicated", "Hungover", "Blitzed", "Spiraled", "Fevered", "Jittering",
  "Sour-Breathed", "Bleary", "Shaking", "Half-Conscious", "Delirious", "Unicorn", "Dragon", "Phoenix", "Rocket", "Comet", "Star",
  "Wizard", "Robot", "Knight", "Pirate", "Ninja",  "Amazing", "Incredible", "Fantastic", "Legendary", "Epic", "Magical",
  "Glorious", "Electric", "Radiant", "Brilliant", "Spectacular", "Cosmic",
  "Wild", "Awesome", "Golden", "Sparkling", "Dazzling", "Shiny",
  "Turbo", "Mega", "Ultra", "Hyper", "Super", "Stellar",
  "Dreamy", "Happy", "Lucky", "Sunny", "Smiling", "Bouncy",
  "Cheery", "Playful", "Groovy", "Funky"
];

const NOUNS = [
  "Penguin", "Shark", "Fish", "Whale", "Donkey", "Eagle",
  "Tunnel", "Backroom", "Stairwell", "Bathroom", "Rooftop", "BoilerRoom", "Dumpster",
  "Subway", "Crackhouse", "Flophouse", "Motel", "Pawnshop", "Garage", "ChopShop",
  "Bunker", "Cellar", "LoadingDock", "KillRoom", "Safehouse", "Dogfight",
  "BloodBank", "Hellhole", "Pit", "Hole", "Crawlspace", "Locker", "Furnace", "Radiant", "Brilliant", "Spectacular", "Cosmic",
  "Wild", "Awesome", "Golden", "Sparkling", "Dazzling", "Shiny",
  "Turbo", "Mega", "Ultra", "Hyper", "Super", "Stellar"
];

const POKER_TERMS = [
  "Showdown", "All-In", "Bluff", "River", "Flop", "Turn", "Pot", "Chips", "Cards",
  "Dealer", "Button", "Blinds", "Raise", "Call", "Fold", "Check", "Bet", "Rake",
  "Fish", "Shark", "Whale", "Donkey", "Rock", "Maniac", "TAG", "LAG", "Nit", "All-In", "Showdown", "DeadHand", "River", "Flop", "Turn", "BurnCard",
  "BlindRaise", "ColdCall", "Backdoor", "BadBeat", "Cooler", "StackOff",
  "Grind", "Rake", "SnapFold", "Overbet", "CheckRaise", "FinalPot",
  "LastChip", "DeepStack", "ShortStack", "Push", "Shove", "SnapCall",  "Bender", "Blackout", "Spiral", "Crash", "Overindulgence",
  "Binge", "Relapse", "ComeDown", "ComeUp", "Withdrawal",
  "Hallucination", "Stagger", "Swoon", "Fade", "Descent",
  "Detox", "Collapse", "Break", "Burn", "Numbness",
  "Drift", "Blur", "Slip", "Disappear", "Wander",
  "Ramble", "Ramshackle Night", "Lost Weekend",
  "Chemical Dream", "Hallucination"
];

const ACTIONS = [
  "Paradise", "Hell", "Heaven", "Party", "Festival", "Carnival", "Circus", "Showdown",
  "Championship", "Tournament", "Battle", "War", "Clash", "Feast", "Banquet", "Picnic",
  "Adventure", "Journey", "Quest", "Mission", "Expedition", "Voyage", "Cruise", "Trip", "Massacre", "Blackout", "Bloodbath", "Riot", "Execution", "Ambush",
  "Heist", "Break-In", "Shootout", "Overdose", "Crash", "Burnout",
  "Standoff", "Lockdown", "Disappearance", "Interrogation",
  "Extortion", "Smuggling", "Trafficking", "Deal", "Setup",
  "DoubleCross", "Extraction", "Escape", "Party", "Fiesta", "Celebration", "Carnival", "Festival",
  "Blast", "Bonanza", "Adventure", "Quest", "Journey",
  "Extravaganza", "Showtime", "Parade", "Fireworks",
  "DanceOff", "JamSession", "Hangout", "Picnic",
  "TreasureHunt", "VictoryLap", "FunRun", "Joyride", "Shitburg"
];

/**
 * Generate a funny random table name
 * @returns A randomly generated funny table name
 */
function generateFunnyTableName(): string {
  const getRandomElement = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  
  const patterns: (() => string)[] = [
    () => `${getRandomElement(ADJECTIVES)} ${getRandomElement(NOUNS)} ${getRandomElement(POKER_TERMS)}`,
    () => `${getRandomElement(ADJECTIVES)} ${getRandomElement(POKER_TERMS)} ${getRandomElement(ACTIONS)}`,
    () => `${getRandomElement(POKER_TERMS)} ${getRandomElement(ACTIONS)} ${getRandomElement(ADJECTIVES)} `,
    () => `${getRandomElement(ADJECTIVES)} ${getRandomElement(ADJECTIVES)} ${getRandomElement(POKER_TERMS)} ${getRandomElement(ACTIONS)}`,
    () => `${getRandomElement(ADJECTIVES)} ${getRandomElement(POKER_TERMS)} ${getRandomElement(ACTIONS)}`,
    () => `${getRandomElement(ADJECTIVES)} ${getRandomElement(POKER_TERMS)} ${getRandomElement(ACTIONS)}`,
    () => `${getRandomElement(ADJECTIVES)} ${getRandomElement(POKER_TERMS)} ${getRandomElement(NOUNS)}`,
    () => `${getRandomElement(ADJECTIVES)} ${getRandomElement(POKER_TERMS)} ${getRandomElement(ACTIONS)}`,
    () => `${getRandomElement(NOUNS)} ${getRandomElement(ADJECTIVES)} ${getRandomElement(POKER_TERMS)}`,
    () => `${getRandomElement(ADJECTIVES)} ${getRandomElement(NOUNS)} ${getRandomElement(ACTIONS)}`,
    () => `${getRandomElement(POKER_TERMS)} ${getRandomElement(ADJECTIVES)} ${getRandomElement(POKER_TERMS)}`,
    () => `${getRandomElement(ADJECTIVES)} ${getRandomElement(POKER_TERMS)}`,
    () => `${getRandomElement(ADJECTIVES)} ${getRandomElement(POKER_TERMS)}`,
    () => `${getRandomElement(POKER_TERMS)} ${getRandomElement(ACTIONS)}`,
    () => `${getRandomElement(POKER_TERMS)} ${getRandomElement(ACTIONS)}`,
    () => `${getRandomElement(POKER_TERMS)} ${getRandomElement(ACTIONS)}`,
    () => `${getRandomElement(POKER_TERMS)} ${getRandomElement(ACTIONS)}`,
    () => `${getRandomElement(POKER_TERMS)} ${getRandomElement(ACTIONS)}`,
    () => `${getRandomElement(POKER_TERMS)} ${getRandomElement(ACTIONS)}`,
    () => `${getRandomElement(POKER_TERMS)} ${getRandomElement(ACTIONS)}`,
    () => `${getRandomElement(ADJECTIVES)} ${getRandomElement(ACTIONS)}`,
    () => `${getRandomElement(ADJECTIVES)} ${getRandomElement(NOUNS)}`,
    () => `${getRandomElement(POKER_TERMS)} ${getRandomElement(ACTIONS)}`,
    () => `${getRandomElement(POKER_TERMS)} ${getRandomElement(ADJECTIVES)}`,
    () => `${getRandomElement(POKER_TERMS)} ${getRandomElement(ADJECTIVES)}`,
    () => `${getRandomElement(POKER_TERMS)} ${getRandomElement(POKER_TERMS)}`,
  ];
  
  const selectedPattern = getRandomElement(patterns);
  return selectedPattern();
}

/**
 * Get a single random funny table name
 * @returns A funny table name
 */
export function getRandomTableName(): string {
  return generateFunnyTableName();
}
