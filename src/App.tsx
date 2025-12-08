import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  onSnapshot,
  setDoc,
  serverTimestamp,
  enableIndexedDbPersistence,
} from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";

/**
 * =============================================================
 * BIA-TOLLAS – Biatorbágy (Badminton League)
 * - Player/Admin toggle (view switch, no password)
 * - Emoji selection for new players (40 emojis) + subsequent modification
 * - Date navigation in Player view + "Last session" badge
 * - Training days: Monday & Wednesday; default date = next training day
 * - Attendance list: tap small cards instead of checkboxes
 * - Random match draw: tries to balance teams, avoid repeat teammates TODAY
 * - Badge system: achievements for players (streaks, beating Melinda, etc.)
 * - Standings summary: base points + special bonus points
 *
 * IMPORTANT:
 * - League data is stored in Firestore under "leagues/default"
 * - Backups are stored as an array in the same document
 * =============================================================
 */

// ========================= Types =========================

type Player = {
  id: string;
  name: string;
  emoji?: string;
  active?: boolean; // optional, used for filtering "retired" players
};

type Match = {
  id: string;
  date: string; // YYYY-MM-DD
  teamA: [string, string]; // player ids
  teamB: [string, string]; // player ids
  winner?: "A" | "B" | "draw";
  createdAt?: any;
};

type Backup = {
  id: string;
  label: string;
  createdAt: string;
  players: Player[];
  matches: Match[];
};

type LeagueDoc = {
  players: Player[];
  matches: Match[];
  createdAt?: any;
  updatedAt?: any;
  title?: string;
  backups?: Backup[];
};

// ========================= Firebase =========================
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
signInAnonymously(auth).catch(() => {});
const db = getFirestore(app);
enableIndexedDbPersistence(db).catch(() => {});

// ========================= Utils =========================
const uid = () => Math.random().toString(36).slice(2, 10);
const fmt = (d: Date) => d.toISOString().slice(0, 10); // YYYY-MM-DD
const weekday = (dstr: string) =>
  new Date(dstr + "T12:00:00").toLocaleDateString(undefined, {
    weekday: "long",
  });

const trainingDays = [1, 3]; // Monday (1) and Wednesday (3)
const nextTrainingDate = () => {
  const today = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    if (trainingDays.includes(d.getDay())) return d;
  }
  return today;
};

// ========================= Achievements & Stats =========================

type AchievementId =
  | "beatMelinda"
  | "streak10"
  | "streak3"
  | "streak6"
  | "win5"
  | "win10"
  | "win25"
  | "min5matches";

type Achievement = {
  id: AchievementId;
  label: string;
  description: string;
};

const achievementDefinitions: Record<AchievementId, Achievement> = {
  beatMelinda: {
    id: "beatMelinda",
    label: "Beat Melinda",
    description: "Won a match against Melinda.",
  },
  streak10: {
    id: "streak10",
    label: "Ironman 10",
    description: "Played in 10 consecutive sessions.",
  },
  streak3: {
    id: "streak3",
    label: "On Fire 3",
    description: "3-session attendance streak.",
  },
  streak6: {
    id: "streak6",
    label: "On Fire 6",
    description: "6-session attendance streak.",
  },
  win5: {
    id: "win5",
    label: "5 Wins",
    description: "Reached 5 total wins.",
  },
  win10: {
    id: "win10",
    label: "10 Wins",
    description: "Reached 10 total wins.",
  },
  win25: {
    id: "win25",
    label: "25 Wins",
    description: "Reached 25 total wins.",
  },
  min5matches: {
    id: "min5matches",
    label: "Match Ready",
    description: "Played at least 5 matches.",
  },
};

type PlayerStats = {
  id: string;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  basePoints: number;
  bonusPoints: number;
  totalPoints: number;
};

// For achievement styling
const badgeStyles: Record<
  AchievementId,
  { icon: string; accent: string; bg: string }
> = {
  beatMelinda: {
    icon: "⭐",
    accent: "text-yellow-700",
    bg: "from-yellow-50 via-white to-emerald-50",
  },
  win5: {
    icon: "🎯",
    accent: "text-indigo-700",
    bg: "from-indigo-50 via-white to-emerald-50",
  },
  win10: {
    icon: "🎖️",
    accent: "text-emerald-700",
    bg: "from-emerald-50 via-white to-sky-50",
  },
  win25: {
    icon: "🏅",
    accent: "text-amber-700",
    bg: "from-amber-50 via-white to-emerald-50",
  },
  min5matches: {
    icon: "📈",
    accent: "text-slate-700",
    bg: "from-slate-50 via-white to-emerald-50",
  },
  streak3: {
    icon: "🔥",
    accent: "text-orange-700",
    bg: "from-orange-50 via-white to-emerald-50",
  },
  streak6: {
    icon: "💪",
    accent: "text-emerald-700",
    bg: "from-emerald-50 via-white to-sky-50",
  },
  streak10: {
    icon: "🏆",
    accent: "text-indigo-700",
    bg: "from-indigo-50 via-white to-emerald-50",
  },
};

// Basic match stats
function computePlayerStats(players: Player[], matches: Match[]): PlayerStats[] {
  const statsMap = new Map<string, PlayerStats>();
  players.forEach((p) =>
    statsMap.set(p.id, {
      id: p.id,
      matches: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      basePoints: 0,
      bonusPoints: 0,
      totalPoints: 0,
    })
  );

  for (const m of matches) {
    const [a1, a2] = m.teamA;
    const [b1, b2] = m.teamB;
    const teamAPlayers = [a1, a2];
    const teamBPlayers = [b1, b2];

    const all = [...teamAPlayers, ...teamBPlayers];
    for (const pid of all) {
      const s = statsMap.get(pid);
      if (!s) continue;
      s.matches += 1;
      if (m.winner === "A" && teamAPlayers.includes(pid)) {
        s.wins += 1;
        s.basePoints += 3;
      } else if (m.winner === "B" && teamBPlayers.includes(pid)) {
        s.wins += 1;
        s.basePoints += 3;
      } else if (m.winner === "A" && teamBPlayers.includes(pid)) {
        s.losses += 1;
      } else if (m.winner === "B" && teamAPlayers.includes(pid)) {
        s.losses += 1;
      } else if (m.winner === "draw") {
        s.draws += 1;
        s.basePoints += 1;
      }
    }
  }

  return Array.from(statsMap.values());
}

