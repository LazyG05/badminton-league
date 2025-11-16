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
 *  BIA-TOLLAS – Pastel Court Edition
 *  - Player/Admin toggle, adminhoz jelszó: "biatollas"
 *  - Emoji választás új játékoshoz (40 emoji)
 *  - Admin oldalon játékos emoji később is módosítható
 *  - Pastell, családbarát tollaslabda dizájn
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
  "🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯",
  "🦁","🐮","🐷","🐸","🐵","🐔","🐧","🐦","🐤","🦆",
  "🦅","🦉","🐺","🦄","🐝","🐛","🦋","🐌","🐞","🐢",
  "🐍","🦎","🐙","🦑","🦀","🐡","🐠","🐳","🐬","🐊",
];

// ========================= UI tokens (Pastel Court) =========================
const btnBase =
  "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed";

// pasztell türkiz fő gomb
const btnPrimary = `${btnBase} bg-[#a6e3e9] text-slate-900 hover:bg-[#94d8df] focus-visible:ring-[#a6e3e9]`;

// könnyű kontúros gomb
const btnSecondary = `${btnBase} border border-[#e7f0ff] bg-white text-slate-800 hover:bg-[#f5faff] focus-visible:ring-[#a6e3e9]`;

// veszély gomb: kicsit lágyított piros
const btnDanger = `${btnBase} bg-rose-500 text-white hover:bg-rose-600 focus-visible:ring-rose-400`;

// kártyák: puha, nagy lekerekítés, halvány keret
const card =
  "relative overflow-hidden rounded-3xl bg-white/90 p-4 shadow-sm border border-[#e7f0ff]";

// input: halvány szegély, türkiz fókusz
const input =
  "w-full rounded-xl border border-[#e7f0ff] bg-white px-3 py-2 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#a6e3e9]";

