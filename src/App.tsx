// 🔹 Polyfillek régi böngészőkhöz (iOS 10, régi Safari)
import "core-js/stable";
import "regenerator-runtime/runtime";
import "cross-fetch/polyfill";

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
 * UI REDESIGN: Modern, Logo-based colors (Sky Blue / Lime Green / Slate)
 * FIXES: Removed unused variables (date, getEmoji, getName)
 * =============================================================
 */

// ========================= Types =========================
export type Player = {
  id: string;
  name: string;
  gender?: "M" | "F";
};
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

// ========================= UI Tokens (Redesigned) =========================
const btnBase =
  "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-bold transition-all duration-200 transform active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 shadow-sm";

const btnPrimary = `${btnBase} bg-gradient-to-r from-sky-500 to-blue-600 text-white hover:from-sky-400 hover:to-blue-500 hover:shadow-md hover:shadow-sky-200 focus-visible:ring-sky-500 border border-transparent`;
const btnSecondary = `${btnBase} bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 focus-visible:ring-slate-400`;
const btnDanger = `${btnBase} bg-white text-rose-600 border border-rose-200 hover:bg-rose-50 hover:border-rose-300 focus-visible:ring-rose-400`;
const card =
  "relative overflow-hidden rounded-2xl bg-white p-5 shadow-lg shadow-slate-200/50 border border-white/50 text-slate-800 backdrop-blur-sm";
const input =
  "w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent transition-all";

const ShuttleBg = () => (
  <svg
    className="pointer-events-none absolute -right-4 -top-4 h-24 w-24 opacity-5 text-sky-600 rotate-12"
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M14 38c6-10 16-16 26-20l6 6-8 22-10-4-8-4Z"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle
      cx="40"
      cy="46"
      r="6"
      fill="currentColor"
      className="text-lime-500" 
    />
  </svg>
);


export type Achievement = {
  id: string;
  title: string;
  description: string;
};

