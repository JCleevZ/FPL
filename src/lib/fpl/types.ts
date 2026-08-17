/**
 * Types for the official (undocumented) Fantasy Premier League API.
 * Shapes verified against the live 2026/27 endpoints.
 *
 * Numeric fields that FPL returns as strings (form, xG, ownership...) are typed
 * as `string` here deliberately — the ingest layer is responsible for coercing
 * them, so nothing downstream silently does string arithmetic.
 */

export const POSITION = { GK: 1, DEF: 2, MID: 3, FWD: 4 } as const;
export type Position = (typeof POSITION)[keyof typeof POSITION];

export const POSITION_NAME: Record<Position, string> = {
  1: 'GKP',
  2: 'DEF',
  3: 'MID',
  4: 'FWD',
};

/** `status` on an element. Anything other than 'a' is a availability warning. */
export type PlayerStatus =
  | 'a' // available
  | 'd' // doubtful
  | 'i' // injured
  | 's' // suspended
  | 'u' // unavailable
  | 'n'; // not in squad (e.g. loaned out)

export interface FplTeam {
  id: number;
  code: number;
  name: string;
  short_name: string;
  strength: number;
  strength_overall_home: number;
  strength_overall_away: number;
  strength_attack_home: number;
  strength_attack_away: number;
  strength_defence_home: number;
  strength_defence_away: number;
  position: number;
  played: number;
  win: number;
  draw: number;
  loss: number;
  points: number;
}

export interface FplElement {
  id: number;
  code: number;
  first_name: string;
  second_name: string;
  web_name: string;
  team: number;
  element_type: Position;
  now_cost: number;
  cost_change_start: number;
  cost_change_event: number;

  status: PlayerStatus;
  news: string;
  news_added: string | null;
  chance_of_playing_this_round: number | null;
  chance_of_playing_next_round: number | null;

  total_points: number;
  points_per_game: string;
  form: string;
  minutes: number;
  starts: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  goals_conceded: number;
  own_goals: number;
  penalties_saved: number;
  penalties_missed: number;
  yellow_cards: number;
  red_cards: number;
  saves: number;
  bonus: number;
  bps: number;

  defensive_contribution: number;
  clearances_blocks_interceptions: number;
  recoveries: number;
  tackles: number;

  expected_goals: string;
  expected_assists: string;
  expected_goal_involvements: string;
  expected_goals_conceded: string;
  expected_goals_per_90: number;
  expected_assists_per_90: number;
  expected_goal_involvements_per_90: number;
  expected_goals_conceded_per_90: number;
  starts_per_90: number;
  clean_sheets_per_90: number;
  saves_per_90: number;
  defensive_contribution_per_90: number;

  influence: string;
  creativity: string;
  threat: string;
  ict_index: string;

  selected_by_percent: string;
  transfers_in: number;
  transfers_out: number;
  transfers_in_event: number;
  transfers_out_event: number;
  value_form: string;
  value_season: string;
  ep_this: string | null;
  ep_next: string | null;

  penalties_order: number | null;
  direct_freekicks_order: number | null;
  corners_and_indirect_freekicks_order: number | null;
}

export interface FplEvent {
  id: number;
  name: string;
  deadline_time: string;
  finished: boolean;
  data_checked: boolean;
  is_previous: boolean;
  is_current: boolean;
  is_next: boolean;
  average_entry_score: number | null;
  highest_score: number | null;
  most_selected: number | null;
  most_transferred_in: number | null;
  most_captained: number | null;
  most_vice_captained: number | null;
  top_element: number | null;
  transfers_made: number;
  chip_plays: { chip_name: string; num_played: number }[];
}

export interface FplElementType {
  id: Position;
  plural_name: string;
  singular_name: string;
  singular_name_short: string;
  squad_select: number;
  squad_min_play: number;
  squad_max_play: number;
  element_count: number;
}

export interface FplBootstrap {
  events: FplEvent[];
  teams: FplTeam[];
  elements: FplElement[];
  element_types: FplElementType[];
  element_stats: { label: string; name: string }[];
  chips: { id: number; name: string; start_event: number; stop_event: number }[];
  total_players: number;
  game_settings: Record<string, unknown>;
}

