export type Player = {
  id: string;
  name: string;
  gender?: "M" | "F";
};
export type Pair = [string, string];
export type Match = {
  id: string;
  date: string;
  teamA: Pair;
  teamB: Pair;
  winner?: "A" | "B";
};
export type Backup = {
  id: string;
  createdAt: string;
  note?: string;
  data: { players: Player[]; matches: Match[] };
};
export type CheckInEvent = {
  playerId: string;
  playerName: string;
  trainingDate: string;
  timestamp: string;
  action: "in" | "out";
};
export type LeagueDoc = {
  players: Player[];
  matches: Match[];
  createdAt?: any;
  updatedAt?: any;
  title?: string;
  backups?: Backup[];
  attendance?: Record<string, string[]>;
  checkinLog?: CheckInEvent[];
};
export type Achievement = {
  id: string;
  title: string;
  description: string;
};
export type Role = "admin" | "attendance";
