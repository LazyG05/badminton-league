// 🔹 Polyfillek régi böngészőkhöz (iOS 10, régi Safari)
import "core-js/stable";
import "regenerator-runtime/runtime";
import "cross-fetch/polyfill";

import { useCallback, useEffect, useMemo, useState } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  onSnapshot,
  setDoc,
  serverTimestamp,
  enableIndexedDbPersistence,
} from "firebase/firestore";

// ========================= Types =========================

export type Player = { id: string; name: string; gender?: "F" | "M" };

export type Match = {
  id: string;
  date: string; // "YYYY-MM-DD"
  teamA: [string, string]; // player IDs
  teamB: [string, string];
  scoreA: number | null;
  scoreB: number | null;
  winner: "A" | "B" | null;
  bestOf: number; // always 3 (best of 3) for now
};

export type Backup = {
  id: string;
  createdAt: string;
  league: LeagueDoc;
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
const db = getFirestore(app);

// Enable offline persistence (IndexedDB)
enableIndexedDbPersistence(db).catch((err) => {
  console.warn("IndexedDB persistence error:", err);
});

// ========================= Utils =========================

function uid() {
  return Math.random().toString(36).slice(2);
}

function fmt(date: Date) {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

function parseDate(str: string) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function key(a: string, b: string) {
  return [a, b].sort().join("-");
}

function shuffle<T>(array: T[]): T[] {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ========================= Hooks =========================

function useLeague() {
  const [league, setLeague] = useState<LeagueDoc>({
    players: [],
    matches: [],
    backups: [],
  });

  useEffect(() => {
    const ref = doc(db, "leagues", "default");
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as LeagueDoc;
        if (!data.backups) data.backups = [];
        setLeague(data);
      } else {
        setLeague({ players: [], matches: [], backups: [] });
      }
    });

    return () => unsub();
  }, []);

  const write = useCallback(
    async (partial: Partial<LeagueDoc>) => {
      const ref = doc(db, "leagues", "default");
      const current = league;

      const backup: Backup = {
        id: uid(),
        createdAt: new Date().toISOString(),
        league: current,
      };

      const updated: LeagueDoc = {
        ...current,
        ...partial,
        updatedAt: serverTimestamp(),
        backups: [...(current.backups || []), backup].slice(-20),
      };

      await setDoc(ref, updated, { merge: true });
    },
    [league]
  );

  return [league, write] as const;
}

// ========================= Styling helpers =========================

const card =
  "relative overflow-hidden rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur-sm sm:p-5";
const input =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100";
const btnBase =
  "inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-medium shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60";
const btnPrimary =
  btnBase +
  " bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800";
const btnSecondary =
  btnBase +
  " bg-slate-100 text-slate-800 hover:bg-slate-200 active:bg-slate-300";
const btnDanger =
  btnBase + " bg-rose-500 text-white hover:bg-rose-600 active:bg-rose-700";

// Emojik listája
const EMOJIS = [
  "🏸",
  "🔥",
  "💪",
  "🚀",
  "⭐",
  "🐺",
  "🦊",
  "🐻",
  "🦁",
  "🐯",
  "🐼",
  "🦄",
  "🐙",
  "🐢",
  "🐧",
  "🐤",
];

// ========================= Achievements =========================

type AchievementId = "beatMelinda" | "streak10";

type Achievement = {
  id: AchievementId;
  title: string;
  description: string;
};

const BADGE_CONFIG: Record<
  AchievementId,
  { icon: string; label: string; color: string }
> = {
  beatMelinda: {
    icon: "👑",
    label: "Melinda slayer",
    color: "bg-amber-100 text-amber-800 border-amber-200",
  },
  streak10: {
    icon: "🔥",
    label: "Ironman 10x",
    color: "bg-red-100 text-red-800 border-red-200",
  },
};