export interface FplFixture {
  id: number;
  code: number;
  /** Null when the fixture has not been assigned to a gameweek yet. */
  event: number | null;
  team_h: number;
  team_a: number;
  team_h_score: number | null;
  team_a_score: number | null;
  team_h_difficulty: number;
  team_a_difficulty: number;
  kickoff_time: string | null;
  started: boolean;
  finished: boolean;
  finished_provisional: boolean;
  minutes: number;
  stats: { identifier: string; a: FplFixtureStat[]; h: FplFixtureStat[] }[];
}

export interface FplFixtureStat {
  value: number;
  element: number;
}

/** One gameweek row from `element-summary/{id}/`.history */
export interface FplElementHistory {
  element: number;
  fixture: number;
  opponent_team: number;
  was_home: boolean;
  round: number;
  total_points: number;
  minutes: number;
  starts: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  goals_conceded: number;
  own_goals: number;
  penalties_saved: number;
  penalties_missed: number;
  yellow_cards: number;
  red_cards: number;
  saves: number;
  bonus: number;
  bps: number;
  defensive_contribution: number;
  expected_goals: string;
  expected_assists: string;
  expected_goal_involvements: string;
  expected_goals_conceded: string;
  influence: string;
  creativity: string;
  threat: string;
  ict_index: string;
  value: number;
  selected: number;
  transfers_in: number;
  transfers_out: number;
}

export interface FplElementSummary {
  fixtures: {
    id: number;
    event: number | null;
    team_h: number;
    team_a: number;
    is_home: boolean;
    difficulty: number;
    kickoff_time: string | null;
  }[];
  history: FplElementHistory[];
  history_past: {
    season_name: string;
    element_code: number;
    start_cost: number;
    end_cost: number;
    total_points: number;
    minutes: number;
    goals_scored: number;
    assists: number;
    clean_sheets: number;
    expected_goals: string;
    expected_assists: string;
  }[];
}

/** `event/{gw}/live/` — live points and BPS mid-gameweek. */
export interface FplLive {
  elements: {
    id: number;
    stats: {
      minutes: number;
      goals_scored: number;
      assists: number;
      clean_sheets: number;
      goals_conceded: number;
      own_goals: number;
      penalties_saved: number;
      penalties_missed: number;
      yellow_cards: number;
      red_cards: number;
      saves: number;
      bonus: number;
      bps: number;
      defensive_contribution: number;
      total_points: number;
    };
    explain: {
      fixture: number;
      stats: { identifier: string; points: number; value: number }[];
    }[];
  }[];
}

/** `entry/{id}/` — public manager profile, no auth required. */
export interface FplEntry {
  id: number;
  name: string;
  player_first_name: string;
  player_last_name: string;
  started_event: number;
  favourite_team: number | null;
  summary_overall_points: number | null;
  summary_overall_rank: number | null;
  summary_event_points: number | null;
  summary_event_rank: number | null;
  current_event: number | null;
  last_deadline_bank: number | null;
  last_deadline_value: number | null;
  last_deadline_total_transfers: number | null;
  kit: string | null;
  leagues: {
    classic: { id: number; name: string; entry_rank: number | null }[];
  };
}

export interface FplEntryHistory {
  current: {
    event: number;
    points: number;
    total_points: number;
    rank: number | null;
    overall_rank: number | null;
    bank: number;
    value: number;
    event_transfers: number;
    event_transfers_cost: number;
    points_on_bench: number;
  }[];
  past: { season_name: string; total_points: number; rank: number }[];
  chips: { name: string; event: number; time: string }[];
}

export interface FplEntryPicks {
  active_chip: string | null;
  entry_history: {
    event: number;
    points: number;
    total_points: number;
    rank: number | null;
    overall_rank: number | null;
    bank: number;
    value: number;
    event_transfers: number;
    event_transfers_cost: number;
    points_on_bench: number;
  };
  picks: {
    element: number;
    position: number;
    multiplier: number;
    is_captain: boolean;
    is_vice_captain: boolean;
  }[];
}

export interface FplEventStatus {
  status: {
    bonus_added: boolean;
    date: string;
    event: number;
    points: 'r' | 'p' | 'l'; // ready / provisional / live
  }[];
  leagues: string;
}
