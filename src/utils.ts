import type { Player, Match, Achievement, Pair } from "./types";
import { TRAINING_DAYS } from "./constants";

// ── Deep clean for Firestore payloads ──────────────────────────────────────
const isPlainObject = (v: any) =>
  v !== null &&
  typeof v === "object" &&
  (Object.getPrototypeOf(v) === Object.prototype ||
    Object.getPrototypeOf(v) === null);

export function stripUndefinedDeep<T>(value: T): T {
  if (value === undefined) return undefined as any;
  if (value === null) return value;
  if (Array.isArray(value)) {
    return value.map((v) => (v === undefined ? null : stripUndefinedDeep(v))) as any;
  }
  if (isPlainObject(value)) {
    const out: any = {};
    for (const [k, v] of Object.entries(value as any)) {
      if (v === undefined) continue;
      out[k] = stripUndefinedDeep(v);
    }
    return out;
  }
  return value;
}

// ── General utils ─────────────────────────────────────────────────────────
export const uid = () => Math.random().toString(36).slice(2, 10);

export const fmt = (d: Date) => d.toISOString().slice(0, 10);

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("hu-HU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Budapest",
  });

export const weekday = (dstr: string) =>
  new Date(dstr + "T12:00:00").toLocaleDateString(undefined, { weekday: "long" });

export const getBaseName = (full: string) => full.replace(/^.+?\s/, "");

export const isSinglesMatch = (m: Match) => !m.teamA[1] && !m.teamB[1];

export const formatTeam = (team: Pair, nameOf: (id: string) => string) =>
  team[1] ? `${nameOf(team[0])} & ${nameOf(team[1])}` : `${nameOf(team[0])}`;

export const isHiddenFromStandings = (p: Player) =>
  getBaseName(p.name).trim().toLowerCase() === "orsi";

// ── Training date helpers ──────────────────────────────────────────────────
export function nextTrainingDate(from: Date = new Date()): Date {
  const d = new Date(from);
  while (!TRAINING_DAYS.includes(d.getDay())) d.setDate(d.getDate() + 1);
  return d;
}

export function getCurrentTrainingDate(): string | null {
  const now = new Date();
  const day = now.getDay();
  if (day === 1 || day === 2) {
    const d = new Date(now);
    d.setDate(now.getDate() - (day - 1));
    return fmt(d);
  }
  if (day === 3 || day === 4) {
    const d = new Date(now);
    d.setDate(now.getDate() - (day - 3));
    return fmt(d);
  }
  return null;
}

// ── Achievements ──────────────────────────────────────────────────────────
export const BADGE_META: Record<string, { icon: string; accent: string; bg: string }> = {
  win5:       { icon: "🥉", accent: "text-amber-700",  bg: "bg-amber-50"  },
  win10:      { icon: "🥈", accent: "text-slate-700",  bg: "bg-slate-100" },
  win25:      { icon: "🥇", accent: "text-yellow-600", bg: "bg-yellow-50" },
  beatMelinda:{ icon: "🎯", accent: "text-rose-600",   bg: "bg-rose-50"   },
  streak3:    { icon: "🔥", accent: "text-orange-600", bg: "bg-orange-50" },
  streak6:    { icon: "💪", accent: "text-lime-600",   bg: "bg-lime-50"   },
  streak10:   { icon: "🏆", accent: "text-sky-600",    bg: "bg-sky-50"    },
  min5matches:{ icon: "🏸", accent: "text-cyan-600",   bg: "bg-cyan-50"   },
};

export const ALL_BADGES: Achievement[] = [
  { id: "win5",        title: "Novice Winner",   description: "Win 5 matches."       },
  { id: "win10",       title: "Pro Winner",      description: "Win 10 matches."      },
  { id: "win25",       title: "Champion",        description: "Win 25 matches."      },
  { id: "beatMelinda", title: "Beat Melinda!",   description: "Win vs Melinda."      },
  { id: "streak3",     title: "Regular",         description: "3 sessions in a row." },
  { id: "streak6",     title: "Dedicated",       description: "6 sessions in a row." },
  { id: "streak10",    title: "Ironman",         description: "10 sessions in a row."},
  { id: "min5matches", title: "Seasoned Player", description: "Play 5 matches."      },
];

export function computeAttendanceStreak(playerId: string, matches: Match[]): number {
  if (!matches.length) return 0;
  const allDates = Array.from(new Set(matches.map((m) => m.date))).sort();
  const playedDates = new Set<string>();
  matches.forEach((m) => {
    if (m.teamA.includes(playerId) || m.teamB.includes(playerId)) playedDates.add(m.date);
  });
  let best = 0; let current = 0;
  for (const d of allDates) {
    if (playedDates.has(d)) { current++; if (current > best) best = current; } else { current = 0; }
  }
  return best;
}

export function computeAchievementsFull(
  playerId: string,
  matches: Match[],
  players: Player[]
): Achievement[] {
  const out: Achievement[] = [];
  const playerMatches = matches.filter(
    (m) => m.teamA.includes(playerId) || m.teamB.includes(playerId)
  );
  let wins = 0;
  playerMatches.forEach((m) => {
    const inA = m.teamA.includes(playerId);
    const inB = m.teamB.includes(playerId);
    if (!inA && !inB) return;
    if (m.winner) {
      if ((m.winner === "A" && inA) || (m.winner === "B" && inB)) wins++;
    }
  });
  if (wins >= 5)  out.push({ id: "win5",  title: "Novice Winner", description: "Win 5 matches."  });
  if (wins >= 10) out.push({ id: "win10", title: "Pro Winner",     description: "Win 10 matches." });
  if (wins >= 25) out.push({ id: "win25", title: "Champion",       description: "Win 25 matches." });

  const melinda = players.find((p) => p.name.toLowerCase().includes("melinda"));
  if (melinda) {
    const beatMelinda = playerMatches.some((m) => {
      const melInA = m.teamA.includes(melinda.id);
      const melInB = m.teamB.includes(melinda.id);
      const inA = m.teamA.includes(playerId);
      const inB = m.teamB.includes(playerId);
      if (!(melInA || melInB) || !(inA || inB) || !m.winner) return false;
      if ((melInA && inA) || (melInB && inB)) return false;
      return (m.winner === "A" && inA) || (m.winner === "B" && inB);
    });
    if (beatMelinda)
      out.push({ id: "beatMelinda", title: "Beat Melinda!", description: "Won vs Melinda." });
  }
  if (playerMatches.length >= 5)
    out.push({ id: "min5matches", title: "Seasoned Player", description: "Play 5 matches." });

  const streak = computeAttendanceStreak(playerId, matches);
  if (streak >= 3)  out.push({ id: "streak3",  title: "Regular",   description: "Streak: 3"  });
  if (streak >= 6)  out.push({ id: "streak6",  title: "Dedicated", description: "Streak: 6"  });
  if (streak >= 10) out.push({ id: "streak10", title: "Ironman",   description: "Streak: 10" });

  return out;
}
