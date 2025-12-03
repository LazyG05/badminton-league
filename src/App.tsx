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
 * - Player/Admin toggle, admin password: "biatollas"
 * - Emoji selection for new players (40 emojis) + subsequent modification
 * - Date navigation in Player view + "Last session" badge
 * - Training days: Monday & Wednesday; default date = closest such day
 * - Firestore realtime sync (single league doc: "leagues/default")
 * - Jelenléti lista: Attendance
 * * 🆕 JELENLÉTI LISTA & HELYSZÍNI SORSOLÁS
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


export type Achievement = {
  id: string;
  title: string;
  description: string;
};

function PlayerAchievements({
  players,
  matches,
  meId,
}: {
  players: Player[];
  matches: Match[];
  meId: string;
}) {
  const me = players.find((p) => p.id === meId);
  if (!me || !players.length) return null;

  const ach = computeAchievementsFull(meId, matches, players);

  // badge meta: icon + colors per achievement id
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
    // 🆕 Min. 5 matches
    min5matches: {
      icon: "🏸",
      accent: "text-sky-700",
      bg: "from-sky-50 via-white to-emerald-50",
    },
  };

  // All existing badges (showcase list)
  const ALL_BADGES: Achievement[] = [
    {
      id: "win5",
      title: "Novice Winner",
      description: "Win 5 matches.",
    },
    {
      id: "win10",
      title: "Pro Winner",
      description: "Win 10 matches.",
    },
    {
      id: "win25",
      title: "Champion",
      description: "Win 25 matches.",
    },
    {
      id: "beatMelinda",
      title: "Beat Melinda!",
      description: "Win a match against Coach Melinda.",
    },
    {
      id: "streak3",
      title: "Regular",
      description: "Attend 3 sessions in a row.",
    },
    {
      id: "streak6",
      title: "Dedicated",
      description: "Attend 6 sessions in a row.",
    },
    {
      id: "streak10",
      title: "Ironman",
      description: "Attend 10 sessions in a row.",
    },
    // 🆕 Min. 5 matches
    {
      id: "min5matches",
      title: "Seasoned Player",
      description: "Play at least 5 matches.",
    },
  ];


  const earnedIds = new Set(ach.map((a) => a.id));

  // 🔔 For badge reward animation: what did we just unlock?
  const [justUnlocked, setJustUnlocked] = useState<Achievement | null>(null);
  const knownIdsRef = useRef<string[]>([]);
  const firstRender = useRef(true);

  useEffect(() => {
    const currentIds = ach.map((a) => a.id);

    // Don't show all badges at once on first render
    if (firstRender.current) {
      firstRender.current = false;
      knownIdsRef.current = currentIds;
      return;
    }

    const prev = knownIdsRef.current;
    const newOnes = currentIds.filter((id) => !prev.includes(id));

    knownIdsRef.current = currentIds;

    if (newOnes.length === 0) return;

    const latestId = newOnes[newOnes.length - 1];
    const unlocked = ach.find((a) => a.id === latestId) || null;
    if (!unlocked) return;

    setJustUnlocked(unlocked);
    const timer = window.setTimeout(() => setJustUnlocked(null), 4000);
    return () => window.clearTimeout(timer);
  }, [ach]);

  return (
    <>
      <div className={card}>
        <ShuttleBg />
        <h3 className="mb-1 text-sm font-semibold text-slate-700">
          Achievements
        </h3>
        <p className="mb-3 text-xs text-gray-500">
          Badges earned by{" "}
          <span className="font-medium text-slate-800">{me.name}</span>
        </p>

        {/* Megszerzett badge-ek */}
        {ach.length === 0 ? (
          <p className="text-sm text-gray-500 mb-3">
            No achievements yet. Keep playing! 🏸
          </p>
        ) : (
          <ul className="space-y-2 mb-4">
            {ach.map((a) => {
              const meta = BADGE_META[a.id] || {
                icon: "⭐",
                accent: "text-slate-700",
                bg: "from-slate-50 via-white to-slate-50",
              };

              return (
                <li
                  key={a.id}
                  className={`
                    group relative overflow-hidden
                    rounded-2xl border border-slate-200
                    bg-gradient-to-r ${meta.bg}
                    px-3 py-2 text-sm shadow-sm
                    transition-transform hover:-translate-y-0.5 hover:shadow-md
                  `}
                >
                  {/* small "shimmer" overlay */}
                  <div className="pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full bg-white/40 blur-2 opacity-0 group-hover:opacity-70 transition-opacity" />

                  <div className="flex items-center gap-3 relative">
                    <div
                      className={`
                        flex h-9 w-9 items-center justify-center
                        rounded-full bg-white shadow
                        text-lg ${meta.accent}
                      `}
                    >
                      {meta.icon}
                    </div>

                    <div className="min-w-0">
                      <div className="truncate font-semibold text-slate-800">
                        {a.title}
                      </div>
                      <div className="text-xs text-gray-600">
                        {a.description}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Összes badge bemutatása */}
        <div className="mt-1">
          <h4 className="mb-1 text-xs font-semibold text-slate-600 uppercase tracking-wide">
            All badges
          </h4>
          <ul className="space-y-1">
            {ALL_BADGES.map((b) => {
              const meta = BADGE_META[b.id] || {
                icon: "⭐",
                accent: "text-slate-700",
                bg: "from-slate-50 via-white to-slate-50",
              };
              const earned = earnedIds.has(b.id);

              return (
                <li
                  key={b.id}
                  className={`
                    flex items-center gap-2 rounded-xl border px-2 py-1
                    text-xs
                    ${
                      earned
                        ? "border-emerald-200 bg-emerald-50/60 text-slate-800"
                        : "border-slate-200 bg-slate-50 text-slate-500"
                    }
                  `}
                >
                  <span
                    className={`
                      flex h-6 w-6 items-center justify-center rounded-full bg-white text-base
                      ${earned ? meta.accent : "text-slate-400"}
                    `}
                  >
                    {meta.icon}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {b.title}
                      {earned && (
                        <span className="ml-1 text-[10px] text-emerald-700">
                          (earned)
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] truncate">
                      {b.description}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* 🔔 Badge reward toast animáció */}
      {justUnlocked && (
        <div className="fixed bottom-4 right-4 z-50">
          <div className="relative overflow-hidden rounded-2xl border border-amber-200 bg-white px-4 py-3 shadow-lg">
            <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-gradient-to-tr from-yellow-300/40 via-pink-300/40 to-amber-200/40 blur-xl opacity-70" />

            {(() => {
              const meta =
                BADGE_META[justUnlocked.id] || {
                  icon: "⭐",
                  accent: "text-amber-700",
                  bg: "",
                };

              return (
                <div className="relative flex items-center gap-3">
                  <div
                    className={`
                      flex h-10 w-10 items-center justify-center rounded-full 
                      bg-amber-50 shadow-inner text-2xl
                      ${meta.accent} animate-bounce
                    `}
                  >
                    {meta.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                      New badge unlocked!
                    </div>
                    <div className="text-sm font-semibold text-slate-900">
                      {justUnlocked.title}
                    </div>
                    <div className="text-xs text-slate-600">
                      {justUnlocked.description}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </>
  );
}



// ... (achievement computation functions - unchanged)

export function computeAchievementsFull(
  playerId: string,
  matches: Match[],
  players: Player[]
): Achievement[] {
  const out: Achievement[] = [];

  // --- basic stats: only the matches of the given player ---
  const playerMatches = matches.filter(
    (m) => m.teamA.includes(playerId) || m.teamB.includes(playerId)
  );

  let wins = 0;
  const datesPlayed = new Set<string>();

  playerMatches.forEach((m) => {
    const inA = m.teamA.includes(playerId);
    const inB = m.teamB.includes(playerId);

    if (!inA && !inB) return;

    if (m.winner) {
      const didWin =
        (m.winner === "A" && inA) ||
        (m.winner === "B" && inB);
      if (didWin) wins++;
    }

    datesPlayed.add(m.date);
  });

  // --- win achievements ---
  if (wins >= 5)
    out.push({
      id: "win5",
      title: "Novice Winner",
      description: "Win 5 matches.",
    });

  if (wins >= 10)
    out.push({
      id: "win10",
      title: "Pro Winner",
      description: "Win 10 matches.",
    });

  if (wins >= 25)
    out.push({
      id: "win25",
      title: "Champion",
      description: "Win 25 matches.",
    });

  // --- Melinda challenge ---
  const melinda = players.find((p) =>
  p.name.toLowerCase().includes("melinda")
);

if (melinda) {
  const beatMelinda = playerMatches.some((m) => {
    const melInA = m.teamA.includes(melinda.id);
    const melInB = m.teamB.includes(melinda.id);
    const playerInA = m.teamA.includes(playerId);
    const playerInB = m.teamB.includes(playerId);

    // both must be in the match
    if (!(melInA || melInB)) return false;
    if (!(playerInA || playerInB)) return false;
    if (!m.winner) return false;

    // important: must be an OPPONENT, not a TEAMMATE
    const onOppositeTeams =
      (melInA && playerInB) || (melInB && playerInA);

    if (!onOppositeTeams) return false;

    // did the player's team win?
    const playerWon =
      (m.winner === "A" && playerInA) ||
      (m.winner === "B" && playerInB);

    return playerWon;
  });

  if (beatMelinda) {
    out.push({
      id: "beatMelinda",
      title: "Beat Melinda!",
      description: "Won a match against Coach Melinda.",
    });
  }
}

  // --- Min. 5 matches badge ---
  const matchesPlayed = playerMatches.length;
  if (matchesPlayed >= 5) {
    out.push({
      id: "min5matches",
      title: "Seasoned Player",
      description: "Play at least 5 matches.",
    });
  }


  // --- Attendance streak ---
  const streak = computeAttendanceStreak(playerId, matches);

  if (streak >= 3)
    out.push({
      id: "streak3",
      title: "Regular",
      description: "Attend 3 sessions in a row.",
    });

  if (streak >= 6)
    out.push({
      id: "streak6",
      title: "Dedicated",
      description: "Attend 6 sessions in a row.",
    });

  if (streak >= 10)
    out.push({
      id: "streak10",
      title: "Ironman",
      description: "Attend 10 sessions in a row.",
    });

  return out;
}


// Training days: Monday (1), Wednesday (3) – JS Date.getDay()
const TRAINING_DAYS = [1, 3];

function nextTrainingDate(from: Date = new Date()): Date {
  const d = new Date(from);
  while (!TRAINING_DAYS.includes(d.getDay())) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}
// Consecutive league days on which the player played.
// Here "session" = any date when there was any match in the league.
function computeAttendanceStreak(playerId: string, matches: Match[]): number {
  if (!matches.length) return 0;

  // All league dates (date of any match), sorted
  const allDates = Array.from(new Set(matches.map((m) => m.date))).sort();

  // Days when the player played
  const playedDates = new Set<string>();
  matches.forEach((m) => {
    if (m.teamA.includes(playerId) || m.teamB.includes(playerId)) {
      playedDates.add(m.date);
    }
  });

  let best = 0;
  let current = 0;

  // Iterate through all league days in chronological order,
  // and check if the player was present at a match.
  for (const d of allDates) {
    if (playedDates.has(d)) {
      current++;
      if (current > best) best = current;
    } else {
      current = 0;
    }
  }

  return best;
}


// ... (EMOJIS, UI tokens - unchanged)

// ========================= Emoji list =========================
const EMOJIS = [
  "🐶",
  "🐱",
  "🐭",
  "🐹",
  "🐰",
  "🦊",
  "🐻",
  "🐼",
  "🐨",
  "🐯",
  "🦁",
  "🐮",
  "🐷",
  "🐸",
  "🐵",
  "🐔",
  "🐧",
  "🐦",
  "🐤",
  "🦆",
  "🦅",
  "🦉",
  "🐺",
  "🦄",
  "🐝",
  "🐛",
  "🦋",
  "🐌",
  "🐞",
  "🐢",
  "🐍",
  "🦎",
  "🐙",
  "🦑",
  "🦀",
  "🐡",
  "🐠",
  "🐳",
  "🐬",
  "🐊",
];

// ========================= UI tokens =========================
const btnBase =
  "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed";

const btnPrimary = `${btnBase} bg-[#4f8ef7] text-white hover:bg-[#3b7ae0] focus-visible:ring-[#4f8ef7]`;
const btnSecondary = `${btnBase} border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 focus-visible:ring-[#4f8ef7]`;
const btnDanger = `${btnBase} bg-rose-500 text-white hover:bg-rose-600 focus-visible:ring-rose-400`;

const card =
  "relative overflow-hidden rounded-3xl bg-white/95 p-4 shadow-sm border border-slate-100";

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
    <circle
      cx="40"
      cy="46"
      r="5"
      stroke="currentColor"
      strokeWidth="2"
    />
  </svg>
);

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

  const write = useCallback(
    (patch: Partial<LeagueDoc>) => {
      // Use functional update to avoid reading stale `data` from closure.
      if (tRef.current) window.clearTimeout(tRef.current);

      setData((prev) => {
        const next = { ...prev, ...patch };

        // If we're suppressing (incoming remote update), update local state but
        // don't push to Firestore.
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
    },
    []
  );

  return [data, write] as const;
}

// ========================= Components =========================
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
              !isAdmin
                ? "bg-[#4f8ef7] text-white"
                : "bg-white text-slate-700"
            } px-3 py-1`}
          >
            Player
          </button>
          <button
            type="button"
            onClick={setAdmin}
            className={`${btnBase} ${
              isAdmin
                ? "bg-[#4f8ef7] text-white"
                : "bg-white text-slate-700"
            } px-3 py-1`}
          >
            Admin
          </button>
        </div>
      </div>
    </header>
  );
}

function DatePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  return (
    <div className={card}>
      <ShuttleBg />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Round date</h2>
          <p className="text-sm text-gray-500">
            {value} / {weekday(value)}
          </p>
        </div>
        <input
          className={input}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}

// 🆕 Új Jelenléti Lista Komponens
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
  const isPresent = (id: string) => presentIds.includes(id);

  const togglePresence = (id: string) => {
    if (isPresent(id)) {
      setPresentIds(presentIds.filter((pId) => pId !== id));
    } else {
      setPresentIds([...presentIds, id]);
    }
  };

  const baseName = (full: string) =>
    full.replace(/^.+?\s/, ""); // slicing off emoji + space

  const sortedPlayers = useMemo(
    () =>
      [...players].sort((a, b) =>
        baseName(a.name).localeCompare(baseName(b.name), "hu")
      ),
    [players]
  );
  
  const presentCount = presentIds.length;

  return (
    <div className={card}>
      <ShuttleBg />
      {/* 🛠️ Névátírás: Jelenlét -> Attendance */}
      <h3 className="mb-2 font-semibold">
        Attendance {date} ({presentCount}/{players.length})
      </h3>
      
      {players.length === 0 ? (
        <p className="text-sm text-gray-500">No players yet. Add them first.</p>
      ) : (
        <>
          <div className="flex gap-2 mb-3 text-xs">
              <button
                className={`${btnSecondary} px-3 py-1`}
                onClick={() => setPresentIds(players.map(p => p.id))}
              >
                Select All
              </button>
              <button
                className={`${btnSecondary} px-3 py-1`}
                onClick={() => setPresentIds([])}
              >
                Clear All
              </button>
          </div>
          <ul className="space-y-1 max-h-52 overflow-y-auto pr-1">
            {sortedPlayers.map((p) => {
              const checked = isPresent(p.id);
              return (
                <li
                  key={p.id}
                  className={`flex items-center justify-between rounded-lg px-2 py-1 text-sm border cursor-pointer transition ${
                    checked
                      ? "bg-emerald-50 border-emerald-300 text-slate-800"
                      : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"
                  }`}
                  onClick={() => togglePresence(p.id)}
                >
                  <label className="flex items-center gap-2 cursor-pointer w-full">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePresence(p.id)}
                      className="form-checkbox h-4 w-4 text-emerald-600 rounded"
                      readOnly // Readonly, since click handles the change
                    />
                    <span>{p.name}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
// 🆕 Jelenléti Lista Komponens VÉGE

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
  const [name, setName] = useState("");
  const [selectedEmoji, setSelectedEmoji] = useState<string>(EMOJIS[0]);
  const [editingEmoji, setEditingEmoji] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(
    players.length ? players[0].id : null
  );

  // if the players array changes (e.g., new player), update the select
  useEffect(() => {
    if (!players.length) {
      setSelectedPlayerId(null);
    } else if (!selectedPlayerId || !players.some(p => p.id === selectedPlayerId)) {
      setSelectedPlayerId(players[0].id);
    }
  }, [players, selectedPlayerId]);

  const getBaseName = (full: string) =>
    full.replace(/^.+?\s/, ""); // slicing off emoji + space

  const getEmoji = (full: string) => {
    const m = full.match(/^(\S+)/);
    return m ? m[1] : "😀";
  };

  const handleAdd = () => {
    const t = name.trim();
    if (!t || disabled) return;
    onAdd(`${selectedEmoji} ${t}`);
    setName("");
  };

  const selectedPlayer =
    selectedPlayerId && players.find((p) => p.id === selectedPlayerId)
      ? players.find((p) => p.id === selectedPlayerId)!
      : null;

  return (
    <div className={card}>
      <ShuttleBg />
      <h2 className="mb-2 text-lg font-semibold">
        Players ({players.length})
      </h2>

      {/* Új játékos felvétele */}
      <div className="mb-4 space-y-2">
        <div>
          <div className="mb-1 text-xs text-gray-500">New player emoji</div>
          <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                className={`rounded-lg border px-2 py-1 text-sm ${
                  selectedEmoji === e
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
        </div>

        <div className="flex w-full flex-col gap-2 sm:flex-row">
          <input
            className={input}
            placeholder="Player name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !disabled) {
                handleAdd();
              }
            }}
            disabled={!!disabled}
          />
          <button
            className={btnPrimary}
            onClick={handleAdd}
            disabled={!!disabled || !name.trim()}
          >
            Add
          </button>
        </div>
      </div>

      {/* Managing existing players – dropdown */}
      <div className="border-t border-slate-100 pt-3 mt-2">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">
          Manage existing player
        </h3>

        {players.length === 0 ? (
          <p className="text-sm text-gray-500">
            No players yet. Add someone above.
          </p>
        ) : (
          <>
            <select
  className={`${input} mb-3`}
  value={selectedPlayerId ?? ""}
  onChange={(e) => {
    setSelectedPlayerId(e.target.value || null);
    setEditingEmoji(false);
  }}
  disabled={!!disabled}
>
  {[...players]
    .sort((a, b) =>
      getBaseName(a.name).localeCompare(getBaseName(b.name), "hu")
    )
    .map((p) => (
      <option key={p.id} value={p.id}>
        {p.name}
      </option>
    ))}
</select>


            {selectedPlayer && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-lg">
                      {getEmoji(selectedPlayer.name)}
                    </span>
                    <span className="truncate font-medium">
                      {getBaseName(selectedPlayer.name)}
                    </span>
                  </div>
                  <button
                    className={btnDanger}
                    onClick={() => onRemove(selectedPlayer.id)}
                    disabled={!!disabled}
                  >
                    remove
                  </button>
                </div>

                <div className="mt-3">
                  <button
                    type="button"
                    className={btnSecondary}
                    onClick={() => setEditingEmoji((v) => !v)}
                    disabled={!!disabled}
                  >
                    {editingEmoji ? "Close emoji picker" : "Change emoji"}
                  </button>

                  {editingEmoji && (
                    <div className="mt-2 flex flex-wrap gap-1 max-h-24 overflow-y-auto">
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
                            // nem muszáj bezárni, de lehet:
                            // setEditingEmoji(false);
                          }}
                          disabled={!!disabled}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}




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
  const hasDuplicate =
    new Set(selectedIds).size !== selectedIds.length;

  const canCreate =
    !disabled &&
    selectedIds.length === 4 &&
    !hasDuplicate;

  const warnA =
    !!teamA1 &&
    !!teamA2 &&
    seenTeammates.has(key(teamA1, teamA2));

  const warnB =
    !!teamB1 &&
    !!teamB2 &&
    seenTeammates.has(key(teamB1, teamB2));

const availablePlayers = players
  .filter((p) => freeIds.includes(p.id))
  .sort((a, b) =>
    a.name.replace(/^.+?\s/, "").localeCompare(
      b.name.replace(/^.+?\s/, ""),
      "hu"
    )
  );



  const renderSelect = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    exclude: string[]
  ) => {
    return (
      <div className="space-y-1">
        <div className="text-xs text-gray-600">{label}</div>
        <select
          className={input}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={!!disabled}
        >
          <option value="">– select player –</option>
          {availablePlayers
            .filter((p) => !exclude.includes(p.id))
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
      </div>
    );
  };

  return (
    <div className={card}>
      <ShuttleBg />
      <h3 className="mb-2 font-semibold">
        Pairing (dropdown) – players can appear in multiple matches
      </h3>

      <div className="grid gap-4 md:grid-cols-2">
        {/* TEAM A */}
        <div
          className={`rounded-xl border p-3 space-y-2 ${
            warnA ? "border-amber-400 bg-amber-50/40" : "border-slate-200 bg-white"
          }`}
        >
          <div className="text-sm font-medium">
            Team A{" "}
            {warnA && (
              <span className="ml-2 text-xs text-amber-600">
                (pair already used today)
              </span>
            )}
          </div>
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

        {/* TEAM B */}
        <div
          className={`rounded-xl border p-3 space-y-2 ${
            warnB ? "border-amber-400 bg-amber-50/40" : "border-slate-200 bg-white"
          }`}
        >
          <div className="text-sm font-medium">
            Team B{" "}
            {warnB && (
              <span className="ml-2 text-xs text-amber-600">
                (pair already used today)
              </span>
            )}
          </div>
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


function MatchesAdmin({ matches, nameOf, onPick, onClear, onDelete }: { matches: Match[]; nameOf: (id: string) => string; onPick: (id: string, w: "A" | "B") => void; onClear: (id: string) => void; onDelete: (id: string) => void; }) {
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
              className="rounded-xl border border-slate-200 p-3 bg-white shadow-sm"
            >
              {/* Felső sor – csapatok szépen tördelve */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <div
                  className={`p-2 rounded-lg border ${
                    m.winner === "A"
                      ? "bg-indigo-50 border-indigo-300"
                      : "border-slate-200"
                  }`}
                >
                  <div className="font-medium">
                    {nameOf(m.teamA[0])} & {nameOf(m.teamA[1])}
                  </div>
                  {m.winner === "A" && (
                    <div className="text-indigo-600 text-xs font-semibold">
                      WINNER
                    </div>
                  )}
                </div>

                <div
                  className={`p-2 rounded-lg border ${
                    m.winner === "B"
                      ? "bg-indigo-50 border-indigo-300"
                      : "border-slate-200"
                  }`}
                >
                  <div className="font-medium">
                    {nameOf(m.teamB[0])} & {nameOf(m.teamB[1])}
                  </div>
                  {m.winner === "B" && (
                    <div className="text-indigo-600 text-xs font-semibold">
                      WINNER
                    </div>
                  )}
                </div>
              </div>

              {/* Alsó sor – Pick winner + Delete gombok */}
              <div className="mt-3 flex items-center gap-2 text-xs">
                <span className="font-medium text-slate-600">
                  {m.winner ? "Winner:" : "Pick winner:"}
                </span>
                <button
                  type="button"
                  onClick={() => onPick(m.id, "A")}
                  disabled={m.winner === "A"}
                  className={`${btnBase} px-3 py-1 ${
                    m.winner === "A"
                      ? "bg-indigo-600 text-white"
                      : "bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
                  }`}
                >
                  Team A
                </button>
                <button
                  type="button"
                  onClick={() => onPick(m.id, "B")}
                  disabled={m.winner === "B"}
                  className={`${btnBase} px-3 py-1 ${
                    m.winner === "B"
                      ? "bg-indigo-600 text-white"
                      : "bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
                  }`}
                >
                  Team B
                </button>

                {m.winner && (
                  <button
                    type="button"
                    onClick={() => onClear(m.id)}
                    // 🛠️ FIX: Fekete háttér eltávolítása: hozzáadva a bg-white
                    className={`${btnBase} px-3 py-1 text-slate-500 hover:bg-slate-100 bg-white`}
                  >
                    clear
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onDelete(m.id)}
                  // 🛠️ FIX: Fekete háttér eltávolítása: hozzáadva a bg-white
                  className={`${btnBase} px-3 py-1 ml-auto text-rose-500 hover:bg-rose-50 bg-white`}
                >
                  delete
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

  // ha van grouped, nyissuk a legutolsót
  useEffect(() => {
    if (!grouped.length) return;
    const sorted = [...grouped].sort((a, b) =>
      b.date.localeCompare(a.date)
    );
    const latestDate = sorted[0].date;

    setOpenDate((prev) => {
      // ha már nyitva van, hagyjuk
      if (prev === latestDate) return prev;
      
      // különben nyissuk az utolsót
      return latestDate;
    });
  }, [grouped]);
  

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
            return (
              <div
                key={g.date}
                id={`date-${g.date}`}
                className="rounded-xl border border-slate-200 bg-white"
              >
                {/* Date "header" – kattintható sor, mint egy dropdown */}
                <button
                  type="button"
                  onClick={() => setOpenDate(isOpen ? null : g.date)}
                  className=" flex w-full items-center justify-between px-3 py-2 text-sm rounded-t-xl bg-white text-slate-800 /* <-- EZ A FONTOS!!! */ border-b border-slate-200 hover:bg-slate-50 "
                >
                  <span className="flex flex-col items-start">
                    <span className="font-medium">{g.date}</span>
                    <span className="text-xs text-gray-500">
                      {" "}
                      {weekday(g.date)}{" "}
                    </span>
                  </span>
                  <span className="text-xs text-gray-500">
                    {g.matches.length} match
                    <span className="ml-2 inline-block">
                      {" "}
                      {isOpen ? "▲" : "▼"}{" "}
                    </span>
                  </span>
                </button>
                {/* Lenyíló rész – csak ha nyitva van */}
                {isOpen && (
                  <div className="border-t border-slate-200 px-3 py-2">
                    <ul className="space-y-3">
                      {g.matches.map((m) => (
                        <li
                          key={m.id}
                          className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-sm"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {/* Team A */}
                            <div
                              className={`p-2 rounded-lg border ${
                                m.winner === "A"
                                  ? "bg-indigo-100 border-indigo-300"
                                  : "border-slate-200"
                              }`}
                            >
                              <div className="font-medium">
                                {nameOf(m.teamA[0])} & {nameOf(m.teamA[1])}
                              </div>
                              {m.winner === "A" && (
                                <div className="text-indigo-600 text-xs font-semibold">
                                  WINNER
                                </div>
                              )}
                            </div>

                            {/* Team B */}
                            <div
                              className={`p-2 rounded-lg border ${
                                m.winner === "B"
                                  ? "bg-indigo-100 border-indigo-300"
                                  : "border-slate-200"
                              }`}
                            >
                              <div className="font-medium">
                                {nameOf(m.teamB[0])} & {nameOf(m.teamB[1])}
                              </div>
                              {m.winner === "B" && (
                                <div className="text-indigo-600 text-xs font-semibold">
                                  WINNER
                                </div>
                              )}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
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


function StandingsInfo() {
  return (
    <div className={card}>
      <ShuttleBg />
      <h3 className="mb-2 font-semibold">How the ranking works</h3>
      <div className="text-sm space-y-3">
        <p>
          The ranking is calculated based on{" "}
          <b>Base Points + Bonus Points</b>.
        </p>
        <p>
          🥇 <b>Base points:</b> Win = +3 points, Loss = +1 point.
          Ties are broken first by higher total points, higher Win% comes
          first, then the number of matches played.
        </p>
        <p>
          ⭐ <b>Bonus points:</b> +1 point for achievements such as beating
          Melinda, or reaching the Ironman 10-session streak.
        </p>
      </div>
    </div>
  );
}

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
        <p className="text-sm text-gray-500">No matches yet.</p>
      ) : (
        <ul className="text-sm space-y-1 max-h-52 overflow-y-auto">
          {grouped.map((g) => (
            <li key={g.date}>
              <button
                type="button"
                onClick={() => setDate(g.date)}
                className={` flex w-full items-center justify-between rounded-lg px-2 py-1 text-left bg-white text-slate-700 border border-slate-200 transition ${
                  date === g.date
                    ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                    : "hover:bg-slate-100"
                } `}
              >
                <span>{g.date}</span>
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  {weekday(g.date)}{" "}
                  {lastSessionDate === g.date && (
                    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 border border-emerald-200">
                      {" "}
                      Last{" "}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-gray-400">
        {" "}
        Pick a date to edit or add matches (including past sessions).{" "}
      </p>
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

  return (
    <div className={card}>
      <ShuttleBg />
      <h3 className="mb-2 font-semibold">Backups ({backups.length})</h3>

      <div className="flex gap-2 mb-3">
        <input
          className={input}
          placeholder="Backup note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button
          className={btnSecondary}
          onClick={() => {
            onCreate(note);
            setNote("");
          }}
          disabled={note.length > 50}
        >
          Create
        </button>
      </div>

      {backups.length === 0 ? (
        <p className="text-sm text-gray-500">No backups yet.</p>
      ) : (
        <ul className="space-y-2 max-h-52 overflow-y-auto">
          {[...backups]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map((b) => (
              <li
                key={b.id}
                className="rounded-xl border border-slate-200 p-3 bg-white shadow-sm"
              >
                <div className="text-xs text-gray-500">
                  {b.createdAt.slice(0, 16).replace("T", " ")}
                </div>
                {b.note && (
                  <div className="font-medium text-sm mt-1 mb-2">
                    {b.note}
                  </div>
                )}
                <button
                  className={`${btnSecondary} px-3 py-1 text-xs`}
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
  // segéd: win/loss/winrate számítása az adott játékosra
  const computePlayerStats = (playerId: string, matches: Match[]) => {
    let wins = 0;
    let losses = 0;
    const form: ("W" | "L")[] = [];

    matches.forEach((m) => {
      const inA = m.teamA.includes(playerId);
      const inB = m.teamB.includes(playerId);

      if (!inA && !inB) return;
      if (!m.winner) return;

      const isWin =
        (m.winner === "A" && inA) || (m.winner === "B" && inB);

      if (isWin) {
        wins++;
        form.push("W");
      } else {
        losses++;
        form.push("L");
      }
    });

    const total = wins + losses;
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
    const formLast5 = form.slice(-5);

    return { wins, losses, total, winRate, formLast5 };
  };

  // segéd: emoji levágása a névről (pl. "🐢 Anita" → "Anita")
  const baseName = (full: string) => full.replace(/^.+?\s/, "");

  // ABC szerinti sorrend (emoji nélküli név alapján)
  const sortedPlayers = useMemo(
    () =>
      [...players].sort((a, b) =>
        baseName(a.name).localeCompare(baseName(b.name), "hu")
      ),
    [players]
  );

  // ha még nincs meId elmentve, válasszuk az első (ABC szerinti) playert
  useEffect(() => {
    const exists = sortedPlayers.some((p) => p.id === meId);
    if ((!meId || !exists) && sortedPlayers.length) {
      setMeId(sortedPlayers[0].id);
    }
  }, [meId, sortedPlayers, setMeId]);

  const me = sortedPlayers.find((p) => p.id === meId);
  if (!me || !sortedPlayers.length) return null;

  const stats = computePlayerStats(meId, matches);

  return (
    <div className={card}>
      <ShuttleBg />
      <h3 className="mb-2 text-sm font-semibold text-slate-700"> My stats </h3>

      {/* Játékosválasztó – ABC szerint rendezve */}
      <select
        className={`${input} text-sm mb-3`}
        value={meId}
        onChange={(e) => setMeId(e.target.value)}
      >
        {sortedPlayers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span>Total matches:</span>
          <b>{stats.total}</b>
        </div>
        <div className="flex justify-between">
          <span>Wins:</span>
          <b className="text-emerald-700">{stats.wins}</b>
        </div>
        <div className="flex justify-between">
          <span>Losses:</span>
          <b className="text-rose-700">{stats.losses}</b>
        </div>
        <div className="flex justify-between font-semibold border-t border-slate-100 pt-2">
          <span>Win rate:</span>
          <b>{stats.winRate}%</b>
        </div>
      </div>

      {/* Form (utolsó 5 meccs) */}
      <div className="mt-3 border-t border-slate-100 pt-2">
        <div className="flex justify-between">
          <span className="text-xs text-gray-500">Form (last 5 matches):</span>
          <div className="flex gap-1">
            {stats.formLast5.map((f, i) => (
              <span
                key={i}
                className={`
                  inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold
                  ${
                    f === "W"
                      ? "bg-emerald-500 text-white"
                      : "bg-rose-500 text-white"
                  }
                `}
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


function Standings({
  rows,
  players,
  matches,
  achievementsById,
}: {
  rows: (ReturnType<typeof useLeague>[0]["players"][number] & {
    wins: number;
    losses: number;
    matches: number;
    winRate: number;
    basePoints: number;
    bonusPoints: number;
    totalPoints: number;
    qualified: boolean;
  })[];
  players: Player[];
  matches: Match[];
  achievementsById: Map<string, Achievement[]>;
}) {
  const BADGE_CONFIG: Record<string, { icon: string; label: string }> = {
    win25: { icon: "🥇", label: "Champion (25 wins)" },
    win10: { icon: "🥈", label: "Pro Winner (10 wins)" },
    win5: { icon: "🥉", label: "Novice Winner (5 wins)" },
    beatMelinda: { icon: "🎯", label: "Beat Coach Melinda" },
    streak3: { icon: "🔥", label: "3-session streak" },
    streak6: { icon: "💪", label: "6-session streak" },
    streak10: { icon: "🏆", label: "10-session streak" },
    min5matches: { icon: "🏸", label: "Played 5+ matches" },
  };

  return (
    <div className={card}>
      <ShuttleBg />
      <h2 className="mb-2 text-lg font-semibold">Individual standings</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">No players yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-2 px-2">#</th>
                <th className="py-2 px-2">Player</th>
                <th className="py-2 px-2">Wins</th>
                <th className="py-2 px-2">Losses</th>
                <th className="py-2 px-2">Win%</th>
                <th className="py-2 px-2">Matches</th>
                <th className="py-2 px-2">Points</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const ach =
                  achievementsById?.get(row.id) ??
                  computeAchievementsFull(row.id, matches, players);
                return (
                  <tr
                    key={row.id}
                    className={
                      idx % 2 === 0 ? "border-t bg-slate-50/60" : "border-t"
                    }
                  >
                    <td className="py-2 px-2 align-middle">{idx + 1}</td>
                    {/* Név + ❕ + badge ikonok EGY SORBAN */}
                    <td className="py-2 px-2 align-middle">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium flex items-center gap-1">
                          {row.name}{" "}
                          {!row.qualified && (
                            <span
                              className=" inline-flex items-center rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200 "
                              title="Less than 5 matches – provisional ranking"
                            >
                              {" "}
                              ❕{" "}
                            </span>
                          )}
                        </span>
                        <div className="flex gap-1">
                          {ach.map((a) => {
                            const config = BADGE_CONFIG[a.id];
                            if (!config) return null;
                            return (
                              <span
                                key={a.id}
                                className="text-xs"
                                title={config.label}
                              >
                                {config.icon}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </td>
                    <td className="py-2 px-2 align-middle">{row.wins}</td>
                    <td className="py-2 px-2 align-middle">{row.losses}</td>
                    <td className="py-2 px-2 align-middle">
                      {row.winRate}%
                    </td>
                    <td className="py-2 px-2 align-middle">{row.matches}</td>
                    <td className="py-2 px-2 align-middle">
                      <b className="text-slate-900">{row.basePoints}</b>
                      {row.bonusPoints > 0 && (
                        <span className="text-xs text-amber-700 ml-1">
                          (+{row.bonusPoints}
                          <span title="Bonus points for achievements">
                            {" "}
                            ⭐
                          </span>
                          )
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


export default function App() {
  const [role, setRole] = useState<"player" | "admin">(() => {
    return (localStorage.getItem("bia_role") as "player" | "admin") || "player";
  });

  const setPlayer = () => {
    localStorage.setItem("bia_role", "player");
    setRole("player");
  };

  const setAdmin = () => {
    const pwd = prompt("Admin password:");
    if (pwd === "biatollas") {
      localStorage.setItem("bia_role", "admin");
      setRole("admin");
    } else if (pwd !== null) {
      alert("Incorrect password.");
    }
  };

  // "Én ki vagyok?" – kiválasztott játékos a player nézetben
  const [meId, setMeId] = useState(() => {
    return localStorage.getItem("meId") || "";
  });

  useEffect(() => {
    if (meId) localStorage.setItem("meId", meId);
  }, [meId]);

  // Date (round) – legközelebbi hétfő / szerda
  const [date, setDate] = useState(() => fmt(nextTrainingDate()));

  // 🆕 Jelenlét a sorsoláshoz (Admin nézet)
  const [presentPlayerIds, setPresentPlayerIds] = useState<string[]>([]);
  
  // 🆕 Reset attendance when date changes
  const setDateAndResetAttendance = useCallback((newDate: string) => {
    setDate(newDate);
    setPresentPlayerIds([]);
  }, []);

  // ========================= Data derivation =========================
  const [league, write] = useLeague();
  
  const players = league.players || [];
  const backups = league.backups ?? [];
  const matchesForDate = useMemo(
    () => league.matches.filter((m) => m.date === date),
    [league.matches, date]
  );
  const nameOf = useCallback(
    (id: string) => players.find((p) => p.id === id)?.name || "?",
    [players]
  );

  // seen teammate pairs only for this date
  const seenTeammatesToday = useMemo(() => {
    const s = new Set<string>();
    matchesForDate.forEach((m) => {
      s.add(key(m.teamA[0], m.teamA[1]));
      s.add(key(m.teamB[0], m.teamB[1]));
    });
    return s;
  }, [matchesForDate]);

  // everyone can appear in multiple matches on a date
  const freeIds = useMemo(() => players.map((p) => p.id), [players]);


  // ========================= Standings (aggregate all dates) =========================
  const standings = useMemo(() => {
    const MIN_MATCHES = 5; // if changed later, only this needs to be updated
    const map = new Map<
      string,
      {
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
      }
    >();

    players.forEach((p) => {
      map.set(p.id, {
        ...p,
        wins: 0,
        losses: 0,
        matches: 0,
        winRate: 0,
        basePoints: 0,
        bonusPoints: 0,
        totalPoints: 0,
        qualified: false,
      });
    });

    league.matches.forEach((m) => {
      const winnerTeam = m.winner === "A" ? m.teamA : m.winner === "B" ? m.teamB : null;
      const loserTeam = m.winner === "A" ? m.teamB : m.winner === "B" ? m.teamA : null;

      if (winnerTeam) {
        winnerTeam.forEach((id) => {
          const r = map.get(id);
          if (r) {
            r.wins++;
            r.basePoints += 3; // Win = +3 points
          }
        });
        loserTeam?.forEach((id) => {
          const r = map.get(id);
          if (r) {
            r.losses++;
            r.basePoints += 1; // Loss = +1 point
          }
        });
      }
    });

    map.forEach((r) => {
      r.matches = r.wins + r.losses;
      r.winRate = r.matches > 0 ? Math.round((r.wins / r.matches) * 100) : 0;
      r.qualified = r.matches >= MIN_MATCHES;
    });

    // BONUS points: Beat Melinda + Ironman (10 streak)
    players.forEach((p) => {
      const ach = computeAchievementsFull(p.id, league.matches, players);
      const hasBeatMelinda = ach.some((a) => a.id === "beatMelinda");
      const hasIronman = ach.some((a) => a.id === "streak10");
      const r = map.get(p.id);
      if (!r) return;
      if (hasBeatMelinda) r.bonusPoints += 1;
      if (hasIronman) r.bonusPoints += 1;
      r.totalPoints = r.basePoints + r.bonusPoints;
    });

    // Ranking – qualified first, then totalPoints, win%, matches, name
    return Array.from(map.values()).sort((a, b) => {
      // 1) first: minimum matches achieved?
      if (a.qualified !== b.qualified) {
        return a.qualified ? -1 : 1;
      }
      // 2) main criteria: total score (basePoints + bonusPoints)
      if (b.totalPoints !== a.totalPoints) {
        return b.totalPoints - a.totalPoints;
      }
      // 3) if points are equal: better win rate comes first
      if (b.winRate !== a.winRate) {
        return b.winRate - a.winRate;
      }
      // 4) if still equal: more matches come first
      if (b.matches !== a.matches) {
        return b.matches - a.matches;
      }
      // 5) final tie-breaker: by name
      return a.name.localeCompare(b.name);
    });
  }, [league.matches, players]);


  // Grouped results for Player view + last session date
  const grouped = useMemo(() => {
    const by: Record<string, Match[]> = {};
    league.matches.forEach((m) => {
      if (!by[m.date]) by[m.date] = [];
      by[m.date].push(m);
    });
    return Object.entries(by)
      .map(([date, matches]) => ({ date, matches }))
      .sort((a, b) => b.date.localeCompare(a.date)); // descending date
  }, [league.matches]);

  const lastSessionDate = grouped[0]?.date || null;


  // Cache all achievements for standings table
  const achievementsById = useMemo(() => {
    const map = new Map<string, Achievement[]>();
    players.forEach((p) => {
      map.set(p.id, computeAchievementsFull(p.id, league.matches, players));
    });
    return map;
  }, [league.matches, players]);

  // ========================= Data modification handlers =========================

  const addPlayer = (name: string) => {
    if (!role) return;
    const newPlayer: Player = { id: uid(), name };
    write({ players: [...players, newPlayer] });
    // Ha admin ad hozzá, attól még nem lesz ő a "meId"
    // Ha player nézetből jött, akkor a PlayerStats úgyis beállítja őt meId-nek (lásd: PlayerStats useEffect)
  };

  const removePlayer = (id: string) => {
    if (!role) return;
    if (!confirm("Delete this player permanently? This cannot be undone.")) return;
    write({
      players: players.filter((p) => p.id !== id),
      matches: league.matches.filter(
        (m) => !m.teamA.includes(id) && !m.teamB.includes(id)
      ),
    });
  };

  const updatePlayerEmoji = (id: string, emoji: string) => {
    if (!role) return;
    const nextPlayers = players.map((p) => {
      if (p.id !== id) return p;
      const parts = p.name.split(" ");
      if (parts.length > 1) {
        const [, ...rest] = parts;
        return { ...p, name: `${emoji} ${rest.join(" ")}` };
      } else {
        return { ...p, name: `${emoji} ${p.name}` };
      }
    });
    write({ players: nextPlayers });
  };

  const addMatch = (a: Pair, b: Pair) => {
    if (!isAdmin) return;
    write({
      matches: [...league.matches, { id: uid(), date, teamA: a, teamB: b }],
    });
  };

  const pickWinner = (id: string, w: "A" | "B") => {
    if (!isAdmin) return;
    write({
      matches: league.matches.map((m) =>
        m.id === id ? { ...m, winner: w } : m
      ),
    });
  };

  const deleteMatch = (id: string) => {
    if (!isAdmin) return;
    if (!confirm("Delete this match permanently?")) return;
    write({ matches: league.matches.filter((m) => m.id !== id) });
  };

  const clearWinner = (id: string) => {
    if (!isAdmin) return;
    write({
      matches: league.matches.map((m) =>
        m.id === id ? { ...m, winner: undefined } : m
      ),
    });
  };

  // ... (previous code: clearWinner)
  // 🆕 NEW: Balanced "High-Low" draw for 3 ROUNDS (using present players)
  const autoDraw = () => {
    if (!isAdmin) return;
    
    // 🆕 Jelenlévő játékosok használata
    const poolIds = presentPlayerIds.length > 0 ? presentPlayerIds : players.map((p) => p.id);
    const poolPlayers = players.filter((p) => poolIds.includes(p.id));
    const allPlayerIds = poolPlayers.map(p => p.id);

    // 🆕 Check for minimum players
    if (poolPlayers.length < 4) {
      alert("Need at least 4 players to draw matches. (Check the attendance list.)");
      return;
    }

    // 1. Helper function: Calculate score for a player
    const getScore = (pid: string) => {
      let pts = 0;
      let matchCount = 0;
      league.matches.forEach(m => {
        if (m.winner) {
          const inA = m.teamA.includes(pid);
          const inB = m.teamB.includes(pid);
          if (!inA && !inB) return;
          matchCount++;
          const isWin = (m.winner === "A" && inA) || (m.winner === "B" && inB);
          // Auto-draw score is still just 1 point for win, 0 for loss for fair pairing
          if (isWin) pts += 1; // Used only for pairing
        }
      });
      return { id: pid, score: pts, matches: matchCount };
    };

    // 2. Rank players based on points (only those present)
    const sortedIds = allPlayerIds
      .map(getScore)
      .sort((a, b) => {
        // Higher score is better
        if (b.score !== a.score) return b.score - a.score;
        // More matches is better
        return b.matches - a.matches;
      });

    const allMatches: Match[] = [];
    // Clone the list of teammates already seen today to track pairings over the 3 rounds
    const localSeenTeammatesToday = new Set<string>(seenTeammatesToday);

    // 🎯 MAIN LOOP: Draw 3 ROUNDS
    for (let round = 0; round < 3; round++) {
      let workingPool = [...sortedIds]; // Start each round with the full, ranked list
      const teams: Pair[] = [];
      const roundMatches: Match[] = [];

      // 3. CREATE PAIRS (High-Low method)
      while (workingPool.length >= 2) {
        const high = workingPool[0]; // The strongest player
        let bestMateIndex = -1; // Search from the bottom up (Looking for the weakest) for a partner they haven't teamed up with today
        
        for (let i = workingPool.length - 1; i > 0; i--) {
          const candidate = workingPool[i];
          if (!localSeenTeammatesToday.has(key(high.id, candidate.id))) {
            bestMateIndex = i;
            break; // Found the best partner
          }
        }

        // If there's no "virgin" pair, select the weakest available
        if (bestMateIndex === -1) bestMateIndex = workingPool.length - 1;

        const low = workingPool[bestMateIndex];
        const newPair: Pair = [high.id, low.id];
        teams.push(newPair);

        // ❗️ UPDATE: This pair has been seen today (matters for later rounds)
        localSeenTeammatesToday.add(key(high.id, low.id));

        // Remove them from the pool
        workingPool.splice(bestMateIndex, 1);
        workingPool.shift();
      }

      // 4. CREATE MATCHES from the even teams
      // Pair up the teams (1st team vs 2nd team, 3rd team vs 4th team, etc.)
      for (let i = 0; i + 1 < teams.length; i += 2) {
        roundMatches.push({
          id: uid(),
          date,
          teamA: teams[i],
          teamB: teams[i + 1],
        });
      }
      
      allMatches.push(...roundMatches);
    }
    
    if (allMatches.length === 0) {
      alert("Could not generate a balanced draw with the current players.");
      return;
    }

    // Add all generated matches to the league data
    write({ matches: [...league.matches, ...allMatches] });
  };


  const createBackup = (note: string) => {
    if (!isAdmin) return;
    const newBackup: Backup = {
      id: uid(),
      createdAt: new Date().toISOString(),
      note: note.trim() || undefined,
      data: {
        players: league.players,
        matches: league.matches,
      },
    };
    write({ backups: [...backups, newBackup] });
    alert("Backup created successfully!");
  };

  const restoreBackup = (id: string) => {
    if (!isAdmin) return;
    const backup = backups.find((b) => b.id === id);
    if (
      !backup ||
      !confirm(
        "Are you sure you want to restore this backup? All current data will be overwritten."
      )
    )
      return;

    // Restore players and matches from backup
    write({ players: backup.data.players, matches: backup.data.matches });
  };

  const isAdmin = role === "admin";

  return (
    <div className="min-h-screen bg-[#eef2ff] text-slate-900">
      <div className="mx-auto max-w-5xl p-4 sm:p-6">
        <Header
          title={league.title || "Bia-Tollas"}
          role={role}
          setPlayer={setPlayer}
          setAdmin={setAdmin}
        />

        {/* Date selector */}
        <div className="space-y-2">
          <DatePicker value={date} onChange={setDateAndResetAttendance} />
          {role === "admin" && (
            <div className="flex flex-wrap gap-2 text-xs text-gray-600">
              <button
                type="button"
                className={`${btnSecondary} px-3 py-1`}
                onClick={() => setDateAndResetAttendance(fmt(new Date()))}
              >
                Today
              </button>
              <button
                type="button"
                className={`${btnSecondary} px-3 py-1`}
                onClick={() => setDateAndResetAttendance(fmt(nextTrainingDate()))}
              >
                Next training
              </button>
              {lastSessionDate && (
                <button
                  type="button"
                  className={`${btnSecondary} px-3 py-1`}
                  onClick={() => setDateAndResetAttendance(lastSessionDate)}
                >
                  Last session
                </button>
              )}
            </div>
          )}
        </div>


        {role === "admin" ? (
          <>
            <section className="grid gap-4 sm:gap-6 md:grid-cols-3">
              <div className="space-y-4 md:col-span-2">
                <PlayerEditor
                  players={players}
                  onAdd={addPlayer}
                  onRemove={removePlayer}
                  onUpdateEmoji={updatePlayerEmoji}
                  disabled={!isAdmin}
                />

                <SelectPairs
                  players={players}
                  freeIds={freeIds}
                  seenTeammates={seenTeammatesToday}
                  onCreate={addMatch}
                  disabled={!isAdmin}
                />

                <MatchesAdmin
                  matches={matchesForDate}
                  nameOf={nameOf}
                  onPick={pickWinner}
                  onClear={clearWinner}
                  onDelete={deleteMatch}
                />
              </div>

              {/* Jobb oldali sáv: Jelenlét, Sorsolás, Dátumugrás, Backup, Infó */}
              <div className="space-y-4">
                {/* 🆕 Jelenléti Lista */}
                <AttendanceList 
                  players={players} 
                  date={date} 
                  presentIds={presentPlayerIds} 
                  setPresentIds={setPresentPlayerIds} 
                />

                <div className={card}>
                  <ShuttleBg />
                  <h3 className="mb-2 font-semibold">Match Draw (based on attendance)</h3>
                  <button
                    className={`${btnPrimary} w-full`}
                    onClick={autoDraw}
                    disabled={players.length < 4 || presentPlayerIds.length < 4}
                  >
                    Auto-draw 3 Rounds (High-Low)
                  </button>
                  {presentPlayerIds.length > 0 && presentPlayerIds.length < 4 && (
                    <p className="mt-2 text-xs text-rose-500">
                      Minimum 4 **present** players required for auto-draw.
                    </p>
                  )}
                  {presentPlayerIds.length === 0 && players.length >= 4 && (
                     <p className="mt-2 text-xs text-gray-400">
                      **Warning:** Currently using **ALL** players for draw (since no one is marked as present).
                    </p>
                  )}
                  <p className="mt-2 text-xs text-gray-400">
                    Creates 3 rounds of matches using a balanced high-low
                    ranking method to ensure variety.
                  </p>
                </div>
                <AdminDateJump
                  grouped={grouped}
                  date={date}
                  setDate={setDateAndResetAttendance}
                  lastSessionDate={lastSessionDate}
                />
                <BackupPanel onCreate={createBackup} onRestore={restoreBackup} backups={backups} />
                <StandingsInfo />
              </div>
            </section>

            {/* 🆕 Standings teljes szélességben */}
            <div className="mt-4 sm:mt-6">
              <Standings
                rows={standings}
                players={players}
                matches={league.matches}
                achievementsById={achievementsById}
              />
            </div>
          </>
        ) : (
          <>
            <section className="grid gap-4 sm:gap-6 md:grid-cols-3">
              <div className="space-y-4 md:col-span-2">
                <MatchesPlayer
                  grouped={grouped}
                  nameOf={nameOf}
                />
                <StandingsInfo />
              </div>

              <div className="space-y-4">
                {/* Legutolsó dátumok lista */}
                <div className={card}>
                  <ShuttleBg />
                  <h3 className="mb-2 font-semibold">Latest sessions</h3>
                  {grouped.length === 0 ? (
                    <p className="text-sm text-gray-500">No matches yet.</p>
                  ) : (
                    <ul className="text-sm space-y-1 max-h-52 overflow-y-auto">
                      {grouped.slice(0, 10).map((g) => (
                        <li key={g.date}>
                          <a
                            href={`#date-${g.date}`}
                            className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-left bg-white text-slate-700 border border-slate-200 transition hover:bg-slate-100 hover:text-[#4f8ef7]"
                            onClick={(e) => {
                              // manuálisan nyissa meg az adott dátumot
                              e.preventDefault();
                              // ez a logikát kicseréltem a MatchesPlayer komponensbe:
                              // setOpenDate(g.date); 
                              window.location.hash = `date-${g.date}`;
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
                  )}
                  <p className="mt-2 text-xs text-gray-400">
                    Training days: Monday & Wednesday
                  </p>
                </div>

                {/* Statisztikák */}
                <PlayerStats
                  players={players}
                  matches={league.matches}
                  meId={meId}
                  setMeId={setMeId}
                />

                {/* Achievementek */}
                <PlayerAchievements
                  players={players}
                  matches={league.matches}
                  meId={meId}
                />

                {/* Infók */}
              </div>
            </section>

            {/* 🆕 Standings teljes szélességben */}
            <div className="mt-4 sm:mt-6">
              <Standings
                rows={standings}
                players={players}
                matches={league.matches}
                achievementsById={achievementsById}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}