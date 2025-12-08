// 🔹 Polyfillek régi böngészőkhöz (iOS 10, régi Safari)
import "core-js/stable";
import "regenerator-runtime/runtime";
import "cross-fetch/polyfill";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

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
 * - Player/Admin toggle (jelszó NINCS)
 * - Emoji-s játékosnevek
 * - Training days: Monday & Wednesday; default = legközelebbi ilyen nap
 * - Firestore realtime sync (single doc: "leagues/default")
 * - Attendance + random & manual draw
 * - Robi & Melinda soha nem kerülhetnek egy párba
 * - Achievements, standings, backup
 * =============================================================
 */

// ========================= Types =========================
export type Player = { id: string; name: string };
export type Pair = [string, string];
export type Match = {
  id: string;
  date: string; // YYYY-MM-DD
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

export type LeagueDoc = {
  players: Player[];
  matches: Match[];
  createdAt?: any;
  updatedAt?: any;
  title?: string;
  backups?: Backup[];
};

export type Achievement = {
  id: string;
  title: string;
  description: string;
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
const key = (a: string, b: string) => [a, b].sort().join("::");

// név emoji nélküli része az ABC rendezéshez
const baseName = (full: string) => full.replace(/^.+?\s/, "");

// ========================= UI tokens =========================
const btnBase =
  "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed";

const btnPrimary = `${btnBase} bg-[#4f8ef7] text-white hover:bg-[#3b7ae0] focus-visible:ring-[#4f8ef7]`;
const btnSecondary = `${btnBase} border border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-100 focus-visible:ring-slate-400`;
const btnDanger = `${btnBase} bg-rose-500 text-white hover:bg-rose-600 focus-visible:ring-rose-400`;

const card =
  "relative overflow-hidden rounded-3xl bg-white p-4 shadow-sm border border-slate-200 text-slate-900";

const input =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4f8ef7]";

// Shuttlecock watermark
const ShuttleBg = () => (
  <svg
    className="pointer-events-none absolute right-2 top-2 h-16 w-16 opacity-15 text-slate-300"
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M14 38c6-10 16-16 26-20l6 6-8 22-10-4-8-4Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="40" cy="46" r="5" stroke="currentColor" strokeWidth="2" />
  </svg>
);

// Egyszerű összecsukható szekció a zsúfoltság csökkentésére
function Section({
  title,
  description,
  defaultOpen = true,
  children,
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={card}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <div>
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {description && (
            <p className="mt-0.5 text-xs text-slate-500">{description}</p>
          )}
        </div>
        <span
          className={`text-xs transition-transform ${
            open ? "rotate-90" : ""
          }`}
          aria-hidden
        >
          ›
        </span>
      </button>
      {open && <div className="mt-3 space-y-3">{children}</div>}
    </section>
  );
}

// ========================= Data sync (single league doc) =========================
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
        setData(snap.data() as LeagueDoc);
        setTimeout(() => (suppress.current = false), 0);
      } else {
        await setDoc(ref, {
          players: [],
          matches: [],
          backups: [],
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
      const next = { ...prev, ...patch };
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

// ========================= Header =========================
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
        <h1 className="text-xl font-bold sm:text-2xl">
          🏸 {title || "Bia-Tollas League"}
        </h1>
        <p className="text-xs text-slate-500">
          Biatorbágy – training on Monday & Wednesday
        </p>
      </div>
      <div className="flex gap-2">
        <div className="rounded-full border border-slate-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={setPlayer}
            className={`${btnBase} ${
              !isAdmin ? "bg-[#4f8ef7] text-white" : "bg-white text-slate-700"
            } px-3 py-1`}
          >
            Player
          </button>
          <button
            type="button"
            onClick={setAdmin}
            className={`${btnBase} ${
              isAdmin ? "bg-[#4f8ef7] text-white" : "bg-white text-slate-700"
            } px-3 py-1`}
          >
            Admin
          </button>
        </div>
      </div>
    </header>
  );
}

// ========================= Date helper =========================
function nextTrainingDate(): Date {
  const today = new Date();
  const day = today.getDay(); // 0=Sun ... 1=Mon ... 3=Wed
  const copy = new Date(today);
  if (day <= 1) {
    // Sunday/Monday -> Monday
    copy.setDate(today.getDate() + (1 - day));
  } else if (day <= 3) {
    // Tue/Wed -> Wed
    copy.setDate(today.getDate() + (3 - day));
  } else {
    // Thu–Sat -> next Monday
    const daysToMon = 8 - day;
    copy.setDate(today.getDate() + daysToMon);
  }
  return copy;
}

// ========================= ACHIEVEMENTS =========================

const BADGE_CONFIG: Record<
  string,
  { icon: string; title: string; description: string }
> = {
  win5: {
    icon: "🥉",
    title: "Rising Star",
    description: "5 wins collected",
  },
  win10: {
    icon: "🥈",
    title: "Solid Player",
    description: "10 wins collected",
  },
  win25: {
    icon: "🥇",
    title: "Legend",
    description: "25 wins collected",
  },
  beatMelinda: {
    icon: "🎯",
    title: "Beat the Coach",
    description: "Won a match against Melinda",
  },
  streak3: {
    icon: "🔥",
    title: "Warm-up",
    description: "3-session attendance streak",
  },
  streak6: {
    icon: "💪",
    title: "Iron Squad",
    description: "6-session attendance streak",
  },
  streak10: {
    icon: "🏆",
    title: "Ironman",
    description: "10-session attendance streak",
  },
  min5: {
    icon: "📊",
    title: "On the board",
    description: "Played at least 5 matches",
  },
};

function computeAttendanceStreak(
  playerId: string,
  grouped: { date: string; matches: Match[] }[]
): number {
  // grouped: legújabb elöl
  let streak = 0;
  for (const g of grouped) {
    const present = g.matches.some((m) =>
      [m.teamA[0], m.teamA[1], m.teamB[0], m.teamB[1]].includes(playerId)
    );
    if (present) streak++;
    else break;
  }
  return streak;
}

function computeAchievementsFull(
  playerId: string,
  matches: Match[],
  players: Player[]
): Achievement[] {
  const result: Achievement[] = [];
  const playerMatches = matches.filter((m) =>
    [m.teamA[0], m.teamA[1], m.teamB[0], m.teamB[1]].includes(playerId)
  );
  const wins = playerMatches.filter((m) => {
    if (!m.winner) return false;
    const isTeamA = m.teamA.includes(playerId);
    return (isTeamA && m.winner === "A") || (!isTeamA && m.winner === "B");
  });

  const melinda = players.find((p) =>
    p.name.toLowerCase().includes("melinda")
  );
  const hasBeatMelinda =
    melinda &&
    playerMatches.some((m) => {
      if (!m.winner) return false;
      const bothInA = m.teamA.includes(playerId) && m.teamA.includes(melinda.id);
      const bothInB = m.teamB.includes(playerId) && m.teamB.includes(melinda.id);
      if (bothInA || bothInB) return false; // csapattárs
      const isA = m.teamA.includes(playerId);
      const playerWon =
        (isA && m.winner === "A") || (!isA && m.winner === "B");
      const melindaTeamWon =
        (m.teamA.includes(melinda.id) && m.winner === "A") ||
        (m.teamB.includes(melinda.id) && m.winner === "B");
      return playerWon && !melindaTeamWon;
    });

  // win milestones
  if (wins.length >= 5)
    result.push({
      id: "win5",
      title: BADGE_CONFIG.win5.title,
      description: BADGE_CONFIG.win5.description,
    });
  if (wins.length >= 10)
    result.push({
      id: "win10",
      title: BADGE_CONFIG.win10.title,
      description: BADGE_CONFIG.win10.description,
    });
  if (wins.length >= 25)
    result.push({
      id: "win25",
      title: BADGE_CONFIG.win25.title,
      description: BADGE_CONFIG.win25.description,
    });

  if (hasBeatMelinda)
    result.push({
      id: "beatMelinda",
      title: BADGE_CONFIG.beatMelinda.title,
      description: BADGE_CONFIG.beatMelinda.description,
    });

  // min matches
  if (playerMatches.length >= 5)
    result.push({
      id: "min5",
      title: BADGE_CONFIG.min5.title,
      description: BADGE_CONFIG.min5.description,
    });

  // streak – majd a teljes grouped alapján számoljuk az App-ban,
  // itt csak helyet tartunk az ID-knek
  return result;
}

function PlayerAchievements({
  players,
  matches,
  meId,
  grouped,
}: {
  players: Player[];
  matches: Match[];
  meId: string;
  grouped: { date: string; matches: Match[] }[];
}) {
  const me = players.find((p) => p.id === meId);
  if (!me || !players.length) return null;

  const ach = computeAchievementsFull(meId, matches, players);
  const streak = computeAttendanceStreak(meId, grouped);
  if (streak >= 3) {
    ach.push({
      id: streak >= 10 ? "streak10" : streak >= 6 ? "streak6" : "streak3",
      title:
        streak >= 10
          ? BADGE_CONFIG.streak10.title
          : streak >= 6
          ? BADGE_CONFIG.streak6.title
          : BADGE_CONFIG.streak3.title,
      description: `Attendance streak: ${streak} sessions`,
    });
  }

  const BADGE_META: Record<
    string,
    { icon: string; accent: string; bg: string }
  > = {
    win5: {
      icon: "🥉",
      accent: "text-amber-700",
      bg: "from-amber-50 via-white to-slate-50",
    },
    win10: {
      icon: "🥈",
      accent: "text-slate-700",
      bg: "from-slate-50 via-white to-indigo-50",
    },
    win25: {
      icon: "🥇",
      accent: "text-yellow-700",
      bg: "from-yellow-50 via-white to-amber-50",
    },
    beatMelinda: {
      icon: "🎯",
      accent: "text-rose-700",
      bg: "from-rose-50 via-white to-indigo-50",
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
      bg: "from-indigo-50 via-white to-amber-50",
    },
    min5: {
      icon: "📊",
      accent: "text-slate-700",
      bg: "from-slate-50 via-white to-slate-100",
    },
  };

  return (
    <div className={card}>
      <ShuttleBg />
      <h3 className="mb-2 text-sm font-semibold">My achievements</h3>
      {ach.length === 0 ? (
        <p className="text-sm text-gray-500">
          Play more matches to unlock badges!
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {ach.map((a) => {
            const meta =
              BADGE_META[a.id] || {
                icon: "⭐",
                accent: "text-slate-700",
                bg: "from-slate-50 via-white to-slate-100",
              };
            return (
              <div
                key={a.id}
                className={`relative overflow-hidden rounded-2xl border border-slate-100 bg-gradient-to-br ${meta.bg} p-3 text-xs`}
              >
                <div className="flex items-center gap-2">
                  <span className={`text-lg ${meta.accent}`}>{meta.icon}</span>
                  <div>
                    <p className={`font-semibold ${meta.accent}`}>{a.title}</p>
                    <p className="text-[11px] text-slate-600">
                      {a.description}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {streak > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          Current attendance streak:{" "}
          <span className="font-semibold">{streak} sessions</span>
        </p>
      )}
    </div>
  );
}

// ========================= Attendance =========================

function DatePicker({
  date,
  setDate,
}: {
  date: string;
  setDate: (d: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-gray-500">Date</label>
      <input
        type="date"
        className={input}
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />
      <p className="text-xs text-gray-500">
        {weekday(date)} • click on players below to mark attendance
      </p>
    </div>
  );
}

function AttendanceList({
  players,
  presentIds,
  setPresentIds,
}: {
  players: Player[];
  presentIds: string[];
  setPresentIds: (ids: string[]) => void;
}) {
  const toggle = (id: string) => {
    setPresentIds(
      presentIds.includes(id)
        ? presentIds.filter((x) => x !== id)
        : [...presentIds, id]
    );
  };

  const sorted = [...players].sort((a, b) =>
    baseName(a.name).localeCompare(baseName(b.name), "hu")
  );

  return (
    <div className={card}>
      <ShuttleBg />
      <h3 className="mb-2 text-sm font-semibold">Attendance</h3>
      {players.length === 0 ? (
        <p className="text-sm text-gray-500">No players yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {sorted.map((p) => {
            const active = presentIds.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs sm:text-sm transition-colors ${
                  active
                    ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                }`}
              >
                <span className="truncate">{p.name}</span>
                {active && <span className="ml-1 text-xs">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ========================= Player editor =========================

const EMOJIS = [
  "😀",
  "😃",
  "😄",
  "😁",
  "😆",
  "😅",
  "🤣",
  "😂",
  "🙂",
  "🙃",
  "😉",
  "😊",
  "😇",
  "🥰",
  "😍",
  "🤩",
  "😘",
  "😜",
  "🤪",
  "😎",
  "🤓",
  "🧐",
  "😏",
  "😴",
  "🤠",
  "🥳",
  "😺",
  "😸",
  "😹",
  "😻",
  "🐼",
  "🐻",
  "🐯",
  "🦊",
  "🐸",
  "🐵",
  "🐧",
  "🐶",
  "🐱",
];

function getEmoji(full: string) {
  const m = full.match(/^(.+?)\s/);
  return m ? m[1] : "😀";
}
function getBaseName(full: string) {
  const m = full.match(/^.+?\s(.*)$/);
  return m ? m[1] : full;
}

function PlayerEditor({
  players,
  onAdd,
  onRemove,
  onUpdateEmoji,
  disabled,
}: {
  players: Player[];
  onAdd: (name: string) => void;
  onRemove: (id: string) => void;
  onUpdateEmoji: (id: string, emoji: string) => void;
  disabled?: boolean;
}) {
  const [newName, setNewName] = useState("");
  const [selectedEmoji, setSelectedEmoji] = useState("😀");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const selectedPlayer = players.find((p) => p.id === selectedPlayerId);

  const sortedPlayers = [...players].sort((a, b) =>
    baseName(a.name).localeCompare(baseName(b.name), "hu")
  );

  return (
    <div className={card}>
      <ShuttleBg />
      <h3 className="mb-3 font-semibold text-sm">Players</h3>

      {/* Új játékos hozzáadása */}
      <div className="mb-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
          Add new player
        </h4>
        <div className="grid grid-cols-[auto,1fr] gap-2">
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-xl"
            disabled={!!disabled}
          >
            {selectedEmoji}
          </button>
          <input
            className={input}
            placeholder="Player name"
            value={newName}
            disabled={!!disabled}
            onChange={(e) => setNewName(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1 max-h-18 overflow-y-auto">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              className={`rounded-lg border px-2 py-1 text-xs ${
                e === selectedEmoji
                  ? "bg-[#e0edff] border-[#4f8ef7]"
                  : "bg-white border-slate-200"
              }`}
              onClick={() => setSelectedEmoji(e)}
              disabled={!!disabled}
            >
              {e}
            </button>
          ))}
        </div>
        <button
          className={btnPrimary}
          disabled={!newName.trim() || !!disabled}
          onClick={() => {
            const full = `${selectedEmoji} ${newName.trim()}`;
            onAdd(full);
            setNewName("");
          }}
        >
          Add player
        </button>
      </div>

      {/* Játékos módosítás/törlés */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
          Manage existing players
        </h4>
        <select
          className={input}
          value={selectedPlayerId || ""}
          onChange={(e) => setSelectedPlayerId(e.target.value)}
          disabled={players.length === 0 || !!disabled}
        >
          <option value="" disabled>
            Select a player to edit
          </option>
          {sortedPlayers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {selectedPlayer && (
          <div className="space-y-3">
            <button
              className={btnDanger}
              onClick={() => onRemove(selectedPlayer.id)}
              disabled={!!disabled}
            >
              Remove Player ({getBaseName(selectedPlayer.name)})
            </button>

            <div>
              <div className="mb-1 text-xs text-slate-500">
                Change emoji for{" "}
                <span className="font-semibold">
                  {getBaseName(selectedPlayer.name)}
                </span>
              </div>
              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    className={`rounded-lg border px-2 py-1 text-xs ${
                      e === getEmoji(selectedPlayer.name)
                        ? "bg-[#e0edff] border-[#4f8ef7]"
                        : "bg-white border-slate-200"
                    }`}
                    onClick={() => {
                      onUpdateEmoji(selectedPlayer.id, e);
                    }}
                    disabled={!!disabled}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ========================= Random Draw =========================

function DrawMatches({
  players,
  presentIds,
  matchesToday,
  onCreateMatches,
}: {
  players: Player[];
  presentIds: string[];
  matchesToday: Match[];
  onCreateMatches: (ms: Match[]) => void;
}) {
  const [running, setRunning] = useState(false);

  const handleDraw = () => {
    if (presentIds.length < 4 || running) return;
    setRunning(true);

    const shuffled = [...presentIds].sort(() => Math.random() - 0.5);
    const seenPairs = new Set<string>();
    matchesToday.forEach((m) => {
      if (m.winner) {
        seenPairs.add(key(m.teamA[0], m.teamA[1]));
        seenPairs.add(key(m.teamB[0], m.teamB[1]));
      }
    });

    // Edzők azonosítása név alapján
    const findByName = (substr: string) =>
      players.find((p) => p.name.toLowerCase().includes(substr.toLowerCase()));
    const robi = findByName("robi");
    const melinda = findByName("melinda");

    const newMatches: Match[] = [];
    const pool = [...shuffled];

    const isCoachPair = (a: string, b: string) =>
      (robi && melinda && ((a === robi.id && b === melinda.id) || (a === melinda.id && b === robi.id)));

    while (pool.length >= 4) {
      let a1 = pool.shift()!;
      let a2Idx = pool.findIndex(
        (id) =>
          !seenPairs.has(key(a1, id)) && !isCoachPair(a1, id)
      );
      if (a2Idx === -1) {
        // ha nem talált “jó” társat, engedjük a seenPairs-t, de ne legyen edző-edző
        a2Idx = pool.findIndex((id) => !isCoachPair(a1, id));
      }
      if (a2Idx === -1) break;
      const [a2] = pool.splice(a2Idx, 1);

      let b1 = pool.shift()!;
      let b2Idx = pool.findIndex(
        (id) =>
          !seenPairs.has(key(b1, id)) && !isCoachPair(b1, id)
      );
      if (b2Idx === -1) {
        b2Idx = pool.findIndex((id) => !isCoachPair(b1, id));
      }
      if (b2Idx === -1) break;
      const [b2] = pool.splice(b2Idx, 1);

      seenPairs.add(key(a1, a2));
      seenPairs.add(key(b1, b2));

      newMatches.push({
        id: uid(),
        date: matchesToday[0]?.date || fmt(new Date()),
        teamA: [a1, a2],
        teamB: [b1, b2],
      });
    }

    onCreateMatches(newMatches);
    setRunning(false);
  };

  const disabled = running || presentIds.length < 4;

  return (
    <div className={card}>
      <ShuttleBg />
      <h3 className="mb-2 text-sm font-semibold">Random draw</h3>
      <p className="mb-2 text-xs text-slate-500">
        Creates random pairs from the attendance list. Robi &amp; Melinda will
        never be in the same team.
      </p>
      <button className={btnPrimary} disabled={disabled} onClick={handleDraw}>
        Draw new matches
      </button>
      {presentIds.length < 4 && (
        <p className="mt-2 text-xs text-amber-600">
          At least 4 players must be present.
        </p>
      )}
    </div>
  );
}

// ========================= Matches admin / player =========================

function MatchesAdmin({
  matches,
  nameOf,
  onPick,
  onClear,
  onDelete,
}: {
  matches: Match[];
  nameOf: (id: string) => string;
  onPick: (id: string, w: "A" | "B") => void;
  onClear: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className={card}>
      <ShuttleBg />
      <h3 className="mb-2 font-semibold">Matches (Admin)</h3>
      {matches.length === 0 ? (
        <p className="text-sm text-gray-500">No matches for this date yet.</p>
      ) : (
        <ul className="space-y-3">
          {matches.map((m) => (
            <li
              key={m.id}
              className="rounded-xl border border-slate-200 p-3 bg-white"
            >
              <div className="mb-2 text-sm">
                <p>
                  <span className="font-semibold">Team A:</span>{" "}
                  {nameOf(m.teamA[0])} & {nameOf(m.teamA[1])}
                </p>
                <p>
                  <span className="font-semibold">Team B:</span>{" "}
                  {nameOf(m.teamB[0])} & {nameOf(m.teamB[1])}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  className={`${btnBase} px-3 py-1 text-xs ${
                    m.winner === "A"
                      ? "bg-emerald-500 text-white"
                      : "bg-white border border-slate-200 text-slate-800 hover:bg-emerald-50"
                  }`}
                  onClick={() => onPick(m.id, "A")}
                >
                  {m.winner === "A" ? "Winner (A) 🏆" : "Pick A"}
                </button>
                <button
                  className={`${btnBase} px-3 py-1 text-xs ${
                    m.winner === "B"
                      ? "bg-emerald-500 text-white"
                      : "bg-white border border-slate-200 text-slate-800 hover:bg-emerald-50"
                  }`}
                  onClick={() => onPick(m.id, "B")}
                >
                  {m.winner === "B" ? "Winner (B) 🏆" : "Pick B"}
                </button>
                <button
                  className={`${btnBase} border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50`}
                  onClick={() => onClear(m.id)}
                >
                  Clear
                </button>
                <button
                  className={`${btnBase} bg-rose-50 px-3 py-1 text-xs text-rose-700 hover:bg-rose-100`}
                  onClick={() => onDelete(m.id)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MatchesPlayer({
  grouped,
  nameOf,
}: {
  grouped: { date: string; matches: Match[] }[];
  nameOf: (id: string) => string;
}) {
  const [openDate, setOpenDate] = useState<string | null>(null);
  const latestDate = useMemo(
    () => (grouped.length > 0 ? grouped[0].date : null),
    [grouped]
  );
  useEffect(() => {
    if (!latestDate) return;
    setOpenDate((prev) => (prev === latestDate ? prev : latestDate));
  }, [grouped, latestDate]);

  return (
    <div className={card}>
      <ShuttleBg />
      <h3 className="mb-2 font-semibold">Results by date</h3>
      {grouped.length === 0 ? (
        <p className="text-sm text-gray-500">No matches yet.</p>
      ) : (
        <div className="space-y-2">
          {grouped.map((g) => {
            const isOpen = openDate === g.date;

            const presentIds = new Set<string>();
            g.matches.forEach((m) => {
              m.teamA.forEach((id) => presentIds.add(id));
              m.teamB.forEach((id) => presentIds.add(id));
            });
            const presentPlayers = Array.from(presentIds)
              .map(nameOf)
              .sort((a, b) => baseName(a).localeCompare(baseName(b), "hu"));

            return (
              <div
                key={g.date}
                id={`date-${g.date}`}
                className="rounded-xl border border-slate-200 bg-white"
              >
                <button
                  type="button"
                  onClick={() => setOpenDate(isOpen ? null : g.date)}
                  className={`
                    flex w-full items-center justify-between p-3 transition-colors
                    bg-white
                    ${
                      isOpen
                        ? "bg-slate-100 rounded-t-xl"
                        : "hover:bg-slate-50 rounded-xl"
                    }
                  `}
                >
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <span className="text-lg font-medium">{g.date}</span>
                    <span className="text-sm text-gray-500">
                      {weekday(g.date)} ({g.matches.length} matches)
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-slate-500">
                    <span className="text-xs font-medium">
                      {isOpen ? "Close ⏶" : "Open ⏷"}
                    </span>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-slate-100 p-3 space-y-3">
                    <div className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
                      <p className="font-semibold mb-1">Players present</p>
                      <p className="leading-snug">
                        {presentPlayers.join(", ")}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <p className="mb-1 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                        Matches played
                      </p>
                      <ul className="space-y-3">
                        {g.matches.map((m) => {
                          const winA = m.winner === "A";
                          const winB = m.winner === "B";
                          return (
                            <li
                              key={m.id}
                              className={`rounded-lg border p-3 text-sm transition-colors ${
                                m.winner
                                  ? "border-slate-200 bg-white shadow-sm"
                                  : "border-slate-100 bg-slate-50 text-gray-500"
                              }`}
                            >
                              <p className="mb-1 text-xs">
                                Match{" "}
                                {m.winner ? (
                                  <span className="text-emerald-600 font-medium">
                                    (finished)
                                  </span>
                                ) : (
                                  "(no result yet)"
                                )}
                              </p>
                              <div
                                className={`
                                flex items-center justify-between
                                ${winA && "font-semibold text-emerald-700"}
                              `}
                              >
                                <p>
                                  {nameOf(m.teamA[0])} & {nameOf(m.teamA[1])}
                                </p>
                                {m.winner && (
                                  <span className="text-xs font-semibold">
                                    {winA ? "Win 🏆" : "Loss 😞"}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-gray-400">vs</div>
                              <div
                                className={`
                                flex items-center justify-between
                                ${winB && "font-semibold text-emerald-700"}
                              `}
                              >
                                <p>
                                  {nameOf(m.teamB[0])} & {nameOf(m.teamB[1])}
                                </p>
                                {m.winner && (
                                  <span className="text-xs font-semibold">
                                    {winB ? "Win 🏆" : "Loss 😞"}
                                  </span>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ========================= Admin date jump & backup =========================

function AdminDateJump({
  grouped,
  date,
  setDate,
  lastSessionDate,
}: {
  grouped: { date: string; matches: Match[] }[];
  date: string;
  setDate: (d: string) => void;
  lastSessionDate?: string | null;
}) {
  return (
    <div className={card}>
      <ShuttleBg />
      <h3 className="mb-2 font-semibold">Jump to date</h3>
      {grouped.length === 0 ? (
        <p className="text-sm text-gray-500">No sessions recorded yet.</p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            Current date: <span className="font-semibold">{date}</span>
          </p>
          <ul className="space-y-1 max-h-40 overflow-y-auto">
            {grouped.map((g) => (
              <li key={g.date}>
                <a
                  href={`#date-${g.date}`}
                  className="flex items-center justify-between hover:text-[#4f8ef7]"
                  onClick={(e) => {
                    e.preventDefault();
                    setDate(g.date);
                    window.scrollTo(0, 0);
                  }}
                >
                  <span>{g.date}</span>
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    {weekday(g.date)}
                    {lastSessionDate === g.date && (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 border border-emerald-200">
                        Last
                      </span>
                    )}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function BackupPanel({
  backups,
  onCreate,
  onRestore,
}: {
  backups: Backup[];
  onCreate: (note: string) => void;
  onRestore: (id: string) => void;
}) {
  const [note, setNote] = useState("");
  const sortedBackups = useMemo(
    () => [...backups].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [backups]
  );
  return (
    <div className={card}>
      <ShuttleBg />
      <h3 className="mb-2 font-semibold">Data Backup</h3>
      <div className="space-y-4">
        <div className="space-y-2 rounded-xl border border-slate-200 p-3 bg-white">
          <h4 className="font-medium text-sm">Create new backup</h4>
          <input
            className={input}
            placeholder="Optional note (e.g. 'Before season 2')"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button
            className={btnSecondary}
            onClick={() => {
              onCreate(note);
              setNote("");
            }}
          >
            Create Backup
          </button>
        </div>

        <div className="space-y-2">
          <h4 className="font-medium text-sm">Restore backup</h4>
          {sortedBackups.length === 0 ? (
            <p className="text-sm text-gray-500">No backups yet.</p>
          ) : (
            <ul className="space-y-2 max-h-52 overflow-y-auto">
              {sortedBackups.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 p-2 text-sm bg-white"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {new Date(b.createdAt).toLocaleString()}
                    </div>
                    <div className="truncate text-xs text-gray-500">
                      {b.note || "No note"}
                    </div>
                  </div>
                  <button
                    className={`${btnBase} border border-slate-200 bg-slate-50 px-3 py-1 text-xs hover:bg-slate-100`}
                    onClick={() => onRestore(b.id)}
                  >
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ========================= Manual match creation =========================

function SelectPairs({
  players,
  freeIds,
  seenTeammates,
  onCreate,
  disabled,
}: {
  players: Player[];
  freeIds: string[];
  seenTeammates: Set<string>;
  onCreate: (a: Pair, b: Pair) => void;
  disabled?: boolean;
}) {
  const [teamA1, setTeamA1] = useState<string>("");
  const [teamA2, setTeamA2] = useState<string>("");
  const [teamB1, setTeamB1] = useState<string>("");
  const [teamB2, setTeamB2] = useState<string>("");

  const reset = () => {
    setTeamA1("");
    setTeamA2("");
    setTeamB1("");
    setTeamB2("");
  };

  const selectedIds = [teamA1, teamA2, teamB1, teamB2].filter(Boolean);
  const hasDuplicate = new Set(selectedIds).size !== selectedIds.length;
  const canCreate = !disabled && selectedIds.length === 4 && !hasDuplicate;

  const warnA = !!teamA1 && !!teamA2 && seenTeammates.has(key(teamA1, teamA2));
  const warnB = !!teamB1 && !!teamB2 && seenTeammates.has(key(teamB1, teamB2));

  const renderSelect = (
    label: string,
    value: string,
    onChange: (val: string) => void,
    excludeIds: string[]
  ) => {
    const options = players
      .filter((p) => !excludeIds.includes(p.id))
      .sort((a, b) =>
        baseName(a.name).localeCompare(baseName(b.name), "hu")
      );

    return (
      <div className="space-y-1">
        <label className="text-xs text-gray-500 block">{label}:</label>
        <select
          className={input}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={!!disabled}
        >
          <option value="" disabled>
            Select player
          </option>
          {options.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} {freeIds.includes(p.id) ? " (free)" : " (played)"}
            </option>
          ))}
        </select>
      </div>
    );
  };

  return (
    <div className={card}>
      <ShuttleBg />
      <h3 className="mb-2 font-semibold">Manual Match Creation</h3>

      <div className="grid gap-4 sm:grid-cols-2">
        <div
          className={`rounded-xl border p-3 ${
            warnA ? "border-amber-400 bg-amber-50/50" : "border-slate-200"
          }`}
        >
          <p className="mb-2 text-xs font-semibold text-slate-600 uppercase tracking-wide">
            Team A
          </p>
          <div className="space-y-2">
            {renderSelect(
              "Team A – Player 1",
              teamA1,
              setTeamA1,
              [teamA2, teamB1, teamB2].filter(Boolean) as string[]
            )}
            {renderSelect(
              "Team A – Player 2",
              teamA2,
              setTeamA2,
              [teamA1, teamB1, teamB2].filter(Boolean) as string[]
            )}
          </div>
          {warnA && (
            <p className="mt-1 text-xs text-amber-700">
              These two already played together today (with result).
            </p>
          )}
        </div>

        <div
          className={`rounded-xl border p-3 ${
            warnB ? "border-amber-400 bg-amber-50/50" : "border-slate-200"
          }`}
        >
          <p className="mb-2 text-xs font-semibold text-slate-600 uppercase tracking-wide">
            Team B
          </p>
          <div className="space-y-2">
            {renderSelect(
              "Team B – Player 1",
              teamB1,
              setTeamB1,
              [teamA1, teamA2, teamB2].filter(Boolean) as string[]
            )}
            {renderSelect(
              "Team B – Player 2",
              teamB2,
              setTeamB2,
              [teamA1, teamA2, teamB1].filter(Boolean) as string[]
            )}
          </div>
          {warnB && (
            <p className="mt-1 text-xs text-amber-700">
              These two already played together today (with result).
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2 text-xs">
        <button
          className={btnPrimary}
          disabled={!canCreate}
          onClick={() => {
            onCreate(
              [teamA1, teamA2] as Pair,
              [teamB1, teamB2] as Pair
            );
            reset();
          }}
        >
          Add match
        </button>
        <button
          className={btnSecondary}
          type="button"
          onClick={reset}
          disabled={!!disabled && selectedIds.length === 0}
        >
          Reset
        </button>
        {hasDuplicate && (
          <span className="text-rose-600">
            The same player cannot be in two positions in one match.
          </span>
        )}
        <span className="text-gray-500">
          Tip: Players can appear in multiple matches on the same date.
        </span>
      </div>
    </div>
  );
}

// ========================= Player stats & standings =========================

function PlayerStats({
  players,
  matches,
  meId,
  setMeId,
}: {
  players: Player[];
  matches: Match[];
  meId: string;
  setMeId: (id: string) => void;
}) {
  const me = players.find((p) => p.id === meId) ?? players[0];
  const allSorted = [...players].sort((a, b) =>
    baseName(a.name).localeCompare(baseName(b.name), "hu")
  );

  const stats = useMemo(() => {
    if (!me) return null;
    const myMatches = matches.filter((m) =>
      [m.teamA[0], m.teamA[1], m.teamB[0], m.teamB[1]].includes(me.id)
    );
    const wins = myMatches.filter((m) => {
      if (!m.winner) return false;
      const isA = m.teamA.includes(me.id);
      return (isA && m.winner === "A") || (!isA && m.winner === "B");
    }).length;
    const losses = myMatches.filter((m) => m.winner && !wins).length;
    const played = myMatches.length;
    const winRate = played ? Math.round((wins / played) * 100) : 0;
    return { played, wins, losses, winRate };
  }, [matches, me]);

  if (!me || !stats) return null;

  return (
    <div className={card}>
      <ShuttleBg />
      <h3 className="mb-2 text-sm font-semibold">My stats</h3>
      <div className="mb-3">
        <label className="mb-1 block text-xs text-slate-500">
          Select player
        </label>
        <select
          className={input}
          value={me.id}
          onChange={(e) => setMeId(e.target.value)}
        >
          {allSorted.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-slate-50 p-2">
          <dt className="text-xs text-slate-500">Matches</dt>
          <dd className="text-lg font-semibold">{stats.played}</dd>
        </div>
        <div className="rounded-xl bg-emerald-50 p-2">
          <dt className="text-xs text-slate-500">Wins</dt>
          <dd className="text-lg font-semibold text-emerald-700">
            {stats.wins}
          </dd>
        </div>
        <div className="rounded-xl bg-rose-50 p-2">
          <dt className="text-xs text-slate-500">Losses</dt>
          <dd className="text-lg font-semibold text-rose-600">
            {stats.losses}
          </dd>
        </div>
        <div className="rounded-xl bg-indigo-50 p-2">
          <dt className="text-xs text-slate-500">Win %</dt>
          <dd className="text-lg font-semibold text-indigo-700">
            {stats.winRate}%
          </dd>
        </div>
      </dl>
    </div>
  );
}

function Standings({
  rows,
  achievementsById,
}: {
  rows: {
    id: string;
    name: string;
    wins: number;
    losses: number;
    matches: number;
    winRate: number;
    basePoints: number;
    bonusPoints: number;
    totalPoints: number;
    qualified: boolean;
  }[];
  achievementsById: Map<string, Achievement[]>;
}) {
  return (
    <div className={card}>
      <ShuttleBg />
      <h3 className="mb-2 font-semibold">Standings</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">No matches yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs sm:text-sm">
            <thead className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-1 pr-2">#</th>
                <th className="py-1 pr-2">Player</th>
                <th className="py-1 pr-2">Points</th>
                <th className="py-1 pr-2">W</th>
                <th className="py-1 pr-2">L</th>
                <th className="py-1 pr-2">Matches</th>
                <th className="py-1 pr-2">Win %</th>
                <th className="py-1 pr-2">Badges</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {rows.map((r, i) => (
                <tr
                  key={r.id}
                  className={`border-b border-slate-100 ${
                    !r.qualified ? "opacity-60" : ""
                  }`}
                >
                  <td className="py-2 pl-1 font-medium">{i + 1}.</td>
                  <td className="py-2 font-medium text-slate-800">
                    {r.name}
                    {!r.qualified && (
                      <span className="ml-2 text-xs text-gray-500">
                        {" "}
                        (min. 5 matches needed)
                      </span>
                    )}
                  </td>
                  <td className="py-2 font-bold text-indigo-700">
                    {r.totalPoints}
                    {r.bonusPoints > 0 && (
                      <span className="ml-1 text-xs font-normal text-gray-500">
                        {" "}
                        ({r.basePoints} + {r.bonusPoints}{" "}
                        <span className="ml-1 text-amber-500"> ⭐ </span>)
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-emerald-600">{r.wins}</td>
                  <td className="py-2 text-rose-600">{r.losses}</td>
                  <td className="py-2">{r.matches}</td>
                  <td className="py-2 font-medium">{r.winRate}%</td>
                  <td className="py-2 pr-1">
                    {achievementsById.get(r.id)?.map((a) => (
                      <span
                        key={a.id}
                        className="mr-1 inline-block"
                        title={a.title}
                      >
                        {BADGE_CONFIG[a.id]?.icon || "⭐"}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StandingsInfo() {
  return (
    <div className={card}>
      <ShuttleBg />
      <h3 className="mb-2 font-semibold">How the ranking works</h3>
      <div className="text-sm space-y-3">
        <p>
          The ranking is calculated based on <b>Base Points + Bonus Points</b>.
        </p>
        <p>
          🥇 <b>Base points:</b> Win = +3 points, Loss = +1 point. Ties are
          broken first by higher total points, then higher Win%, then matches
          played.
        </p>
        <p>
          ⭐ <b>Bonus points:</b> +1 point only for:
          <br />– beating Melinda (beatMelinda badge)
          <br />– reaching the Ironman 10-session streak (streak10 badge)
        </p>
      </div>
    </div>
  );
}

// ========================= MAIN APP =========================

export default function App() {
  const [league, write] = useLeague();
  const { players, matches, backups = [] } = league;

  const [role, setRole] = useState<"player" | "admin">("player");
  const isAdmin = role === "admin";

  const [meId, setMeId] = useState<string>(players.length ? players[0].id : "");
  const defaultDate = useMemo(() => fmt(nextTrainingDate()), []);
  const [date, setDate] = useState(defaultDate);
  const [presentIds, setPresentIds] = useState<string[]>([]);

  const setDateAndResetAttendance = useCallback((newDate: string) => {
    setDate(newDate);
    setPresentIds([]);
  }, []);

  const matchesForDate = useMemo(
    () => matches.filter((m) => m.date === date),
    [matches, date]
  );

  const seenTeammatesToday = useMemo(() => {
    const seen = new Set<string>();
    matchesForDate.forEach((m) => {
      if (m.winner) {
        seen.add(key(m.teamA[0], m.teamA[1]));
        seen.add(key(m.teamB[0], m.teamB[1]));
      }
    });
    return seen;
  }, [matchesForDate]);

  const grouped = useMemo(() => {
    const map = new Map<string, Match[]>();
    [...matches].reverse().forEach((m) => {
      if (!map.has(m.date)) map.set(m.date, []);
      map.get(m.date)!.push(m);
    });
    return Array.from(map.entries()).map(([d, ms]) => ({
      date: d,
      matches: ms,
    }));
  }, [matches]);

  const lastSessionDate = grouped.length > 0 ? grouped[0].date : null;

  // Standings + achievements
  const { standings, achievementsById } = useMemo(() => {
    const MIN_MATCHES = 5;
    const byId = new Map<string, { wins: number; losses: number; matches: number }>();
    players.forEach((p) => {
      byId.set(p.id, { wins: 0, losses: 0, matches: 0 });
    });
    matches.forEach((m) => {
      if (!m.winner) return;
      const teamAWin = m.winner === "A";
      [m.teamA, m.teamB].forEach((team, idx) => {
        team.forEach((id) => {
          const stat = byId.get(id);
          if (!stat) return;
          stat.matches += 1;
          const isWin = (idx === 0 && teamAWin) || (idx === 1 && !teamAWin);
          if (isWin) stat.wins += 1;
          else stat.losses += 1;
        });
      });
    });

    const achievementsById = new Map<string, Achievement[]>();
    players.forEach((p) => {
      const baseAch = computeAchievementsFull(p.id, matches, players);
      const streak = computeAttendanceStreak(
        p.id,
        grouped
      ); // grouped a closure-ból
      const all = [...baseAch];
      if (streak >= 3) {
        all.push({
          id: streak >= 10 ? "streak10" : streak >= 6 ? "streak6" : "streak3",
          title:
            streak >= 10
              ? BADGE_CONFIG.streak10.title
              : streak >= 6
              ? BADGE_CONFIG.streak6.title
              : BADGE_CONFIG.streak3.title,
          description: `Attendance streak: ${streak} sessions`,
        });
      }
      achievementsById.set(p.id, all);
    });

    const bonusAchievementIds = new Set(["beatMelinda", "streak10"]);

    const rows = players.map((p) => {
      const s = byId.get(p.id) || { wins: 0, losses: 0, matches: 0 };
      const basePoints = s.wins * 3 + s.losses * 1;
      const ach = achievementsById.get(p.id) || [];
      const bonusPoints = ach.filter((a) =>
        bonusAchievementIds.has(a.id)
      ).length; // +1 point only for beatMelinda & streak10
      const totalPoints = basePoints + bonusPoints;
      const winRate = s.matches
        ? Math.round((s.wins / s.matches) * 100)
        : 0;
      const qualified = s.matches >= MIN_MATCHES;
      return {
        id: p.id,
        name: p.name,
        ...s,
        winRate,
        basePoints,
        bonusPoints,
        totalPoints,
        qualified,
      };
    });

    rows.sort((a, b) => {
      if (b.totalPoints !== a.totalPoints)
        return b.totalPoints - a.totalPoints;
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      if (b.matches !== a.matches) return b.matches - a.matches;
      return baseName(a.name).localeCompare(baseName(b.name), "hu");
    });

    return { standings: rows, achievementsById };
  }, [players, matches, grouped]);

  const nameOf = (id: string) =>
    players.find((p) => p.id === id)?.name || "—";

  const createMatch = (a: Pair, b: Pair) => {
    write({
      matches: [
        ...matches,
        {
          id: uid(),
          date,
          teamA: a,
          teamB: b,
        },
      ],
    });
  };

  const pickWinner = (id: string, w: "A" | "B") => {
    write({
      matches: matches.map((m) =>
        m.id === id ? { ...m, winner: w } : m
      ),
    });
  };

  const clearWinner = (id: string) => {
    write({
      matches: matches.map((m) =>
        m.id === id ? { ...m, winner: undefined } : m
      ),
    });
  };

  const deleteMatch = (id: string) => {
    write({
      matches: matches.filter((m) => m.id !== id),
    });
  };

  const addPlayer = (name: string) => {
    write({
      players: [...players, { id: uid(), name }],
    });
  };

  const removePlayer = (id: string) => {
    write({
      players: players.filter((p) => p.id !== id),
      matches: matches.filter(
        (m) =>
          ![m.teamA[0], m.teamA[1], m.teamB[0], m.teamB[1]].includes(id)
      ),
    });
  };

  const updatePlayerEmoji = (id: string, emoji: string) => {
    write({
      players: players.map((p) =>
        p.id === id ? { ...p, name: `${emoji} ${getBaseName(p.name)}` } : p
      ),
    });
  };

  const createBackup = (note: string) => {
    const backup: Backup = {
      id: uid(),
      createdAt: new Date().toISOString(),
      note,
      data: { players, matches },
    };
    write({
      backups: [...backups, backup],
    });
  };

  const restoreBackup = (id: string) => {
    const b = backups.find((x) => x.id === id);
    if (!b) return;
    write({
      players: b.data.players,
      matches: b.data.matches,
    });
  };

  const freeIds = useMemo(() => {
    const used = new Set<string>();
    matchesForDate.forEach((m) => {
      [m.teamA[0], m.teamA[1], m.teamB[0], m.teamB[1]].forEach((id) =>
        used.add(id)
      );
    });
    return players
      .map((p) => p.id)
      .filter((id) => !used.has(id));
  }, [matchesForDate, players]);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:py-6">
        <Header
          title={league.title}
          role={role}
          setPlayer={() => setRole("player")}
          setAdmin={() => setRole("admin")}
        />

        <div className="space-y-4 sm:space-y-6">
          {/* ========================= ADMIN VIEW ========================= */}
          {isAdmin && (
            <div className="space-y-4 sm:space-y-6">
              <Section
                title="Session & attendance"
                description="Pick date, mark who is present, and draw random matches."
                defaultOpen
              >
                <div className="grid gap-4 sm:gap-6 md:grid-cols-3">
                  <div className="space-y-3 md:col-span-1">
                    <div className={card}>
                      <ShuttleBg />
                      <DatePicker date={date} setDate={setDateAndResetAttendance} />
                    </div>
                    <DrawMatches
                      players={players}
                      presentIds={presentIds}
                      matchesToday={matchesForDate}
                      onCreateMatches={(ms) =>
                        write({ matches: [...matches, ...ms] })
                      }
                    />
                  </div>

                  <div className="md:col-span-2">
                    <AttendanceList
                      players={players}
                      presentIds={presentIds}
                      setPresentIds={setPresentIds}
                    />
                  </div>
                </div>
              </Section>

              <Section
                title="Players, dates & backups"
                description="Maintain player list, jump to past sessions, and create backups."
                defaultOpen={false}
              >
                <div className="grid gap-4 sm:gap-6 md:grid-cols-3">
                  <div className="md:col-span-2 space-y-4">
                    <PlayerEditor
                      players={players}
                      onAdd={addPlayer}
                      onRemove={removePlayer}
                      onUpdateEmoji={updatePlayerEmoji}
                    />
                  </div>
                  <div className="space-y-4">
                    <AdminDateJump
                      grouped={grouped}
                      date={date}
                      setDate={setDateAndResetAttendance}
                      lastSessionDate={lastSessionDate}
                    />
                    <BackupPanel
                      backups={backups}
                      onCreate={createBackup}
                      onRestore={restoreBackup}
                    />
                  </div>
                </div>
              </Section>

              <Section
                title="Matches on selected date"
                description="Set results or add manual matches for the selected date."
                defaultOpen
              >
                <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
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
                </div>
              </Section>

              <Section
                title="Standings"
                description="Overall ranking with bonus badges."
                defaultOpen
              >
                <Standings
                  rows={standings}
                  achievementsById={achievementsById}
                />
                <div className="mt-3">
                  <StandingsInfo />
                </div>
              </Section>
            </div>
          )}

          {/* ========================= PLAYER VIEW ========================= */}
          {role === "player" && (
            <div className="space-y-4 sm:space-y-6">
              <Section
                title="My matches by date"
                description="Browse all recorded sessions."
                defaultOpen
              >
                <MatchesPlayer grouped={grouped} nameOf={nameOf} />
              </Section>

              <Section
                title="My stats & achievements"
                description="See your personal performance and unlocked badges."
                defaultOpen
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <PlayerStats
                    players={players}
                    matches={matches}
                    meId={meId}
                    setMeId={setMeId}
                  />
                  <PlayerAchievements
                    players={players}
                    matches={matches}
                    meId={meId}
                    grouped={grouped}
                  />
                </div>
              </Section>

              <Section
                title="Standings"
                description="League table for all players."
                defaultOpen={false}
              >
                <Standings
                  rows={standings}
                  achievementsById={achievementsById}
                />
                <div className="mt-3">
                  <StandingsInfo />
                </div>
              </Section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