// ========================= Achievements =========================
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

   const BADGE_META: Record<
    string,
    { icon: string; accent: string; bg: string }
  > = {
    win5: {
      icon: "🥉",
      accent: "text-amber-700",
      bg: "from-amber-50 via-white to-slate-50 border-amber-100",
    },
    win10: {
      icon: "🥈",
      accent: "text-slate-600",
      bg: "from-slate-100 via-white to-sky-50 border-slate-200",
    },
    win25: {
      icon: "🥇",
      accent: "text-yellow-600",
      bg: "from-yellow-50 via-white to-amber-50 border-yellow-100",
    },
    beatMelinda: {
      icon: "🎯",
      accent: "text-rose-600",
      bg: "from-rose-50 via-white to-pink-50 border-rose-100",
    },
    streak3: {
      icon: "🔥",
      accent: "text-orange-600",
      bg: "from-orange-50 via-white to-yellow-50 border-orange-100",
    },
    streak6: {
      icon: "💪",
      accent: "text-lime-600",
      bg: "from-lime-50 via-white to-emerald-50 border-lime-100",
    },
    streak10: {
      icon: "🏆",
      accent: "text-sky-600",
      bg: "from-sky-50 via-white to-indigo-50 border-sky-100",
    },
    min5matches: {
      icon: "🏸",
      accent: "text-cyan-600",
      bg: "from-cyan-50 via-white to-sky-50 border-cyan-100",
    },
  };

  const ALL_BADGES: Achievement[] = [
    { id: "win5", title: "Novice Winner", description: "Win 5 matches." },
    { id: "win10", title: "Pro Winner", description: "Win 10 matches." },
    { id: "win25", title: "Champion", description: "Win 25 matches." },
    { id: "beatMelinda", title: "Beat Melinda!", description: "Win a match against Coach Melinda." },
    { id: "streak3", title: "Regular", description: "Attend 3 sessions in a row." },
    { id: "streak6", title: "Dedicated", description: "Attend 6 sessions in a row." },
    { id: "streak10", title: "Ironman", description: "Attend 10 sessions in a row." },
    { id: "min5matches", title: "Seasoned Player", description: "Play at least 5 matches." }
  ];

  const earnedIds = new Set(ach.map((a) => a.id));
  const [justUnlocked, setJustUnlocked] = useState<Achievement | null>(null);
  const knownIdsRef = useRef<string[]>([]);
  const firstRender = useRef(true);

  useEffect(() => {
    const currentIds = ach.map((a) => a.id);
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
        <div className="relative z-10">
            <h3 className="mb-1 text-sm font-bold uppercase tracking-wider text-slate-400">
            Achievements
            </h3>
            <p className="mb-4 text-xs text-slate-500">
            Badges earned by{" "}
            <span className="font-bold text-sky-700 text-sm">{me.name}</span>
            </p>

            {ach.length === 0 ? (
            <div className="rounded-xl bg-slate-50 p-4 text-center border border-slate-100">
                <p className="text-sm text-slate-400">
                No achievements yet. Keep playing! 🏸
                </p>
            </div>
            ) : (
            <ul className="grid grid-cols-1 gap-2 mb-6 sm:grid-cols-2">
                {ach.map((a) => {
                const meta = BADGE_META[a.id] || {
                    icon: "⭐",
                    accent: "text-slate-700",
                    bg: "bg-white border-slate-200",
                };

                return (
                    <li
                    key={a.id}
                    className={`
                        group relative overflow-hidden
                        rounded-xl border ${meta.bg}
                        bg-gradient-to-br
                        px-3 py-2 text-sm shadow-sm
                        transition-all hover:shadow-md hover:-translate-y-0.5
                    `}
                    >
                    <div className="flex items-center gap-3 relative">
                        <div
                        className={`
                            flex h-10 w-10 items-center justify-center shrink-0
                            rounded-full bg-white shadow-sm ring-2 ring-white
                            text-xl ${meta.accent}
                        `}
                        >
                        {meta.icon}
                        </div>

                        <div className="min-w-0">
                        <div className="truncate font-bold text-slate-800">
                            {a.title}
                        </div>
                        <div className="text-xs text-slate-500 leading-tight">
                            {a.description}
                        </div>
                        </div>
                    </div>
                    </li>
                );
                })}
            </ul>
            )}

            <div className="mt-4 pt-4 border-t border-slate-100">
            <h4 className="mb-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                All badges available
            </h4>
            <div className="flex flex-wrap gap-2">
                {ALL_BADGES.map((b) => {
                const meta = BADGE_META[b.id] || {
                    icon: "⭐",
                    accent: "text-slate-700",
                    bg: "",
                };
                const earned = earnedIds.has(b.id);

                return (
                    <div
                    key={b.id}
                    className={`
                        flex items-center gap-1.5 rounded-full border px-2 py-1
                        text-[10px] transition-colors
                        ${
                        earned
                            ? "border-sky-200 bg-sky-50 text-sky-900"
                            : "border-slate-100 bg-slate-50 text-slate-400 opacity-60 grayscale"
                        }
                    `}
                    title={b.description}
                    >
                    <span className={`${earned ? "" : "grayscale"}`}>{meta.icon}</span>
                    <span className="font-medium">{b.title}</span>
                    </div>
                );
                })}
            </div>
            </div>
        </div>
      </div>

      {justUnlocked && (
        <div className="fixed bottom-6 inset-x-0 mx-auto w-max z-50 animate-bounce-in">
          <div className="relative overflow-hidden rounded-2xl border-2 border-yellow-400 bg-white pl-4 pr-6 py-3 shadow-2xl shadow-yellow-500/20">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100 text-3xl">
                {BADGE_META[justUnlocked.id]?.icon || "⭐"}
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-yellow-600">
                  New Badge Unlocked!
                </div>
                <div className="text-base font-bold text-slate-900">
                  {justUnlocked.title}
                </div>
              </div>
            </div>
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
  const playerMatches = matches.filter(
    (m) => m.teamA.includes(playerId) || m.teamB.includes(playerId)
  );

  let wins = 0;
  playerMatches.forEach((m) => {
    const inA = m.teamA.includes(playerId);
    const inB = m.teamB.includes(playerId);
    if (!inA && !inB) return;
    if (m.winner) {
      const didWin = (m.winner === "A" && inA) || (m.winner === "B" && inB);
      if (didWin) wins++;
    }
  });

  if (wins >= 5) out.push({ id: "win5", title: "Novice Winner", description: "Win 5 matches." });
  if (wins >= 10) out.push({ id: "win10", title: "Pro Winner", description: "Win 10 matches." });
  if (wins >= 25) out.push({ id: "win25", title: "Champion", description: "Win 25 matches." });

  const melinda = players.find((p) => p.name.toLowerCase().includes("melinda"));
  if (melinda) {
    const beatMelinda = playerMatches.some((m) => {
      const melInA = m.teamA.includes(melinda.id);
      const melInB = m.teamB.includes(melinda.id);
      const playerInA = m.teamA.includes(playerId);
      const playerInB = m.teamB.includes(playerId);
      if (!(melInA || melInB)) return false;
      if (!(playerInA || playerInB)) return false;
      if (!m.winner) return false;
      const onOppositeTeams = (melInA && playerInB) || (melInB && playerInA);
      if (!onOppositeTeams) return false;
      const playerWon = (m.winner === "A" && playerInA) || (m.winner === "B" && playerInB);
      return playerWon;
    });
    if (beatMelinda) out.push({ id: "beatMelinda", title: "Beat Melinda!", description: "Won a match against Coach Melinda." });
  }

  const matchesPlayed = playerMatches.length;
  if (matchesPlayed >= 5) out.push({ id: "min5matches", title: "Seasoned Player", description: "Play at least 5 matches." });

  const streak = computeAttendanceStreak(playerId, matches);
  if (streak >= 3) out.push({ id: "streak3", title: "Regular", description: "Attend 3 sessions in a row." });
  if (streak >= 6) out.push({ id: "streak6", title: "Dedicated", description: "Attend 6 sessions in a row." });
  if (streak >= 10) out.push({ id: "streak10", title: "Ironman", description: "Attend 10 sessions in a row." });

  return out;
}


const TRAINING_DAYS = [1, 3];
function nextTrainingDate(from: Date = new Date()): Date {
  const d = new Date(from);
  while (!TRAINING_DAYS.includes(d.getDay())) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}
function computeAttendanceStreak(playerId: string, matches: Match[]): number {
  if (!matches.length) return 0;
  const allDates = Array.from(new Set(matches.map((m) => m.date))).sort();
  const playedDates = new Set<string>();
  matches.forEach((m) => {
    if (m.teamA.includes(playerId) || m.teamB.includes(playerId)) {
      playedDates.add(m.date);
    }
  });
  let best = 0;
  let current = 0;
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

const EMOJIS = ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🐔","🐧","🐦","🐤","🦆","🦅","🦉","🐺","🦄","🐝","🐛","🦋","🐌","🐞","🐢","🐍","🦎","🐙","🦑","🦀","🐡","🐠","🐳","🐬","🐊"];

// ========================= Data sync (single league doc) =========================
function useLeague() {
  const [data, setData] = useState<LeagueDoc>({ players: [], matches: [], backups: [] });
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
        const payload = { ...next, updatedAt: serverTimestamp() } as LeagueDoc;
        try { await setDoc(ref, payload, { merge: true }); } catch (err) { console.error("Failed to sync league:", err); }
      }, 120);
      return next;
    });
  }, []);
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
    <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        {/* LOGO HELYE - Cseréld le a src-t a valós fájlra (pl: "/logo.png") */}
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border-4 border-white shadow-lg bg-sky-100 flex items-center justify-center text-2xl">
           {/* Ha nincs kép, ez egy placeholder ikon */}
           🏸
           {/* <img src="/logo.png" alt="Logo" className="h-full w-full object-cover" /> */}
        </div>

        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-800 sm:text-3xl">
            <span className="bg-gradient-to-r from-sky-600 to-blue-700 bg-clip-text text-transparent">
              {title || "BIATORBÁGY"}
            </span>
            <span className="ml-2 font-light text-slate-500">Badminton</span>
          </h1>
          <p className="text-sm font-medium text-slate-400">
             Monday & Wednesday Sessions
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="flex rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200">
          <button
            type="button"
            onClick={setPlayer}
            className={`rounded-lg px-4 py-1.5 text-sm font-bold transition-all ${
              !isAdmin
                ? "bg-sky-500 text-white shadow-md shadow-sky-200"
                : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            Player
          </button>
          <button
            type="button"
            onClick={setAdmin}
            className={`rounded-lg px-4 py-1.5 text-sm font-bold transition-all ${
              isAdmin
                ? "bg-slate-700 text-white shadow-md shadow-slate-300"
                : "text-slate-500 hover:bg-slate-50"
            }`}
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
      <div className="relative z-10 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Round Date</h2>
          <div className="flex items-center gap-2 mt-1">
             <span className="inline-block px-2 py-0.5 rounded-md bg-sky-100 text-sky-700 text-xs font-bold uppercase tracking-wide">
               {weekday(value)}
             </span>
             <span className="text-sm text-slate-500 font-medium">{value}</span>
          </div>
        </div>
        <input
          className={`${input} max-w-[180px] font-medium text-slate-700`}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
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
  const isPresent = (id: string) => presentIds.includes(id);

  const togglePresence = (id: string) => {
    if (isPresent(id)) {
      setPresentIds(presentIds.filter((pId) => pId !== id));
    } else {
      setPresentIds([...presentIds, id]);
    }
  };

  const baseName = (full: string) => full.replace(/^.+?\s/, "");
  const sortedPlayers = useMemo(
    () => [...players].sort((a, b) => baseName(a.name).localeCompare(baseName(b.name), "hu")),
    [players]
  );
  
  const presentCount = presentIds.length;

  return (
    <div className={card}>
      <ShuttleBg />
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
             <h3 className="font-bold text-lg text-slate-800">Attendance <span className="text-slate-400 font-normal text-sm ml-1">({presentCount} present)</span></h3>
             <div className="flex gap-2">
                <button className="text-xs font-semibold text-sky-600 hover:text-sky-800 hover:underline" onClick={() => setPresentIds(players.map(p => p.id))}>Select All</button>
                <span className="text-slate-300">|</span>
                <button className="text-xs font-semibold text-rose-600 hover:text-rose-800 hover:underline" onClick={() => setPresentIds([])}>Clear</button>
             </div>
        </div>
      
        {players.length === 0 ? (
            <p className="text-sm text-slate-400 italic">No players available.</p>
        ) : (
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-60 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-200">
            {sortedPlayers.map((p) => {
                const checked = isPresent(p.id);
                return (
                <li key={p.id}>
                    <button
                    type="button"
                    onClick={() => togglePresence(p.id)}
                    className={`
                        group w-full rounded-xl px-3 py-2 text-xs sm:text-sm border text-left
                        flex items-center justify-between gap-2 transition-all duration-200
                        ${
                        checked
                            ? "bg-lime-50 border-lime-200 shadow-sm"
                            : "bg-white border-slate-100 text-slate-400 hover:border-sky-200 hover:bg-sky-50"
                        }
                    `}
                    >
                    <span className={`font-semibold truncate ${checked ? "text-slate-800" : "group-hover:text-sky-700"}`}>{p.name}</span>
                    <span
                        className={`
                        h-2 w-2 rounded-full
                        ${
                            checked
                            ? "bg-lime-500 shadow-[0_0_8px_rgba(132,204,22,0.6)]"
                            : "bg-slate-200 group-hover:bg-sky-200"
                        }
                        `}
                    />
                    </button>
                </li>
                );
            })}
            </ul>
        )}
      </div>
    </div>
  );
}

function PlayerEditor({
  players,
  onAdd,
  onRemove,
  onUpdateEmoji,
  onUpdateGender,
  disabled,
}: {
  players: Player[];
  onAdd: (name: string) => void;
  onRemove: (id: string) => void;
  onUpdateEmoji: (id: string, emoji: string) => void;
  onUpdateGender?: (id: string, gender: "M" | "F" | null) => void;
  disabled?: boolean;
}) {
  const [name, setName] = useState("");
  const [selectedEmoji, setSelectedEmoji] = useState<string>(EMOJIS[0]);
  const [editingEmoji, setEditingEmoji] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(
    players.length ? players[0].id : null
  );
  const [showManagement, setShowManagement] = useState(false);

  useEffect(() => {
    if (!players.length) {
      setSelectedPlayerId(null);
    } else if (!selectedPlayerId || !players.some(p => p.id === selectedPlayerId)) {
      setSelectedPlayerId(players[0].id);
    }
  }, [players, selectedPlayerId]);

  const getBaseName = (full: string) => full.replace(/^.+?\s/, "");
  // Removed unused getEmoji function

  const handleAdd = () => {
    const t = name.trim();
    if (!t || disabled) return;
    onAdd(`${selectedEmoji} ${t}`);
    setName("");
  };

  const selectedPlayer = selectedPlayerId && players.find((p) => p.id === selectedPlayerId);

  return (
    <div className={card}>
      <ShuttleBg />
      <div className="relative z-10">
        <h2 className="mb-3 text-lg font-bold text-slate-800">
            Players <span className="text-slate-400 font-normal">({players.length})</span>
        </h2>

        <div className="mb-4">
            <div className="flex w-full flex-col gap-2">
            <div className="flex items-center gap-2 p-1 bg-slate-50 rounded-2xl border border-slate-100">
                <button
                type="button"
                className="h-10 w-12 flex items-center justify-center text-xl bg-white rounded-xl shadow-sm border border-slate-200 hover:bg-sky-50 transition-colors"
                onClick={() => setEditingEmoji(true)}
                disabled={!!disabled}
                >
                {selectedEmoji}
                </button>
                <input
                className="flex-1 bg-transparent border-none focus:ring-0 text-slate-800 placeholder:text-slate-400 font-medium"
                placeholder="New player name..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !disabled) handleAdd(); }}
                disabled={!!disabled}
                />
                <button
                className={`${btnPrimary} py-2 px-4 rounded-xl m-1`}
                onClick={handleAdd}
                disabled={!!disabled || !name.trim()}
                >
                Add
                </button>
            </div>
            </div>
        </div>

        <button
            type="button"
            className="w-full text-xs font-semibold text-slate-500 hover:text-sky-600 flex items-center justify-center gap-1 py-2"
            onClick={() => setShowManagement((v) => !v)}
            disabled={!!disabled}
        >
            {showManagement ? "Close Management ⏶" : "Manage Players / Options ⏷"}
        </button>

        {showManagement && (
            <div className="border-t border-slate-100 pt-3 mt-1 bg-slate-50/50 -mx-5 px-5 pb-2">
            {editingEmoji && (
                <div className="mb-4 space-y-2">
                <div className="text-xs font-bold text-slate-400 uppercase">Pick Emoji</div>
                <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto">
                    {EMOJIS.map((e) => (
                    <button
                        key={e}
                        type="button"
                        className={`rounded-lg p-2 text-sm transition-all ${e === selectedEmoji ? "bg-white shadow ring-2 ring-sky-400 scale-110" : "hover:bg-white hover:shadow-sm"}`}
                        onClick={() => { setSelectedEmoji(e); setEditingEmoji(false); }}
                        disabled={!!disabled}
                    >
                        {e}
                    </button>
                    ))}
                </div>
                </div>
            )}

            <div className="space-y-4">
                <div className="space-y-1">
                     <label className="text-xs font-bold text-slate-400 uppercase">Edit Existing</label>
                    <select
                    className={input}
                    value={selectedPlayerId || ""}
                    onChange={(e) => setSelectedPlayerId(e.target.value)}
                    disabled={players.length === 0 || !!disabled}
                    >
                    <option value="" disabled>Select player...</option>
                    {[...players].sort((a, b) => a.name.replace(/^.+?\s/, "").localeCompare(b.name.replace(/^.+?\s/, ""), "hu"))
                        .map((p) => ( <option key={p.id} value={p.id}>{p.name}</option> ))}
                    </select>
                </div>

                {selectedPlayer && (
                <div className="space-y-4 p-3 bg-white rounded-xl border border-slate-200 shadow-sm">
                    {/* Gender */}
                    {onUpdateGender && (
                    <div>
                        <div className="mb-2 text-xs font-semibold text-slate-500">Gender</div>
                        <div className="grid grid-cols-3 gap-1">
                        {[null, "F", "M"].map((g) => (
                            <button
                            key={String(g)}
                            type="button"
                            className={`px-2 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                selectedPlayer.gender === g
                                ? "bg-sky-500 text-white shadow-md shadow-sky-200"
                                : "bg-slate-50 text-slate-500 hover:bg-slate-100"
                            }`}
                            onClick={() => onUpdateGender(selectedPlayer.id, g as any)}
                            disabled={!!disabled}
                            >
                            {g === "F" ? "Woman" : g === "M" ? "Man" : "Not Set"}
                            </button>
                        ))}
                        </div>
                    </div>
                    )}
                    
                    {/* Emoji Update */}
                    <div>
                         <div className="mb-2 text-xs font-semibold text-slate-500">Change Emoji</div>
                         <div className="flex gap-2 overflow-x-auto pb-2">
                            {EMOJIS.slice(0, 10).map((e) => (
                                <button key={e} onClick={() => onUpdateEmoji(selectedPlayer.id, e)} className="text-lg hover:scale-125 transition-transform">{e}</button>
                            ))}
                         </div>
                    </div>

                    <button
                    className={`${btnDanger} w-full text-xs py-1.5`}
                    onClick={() => onRemove(selectedPlayer.id)}
                    disabled={!!disabled}
                    >
                    Delete {getBaseName(selectedPlayer.name)}
                    </button>
                </div>
                )}
            </div>
            </div>
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

  const reset = () => { setTeamA1(""); setTeamA2(""); setTeamB1(""); setTeamB2(""); };
  const selectedIds = [teamA1, teamA2, teamB1, teamB2].filter(Boolean);
  const hasDuplicate = new Set(selectedIds).size !== selectedIds.length;
  const canCreate = !disabled && selectedIds.length === 4 && !hasDuplicate;
  const warnA = !!teamA1 && !!teamA2 && seenTeammates.has(key(teamA1, teamA2));
  const warnB = !!teamB1 && !!teamB2 && seenTeammates.has(key(teamB1, teamB2));
  // Removed unused getName function

  const renderSelect = (label: string, value: string, onChange: (val: string) => void, excludeIds: string[]) => {
    const options = players.filter((p) => !excludeIds.includes(p.id))
      .sort((a, b) => a.name.replace(/^.+?\s/, "").localeCompare(b.name.replace(/^.+?\s/, ""), "hu"));

    return (
      <div className="space-y-1">
        <label className="text-[10px] uppercase font-bold text-slate-400">{label}</label>
        <select className={input} value={value} onChange={(e) => onChange(e.target.value)} disabled={!!disabled}>
          <option value="" disabled>Select...</option>
          {options.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} {freeIds.includes(p.id) ? "" : "(played)"}
            </option>
          ))}
        </select>
      </div>
    );
  };

  return (
    <div className={card}>
      <ShuttleBg />
      <div className="relative z-10">
        <h3 className="mb-3 font-bold text-slate-800">Manual Match Creation</h3>

        <div className="grid gap-4 sm:grid-cols-2">
            {/* Team A */}
            <div className={`rounded-xl border p-3 ${warnA ? "border-amber-300 bg-amber-50" : "border-slate-100 bg-slate-50/50"}`}>
            <h4 className="mb-2 font-bold text-sm text-sky-700">Team A</h4>
            {warnA && <p className="text-xs text-amber-600 mb-2 font-medium">⚠️ Previously paired today.</p>}
            <div className="space-y-2">
                {renderSelect("Player 1", teamA1, setTeamA1, [teamA2, teamB1, teamB2].filter(Boolean) as string[])}
                {renderSelect("Player 2", teamA2, setTeamA2, [teamA1, teamB1, teamB2].filter(Boolean) as string[])}
            </div>
            </div>

            {/* Team B */}
            <div className={`rounded-xl border p-3 ${warnB ? "border-amber-300 bg-amber-50" : "border-slate-100 bg-slate-50/50"}`}>
            <h4 className="mb-2 font-bold text-sm text-rose-700">Team B</h4>
            {warnB && <p className="text-xs text-amber-600 mb-2 font-medium">⚠️ Previously paired today.</p>}
            <div className="space-y-2">
                {renderSelect("Player 1", teamB1, setTeamB1, [teamA1, teamA2, teamB2].filter(Boolean) as string[])}
                {renderSelect("Player 2", teamB2, setTeamB2, [teamA1, teamA2, teamB1].filter(Boolean) as string[])}
            </div>
            </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
            <button className={btnPrimary} disabled={!canCreate} onClick={() => { onCreate([teamA1, teamA2] as Pair, [teamB1, teamB2] as Pair); reset(); }}>
            Add Match
            </button>
            <button className={btnSecondary} type="button" onClick={reset} disabled={!!disabled && selectedIds.length === 0}>
            Reset
            </button>
            {hasDuplicate && <span className="text-xs font-bold text-rose-500 bg-rose-50 px-2 py-1 rounded">No duplicates allowed!</span>}
        </div>
      </div>
    </div>
  );
}

function MatchesAdmin({ matches, nameOf, onPick, onClear, onDelete }: any) {
  return (
    <div className={card}>
      <ShuttleBg />
      <div className="relative z-10">
        <h3 className="mb-3 font-bold text-slate-800">Matches (Admin)</h3>
        {matches.length === 0 ? (
            <p className="text-sm text-slate-400 italic">No matches for this date yet.</p>
        ) : (
            <ul className="space-y-3">
            {matches.map((m: any) => (
                <li key={m.id} className="rounded-xl border border-slate-200 p-3 bg-white shadow-sm">
                <div className="mb-3 text-sm grid grid-cols-2 gap-2">
                    <div className="p-2 bg-sky-50 rounded-lg text-center border border-sky-100">
                        <div className="text-[10px] font-bold text-sky-400 uppercase">Team A</div>
                        <div className="font-semibold text-slate-700">{nameOf(m.teamA[0])}</div>
                        <div className="font-semibold text-slate-700">{nameOf(m.teamA[1])}</div>
                    </div>
                    <div className="p-2 bg-rose-50 rounded-lg text-center border border-rose-100">
                        <div className="text-[10px] font-bold text-rose-400 uppercase">Team B</div>
                        <div className="font-semibold text-slate-700">{nameOf(m.teamB[0])}</div>
                        <div className="font-semibold text-slate-700">{nameOf(m.teamB[1])}</div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                    className={`flex-1 rounded-lg py-1.5 text-xs font-bold border transition-colors ${m.winner === "A" ? "bg-sky-500 text-white border-sky-600 shadow-md" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
                    onClick={() => onPick(m.id, "A")}
                    >
                    {m.winner === "A" ? "A Won 🏆" : "A Wins"}
                    </button>
                    <button
                    className={`flex-1 rounded-lg py-1.5 text-xs font-bold border transition-colors ${m.winner === "B" ? "bg-rose-500 text-white border-rose-600 shadow-md" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
                    onClick={() => onPick(m.id, "B")}
                    >
                    {m.winner === "B" ? "B Won 🏆" : "B Wins"}
                    </button>
                    {m.winner && (
                    <button className="px-3 rounded-lg py-1.5 text-xs font-bold text-slate-500 bg-slate-100 hover:bg-slate-200" onClick={() => onClear(m.id)}>
                        Undo
                    </button>
                    )}
                    <button className="ml-2 text-slate-300 hover:text-rose-500 transition-colors px-2" onClick={() => onDelete(m.id)}>
                        ✕
                    </button>
                </div>
                </li>
            ))}
            </ul>
        )}
      </div>
    </div>
  );
}

function DrawMatches({
  players,
  presentIds,
  matchesForDate,
  seenTeammatesToday,
  date,
  league,
  write,
  disabled,
}: any) {
  const presentPlayers = players.filter((p: any) => presentIds.includes(p.id));
  const canDraw = presentPlayers.length >= 4;

  const draw = () => {
    if (presentPlayers.length < 4 || disabled) return;
    const allPlayerIds = presentPlayers.map((p:any) => p.id); 
    const getScore = (pid: string) => {
      let pts = 0;
      let matchCount = 0;
      matchesForDate.forEach((m:any) => {
        if (!m.winner) return;
        const inA = m.teamA.includes(pid);
        const inB = m.teamB.includes(pid);
        if (!inA && !inB) return;
        matchCount++;
        const isWin = (m.winner === "A" && inA) || (m.winner === "B" && inB);
        if (isWin) pts += 1;
      });
      return { id: pid, score: pts, matches: matchCount };
    };

    const sortedIds = allPlayerIds.map(getScore).sort((a:any, b:any) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.matches - a.matches;
      });

    const allMatches: Match[] = [];
    const localSeenTeammatesToday = new Set<string>(seenTeammatesToday);
    const baseName = (full: string) => full.replace(/^.+?\s/, "");
    const isCoach = (id: string) => {
      const p = players.find((pl:any) => pl.id === id);
      if (!p) return false;
      const name = baseName(p.name);
      return name === "Robi" || name === "Melinda";
    };
    const canBeTeammates = (aId: string, bId: string) => !(isCoach(aId) && isCoach(bId));

    for (let round = 0; round < 3; round++) {
      let workingPool = [...sortedIds];
      const teams: Pair[] = [];
      const roundMatches: Match[] = [];

    while (workingPool.length >= 2) {
      const high = workingPool[0];
      let bestMate: typeof high | null = null;
      for (let i = workingPool.length - 1; i >= 1; i--) {
        const candidate = workingPool[i];
        if (!localSeenTeammatesToday.has(key(high.id, candidate.id)) && canBeTeammates(high.id, candidate.id)) {
          bestMate = candidate;
          break;
        }
      }
      if (!bestMate) {
        for (let i = workingPool.length - 1; i >= 1; i--) {
          const candidate = workingPool[i];
          if (canBeTeammates(high.id, candidate.id)) {
            bestMate = candidate;
            break;
          }
        }
      }
      if (!bestMate) break;
      workingPool = workingPool.filter((p) => p.id !== high.id && p.id !== bestMate!.id);
      teams.push([high.id, bestMate.id] as Pair);
      localSeenTeammatesToday.add(key(high.id, bestMate.id));
    }
      while (teams.length >= 2) {
        const teamA = teams[0];
        const teamB = teams[teams.length - 1];
        roundMatches.push({ id: uid(), date, teamA, teamB });
        teams.splice(teams.length - 1, 1);
        teams.splice(0, 1);
      }
      allMatches.push(...roundMatches);
    }

    if (allMatches.length === 0) {
      alert("Could not generate a balanced draw with the current players.");
      return;
    }
    write({ matches: [...league.matches, ...allMatches] });
  };

  return (
    <div className={card}>
      <ShuttleBg />
      <div className="relative z-10">
        <h3 className="mb-2 font-bold text-slate-800">Auto Draw <span className="text-slate-400 text-sm font-normal">(3 Rounds)</span></h3>
        <p className="text-sm text-slate-500 mb-4">
            Generates 3 balanced rounds based on daily performance.
        </p>
        <button className={`${btnPrimary} w-full`} onClick={draw} disabled={!canDraw || !!disabled}>
            ⚡ Generate Matches
        </button>
      </div>
    </div>
  );
}

function MatchesPlayer({ grouped, nameOf }: any) {
  const [openDate, setOpenDate] = useState<string | null>(null);
  const latestDate = useMemo(() => grouped.length > 0 ? grouped[0].date : null, [grouped]);
  useEffect(() => {
    if (!latestDate) return;
    setOpenDate((prev) => (prev === latestDate ? prev : latestDate));
  }, [grouped]);
  const baseName = (full: string) => full.replace(/^.+?\s/, "");

  return (
    <div className={card}>
      <ShuttleBg />
      <div className="relative z-10">
        <h3 className="mb-4 font-bold text-slate-800">Results History</h3>
        {grouped.length === 0 ? (
            <p className="text-sm text-slate-400">No matches yet.</p>
        ) : (
            <div className="space-y-3">
            {grouped.map((g: any) => {
                const isOpen = openDate === g.date;
                const presentIds = new Set<string>();
                g.matches.forEach((m: any) => {
                m.teamA.forEach((id: string) => presentIds.add(id));
                m.teamB.forEach((id: string) => presentIds.add(id));
                });
                const presentPlayers = Array.from(presentIds).map(nameOf).sort((a: any, b: any) => baseName(a).localeCompare(baseName(b), "hu"));

                return (
                <div key={g.date} id={`date-${g.date}`} className={`overflow-hidden rounded-xl border transition-all ${isOpen ? "border-sky-200 bg-white shadow-md ring-1 ring-sky-100" : "border-slate-200 bg-white"}`}>
                    <button
                    type="button"
                    onClick={() => setOpenDate(isOpen ? null : g.date)}
                    className={`flex w-full items-center justify-between p-4 transition-colors ${isOpen ? "bg-sky-50" : "hover:bg-slate-50"}`}
                    >
                    <div className="flex flex-col items-start">
                        <span className="text-lg font-bold text-slate-800">{g.date}</span>
                        <span className="text-xs font-semibold text-sky-600 uppercase tracking-wide">{weekday(g.date)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                         <span className="text-xs font-bold bg-white border border-slate-200 px-2 py-1 rounded-lg text-slate-500">{g.matches.length} Matches</span>
                         <span className="text-slate-400 text-xs">{isOpen ? "Hide ▴" : "Show ▾"}</span>
                    </div>
                    </button>

                    {isOpen && (
                    <div className="p-4 pt-2 border-t border-sky-100/50">
                        <div className="mb-4">
                        <div className="flex flex-wrap gap-1 mt-2">
                            {presentPlayers.map((p: any, i: number) => (
                            <span key={i} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded-md">{p}</span>
                            ))}
                        </div>
                        </div>

                        <ul className="grid gap-3 sm:grid-cols-2">
                        {g.matches.map((m: any) => {
                            const winA = m.winner === "A";
                            const winB = m.winner === "B";
                            return (
                            <li key={m.id} className={`relative rounded-lg border p-3 text-sm flex flex-col justify-center gap-1 ${m.winner ? "border-slate-100 bg-slate-50" : "border-dashed border-slate-200 bg-slate-50/50 opacity-70"}`}>
                                {!m.winner && <div className="absolute inset-0 flex items-center justify-center text-[10px] uppercase font-bold text-slate-300 pointer-events-none">Pending</div>}
                                <div className={`flex justify-between items-center p-1 rounded ${winA ? "bg-emerald-100/50 text-emerald-800 font-bold" : "text-slate-600"}`}>
                                    <span>{nameOf(m.teamA[0])} & {nameOf(m.teamA[1])}</span>
                                    {winA && <span>🏆</span>}
                                </div>
                                <div className={`flex justify-between items-center p-1 rounded ${winB ? "bg-emerald-100/50 text-emerald-800 font-bold" : "text-slate-600"}`}>
                                    <span>{nameOf(m.teamB[0])} & {nameOf(m.teamB[1])}</span>
                                    {winB && <span>🏆</span>}
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
    </div>
  );
}

function StandingsInfo() {
  return (
    <div className={card}>
        <ShuttleBg />
        <div className="relative z-10 text-sm text-slate-600 space-y-2">
            <h3 className="font-bold text-slate-800 mb-2">Rules & Points</h3>
            <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-bold shrink-0">+3</span>
                <span>Points for a <b className="text-emerald-700">WIN</b></span>
            </div>
            <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 font-bold shrink-0">+1</span>
                <span>Point for a <b className="text-slate-500">LOSS</b></span>
            </div>
            <div className="mt-4 pt-2 border-t border-slate-100">
                <p className="text-xs text-slate-400">Bonus points awarded for special achievements (Beating Coach, Ironman streak).</p>
            </div>
        </div>
    </div>
  );
}

function AdminDateJump({ grouped, date, setDate, lastSessionDate }: any) {
  return (
    <div className={card}>
      <ShuttleBg />
      <div className="relative z-10">
        <h3 className="mb-2 font-bold text-slate-800">Sessions</h3>
        {grouped.length === 0 ? (
            <p className="text-sm text-slate-400">No history yet.</p>
        ) : (
            <ul className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
            {grouped.map((g: any) => (
                <li key={g.date}>
                <a href={`#date-${g.date}`} className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${date === g.date ? "bg-sky-50 text-sky-700 font-bold" : "text-slate-600 hover:bg-slate-50"}`}
                    onClick={(e) => { e.preventDefault(); setDate(g.date); window.scrollTo(0, 0); }}>
                    <span>{g.date}</span>
                    <span className="flex items-center gap-2">
                         {lastSessionDate === g.date && <span className="h-2 w-2 rounded-full bg-lime-500"></span>}
                         <span className="text-xs opacity-60">{weekday(g.date)}</span>
                    </span>
                </a>
                </li>
            ))}
            </ul>
        )}
      </div>
    </div>
  );
}