function computeAchievementsFull(
  playerId: string,
  matches: Match[],
  players: Player[]
): Achievement[] {
  const result: Achievement[] = [];

  const melinda = players.find((p) =>
    p.name.toLowerCase().includes("melinda")
  );
  if (melinda) {
    const beatMelinda = matches.some((m) => {
      if (!m.winner) return false;
      const melindaOnA = m.teamA.includes(melinda.id);
      const melindaOnB = m.teamB.includes(melinda.id);
      if (!melindaOnA && !melindaOnB) return false;

      const playerOnA = m.teamA.includes(playerId);
      const playerOnB = m.teamB.includes(playerId);
      if (!playerOnA && !playerOnB) return false;

      if (melindaOnA && m.winner === "B" && playerOnB) return true;
      if (melindaOnB && m.winner === "A" && playerOnA) return true;
      return false;
    });

    if (beatMelinda) {
      result.push({
        id: "beatMelinda",
        title: "You beat Melinda!",
        description: "Won a match against Melinda",
      });
    }
  }

  const dates = Array.from(
    new Set(
      matches
        .filter((m) => m.winner && [...m.teamA, ...m.teamB].includes(playerId))
        .map((m) => m.date)
    )
  ).sort();

  let longestStreak = 0;
  let currentStreak = 0;
  let prevDate: Date | null = null;

  for (const d of dates) {
    const current = parseDate(d);
    if (!prevDate) {
      currentStreak = 1;
    } else {
      const diffDays =
        (current.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays <= 7 && diffDays >= 1) {
        currentStreak += 1;
      } else {
        currentStreak = 1;
      }
    }
    longestStreak = Math.max(longestStreak, currentStreak);
    prevDate = current;
  }

  if (longestStreak >= 10) {
    result.push({
      id: "streak10",
      title: "Ironman 10x",
      description: "Played in at least 10 consecutive sessions",
    });
  }

  return result;
}

// ========================= Next training date =========================

function nextTrainingDate() {
  const d = today();
  const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

  let daysToAdd = 0;
  if (day <= 2) {
    daysToAdd = 2 - day;
  } else {
    daysToAdd = 2 + (7 - day);
  }

  d.setDate(d.getDate() + daysToAdd);
  return d;
}

// ========================= Decorative Background =========================

function ShuttleBg() {
  return (
    <div className="pointer-events-none absolute inset-0 opacity-60">
      <svg
        aria-hidden="true"
        className="absolute -right-10 -top-16 h-40 w-40 text-indigo-50"
        viewBox="0 0 200 200"
      >
        <defs>
          <linearGradient id="shuttle" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#e0e7ff" />
            <stop offset="100%" stopColor="#faf5ff" />
          </linearGradient>
        </defs>
        <path
          fill="url(#shuttle)"
          d="M100 10c20 0 40 10 50 30s5 45-10 60l-28 28a18 18 0 01-25 0l-27-28C45 85 40 60 50 40s30-30 50-30z"
        />
      </svg>
      <svg
        aria-hidden="true"
        className="absolute bottom-[-40px] left-[-20px] h-32 w-32 text-indigo-50"
        viewBox="0 0 200 200"
      >
        <circle
          cx="100"
          cy="100"
          r="80"
          fill="none"
          stroke="currentColor"
          strokeDasharray="6,8"
          strokeWidth="4"
          opacity="0.4"
        />
      </svg>
    </div>
  );
}

// ========================= Components =========================

function PlayerSelect({
  players,
  value,
  onChange,
  label,
  disabled,
}: {
  players: Player[];
  value: string | null;
  onChange: (id: string | null) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-500">{label}</label>
      <select
        className={input}
        value={value || ""}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled}
      >
        <option value="">Select a player</option>
        {[...players]
          .slice()
          .sort((a, b) =>
            a.name.replace(/^.+?\s/, "").localeCompare(
              b.name.replace(/^.+?\s/, ""),
              "hu"
            )
          )
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
      </select>
    </div>
  );
}

function getEmoji(name: string): string {
  const parts = name.split(" ");
  const first = parts[0];
  if (/[\u231A-\uD83E\uDDFF]/.test(first)) {
    return first;
  }
  return "🏸";
}

