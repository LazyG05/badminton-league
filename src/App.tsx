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
 *  BIA-TOLLAS – Biatorbágy
 *  - Player/Admin toggle, adminhoz jelszó: "biatollas"
 *  - Emoji választás új játékoshoz (40 emoji) + utólagos módosítás
 *  - Dátum-navigáció a Player nézetben + "Last session" badge
 *  - Edzésnapok: hétfő & szerda; default dátum = legközelebbi ilyen nap
 *  - Firestore realtime sync (single league doc: "leagues/default")
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
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Edzésnapok: hétfő (1), szerda (3) – JS Date.getDay()
const TRAINING_DAYS = [1, 3];

function nextTrainingDate(from: Date = new Date()): Date {
  const d = new Date(from);
  while (!TRAINING_DAYS.includes(d.getDay())) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

// Build pairs avoiding previous TEAMMATE combos (for the given date) as much as possible
function makePairsForRound(ids: string[], seenTeammates: Set<string>): Pair[] {
  const list = shuffle(ids);
  function backtrack(rem: string[], cur: Pair[]): Pair[] {
    if (rem.length < 2) return cur;
    const [first, ...rest] = rem;
    let best = cur;
    const bestPossible = cur.length + Math.floor(rem.length / 2);
    for (let i = 0; i < rest.length; i++) {
      const cand = rest[i];
      if (seenTeammates.has(key(first, cand))) continue;
      const next = backtrack(
        rest.filter((_, idx) => idx !== i),
        [...cur, [first, cand]] as Pair[]
      );
      if (next.length > best.length) {
        best = next;
        if (best.length === bestPossible) return best;
      }
    }
    const skip = backtrack(rest, cur);
    if (skip.length > best.length) best = skip;
    return best;
  }
  return backtrack(list, []);
}

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
      setData((prev) => ({ ...prev, ...patch }));
      if (suppress.current) return;
      if (tRef.current) window.clearTimeout(tRef.current);
      tRef.current = window.setTimeout(async () => {
        const ref = doc(db, "leagues", "default");
        const current = data;
        const payload = {
          ...current,
          ...patch,
          updatedAt: serverTimestamp(),
        } as LeagueDoc;
        try {
          await setDoc(ref, payload, { merge: true });
        } catch {}
      }, 120);
    },
    [data]
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

  // ha változik a players tömb (pl. új játékos), frissítsük a selectet
  useEffect(() => {
    if (!players.length) {
      setSelectedPlayerId(null);
    } else if (!selectedPlayerId || !players.some(p => p.id === selectedPlayerId)) {
      setSelectedPlayerId(players[0].id);
    }
  }, [players, selectedPlayerId]);

  const getBaseName = (full: string) =>
    full.replace(/^.+?\s/, ""); // emoji + space levágása

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

      {/* Meglévő játékosok kezelése – dropdown */}
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
              {players.map((p) => (
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


function DnDPairs({
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
  const [pool, setPool] = useState<string[]>(freeIds);
  const [teamA, setTeamA] = useState<string[]>([]);
  const [teamB, setTeamB] = useState<string[]>([]);
  useEffect(() => {
    setPool(freeIds);
    setTeamA([]);
    setTeamB([]);
  }, [freeIds.join(",")]);

  const onDragStart = (pid: string) => (e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", pid);
  };
  const allow = (e: React.DragEvent) => e.preventDefault();
  const drop = (where: "POOL" | "A" | "B") => (e: React.DragEvent) => {
    e.preventDefault();
    const pid = e.dataTransfer.getData("text/plain");
    if (!pid) return;
    setTeamA((t) => t.filter((x) => x !== pid));
    setTeamB((t) => t.filter((x) => x !== pid));
    setPool((t) => t.filter((x) => x !== pid));
    if (where === "A") setTeamA((t) => (t.length < 2 ? [...t, pid] : t));
    else if (where === "B") setTeamB((t) => (t.length < 2 ? [...t, pid] : t));
    else setPool((t) => [...t, pid]);
  };

  const warnA = teamA.length === 2 && seenTeammates.has(key(teamA[0], teamA[1]));
  const warnB = teamB.length === 2 && seenTeammates.has(key(teamB[0], teamB[1]));
  const canCreate = teamA.length === 2 && teamB.length === 2 && !disabled;

  return (
    <div className={card}>
      <ShuttleBg />
      <h3 className="mb-2 font-semibold">
        Pairing (Drag & Drop) – players available: {pool.length} (players can
        appear in multiple matches today)
      </h3>
      <div className="grid gap-3 md:grid-cols-3">
        <div
          className="rounded-xl border border-slate-200 p-3"
          onDrop={drop("POOL")}
          onDragOver={allow}
        >
          <div className="mb-2 text-sm font-medium text-gray-600">
            Available
          </div>
          <div className="flex flex-wrap gap-2">
            {pool.map((pid) => (
              <span
                key={pid}
                draggable={!disabled}
                onDragStart={onDragStart(pid)}
                className="cursor-move select-none rounded-lg bg-[#e0f2fe] px-3 py-1 text-sm"
              >
                {players.find((p) => p.id === pid)?.name}
              </span>
            ))}
          </div>
        </div>
        <div
          className={`rounded-xl border p-3 ${
            warnA ? "border-amber-400" : "border-slate-200"
          }`}
          onDrop={drop("A")}
          onDragOver={allow}
        >
          <div className="mb-2 text-sm font-medium">
            Team A{" "}
            {warnA && (
              <span className="ml-2 text-amber-600 text-xs">
                (pair already used today)
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2 min-h-[2.25rem]">
            {teamA.map((pid) => (
              <span
                key={pid}
                draggable={!disabled}
                onDragStart={onDragStart(pid)}
                className="cursor-move select-none rounded-lg bg-[#fee2e2] px-3 py-1 text-sm"
              >
                {players.find((p) => p.id === pid)?.name}
              </span>
            ))}
          </div>
        </div>
        <div
          className={`rounded-xl border p-3 ${
            warnB ? "border-amber-400" : "border-slate-200"
          }`}
          onDrop={drop("B")}
          onDragOver={allow}
        >
          <div className="mb-2 text-sm font-medium">
            Team B{" "}
            {warnB && (
              <span className="ml-2 text-amber-600 text-xs">
                (pair already used today)
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2 min-h-[2.25rem]">
            {teamB.map((pid) => (
              <span
                key={pid}
                draggable={!disabled}
                onDragStart={onDragStart(pid)}
                className="cursor-move select-none rounded-lg bg-[#dcfce7] px-3 py-1 text-sm"
              >
                {players.find((p) => p.id === pid)?.name}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className={btnPrimary}
          disabled={!canCreate}
          onClick={() => {
            onCreate([teamA[0], teamA[1]], [teamB[0], teamB[1]]);
            setTeamA([]);
            setTeamB([]);
          }}
        >
          Add match
        </button>
        <button
          className={btnSecondary}
          onClick={() => {
            setPool(freeIds);
            setTeamA([]);
            setTeamB([]);
          }}
          disabled={!!disabled}
        >
          Reset
        </button>
        <span className="text-xs text-gray-500">
          Tip: 8 players → 2 matches, 12 → 3, etc. Add multiple matches in the
          same date.
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
                    <div className="text-indigo-600 text-xs font-semibold mt-1">
                      Winner 🏆
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
                    <div className="text-indigo-600 text-xs font-semibold mt-1">
                      Winner 🏆
                    </div>
                  )}
                </div>
              </div>

              {/* Alsó sor – műveletek */}
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <button
                  className={btnSecondary}
                  onClick={() => onPick(m.id, "A")}
                >
                  Set winner: Team A
                </button>
                <button
                  className={btnSecondary}
                  onClick={() => onPick(m.id, "B")}
                >
                  Set winner: Team B
                </button>
                <button className={btnSecondary} onClick={() => onClear(m.id)}>
                  Clear winner
                </button>
                <button className={btnDanger} onClick={() => onDelete(m.id)}>
                  Delete match
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
  // alapból a legutolsó dátum legyen nyitva
  const [openDate, setOpenDate] = useState<string | null>(() =>
    grouped.length ? grouped[grouped.length - 1].date : null
  );

  useEffect(() => {
    if (grouped.length === 0) {
      setOpenDate(null);
      return;
    }
    // ha új dátumok kerülnek be, és eddig nem volt open, nyissuk a legutolsót
    setOpenDate((prev) => {
      if (prev && grouped.some((g) => g.date === prev)) return prev;
      return grouped[grouped.length - 1].date;
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
                  onClick={() =>
                    setOpenDate(isOpen ? null : g.date)
                  }
                  className="flex w-full items-center justify-between px-3 py-2 text-sm"
                >
                  <span className="flex flex-col items-start">
                    <span className="font-medium">{g.date}</span>
                    <span className="text-xs text-gray-500">
                      {weekday(g.date)}
                    </span>
                  </span>
                  <span className="text-xs text-gray-500">
                    {g.matches.length} match
                    <span className="ml-2 inline-block">
                      {isOpen ? "▲" : "▼"}
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
                                  ? "bg-indigo-50 border-indigo-300"
                                  : "border-slate-200 bg-white"
                              }`}
                            >
                              <div className="font-medium">
                                {nameOf(m.teamA[0])} & {nameOf(m.teamA[1])}
                              </div>
                              {m.winner === "A" && (
                                <div className="text-indigo-600 text-xs font-semibold mt-1">
                                  Winner 🏆
                                </div>
                              )}
                            </div>

                            {/* Team B */}
                            <div
                              className={`p-2 rounded-lg border ${
                                m.winner === "B"
                                  ? "bg-indigo-50 border-indigo-300"
                                  : "border-slate-200 bg-white"
                              }`}
                            >
                              <div className="font-medium">
                                {nameOf(m.teamB[0])} & {nameOf(m.teamB[1])}
                              </div>
                              {m.winner === "B" && (
                                <div className="text-indigo-600 text-xs font-semibold mt-1">
                                  Winner 🏆
                                </div>
                              )}
                            </div>
                          </div>

                          {!m.winner && (
                            <div className="mt-2 text-xs text-gray-500">
                              Result pending
                            </div>
                          )}
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



function Standings({
  rows,
}: {
  rows: {
    id: string;
    name: string;
    wins: number;
    losses: number;
    points: number;
  }[];
}) {
  return (
    <div className={card}>
      <ShuttleBg />
      <h2 className="mb-2 text-lg font-semibold">Individual standings</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">No players yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-2 pr-2">#</th>
                <th className="py-2 pr-2">Player</th>
                <th className="py-2 pr-2">Wins</th>
                <th className="py-2 pr-2">Losses</th>
                <th className="py-2 pr-2">Points</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr
                  key={row.id}
                  className={idx % 2 === 0 ? "border-t bg-slate-50/60" : "border-t"}
                >
                  <td className="py-2 pr-2 align-middle">{idx + 1}</td>
                  <td className="py-2 pr-2 align-middle font-medium">
                    {row.name}
                  </td>
                  <td className="py-2 pr-2 align-middle">{row.wins}</td>
                  <td className="py-2 pr-2 align-middle">{row.losses}</td>
                  <td className="py-2 pr-2 align-middle font-semibold">
                    {row.points}
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
                className={`
                  flex w-full items-center justify-between
                  rounded-lg px-2 py-1 text-left
                  bg-white text-slate-700
                  border border-slate-200
                  transition
                  ${
                    date === g.date
                      ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                      : "hover:bg-slate-100"
                  }
                `}
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
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2 text-xs text-gray-400">
        Pick a date to edit or add matches (including past sessions).
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
  onCreate: () => void;
  onRestore: (id: string) => void;
}) {
  const sorted = [...backups].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );

  return (
    <div className={card}>
      <ShuttleBg />
      <h3 className="mb-2 font-semibold">Backups</h3>
      <button className={btnSecondary} onClick={onCreate}>
        Create backup now
      </button>
      {sorted.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">No backups yet.</p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {sorted.map((b) => (
            <li
              key={b.id}
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-2 py-1"
            >
              <div className="mr-2 min-w-0">
                <div className="truncate font-medium">
                  {new Date(b.createdAt).toLocaleString()}
                </div>
                <div className="truncate text-xs text-gray-500">
                  {b.note}
                </div>
              </div>
              <button
                className={btnSecondary}
                onClick={() => onRestore(b.id)}
              >
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-gray-400">
        Tip: Create a backup before deleting players or changing many results.
      </p>
    </div>
  );
}

// ========================= App =========================
export default function App() {
  const [league, write] = useLeague();

  // Role
  const [role, setRole] = useState<"player" | "admin">(
    () => (localStorage.getItem("bia_role") as any) || "player"
  );
  const isAdmin = role === "admin";
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

  // Date (round) – legközelebbi hétfő / szerda
  const [date, setDate] = useState(() => fmt(nextTrainingDate()));

  // Derive
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

  // Standings (aggregate all dates)
  const standings = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; wins: number; losses: number; points: number }
    >();

    players.forEach((p) =>
      map.set(p.id, {
        id: p.id,
        name: p.name,
        wins: 0,
        losses: 0,
        points: 0,
      })
    );

    league.matches.forEach((m) => {
      if (!m.winner) return;
      const win = m.winner === "A" ? m.teamA : m.teamB;
      const lose = m.winner === "A" ? m.teamB : m.teamA;

      win.forEach((id) => {
        const r = map.get(id);
        if (!r) return;
        r.wins++;
        r.points++;
      });

      lose.forEach((id) => {
        const r = map.get(id);
        if (!r) return;
        r.losses++;
      });
    });

    return Array.from(map.values()).sort(
      (a, b) => b.points - a.points || a.name.localeCompare(b.name)
    );
  }, [league.matches, players]);

  // Grouped results for Player view + last session date
  const grouped = useMemo(() => {
    const by: Record<string, Match[]> = {};
    league.matches.forEach((m) => {
      (by[m.date] ||= []).push(m);
    });
    return Object.entries(by)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([d, arr]) => ({ date: d, matches: arr }));
  }, [league.matches]);

  const lastSessionDate = grouped.length
    ? grouped[grouped.length - 1].date
    : null;

  // Actions
  const addPlayer = (fullName: string) => {
    const t = fullName.trim();
    if (!t) return;

    // base név: az emoji utáni rész
    const base = t.replace(/^.+?\s/, "");

    // duplikátum ellenőrzés: emoji-t figyelmen kívül hagyjuk
    if (
      players.some(
        (p) =>
          p.name.replace(/^.+?\s/, "").toLowerCase() === base.toLowerCase()
      )
    )
      return;

    write({ players: [...players, { id: uid(), name: t }] });
  };

  const removePlayer = (id: string) => {
    const nextPlayers = players.filter((p) => p.id !== id);
    const nextMatches = league.matches.filter(
      (m) => ![...m.teamA, ...m.teamB].includes(id)
    );

    write({ players: nextPlayers, matches: nextMatches });
  };

  const updatePlayerEmoji = (id: string, emoji: string) => {
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
  write({
    matches: league.matches.filter((m) => m.id !== id),
  });
};

  const clearWinner = (id: string) => {
    if (!isAdmin) return;
    write({
      matches: league.matches.map((m) =>
        m.id === id ? { ...m, winner: undefined } : m
      ),
    });
  };

  const autoDraw = () => {
    if (freeIds.length < 4) {
      alert("Not enough free players today.");
      return;
    }
    const pairs = makePairsForRound(freeIds, seenTeammatesToday);
    if (pairs.length < 2) {
      alert("Could not form a match.");
      return;
    }
    const ms: Match[] = [];
    for (let i = 0; i + 1 < pairs.length; i += 2) {
      ms.push({ id: uid(), date, teamA: pairs[i], teamB: pairs[i + 1] });
    }
    write({ matches: [...league.matches, ...ms] });
  };

  const createBackup = () => {
    const snapshot: Backup = {
      id: uid(),
      createdAt: new Date().toISOString(),
      note: `Backup ${new Date().toLocaleString()}`,
      data: { players, matches: league.matches },
    };
    const next = [...backups, snapshot].slice(-10); // keep last 10 backups
    write({ backups: next });
  };

  const restoreBackup = (id: string) => {
    const b = backups.find((b) => b.id === id);
    if (!b) return;
    if (
      !confirm(
        "Restore this backup? This will overwrite current players and matches."
      )
    )
      return;
    write({ players: b.data.players, matches: b.data.matches });
  };

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
  <DatePicker value={date} onChange={setDate} />

  <div className="flex flex-wrap gap-2 text-xs text-gray-600">
    <button
      type="button"
      className={`${btnSecondary} px-3 py-1`}
      onClick={() => setDate(fmt(new Date()))}
    >
      Today
    </button>
    <button
      type="button"
      className={`${btnSecondary} px-3 py-1`}
      onClick={() => setDate(fmt(nextTrainingDate()))}
    >
      Next training
    </button>
    {lastSessionDate && (
      <button
        type="button"
        className={`${btnSecondary} px-3 py-1`}
        onClick={() => setDate(lastSessionDate)}
      >
        Last session
      </button>
    )}
  </div>
</div>


        {role === "admin" ? (
          <section className="grid gap-4 sm:gap-6 md:grid-cols-3">
            <div className="space-y-4 md:col-span-2">
              <div className={card}>
                <ShuttleBg />
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="text-lg font-semibold">Admin tools</h2>
                  <div className="flex gap-2">
                    <button
                      className={btnSecondary}
                      onClick={autoDraw}
                      disabled={freeIds.length < 4}
                    >
                      Auto draw pairs
                    </button>
                  </div>
                </div>
                <p className="text-sm text-gray-600">
                  Players in league: <b>{players.length}</b>
                </p>
              </div>

              {/* Drag&Drop pairing to add multiple matches for the selected date */}
              <DnDPairs
                players={players}
                freeIds={freeIds}
                seenTeammates={seenTeammatesToday}
                onCreate={addMatch}
              />

              {/* Matches list (edit results) */}
             <MatchesAdmin
  matches={matchesForDate}
  nameOf={nameOf}
  onPick={pickWinner}
  onClear={clearWinner}
  onDelete={deleteMatch}
/>
            </div>

            <div className="space-y-4">

              {/* Admin dátum-navigáció */}
      <AdminDateJump
        grouped={grouped}
        date={date}
        setDate={setDate}
        lastSessionDate={lastSessionDate}
      />
              <Standings rows={standings} />
              <PlayerEditor
                players={players}
                onAdd={addPlayer}
                onRemove={removePlayer}
                onUpdateEmoji={updatePlayerEmoji}
              />
              <BackupPanel
                backups={backups}
                onCreate={createBackup}
                onRestore={restoreBackup}
              />
            </div>
          </section>
        ) : (
          <section className="grid gap-4 sm:gap-6 md:grid-cols-3">
            <div className="space-y-4 md:col-span-2">
              <MatchesPlayer
                grouped={grouped}
                nameOf={nameOf}
              />
            </div>
            <div className="space-y-4">
              {/* Dátum-navigáció kártya */}
              <div className={card}>
                <ShuttleBg />
                <h3 className="mb-2 font-semibold">Jump to date</h3>
                {grouped.length === 0 ? (
                  <p className="text-sm text-gray-500">No matches yet.</p>
                ) : (
                  <ul className="text-sm space-y-1 max-h-52 overflow-y-auto">
                    {grouped.map((g) => (
                      <li key={g.date}>
                        <a
                          href={`#date-${g.date}`}
                          className="flex items-center justify-between hover:text-[#4f8ef7]"
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

              <Standings rows={standings} />

              <div className={card}>
                <ShuttleBg />
                <h3 className="mb-2 font-semibold">How it works</h3>
                <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
                  <li>
                    Admin creates pairings at the end of each session date.
                  </li>
                  <li>
                    Winners are recorded per match; standings are individual.
                  </li>
                  <li>New players can be added anytime (admin).</li>
                </ul>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