// Shuttlecock watermark – pasztell lila
const ShuttleBg = () => (
  <svg
    className="pointer-events-none absolute right-2 top-2 h-20 w-20 opacity-20 text-violet-300"
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M12 34c9-7 22-8 32-2l6 4-6 10-6-4C28 37 21 30 18 22"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle
      cx="46"
      cy="46"
      r="6"
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
      <h1 className="text-xl font-bold sm:text-2xl">
        🏸 {title || "Bia-Tollas League"}
      </h1>
      <div className="flex gap-2">
        <div className="rounded-full border border-[#e7f0ff] bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={setPlayer}
            className={`${btnBase} ${
              !isAdmin
                ? "bg-[#a6e3e9] text-slate-900"
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
                ? "bg-[#a6e3e9] text-slate-900"
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
  const [editingId, setEditingId] = useState<string | null>(null);

  const getBaseName = (full: string) =>
    full.replace(/^.+?\s/, ""); // eldobja az első "szót" (emoji) és a space-t

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

  return (
    <div className={card}>
      <ShuttleBg />
      <h2 className="mb-2 text-lg font-semibold">Players ({players.length})</h2>

      {/* Emoji választó új játékos felvételéhez */}
      <div className="mb-3">
        <div className="mb-1 text-xs text-gray-500">Choose emoji</div>
        <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              className={`rounded-lg border px-2 py-1 text-sm ${
                selectedEmoji === e
                  ? "bg-[#fbcfe8] border-[#f9a8d4]"
                  : "bg-white border-[#e7f0ff]"
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

      {players.length > 0 && (
        <ul className="mt-3 divide-y text-sm">
          {players.map((p) => {
            const emoji = getEmoji(p.name);
            const baseName = getBaseName(p.name);
            const isEditing = editingId === p.id;

            return (
              <li key={p.id} className="py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-[#e7f0ff] bg-white px-2 py-1 text-sm"
                      onClick={() =>
                        setEditingId(isEditing ? null : p.id)
                      }
                      disabled={!!disabled}
                    >
                      {emoji}
                    </button>
                    <span className="truncate">{baseName}</span>
                  </div>
                  <button
                    className={btnDanger}
                    onClick={() => onRemove(p.id)}
                    disabled={!!disabled}
                  >
                    remove
                  </button>
                </div>

                {/* Emoji csere panel adott játékoshoz */}
                {isEditing && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {EMOJIS.map((e) => (
                      <button
                        key={e}
                        type="button"
                        className={`rounded-lg border px-2 py-1 text-xs ${
                          e === emoji
                            ? "bg-[#fbcfe8] border-[#f9a8d4]"
                            : "bg-white border-[#e7f0ff]"
                        }`}
                        onClick={() => {
                          onUpdateEmoji(p.id, e);
                          setEditingId(null);
                        }}
                        disabled={!!disabled}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
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
          className="rounded-xl border border-[#e7f0ff] p-3"
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
            warnA ? "border-amber-400" : "border-[#e7f0ff]"
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
                className="cursor-move select-none rounded-lg bg-[#fbcfe8] px-3 py-1 text-sm"
              >
                {players.find((p) => p.id === pid)?.name}
              </span>
            ))}
          </div>
        </div>
        <div
          className={`rounded-xl border p-3 ${
            warnB ? "border-amber-400" : "border-[#e7f0ff]"
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
                className="cursor-move select-none rounded-lg bg-[#d8b4fe] px-3 py-1 text-sm"
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
}: {
  matches: Match[];
  nameOf: (id: string) => string;
  onPick: (id: string, w: "A" | "B") => void;
  onClear: (id: string) => void;
}) {
  return (
    <div className={card}>
      <ShuttleBg />
      <h3 className="mb-2 font-semibold">Matches</h3>
      {matches.length === 0 ? (
        <p className="text-sm text-gray-500">No matches for this date yet.</p>
      ) : (
        <ul className="space-y-3">
          {matches.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between rounded-xl border border-[#e7f0ff] bg-white p-3"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate font-medium">
                  {nameOf(m.teamA[0])} & {nameOf(m.teamA[1])}{" "}
                  {m.winner === "A" && "🏆"}
                </span>
                <span className="shrink-0 text-gray-400">vs</span>
                <span className="truncate font-medium">
                  {nameOf(m.teamB[0])} & {nameOf(m.teamB[1])}{" "}
                  {m.winner === "B" && "🏆"}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <button
                  className={btnSecondary}
                  onClick={() => onPick(m.id, "A")}
                >
                  Team A
                </button>
                <button
                  className={btnSecondary}
                  onClick={() => onPick(m.id, "B")}
                >
                  Team B
                </button>
                <button
                  className={btnSecondary}
                  onClick={() => onClear(m.id)}
                >
                  clear
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
  return (
    <div className={card}>
      <ShuttleBg />
      <h3 className="mb-2 font-semibold">Results by date</h3>
      {grouped.length === 0 ? (
        <p className="text-sm text-gray-500">No matches yet.</p>
      ) : (
        <div className="space-y-4">
          {grouped.map((g) => (
            <div key={g.date}>
              <div className="mb-1 text-sm text-gray-600">
                {g.date} / {weekday(g.date)}
              </div>
              <ul className="divide-y">
                {g.matches.map((m) => (
                  <li key={m.id} className="py-2 text-sm">
                    <b>{nameOf(m.teamA[0])}</b> & <b>{nameOf(m.teamA[1])}</b>
                    <span className="mx-1 text-gray-400">vs</span>
                    <b>{nameOf(m.teamB[0])}</b> & <b>{nameOf(m.teamB[1])}</b>
                    {m.winner ? (
                      <span className="ml-2">
                        – Winner:{" "}
                        <b>
                          {m.winner === "A"
                            ? `${nameOf(m.teamA[0])} & ${nameOf(
                                m.teamA[1]
                              )}`
                            : `${nameOf(m.teamB[0])} & ${nameOf(
                                m.teamB[1]
                              )}`}
                        </b>{" "}
                        🏆
                      </span>
                    ) : (
                      <span className="ml-2 text-gray-500">– no result</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
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
                  className={idx % 2 === 0 ? "border-t bg-[#f9fbff]" : "border-t"}
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
              className="flex items-center justify-between rounded-xl border border-[#e7f0ff] bg-white px-2 py-1"
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

  // Date (round)
  const [date, setDate] = useState(() => fmt(new Date()));

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

  // Grouped results for Player view
  const grouped = useMemo(() => {
    const by: Record<string, Match[]> = {};
    league.matches.forEach((m) => {
      (by[m.date] ||= []).push(m);
    });
    return Object.entries(by)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([d, arr]) => ({ date: d, matches: arr }));
  }, [league.matches]);

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
  <div className="relative min-h-screen bg-[#e5edff] text-slate-900 overflow-hidden">
    <BiatorbagyViaductBg />

    <div className="relative z-10 mx-auto max-w-5xl p-4 sm:p-6">
      <Header
        title={league.title || "Bia-Tollas"}
        role={role}
        setPlayer={setPlayer}
        setAdmin={setAdmin}
      />

        {/* Date selector */}
        <DatePicker value={date} onChange={setDate} />

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
              />
            </div>

            <div className="space-y-4">
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
              <MatchesPlayer grouped={grouped} nameOf={nameOf} />
            </div>
            <div className="space-y-4">
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