function getBaseName(name: string): string {
  const parts = name.split(" ");
  const first = parts[0];
  if (/[\u231A-\uD83E\uDDFF]/.test(first)) {
    return parts.slice(1).join(" ") || name;
  }
  return name;
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
  onUpdateGender: (id: string, gender: "F" | "M" | null) => void;
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
    } else if (
      selectedPlayerId &&
      !players.some((p) => p.id === selectedPlayerId)
    ) {
      setSelectedPlayerId(players[0].id);
    }
  }, [players, selectedPlayerId]);

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

      <div className="mb-4 space-y-2">
        <div className="flex w-full flex-col gap-2 sm:flex-row">
          <div className="flex items-center gap-2 sm:w-1/3">
            <button
              type="button"
              className={btnSecondary + " w-12"}
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
          <div className="flex justify-end sm:w-1/3">
            <button
              type="button"
              className={btnPrimary + " w-full sm:w-auto"}
              onClick={handleAdd}
              disabled={!!name.trim().length === false || !!disabled}
            >
              Add Player
            </button>
          </div>
        </div>

        {editingEmoji && (
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/80 p-3 text-xs">
            <div className="mb-1 font-medium text-indigo-900">
              Choose a default emoji
            </div>
            <div className="flex flex-wrap gap-1">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  className={`rounded-lg border px-2 py-1 ${
                    e === selectedEmoji
                      ? "bg-white border-indigo-400"
                      : "bg-indigo-100 border-transparent"
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
      </div>

      <button
        type="button"
        className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
        onClick={() => setShowManagement((s) => !s)}
      >
        <span
          className={`inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] ${
            showManagement ? "bg-slate-800 text-white" : "bg-white"
          }`}
        >
          {showManagement ? "−" : "+"}
        </span>
        <span>Manage existing players</span>
      </button>

      {showManagement && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs">
          <div className="space-y-2">
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
              {[...players]
                .sort((a, b) =>
                  a.name.replace(/^.+?\s/, "").localeCompare(
                    b.name.replace(/^.+?\s/, ""),
                    "hu"
                  )
                )
                .map((p) => (
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

                {/* Gender módosítás */}
                <div>
                  <div className="mb-1 text-xs text-slate-500">
                    Gender for{" "}
                    <span className="font-semibold">
                      {getBaseName(selectedPlayer.name)}
                    </span>
                  </div>
                  <select
                    className={input}
                    value={selectedPlayer.gender || ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "F" || val === "M") {
                        onUpdateGender(selectedPlayer.id, val);
                      } else {
                        onUpdateGender(selectedPlayer.id, null);
                      }
                    }}
                    disabled={!!disabled}
                  >
                    <option value="">Not set</option>
                    <option value="F">Female</option>
                    <option value="M">Male</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type Pair = [string, string];

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
  onCreate: (teamA: Pair, teamB: Pair) => void;
  disabled?: boolean;
}) {
  const [a1, setA1] = useState<string | null>(null);
  const [a2, setA2] = useState<string | null>(null);
  const [b1, setB1] = useState<string | null>(null);
  const [b2, setB2] = useState<string | null>(null);

  const allSelected = [a1, a2, b1, b2].filter(Boolean) as string[];

  const hasSeenBefore =
    a1 && a2 && seenTeammates.has(key(a1, a2 as string)) ? true : false;

  const canCreate =
    a1 && a2 && b1 && b2 && freeIds.includes(a1) && freeIds.includes(a2);

  const handleCreate = () => {
    if (!canCreate || disabled) return;
    onCreate([a1!, a2!], [b1!, b2!]);
    setA1(null);
    setA2(null);
    setB1(null);
    setB2(null);
  };

  const playerOptions = players.filter(
    (p) => freeIds.includes(p.id) && !allSelected.includes(p.id)
  );

  return (
    <div className={card}>
      <ShuttleBg />
      <h2 className="mb-2 text-lg font-semibold">Manual draw</h2>
      <p className="mb-3 text-xs text-slate-500">
        Pick 4 available players to create a match.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Team A
          </h3>
          <PlayerSelect
            players={playerOptions}
            value={a1}
            onChange={setA1}
            label="Player 1"
            disabled={!!disabled}
          />
          <PlayerSelect
            players={playerOptions}
            value={a2}
            onChange={setA2}
            label="Player 2"
            disabled={!!disabled}
          />
          {hasSeenBefore && (
            <div className="text-xs text-amber-600">
              ⚠️ This pair has already played together today.
            </div>
          )}
        </div>
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Team B
          </h3>
          <PlayerSelect
            players={playerOptions}
            value={b1}
            onChange={setB1}
            label="Player 1"
            disabled={!!disabled}
          />
          <PlayerSelect
            players={playerOptions}
            value={b2}
            onChange={setB2}
            label="Player 2"
            disabled={!!disabled}
          />
        </div>
      </div>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          className={btnPrimary}
          onClick={handleCreate}
          disabled={!canCreate || !!disabled}
        >
          Create match
        </button>
      </div>
    </div>
  );
}

function RandomPairs({
  players,
  date,
  matches,
  presentIds,
  onCreate,
  disabled,
}: {
  players: Player[];
  date: string;
  matches: Match[];
  presentIds: string[];
  onCreate: (teamA: Pair, teamB: Pair) => void;
  disabled?: boolean;
}) {
  const availableIds = presentIds.filter((id) => {
    const hasOpenMatch = matches.some(
      (m) =>
        m.date === date &&
        (!m.winner || m.scoreA === null || m.scoreB === null) &&
        [...m.teamA, ...m.teamB].includes(id)
    );
    return !hasOpenMatch;
  });

  const [numPairs, setNumPairs] = useState<number>(1);
  const [pairs, setPairs] = useState<{ teamA: Pair; teamB: Pair }[]>([]);
  const [autoMode, setAutoMode] = useState(false);

  const toggleAutoMode = () => setAutoMode((prev) => !prev);

  const generatePairs = () => {
    if (availableIds.length < 4 || disabled) return;

    const gameCount = Math.min(
      numPairs,
      Math.floor(availableIds.length / 4)
    );

    const shuffled = shuffle(availableIds);
    const newPairs: { teamA: Pair; teamB: Pair }[] = [];

    for (let i = 0; i < gameCount * 4; i += 4) {
      newPairs.push({
        teamA: [shuffled[i], shuffled[i + 1]],
        teamB: [shuffled[i + 2], shuffled[i + 3]],
      });
    }

    setPairs(newPairs);
  };

  useEffect(() => {
    if (autoMode) {
      generatePairs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableIds.join(","), numPairs, autoMode]);

  const confirmPairs = () => {
    if (!pairs.length || disabled) return;
    pairs.forEach((p) => onCreate(p.teamA, p.teamB));
    setPairs([]);
  };

  return (
    <div className={card}>
      <ShuttleBg />
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Auto draw</h2>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>Auto-refresh</span>
          <button
            type="button"
            onClick={toggleAutoMode}
            className={`relative inline-flex h-5 w-9 items-center rounded-full border transition-colors ${
              autoMode
                ? "border-indigo-500 bg-indigo-500"
                : "border-slate-300 bg-slate-200"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                autoMode ? "translate-x-4" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>

      <p className="mb-3 text-xs text-slate-500">
        Generate random pairs from currently present players without open
        matches.
      </p>

      <div className="mb-3 flex items-center justify-between text-xs">
        <span className="text-slate-500">
          Available players for draw:{" "}
          <span className="font-semibold text-slate-800">
            {availableIds.length}
          </span>
        </span>
        <div className="flex items-center gap-2">
          <span>Number of matches:</span>
          <input
            type="number"
            min={1}
            max={Math.floor(availableIds.length / 4) || 1}
            value={numPairs}
            onChange={(e) =>
              setNumPairs(Math.max(1, parseInt(e.target.value) || 1))
            }
            className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-xs"
            disabled={!!disabled}
          />
        </div>
      </div>

      <div className="mb-3 flex justify-end gap-2">
        <button
          type="button"
          className={btnSecondary}
          onClick={generatePairs}
          disabled={availableIds.length < 4 || !!disabled}
        >
          Generate
        </button>
        <button
          type="button"
          className={btnPrimary}
          onClick={confirmPairs}
          disabled={!pairs.length || !!disabled}
        >
          Confirm all
        </button>
      </div>

      {pairs.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs">
          <h3 className="mb-2 font-semibold text-sm">Proposed matches</h3>
          <ul className="space-y-2">
            {pairs.map((p, idx) => (
              <li key={idx} className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                  #{idx + 1}
                </span>
                <span>
                  <b>
                    {players.find((x) => x.id === p.teamA[0])?.name || "?"} &{" "}
                    {players.find((x) => x.id === p.teamA[1])?.name || "?"}
                  </b>
                  {" vs. "}
                  <b>
                    {players.find((x) => x.id === p.teamB[0])?.name || "?"} &{" "}
                    {players.find((x) => x.id === p.teamB[1])?.name || "?"}
                  </b>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-slate-400">
          No pending auto matches. Generate or wait for auto mode.
        </p>
      )}
    </div>
  );
}

function MatchCard({
  match,
  players,
  onUpdate,
}: {
  match: Match;
  players: Player[];
  onUpdate: (updated: Match) => void;
}) {
  const getName = (id: string) =>
    players.find((p) => p.id === id)?.name || "Unknown";

  const handleScoreChange = (team: "A" | "B", value: number | null) => {
    const updated: Match = {
      ...match,
      scoreA: team === "A" ? value : match.scoreA,
      scoreB: team === "B" ? value : match.scoreB,
    };

    if (
      updated.scoreA !== null &&
      updated.scoreB !== null &&
      updated.scoreA !== updated.scoreB
    ) {
      updated.winner = updated.scoreA > updated.scoreB ? "A" : "B";
    } else {
      updated.winner = null;
    }

    onUpdate(updated);
  };

  const clearScore = () => {
    onUpdate({
      ...match,
      scoreA: null,
      scoreB: null,
      winner: null,
    });
  };

  const hasScore = match.scoreA !== null || match.scoreB !== null;

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-slate-200 bg-white/80 p-3 text-xs shadow-sm ${
        match.winner ? "ring-1 ring-emerald-100" : ""
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
          Best of 3
        </span>
        {match.winner && (
          <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-700">
            <span>Winner:</span>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5">
              {match.winner === "A" ? "Team A" : "Team B"}
            </span>
          </span>
        )}
      </div>

      <div className="grid grid-cols-[1fr,auto,1fr] items-center gap-2">
        <div className="space-y-1">
          <div className="font-medium text-slate-800">
            {getName(match.teamA[0])}
          </div>
          <div className="font-medium text-slate-800">
            {getName(match.teamA[1])}
          </div>
        </div>

        <div className="flex flex-col items-center justify-center gap-1">
          <input
            type="number"
            min={0}
            max={2}
            value={match.scoreA ?? ""}
            onChange={(e) =>
              handleScoreChange(
                "A",
                e.target.value === "" ? null : Number(e.target.value)
              )
            }
            className="w-10 rounded-lg border border-slate-200 px-1 py-0.5 text-center text-xs"
          />
          <span className="text-[11px] font-semibold text-slate-500">vs.</span>
          <input
            type="number"
            min={0}
            max={2}
            value={match.scoreB ?? ""}
            onChange={(e) =>
              handleScoreChange(
                "B",
                e.target.value === "" ? null : Number(e.target.value)
              )
            }
            className="w-10 rounded-lg border border-slate-200 px-1 py-0.5 text-center text-xs"
          />
        </div>

        <div className="space-y-1 text-right">
          <div className="font-medium text-slate-800">
            {getName(match.teamB[0])}
          </div>
          <div className="font-medium text-slate-800">
            {getName(match.teamB[1])}
          </div>
        </div>
      </div>

      <div className="mt-2 flex justify-between text-[11px] text-slate-500">
        <span>
          Match ID: <span className="font-mono text-[10px]">{match.id}</span>
        </span>
        {hasScore && (
          <button
            type="button"
            className="text-rose-500 hover:text-rose-700"
            onClick={clearScore}
          >
            Clear score
          </button>
        )}
      </div>
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
          🥇 <b>Base points:</b> Win = +3 points, Loss = +1 point. Players need
          at least 5 matches to be fully ranked.
        </p>
        <p>
          ⭐ <b>Bonus points:</b> +1 point for special achievements, like beating
          Melinda or achieving a 10-session streak (Ironman 10x).
        </p>
        <p>
          The table is ordered by: total points, higher Win% comes first, then
          the number of matches played.
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
  lastSessionDate: string | null;
}) {
  const handlePrev = () => {
    const current = parseDate(date);
    current.setDate(current.getDate() - 7);
    setDate(fmt(current));
  };

  const handleNext = () => {
    const current = parseDate(date);
    current.setDate(current.getDate() + 7);
    setDate(fmt(current));
  };

  const todayDateStr = fmt(nextTrainingDate());
  const canGoNext =
    lastSessionDate && parseDate(date) < parseDate(lastSessionDate);

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
      <button
        type="button"
        className={btnSecondary + " px-2 py-1 text-[11px]"}
        onClick={handlePrev}
      >
        ◀ Previous week
      </button>
      <button
        type="button"
        className={btnSecondary + " px-2 py-1 text-[11px]"}
        onClick={handleNext}
        disabled={!canGoNext}
      >
        Next week ▶
      </button>

      <div className="ml-auto flex items-center gap-2">
        <span>Jump to:</span>
        <select
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px]"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        >
          <option value={todayDateStr}>Next training ({todayDateStr})</option>
          {grouped.map((g) => (
            <option key={g.date} value={g.date}>
              {g.date}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

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
  const [activeTab, setActiveTab] = useState<"all" | "women" | "men">("all");

  const womenRows = useMemo(
    () => rows.filter((r) => r.gender === "F"),
    [rows]
  );
  const menRows = useMemo(
    () => rows.filter((r) => r.gender === "M"),
    [rows]
  );

  const currentRows =
    activeTab === "all"
      ? rows
      : activeTab === "women"
      ? womenRows
      : menRows;

  const noDataText =
    activeTab === "all"
      ? "No players recorded yet."
      : activeTab === "women"
      ? "No female players recorded yet."
      : "No male players recorded yet.";

  const tabLabel = (tab: "all" | "women" | "men") => {
    if (tab === "all") return "All";
    if (tab === "women") return "Women";
    return "Men";
  };

  return (
    <div className={card}>
      <ShuttleBg />
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-bold">Current Standings</h2>

        <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1 text-xs">
          {(["all", "women", "men"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`
                px-3 py-1 rounded-full font-medium transition-colors
                ${
                  activeTab === tab
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }
              `}
            >
              {tabLabel(tab)}
            </button>
          ))}
        </div>
      </div>

      {currentRows.length === 0 ? (
        <p className="text-sm text-gray-500">{noDataText}</p>
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
                  Win %
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
              {currentRows.map((r, i) => (
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
                        <span className="ml-1 text-amber-500">⭐</span>)
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
  const { players, matches } = league;

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

  const matchesByDate = useMemo(() => {
    const map = new Map<string, Match[]>();
    matches.forEach((m) => {
      if (!map.has(m.date)) map.set(m.date, []);
      map.get(m.date)!.push(m);
    });
    return Array.from(map.entries())
      .map(([d, ms]) => ({ date: d, matches: ms }))
      .sort((a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime());
  }, [matches]);

  const lastSessionDate =
    matchesByDate.length > 0 ? matchesByDate[0].date : null;

  const { standings, achievementsById } = useMemo(() => {
    const MIN_MATCHES = 5;

    const statsById = new Map<
      string,
      {
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
      statsById.set(p.id, {
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

    matches.forEach((m) => {
      if (!m.winner) return;
      const allPlayers = [...m.teamA, ...m.teamB];

      allPlayers.forEach((pid) => {
        const s = statsById.get(pid);
        if (!s) return;
        s.matches += 1;
      });

      const winners = m.winner === "A" ? m.teamA : m.teamB;
      const losers = m.winner === "A" ? m.teamB : m.teamA;

      winners.forEach((pid) => {
        const s = statsById.get(pid);
        if (!s) return;
        s.wins += 1;
      });
      losers.forEach((pid) => {
        const s = statsById.get(pid);
        if (!s) return;
        s.losses += 1;
      });
    });

    statsById.forEach((s) => {
      const total = s.wins + s.losses;
      s.winRate = total ? Math.round((s.wins / total) * 100) : 0;
      s.basePoints = s.wins * 3 + s.losses * 1;
      s.qualified = s.matches >= MIN_MATCHES;
    });

    const achievementsMap = new Map<string, Achievement[]>();
    players.forEach((p) => {
      const ach = computeAchievementsFull(p.id, matches, players);
      achievementsMap.set(p.id, ach);

      let bonus = 0;
      if (ach.some((a) => a.id === "beatMelinda")) bonus += 1;
      if (ach.some((a) => a.id === "streak10")) bonus += 1;

      const st = statsById.get(p.id);
      if (st) {
        st.bonusPoints = bonus;
        st.totalPoints = st.basePoints + st.bonusPoints;
      }
    });

    const sorted = players
      .map((p) => {
        const s = statsById.get(p.id)!;
        return {
          ...p,
          ...s,
        };
      })
      .sort((a, b) => {
        if (b.totalPoints !== a.totalPoints)
          return b.totalPoints - a.totalPoints;
        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        if (b.matches !== a.matches) return b.matches - a.matches;
        return a.name.localeCompare(b.name, "hu");
      });

    return { standings: sorted, achievementsById: achievementsMap };
  }, [players, matches]);

  const addPlayer = (name: string) => {
    if (!role) return;
    const newPlayer: Player = { id: uid(), name };
    write({ players: [...players, newPlayer] });
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
        return { ...p, name: `${emoji} ${p.name}` };
      }
    });

    write({ players: nextPlayers });
  };

  const updatePlayerGender = (
    id: string,
    gender: "F" | "M" | null
  ) => {
    if (!role) return;

    const nextPlayers = players.map((p) => {
      if (p.id !== id) return p;
      return {
        ...p,
        gender: gender || undefined,
      };
    });

    write({ players: nextPlayers });
  };

  const nameOf = (id: string) =>
    players.find((p) => p.id === id)?.name || "—";

  const createMatch = (teamA: Pair, teamB: Pair) => {
    if (!isAdmin) return;

    const newMatch: Match = {
      id: uid(),
      date,
      teamA,
      teamB,
      scoreA: null,
      scoreB: null,
      winner: null,
      bestOf: 3,
    };

    write({ matches: [...matches, newMatch] });
  };

  const updateMatch = (updated: Match) => {
    if (!isAdmin) return;

    const nextMatches = matches.map((m) =>
      m.id === updated.id ? updated : m
    );
    write({ matches: nextMatches });
  };

  const togglePresent = (id: string) => {
    if (!isAdmin) return;

    setPresentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="min-h-screen bg-slate-50/80">
      <div className="mx-auto max-w-5xl px-3 py-4 sm:px-4 sm:py-6">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3 sm:mb-6">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-indigo-600 text-xl text-white shadow-sm sm:h-9 sm:w-9">
                🏸
              </span>
              <span>Badminton League</span>
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Track matches, scores, and league standings.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="inline-flex rounded-full bg-slate-100 p-1">
              <button
                type="button"
                className={`rounded-full px-3 py-1 font-medium ${
                  role === "player"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500"
                }`}
                onClick={() => setRole("player")}
              >
                Player view
              </button>
              <button
                type="button"
                className={`rounded-full px-3 py-1 font-medium ${
                  role === "admin"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500"
                }`}
                onClick={() => setRole("admin")}
              >
                Admin view
              </button>
            </div>

            {players.length > 0 && (
              <div className="flex items-center gap-1 rounded-full bg-white px-2 py-1 shadow-sm">
                <span className="text-[11px] text-slate-500">Me:</span>
                <select
                  className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px]"
                  value={meId}
                  onChange={(e) => setMeId(e.target.value)}
                >
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-[2fr,1fr]">
          <div className="space-y-4 sm:space-y-5">
            {role === "admin" ? (
              <>
                <div className={card}>
                  <ShuttleBg />
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-lg font-semibold">
                        Session on {date}
                      </h2>
                      <p className="text-xs text-slate-500">
                        Manage attendance, create matches, and record scores.
                      </p>
                    </div>
                    <AdminDateJump
                      grouped={matchesByDate}
                      date={date}
                      setDate={setDateAndResetAttendance}
                      lastSessionDate={lastSessionDate}
                    />
                  </div>

                  <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Attendance
                    </h3>
                    {players.length === 0 ? (
                      <p className="text-xs text-slate-400">
                        No players yet. Add players below.
                      </p>
                    ) : (
                      <div className="grid max-h-48 grid-cols-2 gap-1 overflow-y-auto text-xs sm:grid-cols-3 md:grid-cols-4">
                        {players
                          .slice()
                          .sort((a, b) =>
                            a.name
                              .replace(/^.+?\s/, "")
                              .localeCompare(
                                b.name.replace(/^.+?\s/, ""),
                                "hu"
                              )
                          )
                          .map((p) => {
                            const present = presentIds.includes(p.id);
                            return (
                              <button
                                key={p.id}
                                type="button"
                                className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-left transition-colors ${
                                  present
                                    ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                                    : "border-slate-200 bg-white text-slate-700"
                                }`}
                                onClick={() => togglePresent(p.id)}
                              >
                                <span>{getEmoji(p.name)}</span>
                                <span className="truncate text-[11px]">
                                  {getBaseName(p.name)}
                                </span>
                              </button>
                            );
                          })}
                      </div>
                    )}
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <SelectPairs
                      players={players}
                      freeIds={presentIds}
                      seenTeammates={seenTeammatesToday}
                      onCreate={createMatch}
                    />
                    <RandomPairs
                      players={players}
                      date={date}
                      matches={matches}
                      presentIds={presentIds}
                      onCreate={createMatch}
                    />
                  </div>

                  <div className="mt-4">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Matches for {date}
                    </h3>
                    {matchesForDate.length === 0 ? (
                      <p className="text-xs text-slate-400">
                        No matches yet. Create them above.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {matchesForDate.map((m) => (
                          <MatchCard
                            key={m.id}
                            match={m}
                            players={players}
                            onUpdate={updateMatch}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <PlayerEditor
                  players={players}
                  onAdd={addPlayer}
                  onRemove={removePlayer}
                  onUpdateEmoji={updatePlayerEmoji}
                  onUpdateGender={updatePlayerGender}
                />
              </>
            ) : (
              <>
                <div className={card}>
                  <ShuttleBg />
                  <h2 className="mb-2 text-lg font-semibold">
                    My matches and sessions
                  </h2>
                  {players.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No players yet. Ask the admin to add you.
                    </p>
                  ) : (
                    <div className="space-y-3 text-sm">
                      {matchesByDate.length === 0 ? (
                        <p className="text-sm text-slate-500">
                          No matches recorded yet.
                        </p>
                      ) : (
                        matchesByDate.map(({ date, matches }) => {
                          const myMatches = matches.filter((m) =>
                            [...m.teamA, ...m.teamB].includes(meId)
                          );
                          if (!myMatches.length) return null;

                          return (
                            <div
                              key={date}
                              className="rounded-xl bg-slate-50/80 p-3"
                            >
                              <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                                <span className="font-semibold text-slate-700">
                                  {date}
                                </span>
                                <span>
                                  Matches:{" "}
                                  <span className="font-medium">
                                    {myMatches.length}
                                  </span>
                                </span>
                              </div>
                              <div className="space-y-2">
                                {myMatches.map((m) => (
                                  <div
                                    key={m.id}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white/80 px-2 py-1.5 text-xs"
                                  >
                                    <div>
                                      <div>
                                        <b>
                                          {nameOf(m.teamA[0])} &{" "}
                                          {nameOf(m.teamA[1])}
                                        </b>{" "}
                                        vs{" "}
                                        <b>
                                          {nameOf(m.teamB[0])} &{" "}
                                          {nameOf(m.teamB[1])}
                                        </b>
                                      </div>
                                      <div className="mt-0.5 text-[11px] text-slate-500">
                                        Match ID:{" "}
                                        <span className="font-mono">
                                          {m.id}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      {m.scoreA !== null &&
                                      m.scoreB !== null ? (
                                        <>
                                          <div className="font-semibold text-slate-800">
                                            {m.scoreA} : {m.scoreB}
                                          </div>
                                          {m.winner && (
                                            <div className="text-[11px] text-emerald-600">
                                              Winner:{" "}
                                              {m.winner === "A"
                                                ? "Team A"
                                                : "Team B"}
                                            </div>
                                          )}
                                        </>
                                      ) : (
                                        <div className="text-[11px] text-slate-400">
                                          Awaiting score
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="space-y-4 sm:space-y-5">
            <section className="space-y-4">
              <div className={card}>
                <ShuttleBg />
                <h2 className="mb-2 text-lg font-semibold">
                  League overview
                </h2>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
                      👥
                    </span>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">
                        Players
                      </div>
                      <div className="text-sm font-semibold text-slate-900">
                        {players.length}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                      🎮
                    </span>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">
                        Matches
                      </div>
                      <div className="text-sm font-semibold text-slate-900">
                        {matches.length}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                      ⭐
                    </span>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">
                        Achievements
                      </div>
                      <div className="text-sm font-semibold text-slate-900">
                        {
                          new Set(
                            Array.from(achievementsById.values())
                              .flat()
                              .map((a) => a.id)
                          ).size
                        }
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 rounded-xl bg-indigo-50/80 p-3 text-xs text-indigo-900">
                  <div className="mb-1 font-semibold text-[11px] uppercase tracking-wide">
                    Tip
                  </div>
                  <p>
                    As an admin, use <b>Auto draw</b> to create quick matches
                    from present players, and <b>Manual draw</b> when you want
                    specific pairs.
                  </p>
                </div>
              </div>

              <section className="grid gap-4 sm:gap-6 md:grid-cols-[2fr,1fr] mt-4 sm:mt-6">
                <Standings
                  rows={standings}
                  achievementsById={achievementsById}
                />
                <StandingsInfo />
              </section>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