function BackupPanel({ backups, onCreate, onRestore }: any) {
  const [note, setNote] = useState("");
  const sortedBackups = useMemo(() => [...backups].sort((a:any, b:any) => b.createdAt.localeCompare(a.createdAt)), [backups]);
  return (
    <div className={card}>
      <ShuttleBg />
      <div className="relative z-10">
        <h3 className="mb-3 font-bold text-slate-800">Database Backup</h3>
        <div className="space-y-4">
            <div className="flex gap-2">
                <input className={input} placeholder="Backup note..." value={note} onChange={(e) => setNote(e.target.value)} />
                <button className={`${btnSecondary} whitespace-nowrap`} onClick={() => { onCreate(note); setNote(""); }}>Save</button>
            </div>
            <div className="space-y-2 max-h-40 overflow-y-auto">
            {sortedBackups.map((b: any) => (
                <div key={b.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-2 text-xs bg-slate-50">
                    <div className="truncate">
                        <div className="font-bold text-slate-700">{new Date(b.createdAt).toLocaleDateString()}</div>
                        <div className="text-slate-400">{b.note || "Auto"}</div>
                    </div>
                    <button className="text-sky-600 font-bold hover:underline" onClick={() => onRestore(b.id)}>Restore</button>
                </div>
            ))}
            </div>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, icon, color, iconColor }: any) {
  return (
    <div className={`flex flex-1 flex-col items-center justify-center rounded-2xl p-3 border border-white/60 shadow-sm ${color}`}>
      <div className={`flex h-8 w-8 items-center justify-center rounded-full bg-white text-lg shadow-sm mb-1 ${iconColor}`}>
        {icon}
      </div>
      <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">{label}</div>
      <div className="font-black text-xl text-slate-800">{value}</div>
    </div>
  );
}

function PlayerStats({ players, matches, meId, setMeId }: any) {
  const computePlayerStats = (playerId: string, matches: Match[]) => {
    let wins = 0; let losses = 0; const form: ("W" | "L")[] = [];
    matches.forEach((m) => {
      const inA = m.teamA.includes(playerId); const inB = m.teamB.includes(playerId);
      if (!inA && !inB) return; if (!m.winner) return;
      const isWin = (m.winner === "A" && inA) || (m.winner === "B" && inB);
      if (isWin) { wins++; form.push("W"); } else { losses++; form.push("L"); }
    });
    const total = wins + losses; const winRate = total === 0 ? 0 : Math.round((wins / total) * 100);
    return { total, wins, losses, winRate, formLast5: form.slice(-5) };
  };
  const selectedPlayer = players.find((p:any) => p.id === meId);
  useEffect(() => { if (players.length > 0 && (!meId || !players.some((p:any) => p.id === meId))) setMeId(players[0].id); }, [players, meId, setMeId]);
  const stats = useMemo(() => (!meId ? null : computePlayerStats(meId, matches)), [meId, matches]);
  const baseName = (full: string) => full.replace(/^.+?\s/, "");
  const sortedPlayers = useMemo(() => [...players].sort((a:any, b:any) => baseName(a.name).localeCompare(baseName(b.name), "hu")), [players]);

  return (
    <div className={card}>
      <ShuttleBg />
      <div className="relative z-10">
        <h3 className="mb-3 font-bold text-slate-800">Player Stats</h3>
        {players.length === 0 ? <p className="text-sm text-slate-400">Add players first.</p> : (
            <>
            <select className={`${input} mb-4 font-bold text-lg`} value={meId || ""} onChange={(e) => setMeId(e.target.value)}>
                <option value="" disabled>Select Player...</option>
                {sortedPlayers.map((p:any) => (<option key={p.id} value={p.id}>{p.name}</option>))}
            </select>
            {selectedPlayer && stats && (
                <div className="space-y-3">
                <div className="flex gap-2">
                    <StatBox label="Wins" value={stats.wins} icon="🥇" color="bg-gradient-to-br from-emerald-50 to-emerald-100" iconColor="text-emerald-600" />
                    <StatBox label="Win Rate" value={`${stats.winRate}%`} icon="📈" color="bg-gradient-to-br from-sky-50 to-sky-100" iconColor="text-sky-600" />
                </div>
                <div className="flex gap-2">
                     <StatBox label="Total" value={stats.total} icon="🏸" color="bg-slate-50" iconColor="text-slate-500" />
                     <StatBox label="Losses" value={stats.losses} icon="📉" color="bg-rose-50" iconColor="text-rose-500" />
                </div>
                
                <div className="pt-2 border-t border-slate-100 mt-2">
                    <div className="text-xs font-bold text-slate-400 uppercase mb-1">Recent Form</div>
                    <div className="flex gap-1.5">
                    {stats.formLast5.map((f:any, i:number) => (
                        <span key={i} className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold border ${f === "W" ? "bg-emerald-500 border-emerald-600 text-white" : "bg-rose-50 border-rose-200 text-rose-500"}`}>{f}</span>
                    ))}
                    </div>
                </div>
                </div>
            )}
            </>
        )}
      </div>
    </div>
  );
}

const BADGE_CONFIG: Record<string, { icon: string; accent: string; bg: string }> = {
  win5: { icon: "🥉", accent: "text-amber-700", bg: "" },
  win10: { icon: "🥈", accent: "text-slate-700", bg: "" },
  win25: { icon: "🥇", accent: "text-yellow-700", bg: "" },
  beatMelinda: { icon: "🎯", accent: "text-rose-700", bg: "" },
  streak3: { icon: "🔥", accent: "text-orange-700", bg: "" },
  streak6: { icon: "💪", accent: "text-lime-700", bg: "" },
  streak10: { icon: "🏆", accent: "text-sky-700", bg: "" },
  min5matches: { icon: "🏸", accent: "text-cyan-700", bg: "" },
};

function Standings({ rows, achievementsById }: any) {
  const [tab, setTab] = useState<"all" | "women" | "men">("all");
  const filteredRows = useMemo(() => {
    if (tab === "all") return rows;
    const wanted = tab === "men" ? "M" : "F";
    return rows.filter((r:any) => r.gender === wanted);
  }, [rows, tab]);
  const countMen = rows.filter((r:any) => r.gender === "M").length;
  const countWomen = rows.filter((r:any) => r.gender === "F").length;

  return (
    <div className={card}>
      <ShuttleBg />
      <div className="relative z-10">
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-xl font-black text-slate-800">League Standings</h2>
            <div className="inline-flex rounded-xl bg-slate-100 p-1">
                {["all", "women", "men"].map((t) => (
                    <button key={t} onClick={() => setTab(t as any)} className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-all ${tab === t ? "bg-white text-sky-700 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}>
                        {t} {(t === "women" && countWomen > 0) ? `(${countWomen})` : (t === "men" && countMen > 0) ? `(${countMen})` : ""}
                    </button>
                ))}
            </div>
        </div>

        {filteredRows.length === 0 ? (
            <div className="p-8 text-center text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                No data available for this category.
            </div>
        ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
            <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50">
                <tr>
                    {["#", "Player", "Pts", "W", "L", "M", "%", "Awards"].map((h) => (
                        <th key={h} className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">{h}</th>
                    ))}
                </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                {filteredRows.map((r: any, i: number) => (
                    <tr key={r.id} className={`transition-colors hover:bg-sky-50/30 ${!r.qualified ? "opacity-50 grayscale" : ""}`}>
                    <td className="px-3 py-3 font-bold text-slate-400 text-xs">{i + 1}.</td>
                    <td className="px-3 py-3 font-bold text-slate-800 text-sm">
                        {r.name}
                        {!r.qualified && <span className="block text-[9px] font-normal text-rose-400">Qualifying...</span>}
                    </td>
                    <td className="px-3 py-3 text-sm font-black text-indigo-600">
                        {r.totalPoints}
                        {r.bonusPoints > 0 && <span className="ml-1 text-[10px] font-medium text-amber-500">+{r.bonusPoints}★</span>}
                    </td>
                    <td className="px-3 py-3 text-xs font-bold text-emerald-600 bg-emerald-50/30">{r.wins}</td>
                    <td className="px-3 py-3 text-xs font-bold text-rose-500 bg-rose-50/30">{r.losses}</td>
                    <td className="px-3 py-3 text-xs font-medium text-slate-600">{r.matches}</td>
                    <td className="px-3 py-3 text-xs font-bold text-slate-700">{r.winRate}%</td>
                    <td className="px-3 py-3">
                        <div className="flex -space-x-1">
                        {achievementsById.get(r.id)?.map((a:any) => (
                            <span key={a.id} className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-100 text-xs" title={a.title}>
                                {BADGE_CONFIG[a.id]?.icon || "⭐"}
                            </span>
                        ))}
                        </div>
                    </td>
                    </tr>
                ))}
                </tbody>
            </table>
            </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [league, write] = useLeague();
  const { players, matches, backups = [] } = league;
  const [role, setRole] = useState<"player" | "admin">("player");
  const isAdmin = role === "admin";
  const [meId, setMeId] = useState<string>(players.length ? players[0].id : "");
  const defaultDate = useMemo(() => fmt(nextTrainingDate()), []);
  const [date, setDate] = useState(defaultDate);
  const [presentIds, setPresentIds] = useState<string[]>([]);

  const setDateAndResetAttendance = useCallback((newDate: string) => { setDate(newDate); setPresentIds([]); }, []);
  const matchesForDate = useMemo(() => matches.filter((m) => m.date === date), [matches, date]);
  const seenTeammatesToday = useMemo(() => {
    const seen = new Set<string>();
    matchesForDate.forEach((m) => { if (m.winner) { seen.add(key(m.teamA[0], m.teamA[1])); seen.add(key(m.teamB[0], m.teamB[1])); } });
    return seen;
  }, [matchesForDate]);

  const grouped = useMemo(() => {
    const map = new Map<string, Match[]>();
    [...matches].reverse().forEach((m) => { if (!map.has(m.date)) map.set(m.date, []); map.get(m.date)!.push(m); });
    return Array.from(map.entries()).map(([date, matches]) => ({ date, matches }));
  }, [matches]);
  const lastSessionDate = grouped.length > 0 ? grouped[0].date : null;

  const { standings, achievementsById } = useMemo(() => {
    const MIN_MATCHES = 5;
    const statsById = new Map<string, any>();
    players.forEach((p) => statsById.set(p.id, { wins: 0, losses: 0, matches: 0, winRate: 0, basePoints: 0, bonusPoints: 0, totalPoints: 0, qualified: false }));
    matches.forEach((m) => {
      if (!m.winner) return;
      [...m.teamA, ...m.teamB].forEach((pid) => { const s = statsById.get(pid); if (s) s.matches += 1; });
      const winners = m.winner === "A" ? m.teamA : m.teamB; const losers = m.winner === "A" ? m.teamB : m.teamA;
      winners.forEach((pid) => { const s = statsById.get(pid); if (s) s.wins += 1; });
      losers.forEach((pid) => { const s = statsById.get(pid); if (s) s.losses += 1; });
    });
    statsById.forEach((s) => { const total = s.wins + s.losses; s.winRate = total ? Math.round((s.wins / total) * 100) : 0; s.basePoints = s.wins * 3 + s.losses * 1; s.qualified = s.matches >= MIN_MATCHES; });
    const achievementsMap = new Map<string, Achievement[]>();
    players.forEach((p) => {
      const ach = computeAchievementsFull(p.id, matches, players);
      achievementsMap.set(p.id, ach);
      let bonus = 0; if (ach.some((a) => a.id === "beatMelinda")) bonus += 1; if (ach.some((a) => a.id === "streak10")) bonus += 1;
      const st = statsById.get(p.id); if (st) { st.bonusPoints = bonus; st.totalPoints = st.basePoints + bonus; }
    });
    const sorted = players.map((p) => ({ ...p, ...statsById.get(p.id)! })).sort((a, b) => { if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints; if (b.winRate !== a.winRate) return b.winRate - a.winRate; if (b.matches !== a.matches) return b.matches - a.matches; return a.name.localeCompare(b.name, "hu"); });
    return { standings: sorted, achievementsById: achievementsMap };
  }, [players, league.matches]);

  const addPlayer = (name: string) => { if (!role) return; write({ players: [...players, { id: uid(), name }] }); };
  const updatePlayerGender = (id: string, gender: "M" | "F" | null) => { if (!role) return; write({ players: players.map((p) => (p.id === id ? { ...p, gender: gender ?? undefined } : p)) }); };
  const removePlayer = (id: string) => { if (!role) return; if (!confirm("Delete permanently?")) return; write({ players: players.filter((p) => p.id !== id), matches: league.matches.filter((m) => !m.teamA.includes(id) && !m.teamB.includes(id)) }); };
  const updatePlayerEmoji = (id: string, emoji: string) => { if (!role) return; write({ players: players.map((p) => { if (p.id !== id) return p; const parts = p.name.split(" "); return { ...p, name: parts.length > 1 ? `${emoji} ${parts.slice(1).join(" ")}` : `${emoji} ${p.name}` }; }) }); };
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name || "—";
  const createMatch = (teamA: Pair, teamB: Pair) => { if (!isAdmin) return; write({ matches: [...matches, { id: uid(), date, teamA, teamB }] }); };
  const pickWinner = (id: string, winner: "A" | "B") => { if (!isAdmin) return; write({ matches: matches.map((m) => (m.id === id ? { ...m, winner } : m)) }); };
  const clearWinner = (id: string) => { if (!isAdmin) return; write({ matches: matches.map((m) => { if (m.id === id) { const { winner, ...rest } = m; return rest as Match; } return m; }) }); };
  const deleteMatch = (id: string) => { if (!isAdmin) return; if (!confirm("Delete match?")) return; write({ matches: matches.filter((m) => m.id !== id) }); };
  const createBackup = (note: string) => { if (!isAdmin) return; write({ backups: [...backups, { id: uid(), createdAt: new Date().toISOString(), note: note.trim() || undefined, data: { players: league.players, matches: league.matches } }] }); alert("Backup created!"); };
  const restoreBackup = (id: string) => { if (!isAdmin) return; if (!confirm("Restore data? Current data will be lost.")) return; const backup = backups.find((b) => b.id === id); if (!backup) return; write({ players: backup.data.players, matches: backup.data.matches }); alert("Restored!"); };

  const playersWhoPlayedToday = new Set<string>();
  matchesForDate.forEach((m) => { m.teamA.forEach((id) => playersWhoPlayedToday.add(id)); m.teamB.forEach((id) => playersWhoPlayedToday.add(id)); });
  const freeIds = presentIds.filter((id) => !playersWhoPlayedToday.has(id));

  return (
    <div className="min-h-screen bg-[#f0f4f8] text-slate-900 font-sans selection:bg-sky-200">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Header title={league.title} role={role} setPlayer={() => setRole("player")} setAdmin={() => setRole("admin")} />

        <div className="space-y-6">
          {role === "admin" && (
            <div className="space-y-6">
              <section className="grid gap-6 md:grid-cols-3">
                <div className="space-y-6 md:col-span-2">
                  <DatePicker value={date} onChange={setDateAndResetAttendance} />
                  <AttendanceList players={players} presentIds={presentIds} setPresentIds={setPresentIds} />
                  <DrawMatches players={players} presentIds={presentIds} matchesForDate={matchesForDate} seenTeammatesToday={seenTeammatesToday} date={date} league={league} write={write} />
                </div>
                <div className="space-y-6">
                  <PlayerEditor players={players} onAdd={addPlayer} onRemove={removePlayer} onUpdateEmoji={updatePlayerEmoji} onUpdateGender={updatePlayerGender} />
                  <AdminDateJump grouped={grouped} date={date} setDate={setDateAndResetAttendance} lastSessionDate={lastSessionDate} />
                  <BackupPanel onCreate={createBackup} onRestore={restoreBackup} backups={backups} />
                </div>
              </section>
              <section className="space-y-6">
                <MatchesAdmin matches={matchesForDate} nameOf={nameOf} onPick={pickWinner} onClear={clearWinner} onDelete={deleteMatch} />
                <SelectPairs players={players} freeIds={freeIds} seenTeammates={seenTeammatesToday} onCreate={createMatch} />
              </section>
              <div className="mt-8"><Standings rows={standings} achievementsById={achievementsById} /></div>
            </div>
          )}

          {role === "player" && (
            <>
              <section className="grid gap-6 md:grid-cols-3">
                <div className="space-y-6 md:col-span-2">
                  <MatchesPlayer grouped={grouped} nameOf={nameOf} />
                </div>
                <div className="space-y-6">
                  <AdminDateJump grouped={grouped} date={date} setDate={setDate} lastSessionDate={lastSessionDate} />
                  <PlayerStats players={players} matches={matches} meId={meId} setMeId={setMeId} />
                  <PlayerAchievements players={players} matches={matches} meId={meId} />
                </div>
              </section>
              <section className="grid gap-6 md:grid-cols-[2fr,1fr] mt-8">
                <Standings rows={standings} achievementsById={achievementsById} />
                <StandingsInfo />
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}