// Achievements
function computeAchievementsFull(
  playerId: string,
  allMatches: Match[],
  players: Player[]
): Achievement[] {
  const result: Achievement[] = [];

  const meMatches = allMatches.filter((m) =>
    [m.teamA[0], m.teamA[1], m.teamB[0], m.teamB[1]].includes(playerId)
  );

  const wins = meMatches.filter((m) => {
    if (m.winner === "draw" || !m.winner) return false;
    const isTeamA = m.teamA.includes(playerId);
    return (m.winner === "A" && isTeamA) || (m.winner === "B" && !isTeamA);
  });

  if (wins.length >= 5) result.push(achievementDefinitions.win5);
  if (wins.length >= 10) result.push(achievementDefinitions.win10);
  if (wins.length >= 25) result.push(achievementDefinitions.win25);

  if (meMatches.length >= 5) result.push(achievementDefinitions.min5matches);

  const baseName = (full: string) => full.replace(/^.+?\s/, "");

  const melinda = players.find(
    (p) => baseName(p.name) === "Melinda" || p.name === "Melinda"
  );
  if (melinda) {
    const melindaId = melinda.id;
    const beatsMelinda = wins.some((m) => {
      const allIds = [
        ...m.teamA,
        ...m.teamB,
      ];
      if (!allIds.includes(melindaId)) return false;
      const isOnWinnerTeam =
        (m.winner === "A" && m.teamA.includes(playerId)) ||
        (m.winner === "B" && m.teamB.includes(playerId));
      const melindaOnLoserTeam =
        (m.winner === "A" && m.teamB.includes(melindaId)) ||
        (m.winner === "B" && m.teamA.includes(melindaId));
      return isOnWinnerTeam && melindaOnLoserTeam;
    });
    if (beatsMelinda) {
      result.push(achievementDefinitions.beatMelinda);
    }
  }

  const datesSet = new Set<string>();
  meMatches.forEach((m) => datesSet.add(m.date));
  const dates = Array.from(datesSet).sort();

  let longestStreak = 0;
  let currentStreak = 0;
  let prevDate: Date | null = null;

  for (const dstr of dates) {
    const d = new Date(dstr + "T12:00:00");
    if (!prevDate) {
      currentStreak = 1;
    } else {
      const diffDays = Math.round(
        (d.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (diffDays <= 3) {
        currentStreak += 1;
      } else {
        currentStreak = 1;
      }
    }
    prevDate = d;
    if (currentStreak > longestStreak) longestStreak = currentStreak;
  }

  if (longestStreak >= 3) result.push(achievementDefinitions.streak3);
  if (longestStreak >= 6) result.push(achievementDefinitions.streak6);
  if (longestStreak >= 10) result.push(achievementDefinitions.streak10);

  return result;
}

function computeStandings(players: Player[], matches: Match[]) {
  const baseStats = computePlayerStats(players, matches);
  const standings = baseStats.map((s) => ({ ...s }));
  const map = new Map<string, PlayerStats>();
  standings.forEach((s) => map.set(s.id, s));

  const achievementsMap = new Map<string, Achievement[]>();

  const BONUS_ACHIEVEMENT_IDS = new Set<AchievementId>([
    "beatMelinda",
    "streak10",
  ]);

  standings.forEach((stats) => {
    const ach = computeAchievementsFull(stats.id, matches, players);
    achievementsMap.set(stats.id, ach);

    stats.bonusPoints = ach.filter((a) =>
      BONUS_ACHIEVEMENT_IDS.has(a.id)
    ).length;

    stats.totalPoints = stats.basePoints + stats.bonusPoints;
  });

  standings.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }
    if (b.basePoints !== a.basePoints) {
      return b.basePoints - a.basePoints;
    }
    return b.wins - a.wins;
  });

  return { standings, achievementsMap };
}

// ========================= League Hook =========================

