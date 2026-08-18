/**
 * Every piece of jargon the UI shows, defined once.
 *
 * Anything that appears as an abbreviation, a tag or a column header should be
 * looked up here rather than hard-coded, so a term always means the same thing
 * and always carries the same explanation on hover.
 */

export interface Term {
  label: string;
  short: string;
  description: string;
}

export const GLOSSARY = {
  xpts: {
    label: 'xPts',
    short: 'Projected points',
    description:
      'Points we expect this player to score over the upcoming gameweeks, from their underlying numbers, expected minutes and who they play.',
  },
  fdr: {
    label: 'FDR',
    short: 'Fixture difficulty',
    description:
      'Fixture Difficulty Rating: how hard their upcoming opponents are, averaged. 1 is the easiest run, 5 the hardest. Under 3 is a kind run.',
  },
  ownership: {
    label: 'Owned',
    short: 'Ownership',
    description:
      'The share of all FPL managers who have this player. High means popular and safe; low means owning them can gain you rank if they score.',
  },
  form: {
    label: 'Form',
    short: 'Recent form',
    description: 'Average points per match over their last few games.',
  },
  price: {
    label: 'Price',
    short: 'Current price',
    description:
      'What the player costs right now. Prices drift up and down all season as managers buy and sell.',
  },
  priceChange: {
    label: 'Price change',
    short: 'Value gained',
    description:
      'How much your squad has risen or fallen in price since you picked each player. Rises add to your budget when you sell.',
  },
  bank: {
    label: 'In the bank',
    short: 'Money left',
    description: 'Budget left to spend, after what you paid for the players you already own.',
  },
  squadValue: {
    label: 'Squad value',
    short: 'Worth today',
    description: 'What your 15 players are worth at current prices.',
  },
  defcon: {
    label: 'DC',
    short: 'Defensive contribution',
    description:
      'Tackles, interceptions, clearances and recoveries. Clear the threshold in a match and you get 2 points — 10 actions for defenders, 12 for everyone else.',
  },
  bps: {
    label: 'BPS',
    short: 'Bonus points system',
    description:
      'The behind-the-scenes score that decides who gets the 1-3 bonus points in each match.',
  },
  xg: {
    label: 'xG',
    short: 'Expected goals',
    description:
      'The number of goals an average player would score from the chances they had. Better than goals at predicting the future.',
  },
  xa: {
    label: 'xA',
    short: 'Expected assists',
    description: 'The assists an average player would get from the chances they created.',
  },
  netTransfers: {
    label: 'Net T',
    short: 'Net transfers',
    description:
      'Managers buying minus managers selling this gameweek. Strongly positive means a price rise is coming.',
  },
} as const satisfies Record<string, Term>;

export type GlossaryKey = keyof typeof GLOSSARY;

/**
 * Why a player is being recommended.
 *
 * Keys rather than sentences, so the tag, its colour and its explanation stay in
 * step wherever it is rendered.
 */
export const REASONS = {
  kindFixtures: {
    label: 'Kind fixtures',
    tone: 'good',
    description:
      'Their next few opponents are among the easier ones, so returns are more likely.',
  },
  toughFixtures: {
    label: 'Tough fixtures',
    tone: 'bad',
    description: 'A hard run of opponents coming up — returns may dry up.',
  },
  hotForm: {
    label: 'Hot form',
    tone: 'good',
    description: 'Scoring heavily over their recent matches, in the top 10% of the league.',
  },
  goodValue: {
    label: 'Good value',
    tone: 'info',
    description: 'Projected to return a lot of points for what they cost.',
  },
  risingPrice: {
    label: 'Rising price',
    tone: 'warn',
    description:
      'Being bought far more than sold, so their price is likely to go up soon. Buy before it does and you keep the gain.',
  },
  fallingPrice: {
    label: 'Falling price',
    tone: 'bad',
    description:
      'Being sold heavily, so their price is likely to drop. Owning them through a fall loses you budget.',
  },
  lowOwnership: {
    label: 'Low ownership',
    tone: 'accent',
    description:
      'Owned by under 8% of managers. If they score well you gain rank on almost everyone; if they blank, you lose little.',
  },
  highlyOwned: {
    label: 'Widely owned',
    tone: 'muted',
    description:
      'Owned by more than half of managers. Safe, but not owning them is a risk if they haul.',
  },
  nailed: {
    label: 'Nailed starter',
    tone: 'good',
    description: 'Starts almost every match, so you are not gambling on minutes.',
  },
  rotationRisk: {
    label: 'Rotation risk',
    tone: 'warn',
    description: 'Does not start every week — they may be benched without warning.',
  },
  setPieces: {
    label: 'Set pieces',
    tone: 'info',
    description:
      'First choice for penalties, free kicks or corners — extra chances to score or assist.',
  },
  injuryDoubt: {
    label: 'Injury doubt',
    tone: 'bad',
    description: 'Carrying a knock or flagged by FPL. Check the news before picking them.',
  },
  freshNews: {
    label: 'New news',
    tone: 'warn',
    description: 'FPL updated this player’s status in the last few days.',
  },
  teamInForm: {
    label: 'Team in form',
    tone: 'good',
    description: 'Their club is picking up results, which lifts everyone in the side.',
  },
} as const;

export type ReasonKey = keyof typeof REASONS;

export const TONE_CLASS: Record<string, string> = {
  good: 'border-fdr-1/40 text-fdr-1',
  bad: 'border-danger/40 text-danger',
  warn: 'border-amber/40 text-amber',
  info: 'border-cyan/40 text-cyan',
  accent: 'border-violet/40 text-violet',
  muted: 'border-border-bright text-fg-muted',
};
