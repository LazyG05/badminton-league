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
 * * 🛠️ PlayerEditor átalakítva: Alapértelmezetten összecsukott
 * * 🆕 Player nézet: Jelenléti lista dátum szerint
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
    }
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

// 🆕 Jelenléti Lista Komponens
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
  // 🆕 Kibontható/összecsukható állapot
  const [showManagement, setShowManagement] = useState(false);

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

      {/* Új játékos felvétele – Mindig látható */}
      <div className="mb-4 space-y-2">
        <div className="flex w-full flex-col gap-2 sm:flex-row">
          {/* Emoji + Input + Add Button */}
          <div className="flex-1 flex items-center gap-2">
            <button
              type="button"
              className={`${btnSecondary} px-3 py-2 text-xl`}
              onClick={() => setEditingEmoji(true)}
              disabled={!!disabled}
            >
              {selectedEmoji}
            </button>
            <input
              className={`${input} flex-1`}
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
          </div>
          <button
            className={btnPrimary}
            onClick={handleAdd}
            disabled={!!disabled || !name.trim()}
          >
            Add
          </button>
        </div>
      </div>

      {/* 🆕 Toggle button for the rest of the management features */}
      <button
        type="button"
        className={`${btnSecondary} w-full`}
        onClick={() => setShowManagement((v) => !v)}
        disabled={!!disabled}
      >
        {showManagement ? "Close Management ⏶" : "Manage Players / Options ⏷"}
      </button>

      {/* Kezelőfelület: CSAK akkor látszik, ha kibontottuk */}
      {showManagement && (
        <div className="border-t border-slate-100 pt-3 mt-3">
          {/* Új játékos emoji lista */}
          {editingEmoji && (
            <div className="mb-4 space-y-2">
              <div className="text-xs text-slate-500">
                Pick an emoji for the new player:
              </div>
              <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto">
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    className={`rounded-lg border px-2 py-1 text-xs ${
                      e === selectedEmoji
                        ? "bg-[#e0edff] border-[#4f8ef7]"
                        : "bg-white border-slate-200"
                    }`}
                    onClick={() => {
                      setSelectedEmoji(e);
                      setEditingEmoji(false);
                    }}
                    disabled={!!disabled}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Játékos módosítás/törlés */}
          <div className="space-y-4">
            <h3 className="mb-2 font-semibold text-sm">
              Manage existing players
            </h3>
            <select
              className={input}
              value={selectedPlayerId || ""}
              onChange={(e) => setSelectedPlayerId(e.target.value)}
              disabled={players.length === 0 || !!disabled}
            >
              <option value="" disabled>
                Select a player to edit
              </option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            {selectedPlayer && (
              <div className="space-y-3">
                {/* Törlés */}
                <button
                  className={btnDanger}
                  onClick={() => onRemove(selectedPlayer.id)}
                  disabled={!!disabled}
                >
                  Remove Player ({getBaseName(selectedPlayer.name)})
                </button>

                {/* Emoji módosítás */}
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
                          // nem muszáj bezárni, de lehet:
                          // setEditingEmoji(false);
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
      )}
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
  const hasDuplicate = new Set(selectedIds).size !== selectedIds.length;
  const canCreate = !disabled && selectedIds.length === 4 && !hasDuplicate;

  const warnA = !!teamA1 && !!teamA2 && seenTeammates.has(key(teamA1, teamA2));
  const warnB = !!teamB1 && !!teamB2 && seenTeammates.has(key(teamB1, teamB2));

  const getName = (id: string) =>
    players.find((p) => p.id === id)?.name || "—";

  const renderSelect = (
    label: string,
    value: string,
    onChange: (val: string) => void,
    excludeIds: string[]
  ) => {
    const options = players.filter((p) => !excludeIds.includes(p.id));

    return (
      <div className="space-y-1">
        <label className="text-xs text-gray-500 block">
          {label}:
        </label>
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
        {/* Team A */}
        <div
          className={`rounded-xl border p-3 ${
            warnA ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-white"
          }`}
        >
          <h4 className="mb-2 font-semibold">Team A</h4>
          {warnA && (
            <p className="text-xs text-amber-700 mb-2">
              ⚠️ Warning: {getName(teamA1)} and {getName(teamA2)} were teammates
              in a previous match today.
            </p>
          )}
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
        </div>

        {/* Team B */}
        <div
          className={`rounded-xl border p-3 ${
            warnB ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-white"
          }`}
        >
          <h4 className="mb-2 font-semibold">Team B</h4>
          {warnB && (
            <p className="text-xs text-amber-700 mb-2">
              ⚠️ Warning: {getName(teamB1)} and {getName(teamB2)} were teammates
              in a previous match today.
            </p>
          )}
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

              <div className="flex items-center gap-2">
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
                {m.winner && (
                  <button
                    className={`${btnSecondary} px-3 py-1 text-xs`}
                    onClick={() => onClear(m.id)}
                  >
                    Clear Winner
                  </button>
                )}
                <button
                  className={`${btnDanger} px-3 py-1 text-xs ml-auto`}
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

// 🆕 Helzszíni sorsolás komponens
function DrawMatches({
  players,
  presentIds,
  matchesForDate,
  seenTeammatesToday,
  date,
  league,
  write,
  disabled,
}: {
  players: Player[];
  presentIds: string[];
  matchesForDate: Match[];
  seenTeammatesToday: Set<string>;
  date: string;
  league: LeagueDoc;
  write: (patch: Partial<LeagueDoc>) => void;
  disabled?: boolean;
}) {
  const presentPlayers = players.filter((p) => presentIds.includes(p.id));
  const canDraw = presentPlayers.length >= 4;

  const draw = () => {
    if (presentPlayers.length < 4) return;
    if (disabled) return;
    
    // Csak a jelenlévő játékosok id-i
    const allPlayerIds = presentPlayers.map(p => p.id); // <- Ezt a lokális változót használjuk

    // Kiszámítja a játékos pontszámát az aznapi lejátszott meccsek alapján.
    // A pontszám a párosításhoz kell, ahol 1 pont jár minden győzelemért, 0 a vereségért.
    const getScore = (pid: string) => {
      let pts = 0;
      let matchCount = 0;

      // Only count matches with a winner on the *current date* to ensure fresh ranking for the day.
      matchesForDate.forEach((m) => {
        if (!m.winner) return; // Only matches with winners count
        const inA = m.teamA.includes(pid);
        const inB = m.teamB.includes(pid);
        if (!inA && !inB) return;

        matchCount++;
        const isWin = (m.winner === "A" && inA) || (m.winner === "B" && inB);
        // Auto-draw score is still just 1 point for win, 0 for loss for fair pairing
        if (isWin) pts += 1; // Used only for pairing
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

        // Try to find the weakest possible player who hasn't been a teammate with 'high' yet
        let bestMate: typeof high | null = null;
        for (let i = workingPool.length - 1; i >= 1; i--) {
          const candidate = workingPool[i];
          if (!localSeenTeammatesToday.has(key(high.id, candidate.id))) {
            bestMate = candidate;
            break;
          }
        }

        // If no fresh teammate found, pick the weakest (last)
        if (!bestMate) {
          bestMate = workingPool[workingPool.length - 1];
        }

        // Remove the pair from the pool
        workingPool = workingPool.filter(p => p.id !== high.id && p.id !== bestMate!.id);

        teams.push([high.id, bestMate.id] as Pair);

        // Still mark as seen
        localSeenTeammatesToday.add(key(high.id, bestMate.id));
      }

      // 4. CREATE MATCHES (High-Low method)
      // If we have at least 2 teams, pair them up
      while (teams.length >= 2) {
        // High-low match: strongest team (0) vs weakest team (last)
        const teamA = teams[0];
        const teamB = teams[teams.length - 1];

        // This match is ready
        roundMatches.push({
          id: uid(),
          date,
          teamA,
          teamB,
        });

        // Remove teams
        teams.splice(teams.length - 1, 1);
        teams.splice(0, 1);
      }

      // Add round matches to all matches
      allMatches.push(...roundMatches);
    }

    if (allMatches.length === 0) {
      alert("Could not generate a balanced draw with the current players.");
      return;
    }

    // Add all generated matches to the league data
    write({ matches: [...league.matches, ...allMatches] });
  };

  return (
    <div className={card}>
      <ShuttleBg />
      <h3 className="mb-2 font-semibold">Automatic Draw (3 Rounds)</h3>
      {presentPlayers.length < 4 ? (
        <p className="text-sm text-gray-500">
          At least 4 players must be present to draw matches. ({presentPlayers.length} present)
        </p>
      ) : (
        <p className="text-sm text-gray-500 mb-3">
          Generates 3 rounds of balanced matches based on current score and avoiding repeated teammates. ({presentPlayers.length} players)
        </p>
      )}

      <button
        className={btnPrimary}
        onClick={draw}
        disabled={!canDraw || !!disabled}
      >
        Draw Matches
      </button>
    </div>
  );
}
// 🆕 Helzszíni sorsolás komponens VÉGE

function MatchesPlayer({
  grouped,
  nameOf,
}: {
  grouped: { date: string; matches: Match[] }[];
  nameOf: (id: string) => string;
}) {
  const [openDate, setOpenDate] = useState<string | null>(null);

  // Nyissuk ki a legutóbbi alkalmat automatikusan (csak egyszer)
  const latestDate = useMemo(
    () => grouped.length > 0 ? grouped[0].date : null,
    [grouped]
  );
  useEffect(() => {
    if (!latestDate) return;
    setOpenDate((prev) => {
      // ha már nyitva van, hagyjuk
      if (prev === latestDate) return prev;
      // különben nyissuk az utolsót
      return latestDate;
    });
  }, [grouped]);

  // Segédfüggvény a név emoji nélküli részének kinyerésére (soroláshoz)
  const baseName = (full: string) =>
    full.replace(/^.+?\s/, "");

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

            // 🆕 Jelenlévő játékosok kinyerése
            const presentIds = new Set<string>();
            g.matches.forEach((m) => {
              m.teamA.forEach((id) => presentIds.add(id));
              m.teamB.forEach((id) => presentIds.add(id));
            });
            const presentPlayers = Array.from(presentIds)
              .map(nameOf) // Emoji-val együtt
              .sort((a, b) => baseName(a).localeCompare(baseName(b), "hu"));
            // 🆕 Kinyerés VÉGE

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
                  // 🛠️ FIX: Explicit háttér/hover/kerekítés a gombhoz
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

                {/* Match list */}
                {isOpen && (
                  <div className="border-t border-slate-100 p-3 pt-2">
                    {/* Jelenlévő játékosok lista */}
                    <div className="mb-3">
                      <p className="mb-1 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                        Present players ({presentPlayers.length})
                      </p>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-700">
                        {presentPlayers.map((p, i) => (
                          <span key={i}>{p}</span>
                        ))}
                      </div>
                    </div>

                    <p className="mb-2 text-xs font-semibold text-slate-600 uppercase tracking-wide">
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
          🥇 <b>Base points:</b> Win = +3 points, Loss = +1 point. Ties are broken first by higher total points, higher Win% comes first, then the number of matches played.
        </p>
        <p>
          ⭐ <b>Bonus points:</b> +1 point for achievements such as beating Melinda, or reaching the Ironman 10-session streak.
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
                    // scroll to top after jump
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
        {/* Create Backup */}
        <div className="space-y-2 rounded-xl border border-slate-200 p-3 bg-white">
          <h4 className="font-medium text-sm">Create new backup</h4>
          <input
            className={input}
            placeholder="Optional note (e.g., 'Before season 2')"
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

        {/* Restore Backup */}
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
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
  icon,
  color,
  iconColor,
}: {
  label: string;
  value: string | number;
  icon: string;
  color: string;
  iconColor: string;
}) {
  return (
    <div
      className={`flex flex-1 flex-col items-center justify-center rounded-xl p-2 ${color}`}
    >
      <div
        className={`flex h-6 w-6 items-center justify-center rounded-full bg-white text-lg shadow ${iconColor}`}
      >
        {icon}
      </div>
      <div className="text-xs font-medium text-slate-700 mt-1">
        {label}
      </div>
      <div className="font-bold text-lg text-slate-800">{value}</div>
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

      const isWin = (m.winner === "A" && inA) || (m.winner === "B" && inB);
      if (isWin) {
        wins++;
        form.push("W");
      } else {
        losses++;
        form.push("L");
      }
    });

    const total = wins + losses;
    const winRate = total === 0 ? 0 : Math.round((wins / total) * 100);

    return {
      total,
      wins,
      losses,
      winRate,
      formLast5: form.slice(-5), // Csak az utolsó 5 meccs formája
    };
  };

  const selectedPlayer = players.find((p) => p.id === meId);

  // ha megváltozik a players lista, és a meId már nem érvényes, állítsuk be az elsőre
  useEffect(() => {
    if (players.length > 0 && (!meId || !players.some((p) => p.id === meId))) {
      setMeId(players[0].id);
    }
  }, [players, meId, setMeId]);

  const stats = useMemo(() => {
    if (!meId) return null;
    return computePlayerStats(meId, matches);
  }, [meId, matches]);

  // Segédfüggvény a név emoji nélküli részének kinyerésére (soroláshoz)
  const baseName = (full: string) =>
    full.replace(/^.+?\s/, "");

  const sortedPlayers = useMemo(
    () =>
      [...players].sort((a, b) =>
        baseName(a.name).localeCompare(baseName(b.name), "hu")
      ),
    [players]
  );

  return (
    <div className={card}>
      <ShuttleBg />
      <h3 className="mb-2 font-semibold">My Stats</h3>

      {players.length === 0 ? (
        <p className="text-sm text-gray-500">
          No players yet. Please add players first.
        </p>
      ) : (
        <>
          <select
            className={input}
            value={meId || ""}
            onChange={(e) => setMeId(e.target.value)}
          >
            <option value="" disabled>
              Select your name
            </option>
            {sortedPlayers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {!selectedPlayer && meId && (
            <p className="text-sm text-rose-500 mt-2">
              Error: Selected player not found.
            </p>
          )}

          {selectedPlayer && stats && (
            <p className="text-sm text-gray-500 mt-2 mb-3">
              Stats for{" "}
              <span className="font-medium text-slate-800">
                {selectedPlayer.name}
              </span>
            </p>
          )}

          {stats && (
            <div className="space-y-2">
              <div className="flex items-center gap-4">
                <StatBox
                  label="Matches"
                  value={stats.total}
                  icon="🏸"
                  color="bg-indigo-50"
                  iconColor="text-indigo-600"
                />
                <StatBox
                  label="Wins"
                  value={stats.wins}
                  icon="🥇"
                  color="bg-emerald-50"
                  iconColor="text-emerald-600"
                />
                <StatBox
                  label="Losses"
                  value={stats.losses}
                  icon="😞"
                  color="bg-rose-50"
                  iconColor="text-rose-600"
                />
                <StatBox
                  label="Win %"
                  value={`${stats.winRate}%`}
                  icon="🎯"
                  color="bg-amber-50"
                  iconColor="text-amber-600"
                />
              </div>

              {/* Forma (W/L) */}
              <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                <span className="text-xs text-gray-500">
                  Last {stats.formLast5.length} matches:
                </span>
                <div className="flex gap-1">
                  {stats.formLast5.map((f, i) => (
                    <span
                      key={i}
                      className={`
                        inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold
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
          )}
        </>
      )}
    </div>
  );
}

const BADGE_CONFIG: Record<
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
  min5matches: {
    icon: "🏸",
    accent: "text-sky-700",
    bg: "from-sky-50 via-white to-emerald-50",
  },
};

function Standings({
  rows,
  achievementsById,
}: {
  rows: (Player & {
    wins: number;
    losses: number;
    matches: number;
    winRate: number;
    basePoints: number;
    bonusPoints: number;
    totalPoints: number;
    qualified: boolean;
  })[];
  achievementsById: Map<string, Achievement[]>;
}) {
  return (
    <div className={card}>
      <ShuttleBg />
      <h2 className="mb-2 text-xl font-bold">Current Standings</h2>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">No players recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th
                  scope="col"
                  className="px-1 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
                >
                  Rank
                </th>
                <th
                  scope="col"
                  className="px-1 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
                >
                  Player
                </th>
                <th
                  scope="col"
                  className="px-1 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
                  title="Base Points + Bonus Points"
                >
                  Points
                </th>
                <th
                  scope="col"
                  className="px-1 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
                >
                  W
                </th>
                <th
                  scope="col"
                  className="px-1 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
                >
                  L
                </th>
                <th
                  scope="col"
                  className="px-1 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
                >
                  M
                </th>
                <th
                  scope="col"
                  className="px-1 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
                >
                  Win%
                </th>
                <th
                  scope="col"
                  className="px-1 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
                >
                  Badges
                </th>
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

export default function App() {
  const [league, write] = useLeague();
  // 🛠️ FIX: Beállítjuk az alapértelmezett értéket: backups = []
  const { players, matches, backups = [] } = league;

  const [role, setRole] = useState<"player" | "admin">("player");
  const [adminPass, setAdminPass] = useState("");
  const isAdmin = role === "admin" && adminPass === "biatollas";

  // Player view: selected player ID
  const [meId, setMeId] = useState<string>(players.length ? players[0].id : "");
  // Admin view: selected date
  const defaultDate = useMemo(() => fmt(nextTrainingDate()), []);
  const [date, setDate] = useState(defaultDate);
  // 🆕 Admin view: Jelenléti lista
  const [presentIds, setPresentIds] = useState<string[]>([]);
  
  // Amikor az admin átvált dátumot, nullázza a jelenléti listát (hogy új session indulhasson)
  const setDateAndResetAttendance = useCallback((newDate: string) => {
    setDate(newDate);
    setPresentIds([]);
  }, []);


  // ========================= Filter matches by date =========================
  const matchesForDate = useMemo(
    () => matches.filter((m) => m.date === date),
    [matches, date]
  );

  // Az adott napon már látott csapattársak (hogy a manuális/auto draw ne rakja össze őket újra)
  const seenTeammatesToday = useMemo(() => {
    const seen = new Set<string>();
    matchesForDate.forEach((m) => {
      // Csak azok a meccsek számítanak, amiknek már van győztese
      if (m.winner) {
        seen.add(key(m.teamA[0], m.teamA[1]));
        seen.add(key(m.teamB[0], m.teamB[1]));
      }
    });
    return seen;
  }, [matchesForDate]);

  // Player nézet: Meccsek dátum szerint csoportosítva (legújabb elöl)
  const grouped = useMemo(() => {
    const map = new Map<string, Match[]>();
    // Soroljuk visszafelé a meccseket, hogy az eredmények időrendben legyenek a listában
    [...matches].reverse().forEach((m) => {
      if (!map.has(m.date)) {
        map.set(m.date, []);
      }
      map.get(m.date)!.push(m);
    });

    return Array.from(map.entries()).map(([date, matches]) => ({
      date,
      matches,
    }));
  }, [matches]);

  const lastSessionDate = grouped.length > 0 ? grouped[0].date : null;

  // ========================= Standings calculation =========================
  const { standings, achievementsById } = useMemo(() => {
    const MIN_MATCHES = 5;

    const map = new Map<
      string,
      Player & {
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

    players.forEach((p) =>
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
      })
    );

    // BASE points: +3 for win, +1 for loss
    league.matches.forEach((m) => {
      if (!m.winner) return;

      const winnerTeam = m.winner === "A" ? m.teamA : m.teamB;
      const loserTeam = m.winner === "A" ? m.teamB : m.teamA;

      if (winnerTeam) {
        winnerTeam.forEach((id) => {
          const stats = map.get(id);
          if (stats) {
            stats.wins += 1;
            stats.matches += 1;
            stats.basePoints += 3;
          }
        });
      }

      if (loserTeam) {
        loserTeam.forEach((id) => {
          const stats = map.get(id);
          if (stats) {
            stats.losses += 1;
            stats.matches += 1;
            stats.basePoints += 1;
          }
        });
      }
    });

    // Compute win rate and check qualification
    map.forEach((stats) => {
      if (stats.matches > 0) {
        stats.winRate = Math.round((stats.wins / stats.matches) * 100);
      }
      if (stats.matches >= MIN_MATCHES) {
        stats.qualified = true;
      }
    });

    // Compute achievements (bonus points)
    const achievementsMap = new Map<string, Achievement[]>();
    map.forEach((stats) => {
      const ach = computeAchievementsFull(stats.id, league.matches, players);
      achievementsMap.set(stats.id, ach);
      stats.bonusPoints = ach.length; // +1 point for each achievement
      stats.totalPoints = stats.basePoints + stats.bonusPoints;
    });

    const rows = Array.from(map.values());

    // Segédfüggvény a név emoji nélküli részének kinyerésére (soroláshoz)
    const baseName = (full: string) =>
      full.replace(/^.+?\s/, "");

    // Rendezés
    const sorted = rows.sort((a, b) => {
      // 1. Qualified players first
      if (a.qualified && !b.qualified) return -1;
      if (!a.qualified && b.qualified) return 1;

      // 2. Total points (High to Low)
      if (b.totalPoints !== a.totalPoints) {
        return b.totalPoints - a.totalPoints;
      }

      // 3. Win rate (High to Low)
      if (b.winRate !== a.winRate) {
        return b.winRate - a.winRate;
      }

      // 4. Matches played (High to Low)
      if (b.matches !== a.matches) {
        return b.matches - a.matches;
      }

      // 5. Alphabetical name (A-Z)
      return baseName(a.name).localeCompare(baseName(b.name), "hu");
    });

    return { standings: sorted, achievementsById: achievementsMap };
  }, [players, league.matches]);

  // ========================= Admin actions =========================
  const addPlayer = (name: string) => {
    if (!role) return;
    const newPlayer = { id: uid(), name };
    write({ players: [...players, newPlayer] });
    // Ha admin ad hozzá, attól még nem lesz ő a "meId"
    // Ha player nézetből jött, akkor a PlayerStats úgyis beállítja őt meId-nek (lásd: PlayerStats useEffect)
  };

  const removePlayer = (id: string) => {
    if (!role) return;
    if (!confirm("Delete this player permanently? This cannot be undone."))
      return;

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
        return {
          ...p,
          name: `${emoji} ${rest.join(" ")}`,
        };
      } else {
        // Ha valamiért nincs emoji elöl
        return { ...p, name: `${emoji} ${p.name}` };
      }
    });

    write({ players: nextPlayers });
  };

  // 🛠️ FIX: 'nameOf' egyszerű függvényre cserélve (useCallback nélkül)
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name || "—";
  // FIX VÉGE

  const createMatch = (teamA: Pair, teamB: Pair) => {
    if (!isAdmin) return;
    const newMatch: Match = {
      id: uid(),
      date,
      teamA,
      teamB,
      // winner: undefined
    };
    write({ matches: [...matches, newMatch] });
  };

  const pickWinner = (id: string, winner: "A" | "B") => {
    if (!isAdmin) return;
    const nextMatches = matches.map((m) =>
      m.id === id ? { ...m, winner } : m
    );
    write({ matches: nextMatches });
  };

  const clearWinner = (id: string) => {
    if (!isAdmin) return;
    const nextMatches = matches.map((m) => {
      if (m.id === id) {
        const { winner, ...rest } = m; // remove winner property
        return rest as Match;
      }
      return m;
    });
    write({ matches: nextMatches });
  };

  const deleteMatch = (id: string) => {
    if (!isAdmin) return;
    if (!confirm("Delete this match permanently? This cannot be undone."))
      return;
    write({ matches: matches.filter((m) => m.id !== id) });
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
    // 🛠️ FIX: backups már garantáltan egy tömb a destructuring miatt
    write({ backups: [...backups, newBackup] });
    alert("Backup created successfully!");
  };

  const restoreBackup = (id: string) => {
    if (!isAdmin) return;
    if (
      !confirm(
        "Restore data? All current players and matches will be overwritten. This cannot be undone (without another backup)."
      )
    )
      return;

    // 🛠️ FIX: backups már garantáltan egy tömb a destructuring miatt
    const backup = backups.find((b) => b.id === id);
    if (!backup) {
      alert("Backup not found!");
      return;
    }

    write({
      players: backup.data.players,
      matches: backup.data.matches,
      // leave existing backups
    });
    alert("Data restored successfully!");
  };

  // ========================= Render =========================
  // const allPlayerIds = players.map(p => p.id); // <- Ezt töröltük (nem használt)
  const playersWhoPlayedToday = new Set<string>();
  matchesForDate.forEach((m) => {
    m.teamA.forEach(id => playersWhoPlayedToday.add(id));
    m.teamB.forEach(id => playersWhoPlayedToday.add(id));
  });

  // Játékosok, akik jelen vannak, de még nem játszottak ezen a dátumon
  const freeIds = presentIds.filter(id => !playersWhoPlayedToday.has(id));

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <Header
        title={league.title}
        role={role}
        setPlayer={() => {
          setRole("player");
          setAdminPass("");
        }}
        setAdmin={() => setRole("admin")}
      />

      <div className="space-y-4 sm:space-y-6">
        {/* ========================= ADMIN VIEW ========================= */}
        {role === "admin" && (
          <div className="space-y-4 sm:space-y-6">
            {!isAdmin && (
              <div className={card}>
                <h3 className="mb-2 font-semibold text-rose-500">
                  Admin Login
                </h3>
                <input
                  className={input}
                  type="password"
                  placeholder="Admin Password"
                  value={adminPass}
                  onChange={(e) => setAdminPass(e.target.value)}
                />
                <p className="mt-2 text-xs text-gray-500">
                  Hint: biatollas
                </p>
              </div>
            )}

            {isAdmin && (
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
                      backups={backups} // backups a fix után garantáltan nem undefined
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

                {/* Standings */}
                <div className="mt-4 sm:mt-6">
                  <Standings
                    rows={standings}
                    achievementsById={achievementsById}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* ========================= PLAYER VIEW ========================= */}
        {role === "player" && (
          <>
            <section className="grid gap-4 sm:gap-6 md:grid-cols-3">
              <div className="space-y-4 md:col-span-2">
                <MatchesPlayer grouped={grouped} nameOf={nameOf} />
              </div>

              <div className="space-y-4">
                {/* Dátum ugrás (Player nézet) */}
                <AdminDateJump
                  grouped={grouped}
                  date={date}
                  setDate={setDate}
                  lastSessionDate={lastSessionDate}
                />

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
                <StandingsInfo />
              </div>
            </section>

            {/* 🆕 Standings teljes szélességben */}
            <div className="mt-4 sm:mt-6">
              <Standings
                rows={standings}
                achievementsById={achievementsById}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}