function useLeague() {
  const [data, setData] = useState<LeagueDoc>({
    players: [],
    matches: [],
    backups: [],
  });

  const suppress = useRef(false);
  const tRef = useRef<number | null>(null);

  useEffect(() => {
    const ref = doc(db, "leagues", "default");
    const unsub = onSnapshot(ref, async (snap) => {
      if (snap.metadata.hasPendingWrites) return;
      if (snap.exists()) {
        suppress.current = true;
        const remote = snap.data() as LeagueDoc;
        setData({
          players: remote.players || [],
          matches: remote.matches || [],
          backups: remote.backups || [],
          createdAt: remote.createdAt,
          updatedAt: remote.updatedAt,
          title: remote.title ?? "Bia-Tollas Liga",
        });
        setTimeout(() => (suppress.current = false), 0);
      } else {
        await setDoc(ref, {
          players: [],
          matches: [],
          backups: [],
          title: "Bia-Tollas Liga",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    });
    return () => unsub();
  }, []);

  const write = useCallback((patch: Partial<LeagueDoc>) => {
    if (tRef.current) window.clearTimeout(tRef.current);

    setData((prev) => {
      const next: LeagueDoc = {
        ...prev,
        ...patch,
        backups: patch.backups ?? prev.backups ?? [],
      };

      if (suppress.current) return next;

      tRef.current = window.setTimeout(async () => {
        const ref = doc(db, "leagues", "default");
        const payload = {
          ...next,
          updatedAt: serverTimestamp(),
        } as LeagueDoc;
        try {
          await setDoc(ref, payload, { merge: true });
        } catch (err) {
          console.error("Failed to sync league:", err);
        }
      }, 120);

      return next;
    });
  }, []);

  return [data, write] as const;
}

// ========================= Components =========================

const card =
  "relative overflow-hidden rounded-3xl bg-white p-4 shadow-sm border border-slate-200 text-slate-900";
const input =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200";
const btnBase =
  "inline-flex items-center justify-center rounded-xl px-3 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";
const btnPrimary = `${btnBase} bg-sky-600 text-white hover:bg-sky-700 focus-visible:ring-sky-500`;
const btnSecondary = `${btnBase} border border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-100 focus-visible:ring-slate-400`;

// ===== Header =====
function Header({
  title,
  role,
  setPlayer,
  setAdmin,
}: {
  title?: string;
  role: "player" | "admin";
  setPlayer: () => void;
  setAdmin: () => void;
}) {
  const isAdmin = role === "admin";
  return (
    <header className="mb-4 flex flex-col gap-2 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl text-slate-900">
          {title || "Bia-Tollas Liga"}
        </h1>
        <p className="text-xs text-slate-500 sm:text-sm">
          Biatorbágy – Fun, fair matches & steady improvement.
        </p>
      </div>

      <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 p-1">
        <button
          type="button"
          className={
            role === "player"
              ? "rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-900 shadow-sm sm:text-sm"
              : "rounded-full px-3 py-1 text-xs font-medium text-slate-500 hover:text-slate-700 sm:text-sm"
          }
          onClick={setPlayer}
        >
          👤 Player
        </button>
        <button
          type="button"
          className={
            role === "admin"
              ? "rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-900 shadow-sm sm:text-sm"
              : "rounded-full px-3 py-1 text-xs font-medium text-slate-500 hover:text-slate-700 sm:text-sm"
          }
          onClick={setAdmin}
        >
          🛠️ Admin
        </button>
      </div>

      {isAdmin && (
        <span className="text-[10px] uppercase tracking-wide text-rose-500 sm:text-xs">
          Admin view
        </span>
      )}
    </header>
  );
}

// ===== Date Picker =====
function DatePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className={card}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 sm:text-base">
            Training session
          </h2>
          <p className="text-xs text-slate-500">
            {value} • {weekday(value)}
          </p>
        </div>
        <input
          type="date"
          className={`${input} w-auto`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}

// ===== Attendance List (Admin) =====
function AttendanceList({
  players,
  date,
  presentIds,
  setPresentIds,
}: {
  players: Player[];
  date: string;
  presentIds: string[];
  setPresentIds: (ids: string[]) => void;
}) {
  const togglePresence = (id: string) => {
    setPresentIds(
      presentIds.includes(id)
        ? presentIds.filter((x) => x !== id)
        : [...presentIds, id]
    );
  };

  const sortedPlayers = [...players].sort((a, b) =>
    a.name.localeCompare(b.name, "hu")
  );

  const totalPresent = presentIds.length;

  return (
    <div className={card}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 sm:text-base">
            Attendance – {date}
          </h3>
          <p className="text-xs text-slate-500">
            Tap the cards to mark who is present.
          </p>
        </div>
        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 sm:text-xs">
          {totalPresent} present
        </span>
      </div>

      <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-52 overflow-y-auto pr-1">
        {sortedPlayers.map((p) => {
          const checked = presentIds.includes(p.id);
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => togglePresence(p.id)}
                className={`
                  w-full rounded-xl px-2 py-2 text-xs sm:text-sm border text-left
                  flex items-center justify-between gap-2
                  transition-colors
                  ${
                    checked
                      ? "bg-emerald-50 border-emerald-300 text-slate-900"
                      : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                  }
                `}
              >
                <span className="truncate">{p.name}</span>
                <span
                  className={`
                    inline-flex h-5 min-w-[2.5rem] items-center justify-center rounded-full
                    text-[10px] sm:text-xs font-semibold
                    ${
                      checked
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }
                  `}
                >
                  {checked ? "Itt" : "Hiányzik"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ===== Draw Matches (Admin) =====



function DrawMatches({
  players,
  presentIds,
  matchesForDate,
  seenTeammatesToday,
  date,
  league,
  write,
}: {
  players: Player[];
  presentIds: string[];
  matchesForDate: Match[];
  seenTeammatesToday: Set<string>;
  date: string;
  league: LeagueDoc;
  write: (patch: Partial<LeagueDoc>) => void;
}) {
  const canDraw = presentIds.length >= 4;

  const baseName = (full: string) => full.replace(/^.+?\s/, "");

  const isCoach = (id: string) => {
    const p = players.find((pl) => pl.id === id);
    if (!p) return false;
    const name = baseName(p.name);
    return name === "Robi" || name === "Melinda";
  };

  const canBeTeammates = (aId: string, bId: string) =>
    !(isCoach(aId) && isCoach(bId));

  const draw = () => {
    if (!canDraw) return;

    const attendanceSet = new Set(presentIds);
    const presentPlayers = players.filter((p) => attendanceSet.has(p.id));
    if (presentPlayers.length < 4) return;

    const idToStats = new Map<string, { wins: number; matches: number }>();
    league.matches.forEach((m) => {
      const allIds = [...m.teamA, ...m.teamB];
      allIds.forEach((id) => {
        if (!idToStats.has(id)) {
          idToStats.set(id, { wins: 0, matches: 0 });
        }
      });

      const winners: string[] = [];
      if (m.winner === "A") winners.push(...m.teamA);
      if (m.winner === "B") winners.push(...m.teamB);

      allIds.forEach((id) => {
        const stats = idToStats.get(id)!;
        stats.matches += 1;
        if (winners.includes(id)) stats.wins += 1;
      });
    });

    const sortedIds = [...presentPlayers]
      .map((p) => {
        const s = idToStats.get(p.id) ?? { wins: 0, matches: 0 };
        const ratio = s.matches ? s.wins / s.matches : 0;
        return { id: p.id, ratio, matches: s.matches };
      })
      .sort((a, b) => {
        if (a.matches === 0 && b.matches === 0) {
          const pa = players.find((p) => p.id === a.id)?.name ?? "";
          const pb = players.find((p) => p.id === b.id)?.name ?? "";
          return pa.localeCompare(pb, "hu");
        }
        if (b.ratio !== a.ratio) return b.ratio - a.ratio;
        return b.matches - a.matches;
      })
      .map((x) => x.id);

    const key = (a: string, b: string) => [a, b].sort().join("|");

    const allMatches: Match[] = [];
    const localSeenTeammatesToday = new Set<string>(seenTeammatesToday);

    const pool: { id: string; ratio: number }[] = sortedIds.map((id) => {
      const s = idToStats.get(id) ?? { wins: 0, matches: 0 };
      const ratio = s.matches ? s.wins / s.matches : 0;
      return { id, ratio };
    });

    const totalInPool = pool.length;
    const minPlayersInMatch = 4;
    const maxMatches = Math.floor(totalInPool / minPlayersInMatch);
    if (maxMatches <= 0) return;

    const used = new Set<string>();

    const pickStrongest = () => {
      const available = pool.filter((p) => !used.has(p.id));
      if (!available.length) return null;
      return available.reduce((best, curr) =>
        curr.ratio > best.ratio ? curr : best
      );
    };

    const pickWeakestPartner = (forId: string) => {
      const available = pool
        .filter((p) => !used.has(p.id) && p.id !== forId)
        .sort((a, b) => a.ratio - b.ratio);

      for (const cand of available) {
        if (!canBeTeammates(forId, cand.id)) continue;
        if (!localSeenTeammatesToday.has(key(forId, cand.id))) {
          return cand;
        }
      }

      for (const cand of available) {
        if (!canBeTeammates(forId, cand.id)) continue;
        return cand;
      }
      return null;
    };

    const pickOpponents = (teamIds: string[]) => {
      const available = pool
        .filter((p) => !used.has(p.id) && !teamIds.includes(p.id))
        .sort((a, b) => a.ratio - b.ratio);

      if (available.length < 2) return null;

      for (let i = 0; i < available.length - 1; i++) {
        for (let j = i + 1; j < available.length; j++) {
          const c1 = available[i];
          const c2 = available[j];
          if (!canBeTeammates(c1.id, c2.id)) continue;

          const okPair =
            !localSeenTeammatesToday.has(key(c1.id, c2.id)) ||
            available.length <= 2;

          if (!okPair) continue;

          return [c1, c2] as const;
        }
      }

      let bestPair: [typeof available[0], typeof available[0]] | null = null;
      let bestScore = Infinity;
      for (let i = 0; i < available.length - 1; i++) {
        for (let j = i + 1; j < available.length; j++) {
          const c1 = available[i];
          const c2 = available[j];
          if (!canBeTeammates(c1.id, c2.id)) continue;
          const score = c1.ratio + c2.ratio;
          if (score < bestScore) {
            bestScore = score;
            bestPair = [c1, c2];
          }
        }
      }
      return bestPair;
    };

    for (let matchIndex = 0; matchIndex < maxMatches; matchIndex++) {
      const strongest = pickStrongest();
      if (!strongest) break;

      const partner = pickWeakestPartner(strongest.id);
      if (!partner) break;

      const teamAIds = [strongest.id, partner.id];

      const opponents = pickOpponents(teamAIds);
      if (!opponents) break;

      const teamBIds = [opponents[0].id, opponents[1].id];

      const m: Match = {
        id: uid(),
        date,
        teamA: [teamAIds[0], teamAIds[1]],
        teamB: [teamBIds[0], teamBIds[1]],
      };
      allMatches.push(m);

      used.add(teamAIds[0]);
      used.add(teamAIds[1]);
      used.add(teamBIds[0]);
      used.add(teamBIds[1]);

      localSeenTeammatesToday.add(key(teamAIds[0], teamAIds[1]));
      localSeenTeammatesToday.add(key(teamBIds[0], teamBIds[1]));

      const remainingAvailable = pool.filter((p) => !used.has(p.id));
      if (remainingAvailable.length < minPlayersInMatch) break;
    }

    if (!allMatches.length) return;

    write({
      matches: [...league.matches, ...allMatches],
    });
  };

  return (
    <div className={card}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 sm:text-base">
            Random matches
          </h3>
          <p className="text-xs text-slate-500">
            Draw balanced matches for the selected date.
          </p>
        </div>
        <button
          type="button"
          className={btnPrimary}
          disabled={!canDraw}
          onClick={draw}
        >
          🎲 Draw matches
        </button>
      </div>
      {!canDraw && (
        <p className="text-xs text-rose-500">
          At least 4 players must be present to draw matches.
        </p>
      )}
      {matchesForDate.length > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          Already {matchesForDate.length} matches scheduled for this day.
        </p>
      )}
    </div>
  );
}

// ===== Player Editor (Admin) =====
const EMOJIS = [
  "🐧",
  "🦊",
  "🐼",
  "🦁",
  "🐯",
  "🐸",
  "🐨",
  "🐰",
  "🐻",
  "🐙",
  "🐵",
  "🐶",
  "🐱",
  "🐭",
  "🐹",
  "🐮",
  "🐷",
  "🐔",
  "🐣",
  "🐢",
  "🐬",
  "🦉",
  "🦄",
  "🐝",
  "🐞",
  "🌟",
  "⚡",
  "🔥",
  "🎈",
  "🎾",
  "🏸",
  "🚀",
  "🎧",
  "🎮",
  "🌈",
  "🍀",
  "🍎",
  "🍉",
  "🍕",
];

function PlayerEditor({
  players,
  onAdd,
  onRemove,
  onUpdateEmoji,
}: {
  players: Player[];
  onAdd: (name: string, emoji?: string) => void;
  onRemove: (id: string) => void;
  onUpdateEmoji: (id: string, emoji?: string) => void;
}) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState<string | undefined>(undefined);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const getBaseName = (full: string) => full.replace(/^.+?\s/, "");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    const emojiPart = emoji ? emoji + " " : "";
    const finalName = emojiPart + trimmed;

    onAdd(finalName, emoji);
    setName("");
    setEmoji(undefined);
  };

  const sorted = [...players].sort((a, b) =>
    getBaseName(a.name).localeCompare(getBaseName(b.name), "hu")
  );

  const selectedPlayer = selectedPlayerId
    ? players.find((p) => p.id === selectedPlayerId) || null
    : null;

  const [editEmoji, setEditEmoji] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!selectedPlayer) {
      setEditEmoji(undefined);
      return;
    }
    const match = selectedPlayer.name.match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s/u);
    if (match) {
      setEditEmoji(match[0].trim());
    } else if (selectedPlayer.emoji) {
      setEditEmoji(selectedPlayer.emoji);
    } else {
      setEditEmoji(undefined);
    }
  }, [selectedPlayer?.id]);

  const updateEmoji = () => {
    if (!selectedPlayer) return;
    onUpdateEmoji(selectedPlayer.id, editEmoji);
  };

  return (
    <div className={card}>
      <h3 className="mb-2 text-sm font-semibold text-slate-900 sm:text-base">
        Players
      </h3>
      <form onSubmit={submit} className="space-y-2">
        <input
          className={input}
          placeholder="New player name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="flex flex-wrap gap-1">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              className={
                emoji === e
                  ? "rounded-full bg-sky-100 px-2 py-1 text-sm"
                  : "rounded-full bg-slate-100 px-2 py-1 text-sm"
              }
              onClick={() => setEmoji(emoji === e ? undefined : e)}
            >
              {e}
            </button>
          ))}
        </div>
        <button type="submit" className={btnPrimary}>
          ➕ Add player
        </button>
      </form>

      <div className="mt-4 border-t border-slate-100 pt-3">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Edit existing player
        </h4>
        <select
          className={input}
          value={selectedPlayerId || ""}
          onChange={(e) => setSelectedPlayerId(e.target.value)}
        >
          <option value="">Select a player</option>
          {sorted.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {selectedPlayer && (
          <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
            <div className="flex items-center justify-between">
              <span className="font-medium">{selectedPlayer.name}</span>
              <button
                type="button"
                className="text-xs text-rose-500 hover:text-rose-600"
                onClick={() => onRemove(selectedPlayer.id)}
              >
                Remove
              </button>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase text-slate-500">
                Emoji
              </p>
              <div className="flex flex-wrap gap-1">
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    className={
                      editEmoji === e
                        ? "rounded-full bg-sky-100 px-2 py-1 text-sm"
                        : "rounded-full bg-slate-100 px-2 py-1 text-sm"
                    }
                    onClick={() =>
                      setEditEmoji(editEmoji === e ? undefined : e)
                    }
                  >
                    {e}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className={`${btnSecondary} mt-2`}
                onClick={updateEmoji}
              >
                Save emoji
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ===== Admin Date Jump =====
function AdminDateJump({
  grouped,
  date,
  setDate,
  lastSessionDate,
}: {
  grouped: Record<string, Match[]>;
  date: string;
  setDate: (d: string) => void;
  lastSessionDate: string | null;
}) {
  const dates = Object.keys(grouped).sort().reverse();
  return (
    <div className={card}>
      <h3 className="mb-2 text-sm font-semibold text-slate-900 sm:text-base">
        Sessions
      </h3>
      <div className="flex flex-wrap gap-1">
        {dates.map((d) => (
          <button
            key={d}
            type="button"
            className={
              d === date
                ? "rounded-full bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-800"
                : "rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700 hover:bg-slate-200"
            }
            onClick={() => setDate(d)}
          >
            {d} • {weekday(d)}
          </button>
        ))}
        {lastSessionDate && !dates.includes(lastSessionDate) && (
          <button
            type="button"
            className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700"
            onClick={() => setDate(lastSessionDate)}
          >
            Last session ({lastSessionDate})
          </button>
        )}
      </div>
    </div>
  );
}

// ===== Backup Panel =====
function BackupPanel({
  backups,
  onCreate,
  onRestore,
}: {
  backups: Backup[];
  onCreate: () => void;
  onRestore: (id: string) => void;
}) {
  const sorted = [...backups].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
  return (
    <div className={card}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900 sm:text-base">
          Backups
        </h3>
        <button type="button" className={btnSecondary} onClick={onCreate}>
          💾 Create backup
        </button>
      </div>
      {sorted.length === 0 && (
        <p className="text-xs text-slate-500">No backups yet.</p>
      )}
      {sorted.length > 0 && (
        <ul className="space-y-1 text-xs text-slate-700">
          {sorted.map((b) => (
            <li
              key={b.id}
              className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1"
            >
              <span className="truncate">{b.label}</span>
              <button
                type="button"
                className="text-[11px] text-sky-600 hover:text-sky-700"
                onClick={() => onRestore(b.id)}
              >
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ===== Matches Admin =====
function MatchesAdmin({
  matches,
  nameOf,
  onPick,
  onClear,
  onDelete,
}: {
  matches: Match[];
  nameOf: (id: string) => string;
  onPick: (id: string, winner: "A" | "B" | "draw") => void;
  onClear: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (!matches.length) {
    return (
      <div className={card}>
        <h3 className="mb-2 text-sm font-semibold text-slate-900 sm:text-base">
          Matches (admin)
        </h3>
        <p className="text-xs text-slate-500">
          No matches for this day yet. Draw or create some above.
        </p>
      </div>
    );
  }

  return (
    <div className={card}>
      <h3 className="mb-2 text-sm font-semibold text-slate-900 sm:text-base">
        Matches (admin)
      </h3>
      <ul className="space-y-2 text-xs sm:text-sm">
        {matches.map((m) => (
          <li
            key={m.id}
            className="flex flex-col gap-1 rounded-xl bg-slate-50 p-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex flex-wrap items-center gap-1">
              <span className="font-medium text-slate-800">
                {nameOf(m.teamA[0])} & {nameOf(m.teamA[1])}
              </span>
              <span className="text-[11px] text-slate-400">vs</span>
              <span className="font-medium text-slate-800">
                {nameOf(m.teamB[0])} & {nameOf(m.teamB[1])}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                className={
                  m.winner === "A"
                    ? "rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800"
                    : "rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-200"
                }
                onClick={() => onPick(m.id, "A")}
              >
                A win
              </button>
              <button
                type="button"
                className={
                  m.winner === "B"
                    ? "rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800"
                    : "rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-200"
                }
                onClick={() => onPick(m.id, "B")}
              >
                B win
              </button>
              <button
                type="button"
                className={
                  m.winner === "draw"
                    ? "rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800"
                    : "rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-200"
                }
                onClick={() => onPick(m.id, "draw")}
              >
                Draw
              </button>
              {m.winner && (
                <button
                  type="button"
                  className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500 hover:bg-slate-200"
                  onClick={() => onClear(m.id)}
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] text-rose-600 hover:bg-rose-100"
                onClick={() => onDelete(m.id)}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ===== SelectPairs (Admin manual match creation) =====
function SelectPairs({
  players,
  freeIds,
  seenTeammates,
  onCreate,
}: {
  players: Player[];
  freeIds: string[];
  seenTeammates: Set<string>;
  onCreate: (m: Match) => void;
}) {
  const [teamA1, setTeamA1] = useState("");
  const [teamA2, setTeamA2] = useState("");
  const [teamB1, setTeamB1] = useState("");
  const [teamB2, setTeamB2] = useState("");

  const baseName = (full: string) => full.replace(/^.+?\s/, "");

  const getName = (id: string) =>
    players.find((p) => p.id === id)?.name || "—";

  const key = (a: string, b: string) => [a, b].sort().join("|");

  const currentIds = [teamA1, teamA2, teamB1, teamB2].filter(Boolean);

  const renderSelect = (
    label: string,
    value: string,
    onChange: (val: string) => void,
    excludeIds: string[]
  ) => {
    const options = players
      .filter((p) => !excludeIds.includes(p.id))
      .slice()
      .sort((a, b) => baseName(a.name).localeCompare(baseName(b.name), "hu"));

    return (
      <div className="space-y-1">
        <label className="block text-xs font-medium text-slate-500">
          {label}
        </label>
        <select
          className={input}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Select player</option>
          {options.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} {freeIds.includes(p.id) ? " (free)" : " (played)"}
            </option>
          ))}
        </select>
      </div>
    );
  };

  const canSubmit =
    teamA1 && teamA2 && teamB1 && teamB2 && new Set(currentIds).size === 4;

  const submit = () => {
    if (!canSubmit) return;

    const [a1, a2, b1, b2] = [teamA1, teamA2, teamB1, teamB2];

    const m: Match = {
      id: uid(),
      date: fmt(new Date()),
      teamA: [a1, a2],
      teamB: [b1, b2],
    };
    onCreate(m);

    setTeamA1("");
    setTeamA2("");
    setTeamB1("");
    setTeamB2("");
  };

  const hasPlayedTogether = (id1: string, id2: string) =>
    seenTeammates.has(key(id1, id2));

  return (
    <div className={card}>
      <h3 className="mb-2 text-sm font-semibold text-slate-900 sm:text-base">
        Manual match
      </h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {renderSelect("Team A – Player 1", teamA1, setTeamA1, [
          teamA2,
          teamB1,
          teamB2,
        ])}
        {renderSelect("Team A – Player 2", teamA2, setTeamA2, [
          teamA1,
          teamB1,
          teamB2,
        ])}
        {renderSelect("Team B – Player 1", teamB1, setTeamB1, [
          teamA1,
          teamA2,
          teamB2,
        ])}
        {renderSelect("Team B – Player 2", teamB2, setTeamB2, [
          teamA1,
          teamA2,
          teamB1,
        ])}
      </div>

      {canSubmit && (
        <div className="mt-2 rounded-xl bg-slate-50 p-2 text-xs text-slate-700">
          <p className="font-medium">Preview:</p>
          <p>
            <span className="font-semibold">
              {getName(teamA1)} & {getName(teamA2)}
            </span>{" "}
            vs{" "}
            <span className="font-semibold">
              {getName(teamB1)} & {getName(teamB2)}
            </span>
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {hasPlayedTogether(teamA1, teamA2) && (
              <>
                Team A has played together today.{" "}
              </>
            )}
            {hasPlayedTogether(teamB1, teamB2) && (
              <>Team B has played together today.</>
            )}
          </p>
        </div>
      )}

      <button
        type="button"
        className={`${btnPrimary} mt-3`}
        disabled={!canSubmit}
        onClick={submit}
      >
        ➕ Create match
      </button>
    </div>
  );
}

// ===== Matches Player View =====
function MatchesPlayer({
  grouped,
  nameOf,
}: {
  grouped: Record<string, Match[]>;
  nameOf: (id: string) => string;
}) {
  const dates = Object.keys(grouped).sort().reverse();

  if (!dates.length) {
    return (
      <div className={card}>
        <h3 className="mb-2 text-sm font-semibold text-slate-900 sm:text-base">
          Matches
        </h3>
        <p className="text-xs text-slate-500">
          No matches yet. Ask your coach to start the league. 😄
        </p>
      </div>
    );
  }

  return (
    <div className={card}>
      <h3 className="mb-2 text-sm font-semibold text-slate-900 sm:text-base">
        Matches
      </h3>
      <div className="space-y-3 text-xs sm:text-sm">
        {dates.map((d) => (
          <div key={d} className="space-y-1 rounded-xl bg-slate-50 p-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {d} • {weekday(d)}
              </span>
              <span className="text-[11px] text-slate-400">
                {grouped[d].length} match
                {grouped[d].length > 1 ? "es" : ""}
              </span>
            </div>
            <ul className="space-y-1">
              {grouped[d].map((m) => (
                <li key={m.id} className="flex flex-wrap gap-1">
                  <span
                    className={
                      m.winner === "A"
                        ? "font-semibold text-emerald-700"
                        : "text-slate-800"
                    }
                  >
                    {nameOf(m.teamA[0])} & {nameOf(m.teamA[1])}
                  </span>
                  <span className="text-[11px] text-slate-400">vs</span>
                  <span
                    className={
                      m.winner === "B"
                        ? "font-semibold text-emerald-700"
                        : "text-slate-800"
                    }
                  >
                    {nameOf(m.teamB[0])} & {nameOf(m.teamB[1])}
                  </span>
                  {m.winner === "draw" && (
                    <span className="ml-1 text-[11px] text-slate-500">
                      (draw)
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== Standings =====
function Standings({
  rows,
  achievementsById,
}: {
  rows: PlayerStats[];
  achievementsById: Map<string, Achievement[]>;
}) {
  if (!rows.length) {
    return (
      <div className={card}>
        <h3 className="mb-2 text-sm font-semibold text-slate-900 sm:text-base">
          Standings
        </h3>
        <p className="text-xs text-slate-500">
          Standings will appear once matches have been recorded.
        </p>
      </div>
    );
  }

  const bestMatches = rows.reduce((max, r) => Math.max(max, r.matches), 0);
  const bestWins = rows.reduce((max, r) => Math.max(max, r.wins), 0);

  return (
    <div className={card}>
      <h3 className="mb-2 text-sm font-semibold text-slate-900 sm:text-base">
        Standings
      </h3>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
        <span>
          🏆 <b>Total points:</b> base points + special bonus points.
        </span>
        <span>
          ⭐ <b>Bonus points:</b> +1 point for special achievements: beating
          Melinda, and reaching the Ironman 10-session streak.
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-500">
              <th className="py-1 pr-2">#</th>
              <th className="py-1 pr-2">Player</th>
              <th className="py-1 pr-2 text-right">M</th>
              <th className="py-1 pr-2 text-right">W</th>
              <th className="py-1 pr-2 text-right">Pts</th>
              <th className="py-1 pr-2 text-right">Bonus</th>
              <th className="py-1 pr-2 text-right">Total</th>
              <th className="py-1 pr-2">Badges</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const ach = achievementsById.get(r.id) || [];
              const highlight = idx === 0;
              return (
                <tr
                  key={r.id}
                  className={
                    highlight
                      ? "border-b border-slate-100 bg-amber-50/40"
                      : "border-b border-slate-50"
                  }
                >
                  <td className="py-1 pr-2 text-[11px] text-slate-500">
                    {idx + 1}
                  </td>
                  <td className="py-1 pr-2 font-medium text-slate-900">
                    {r.id}
                  </td>
                  <td className="py-1 pr-2 text-right text-slate-800">
                    {r.matches}
                    {r.matches === bestMatches && r.matches > 0 && (
                      <span className="ml-1 text-[10px] text-emerald-600">
                        • most
                      </span>
                    )}
                  </td>
                  <td className="py-1 pr-2 text-right text-slate-800">
                    {r.wins}
                    {r.wins === bestWins && r.wins > 0 && (
                      <span className="ml-1 text-[10px] text-emerald-600">
                        • top
                      </span>
                    )}
                  </td>
                  <td className="py-1 pr-2 text-right text-slate-800">
                    {r.basePoints}
                  </td>
                  <td className="py-1 pr-2 text-right text-emerald-700">
                    +{r.bonusPoints}
                  </td>
                  <td className="py-1 pr-2 text-right font-semibold text-slate-900">
                    {r.totalPoints}
                  </td>
                  <td className="py-1 pr-2">
                    <div className="flex flex-wrap gap-1">
                      {ach.map((a) => {
                        const style = badgeStyles[a.id];
                        if (!style) return null;
                        return (
                          <span
                            key={a.id}
                            className={`inline-flex items-center gap-0.5 rounded-full bg-gradient-to-r px-2 py-0.5 text-[10px] font-medium ${style.accent} ${style.bg}`}
                            title={a.description}
                          >
                            <span>{style.icon}</span>
                            <span>{a.label}</span>
                          </span>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ========================= App =========================

function App() {
  const [league, write] = useLeague();
  const { players, matches, backups = [] } = league;

  const [role, setRole] = useState<"player" | "admin">("player");

  const [meId, setMeId] = useState<string>(players.length ? players[0].id : "");
  const defaultDate = useMemo(() => fmt(nextTrainingDate()), []);
  const [date, setDate] = useState(defaultDate);
  const [presentIds, setPresentIds] = useState<string[]>([]);

  const grouped: Record<string, Match[]> = useMemo(() => {
    const map: Record<string, Match[]> = {};
    matches.forEach((m) => {
      if (!map[m.date]) map[m.date] = [];
      map[m.date].push(m);
    });
    Object.keys(map).forEach((d) => {
      map[d].sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
    });
    return map;
  }, [matches]);

  const matchesForDate = grouped[date] || [];

  const seenTeammatesToday = useMemo(() => {
    const s = new Set<string>();
    const key = (a: string, b: string) => [a, b].sort().join("|");
    matchesForDate.forEach((m) => {
      s.add(key(m.teamA[0], m.teamA[1]));
      s.add(key(m.teamB[0], m.teamB[1]));
    });
    return s;
  }, [matchesForDate]);

  const lastSessionDate =
    Object.keys(grouped).sort().reverse()[0] ?? null;

  useEffect(() => {
    if (players.length && !players.find((p) => p.id === meId)) {
      setMeId(players[0].id);
    }
  }, [players, meId]);

  const createBackup = () => {
    const id = uid();
    const label = `Backup ${new Date().toLocaleString()}`;
    const backup: Backup = {
      id,
      label,
      createdAt: new Date().toISOString(),
      players: league.players,
      matches: league.matches,
    };
    write({ backups: [...backups, backup] });
  };

  const restoreBackup = (id: string) => {
    const backup = backups.find((b) => b.id === id);
    if (!backup) return;
    if (
      !window.confirm(
        `Restore backup "${backup.label}"? This will overwrite current players and matches.`
      )
    )
      return;

    write({
      players: backup.players,
      matches: backup.matches,
    });
  };

  const addPlayer = (name: string, emoji?: string) => {
    const id = name;
    if (league.players.some((p) => p.id === id)) {
      alert("A player with this name already exists.");
      return;
    }
    write({
      players: [...league.players, { id, name, emoji, active: true }],
    });
  };

  const removePlayer = (id: string) => {
    if (!window.confirm("Remove this player and keep their matches?")) return;
    write({
      players: league.players.filter((p) => p.id !== id),
    });
  };

  const updatePlayerEmoji = (id: string, emoji?: string) => {
    write({
      players: league.players.map((p) =>
        p.id === id
          ? {
              ...p,
              emoji,
              name: emoji ? `${emoji} ${p.name.replace(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s/u, "")}` : p.name,
            }
          : p
      ),
    });
  };

  const nameOf = (id: string) =>
    league.players.find((p) => p.id === id)?.name || id;

  const pickWinner = (id: string, winner: "A" | "B" | "draw") => {
    write({
      matches: league.matches.map((m) =>
        m.id === id ? { ...m, winner } : m
      ),
    });
  };

  const clearWinner = (id: string) => {
    write({
      matches: league.matches.map((m) =>
        m.id === id ? { ...m, winner: undefined } : m
      ),
    });
  };

  const deleteMatch = (id: string) => {
    if (!window.confirm("Delete this match?")) return;
    write({
      matches: league.matches.filter((m) => m.id !== id),
    });
  };

  const createMatch = (m: Match) => {
    write({
      matches: [...league.matches, m],
    });
  };

  const statsAndAchievements = useMemo(() => {
    const { standings, achievementsMap } = computeStandings(
      league.players,
      league.matches
    );
    return { standings, achievementsMap };
  }, [league.players, league.matches]);

  const { standings, achievementsMap } = statsAndAchievements;

  const achievementsById = achievementsMap;

  const freeIds = useMemo(() => {
    const usedIds = new Set<string>();
    matchesForDate.forEach((m) => {
      [...m.teamA, ...m.teamB].forEach((id) => usedIds.add(id));
    });
    return league.players
      .map((p) => p.id)
      .filter((id) => !usedIds.has(id));
  }, [matchesForDate, league.players]);

  const setDateAndResetAttendance = (d: string) => {
    setDate(d);
    setPresentIds([]);
  };



  const myStats = useMemo(() => {
    if (!meId) return null;

    const stats = computePlayerStats(league.players, league.matches).find(
      (s) => s.id === meId
    );
    if (!stats) return null;

    const ach = achievementsMap.get(meId) || [];
    return { stats, achievements: ach };
  }, [meId, league.players, league.matches, achievementsMap]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Header
          title={league.title}
          role={role}
          setPlayer={() => setRole("player")}
          setAdmin={() => setRole("admin")}
        />

        <div className="space-y-4 sm:space-y-6">
          {/* ========================= ADMIN VIEW ========================= */}
          {role === "admin" && (
            <>
                  <section className="grid gap-4 sm:gap-6 md:grid-cols-3">
                    <div className="space-y-4 md:col-span-2">
                      <DatePicker value={date} onChange={setDateAndResetAttendance} />
                      <AttendanceList 
                        players={players} 
                        date={date} 
                        presentIds={presentIds} 
                        setPresentIds={setPresentIds} 
                      />
                      <DrawMatches
                        players={players}
                        presentIds={presentIds}
                        matchesForDate={matchesForDate}
                        seenTeammatesToday={seenTeammatesToday}
                        date={date}
                        league={league}
                        write={write}
                      />
                    </div>

                    <div className="space-y-4">
                      <PlayerEditor
                        players={players}
                        onAdd={addPlayer}
                        onRemove={removePlayer}
                        onUpdateEmoji={updatePlayerEmoji}
                      />
                      <AdminDateJump
                        grouped={grouped}
                        date={date}
                        setDate={setDateAndResetAttendance}
                        lastSessionDate={lastSessionDate}
                      />
                      <BackupPanel
                        onCreate={createBackup}
                        onRestore={restoreBackup}
                        backups={backups}
                      />
                    </div>
                  </section>

                  <section className="space-y-4">
                    <MatchesAdmin
                      matches={matchesForDate}
                      nameOf={nameOf}
                      onPick={pickWinner}
                      onClear={clearWinner}
                      onDelete={deleteMatch}
                    />
                    <SelectPairs
                      players={players}
                      freeIds={freeIds}
                      seenTeammates={seenTeammatesToday}
                      onCreate={createMatch}
                    />
                  </section>

                  <div className="mt-4 sm:mt-6">
                    <Standings
                      rows={standings}
                      achievementsById={achievementsById}
                    />
                  </div>
            </>
          )}

          {/* ========================= PLAYER VIEW ========================= */}
          {role === "player" && (
            <>
              <section className="grid gap-4 sm:gap-6 md:grid-cols-3">
                <div className="space-y-4 md:col-span-2">
                  <MatchesPlayer grouped={grouped} nameOf={nameOf} />
                </div>

                <div className="space-y-4">
                  <AdminDateJump
                    grouped={grouped}
                    date={date}
                    setDate={setDate}
                    lastSessionDate={lastSessionDate}
                  />
                  <div className={card}>
                    <h3 className="mb-2 text-sm font-semibold text-slate-900 sm:text-base">
                      My stats
                    </h3>
                    <div className="space-y-2">
                      <select
                        className={input}
                        value={meId}
                        onChange={(e) => setMeId(e.target.value)}
                      >
                        {players.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      {myStats ? (
                        <>
                          <div className="rounded-xl bg-slate-50 p-2 text-xs text-slate-800">
                            <p>
                              Matches:{" "}
                              <b>{myStats.stats.matches}</b>, Wins:{" "}
                              <b>{myStats.stats.wins}</b>, Draws:{" "}
                              <b>{myStats.stats.draws}</b>, Losses:{" "}
                              <b>{myStats.stats.losses}</b>
                            </p>
                            <p>
                              Points: <b>{myStats.stats.basePoints}</b> +{" "}
                              <span className="text-emerald-700">
                                {myStats.stats.bonusPoints} bonus
                              </span>{" "}
                              ={" "}
                              <b className="text-slate-900">
                                {myStats.stats.totalPoints}
                              </b>
                            </p>
                          </div>
                          {myStats.achievements.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                Achievements
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {myStats.achievements.map((a) => {
                                  const style = badgeStyles[a.id];
                                  return (
                                    <span
                                      key={a.id}
                                      className={`inline-flex items-center gap-0.5 rounded-full bg-gradient-to-r px-2 py-0.5 text-[10px] font-medium ${style.accent} ${style.bg}`}
                                      title={a.description}
                                    >
                                      <span>{style.icon}</span>
                                      <span>{a.label}</span>
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-slate-500">
                          No stats yet. Play some matches!
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              <div className="mt-4 sm:mt-6">
                <Standings rows={standings} achievementsById={achievementsById} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
