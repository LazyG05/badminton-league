import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  onSnapshot,
  setDoc,
  serverTimestamp,
  enableIndexedDbPersistence,
  collection,
} from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";

/**
 * =============================================================
 *  BIA-TOLLAS – v8 (English UI, no password; Player/Admin toggle)
 *  - Home: league picker with tiles + "+" new league tile
 *  - Tiles have a faint shuttlecock background
 *  - Doubles only, individual standings (win=1, loss=0)
 *  - Admin: Drag & Drop multi-match pairing per round + optional auto draw (from free players)
 *  - Firestore realtime sync, anonymous auth
 * =============================================================
 */

// ========================= Types =========================
export type Player = { id: string; name: string; wins: number; losses: number };
export type Pair = [string, string];
export type Match = { id: string; teamA: Pair; teamB: Pair; winner?: "A" | "B"; round: number };
export type LeagueState = {
  started: boolean;
  players: Player[];
  matches: Match[];
  currentRound: number;
  title?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
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
const key = (a: string, b: string) => [a, b].sort().join("::");
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
}

// Make pairs for a round while avoiding previous TEAMMATE pairs whenever possible
function makePairsForRound(playerIds: string[], seenTeammates: Set<string>): Pair[] {
  const ids = shuffle(playerIds);
  function backtrack(rem: string[], cur: Pair[]): Pair[] {
    if (rem.length < 2) return cur;
    const [first, ...rest] = rem;
    let best = cur;
    const bestPossible = cur.length + Math.floor(rem.length / 2);
    for (let i = 0; i < rest.length; i++) {
      const cand = rest[i];
      const k = key(first, cand);
      if (seenTeammates.has(k)) continue;
      const nextRem = rest.filter((_, idx) => idx !== i);
      const next = backtrack(nextRem, [...cur, [first, cand]] as Pair[]);
      if (next.length > best.length) {
        best = next;
        if (best.length === bestPossible) return best;
      }
    }
    const skip = backtrack(rest, cur);
    if (skip.length > best.length) best = skip;
    return best;
  }
  return backtrack(ids, []);
}

// ========================= UI tokens =========================
const btnBase =
  "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed";
const btnPrimary = `${btnBase} bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:ring-indigo-600`;
const btnSecondary = `${btnBase} border border-gray-300 bg-white text-gray-900 hover:bg-gray-50 focus-visible:ring-gray-400`;
const btnDanger = `${btnBase} bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-600`;
const card = "relative overflow-hidden rounded-2xl bg-white p-4 shadow";
const input =
  "w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500";

// faint shuttlecock background SVG
const ShuttleBg = () => (
  <svg
    className="pointer-events-none absolute right-2 top-2 h-20 w-20 opacity-10"
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M10 34c10-8 24-8 34 0l6 6-8 8-6-6c-8-10-8-24 0-34" stroke="currentColor" strokeWidth="2" />
    <circle cx="46" cy="46" r="6" stroke="currentColor" strokeWidth="2" />
  </svg>
);

// ========================= Hooks =========================
function getLeagueIdFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get("leagueId");
}
function useLeagueId() {
  const [leagueId, setLeagueId] = useState<string | null>(() => getLeagueIdFromURL());
  useEffect(() => {
    const onPop = () => setLeagueId(getLeagueIdFromURL());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const navigate = (id: string | null) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("leagueId", id);
    else url.searchParams.delete("leagueId");
    window.history.pushState({}, "", url.toString());
    setLeagueId(id);
  };
  return { leagueId, navigate } as const;
}

function useLeagueSync(leagueId: string) {
  const [state, setState] = useState<LeagueState>({ started: false, players: [], matches: [], currentRound: 0 });
  const suppressWriteRef = useRef(false);
  const writeTimeout = useRef<number | null>(null);
  useEffect(() => {
    const dref = doc(db, "leagues", leagueId);
    const unsub = onSnapshot(dref, async (snap) => {
      if (snap.metadata.hasPendingWrites) return;
      if (snap.exists()) {
        suppressWriteRef.current = true;
        setState((prev) => ({ ...prev, ...(snap.data() as LeagueState) }));
        setTimeout(() => (suppressWriteRef.current = false), 0);
      } else {
        await setDoc(dref, { ...state, updatedAt: serverTimestamp() }, { merge: true });
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId]);
  const write = useCallback(
    (next: Partial<LeagueState>) => {
      setState((prev) => ({ ...prev, ...next }));
      if (suppressWriteRef.current) return;
      if (writeTimeout.current) window.clearTimeout(writeTimeout.current);
      writeTimeout.current = window.setTimeout(async () => {
        const dref = doc(db, "leagues", leagueId);
        const payload = { ...state, ...next, updatedAt: serverTimestamp() } as LeagueState;
        try {
          await setDoc(dref, payload, { merge: true });
        } catch {}
      }, 120);
    },
    [leagueId, state]
  );
  return [state, write] as const;
}

function useLeaguesIndex() {
  const [items, setItems] = useState<{ id: string; title?: string; players?: number; createdAt?: any; updatedAt?: any }[]>([]);
  useEffect(() => {
    const cref = collection(db, "leagues");
    const unsub = onSnapshot(cref, (snap) => {
      const arr: typeof items = [];
      snap.forEach((d) => {
        const data = d.data() as LeagueState;
        arr.push({
          id: d.id,
          title: data.title,
          players: data.players?.length ?? 0,
          createdAt: (data as any).createdAt,
          updatedAt: data.updatedAt,
        });
      });
      // sort by last update desc
      arr.sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0));
      setItems(arr);
    });
    return () => unsub();
  }, []);
  return items;
}

// ========================= Components =========================
function Header({
  onReset,
  isAdmin,
  onSetPlayer,
  onSetAdmin,
  title,
}: {
  onReset: () => void;
  isAdmin: boolean;
  onSetPlayer: () => void;
  onSetAdmin: () => void;
  title?: string;
}) {
  return (
    <header className="mb-4 flex flex-col gap-2 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
      <h1 className="text-xl font-bold sm:text-2xl">🏸 {title || "Bia-Tollas League"} – doubles matches, individual standings</h1>
      <div className="flex gap-2">
        <div className="rounded-xl border bg-white p-1">
          <button
            type="button"
            onClick={onSetPlayer}
            className={`${btnBase} ${!isAdmin ? "bg-indigo-600 text-white" : "bg-white text-gray-900"} px-3 py-1`}
          >
            Player
          </button>
          <button
            type="button"
            onClick={onSetAdmin}
            className={`${btnBase} ${isAdmin ? "bg-indigo-600 text-white" : "bg-white text-gray-900"} px-3 py-1`}
          >
            Admin
          </button>
        </div>
        <button onClick={onReset} className={btnSecondary}>
          New league
        </button>
      </div>
    </header>
  );
}

function PlayerEditor({
  players,
  onAdd,
  onRemove,
  disabled,
}: {
  players: Player[];
  onAdd: (name: string) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
}) {
  const [name, setName] = useState("");
  return (
    <div className={card}>
      <ShuttleBg />
      <h2 className="mb-2 text-lg font-semibold">Players ({players.length})</h2>
      <div className="flex w-full flex-col gap-2 sm:flex-row">
        <input
          className={input}
          placeholder="Player name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !disabled) {
              onAdd(name);
              setName("");
            }
          }}
          disabled={!!disabled}
        />
        <button
          className={btnPrimary}
          onClick={() => {
            if (!disabled) {
              onAdd(name);
              setName("");
            }
          }}
          disabled={!!disabled}
        >
          Add
        </button>
      </div>
      {players.length > 0 && (
        <ul className="mt-3 divide-y text-sm">
          {players.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-2">
              <span className="truncate">{p.name}</span>
              <button className={btnDanger} onClick={() => onRemove(p.id)} disabled={!!disabled}>
                remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RoundControls({
  currentRound,
  canDraw,
  onAutoDraw,
  onFinalize,
  isAdmin,
}: {
  currentRound: number;
  canDraw: boolean;
  onAutoDraw: () => void;
  onFinalize: () => void;
  isAdmin: boolean;
}) {
  return (
    <div className={card}>
      <ShuttleBg />
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">Current round: {currentRound}</h2>
        <div className="flex gap-2">
          <button className={btnSecondary} onClick={onAutoDraw} disabled={!canDraw || !isAdmin}>
            Auto draw pairs
          </button>
          <button className={btnPrimary} onClick={onFinalize} disabled={!isAdmin}>
            Close round
          </button>
        </div>
      </div>
      {!isAdmin && <p className="text-sm text-gray-500">Viewer mode: only Admin can pair teams and record results.</p>}
    </div>
  );
}

// ---- Drag & Drop pairing (admin, add multiple matches sequentially in one round) ----
function DnDPairs({
  players,
  availableIds,
  seenTeammates,
  onCreateMatch,
  disabled,
}: {
  players: Player[];
  availableIds: string[];
  seenTeammates: Set<string>;
  onCreateMatch: (a: Pair, b: Pair) => void;
  disabled?: boolean;
}) {
  const [pool, setPool] = useState<string[]>(availableIds);
  const [teamA, setTeamA] = useState<string[]>([]);
  const [teamB, setTeamB] = useState<string[]>([]);
  useEffect(() => {
    setPool(availableIds);
    setTeamA([]);
    setTeamB([]);
  }, [availableIds.join(",")]);

  const onDragStart = (pid: string) => (e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", pid);
  };
  const onDropFactory =
    (target: "A" | "B" | "POOL") =>
    (e: React.DragEvent) => {
      e.preventDefault();
      const pid = e.dataTransfer.getData("text/plain");
      if (!pid) return;
      setTeamA((t) => t.filter((x) => x !== pid));
      setTeamB((t) => t.filter((x) => x !== pid));
      setPool((t) => t.filter((x) => x !== pid));
      if (target === "A") setTeamA((t) => (t.length < 2 ? [...t, pid] : t));
      else if (target === "B") setTeamB((t) => (t.length < 2 ? [...t, pid] : t));
      else setPool((t) => [...t, pid]);
    };
  const allowDrop = (e: React.DragEvent) => e.preventDefault();

  const warnA = teamA.length === 2 && seenTeammates.has(key(teamA[0], teamA[1]));
  const warnB = teamB.length === 2 && seenTeammates.has(key(teamB[0], teamB[1]));
  const canCreate = teamA.length === 2 && teamB.length === 2 && !disabled;

  return (
    <div className={card}>
      <ShuttleBg />
      <h3 className="mb-2 font-semibold">Pairing (Drag & Drop) – available players: {pool.length}</h3>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border p-3" onDrop={onDropFactory("POOL")} onDragOver={allowDrop}>
          <div className="mb-2 text-sm font-medium text-gray-600">Available</div>
          <div className="flex flex-wrap gap-2">
            {pool.map((pid) => (
              <span
                key={pid}
                draggable={!disabled}
                onDragStart={onDragStart(pid)}
                className="cursor-move select-none rounded-lg bg-gray-100 px-3 py-1 text-sm"
              >
                {players.find((p) => p.id === pid)?.name}
              </span>
            ))}
          </div>
        </div>
        <div className={`rounded-xl border p-3 ${warnA ? "border-amber-400" : ""}`} onDrop={onDropFactory("A")} onDragOver={allowDrop}>
          <div className="mb-2 text-sm font-medium">
            Team A {warnA && <span className="ml-2 text-amber-600">(teammates already before)</span>}
          </div>
          <div className="flex flex-wrap gap-2 min-h-[2.25rem]">
            {teamA.map((pid) => (
              <span
                key={pid}
                draggable={!disabled}
                onDragStart={onDragStart(pid)}
                className="cursor-move select-none rounded-lg bg-indigo-100 px-3 py-1 text-sm"
              >
                {players.find((p) => p.id === pid)?.name}
              </span>
            ))}
          </div>
        </div>
        <div className={`rounded-xl border p-3 ${warnB ? "border-amber-400" : ""}`} onDrop={onDropFactory("B")} onDragOver={allowDrop}>
          <div className="mb-2 text-sm font-medium">
            Team B {warnB && <span className="ml-2 text-amber-600">(teammates already before)</span>}
          </div>
          <div className="flex flex-wrap gap-2 min-h-[2.25rem]">
            {teamB.map((pid) => (
              <span
                key={pid}
                draggable={!disabled}
                onDragStart={onDragStart(pid)}
                className="cursor-move select-none rounded-lg bg-indigo-100 px-3 py-1 text-sm"
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
            onCreateMatch([teamA[0], teamA[1]], [teamB[0], teamB[1]]);
            setTeamA([]);
            setTeamB([]);
          }}
        >
          Add match to this round
        </button>
        <button
          className={btnSecondary}
          onClick={() => {
            setPool(availableIds);
            setTeamA([]);
            setTeamB([]);
          }}
          disabled={!!disabled}
        >
          Reset
        </button>
        <span className="text-xs text-gray-500">
          Tip: 8 players → 2 matches, 12 players → 3 matches, etc. Add matches one by one; the list always shows the remaining free
          players.
        </span>
      </div>
    </div>
  );
}

function MatchList({
  matches,
  nameOf,
  onPick,
  disabled,
}: {
  matches: Match[];
  nameOf: (id: string) => string;
  onPick: (matchId: string, winner?: "A" | "B") => void;
  disabled?: boolean;
}) {
  if (matches.length === 0) {
    return (
      <div className={card}>
        <ShuttleBg />
        <p className="text-sm text-gray-500">No matches in this round yet. Create two teams with Drag & Drop or use Auto draw.</p>
      </div>
    );
  }
  return (
    <div className={card}>
      <ShuttleBg />
      <ul className="space-y-3">
        {matches.map((m) => (
          <li key={m.id} className="flex items-center justify-between rounded-xl border p-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 rounded bg-gray-100 px-2 py-1 text-xs">#{m.round}</span>
              <span className="truncate font-medium">
                {nameOf(m.teamA[0])} & {nameOf(m.teamA[1])} {m.winner === "A" && "🏆"}
              </span>
              <span className="shrink-0 text-gray-400">vs</span>
              <span className="truncate font-medium">
                {nameOf(m.teamB[0])} & {nameOf(m.teamB[1])} {m.winner === "B" && "🏆"}
              </span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  className="h-5 w-5"
                  type="radio"
                  name={`winner-${m.id}`}
                  checked={m.winner === "A"}
                  onChange={() => onPick(m.id, "A")}
                  disabled={!!disabled}
                />
                <span className="hidden sm:inline">Team A</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  className="h-5 w-5"
                  type="radio"
                  name={`winner-${m.id}`}
                  checked={m.winner === "B"}
                  onChange={() => onPick(m.id, "B")}
                  disabled={!!disabled}
                />
                <span className="hidden sm:inline">Team B</span>
              </label>
              <button className={btnSecondary} onClick={() => onPick(m.id, undefined)} disabled={!!disabled}>
                clear
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function History({ allMatches, nameOf }: { allMatches: Match[]; nameOf: (id: string) => string }) {
  return (
    <div className={card}>
      <ShuttleBg />
      <h3 className="mb-2 font-semibold">Match history</h3>
      {allMatches.length === 0 ? (
        <p className="text-sm text-gray-500">No matches yet.</p>
      ) : (
        <ul className="divide-y">
          {allMatches
            .slice()
            .sort((a, b) => a.round - b.round)
            .map((m) => (
              <li key={m.id} className="py-2 text-sm">
                <span className="mr-2 rounded bg-gray-100 px-2 py-0.5 text-xs">#{m.round}</span>
                <b>{nameOf(m.teamA[0])}</b> & <b>{nameOf(m.teamA[1])}</b>
                <span className="mx-1 text-gray-400">vs</span>
                <b>{nameOf(m.teamB[0])}</b> & <b>{nameOf(m.teamB[1])}</b>
                {m.winner ? (
                  <span className="ml-2">
                    – Winner: <b>{m.winner === "A" ? `${nameOf(m.teamA[0])} & ${nameOf(m.teamA[1])}` : `${nameOf(m.teamB[0])} & ${nameOf(m.teamB[1])}`}</b> 🏆
                  </span>
                ) : (
                  <span className="ml-2 text-gray-500">– no recorded result</span>
                )}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

function Standings({ rows }: { rows: { id: string; name: string; wins: number; losses: number; points: number }[] }) {
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
                <tr key={row.id} className="border-t">
                  <td className="py-2 pr-2 align-middle">{idx + 1}</td>
                  <td className="py-2 pr-2 align-middle font-medium">{row.name}</td>
                  <td className="py-2 pr-2 align-middle">{row.wins}</td>
                  <td className="py-2 pr-2 align-middle">{row.losses}</td>
                  <td className="py-2 pr-2 align-middle font-semibold">{row.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LeagueTile({ title, subtitle, onClick, plus }: { title: string; subtitle?: string; onClick: () => void; plus?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex h-28 w-full items-center justify-between gap-3 rounded-2xl border bg-white p-4 text-left shadow hover:shadow-md"
    >
      <ShuttleBg />
      <div className="flex items-center gap-3">
        <div className={`grid h-10 w-10 place-items-center rounded-xl ${plus ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-600"}`}>
          {plus ? "+" : "🏸"}
        </div>
        <div>
          <div className="text-base font-semibold">{title}</div>
          {subtitle && <div className="text-xs text-gray-500">{subtitle}</div>}
        </div>
      </div>
      {!plus && <span className="text-sm text-gray-400">Open →</span>}
    </button>
  );
}

function LeaguePicker({ onOpen, onCreate }: { onOpen: (id: string) => void; onCreate: () => void }) {
  const leagues = useLeaguesIndex();
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="mb-4 text-2xl font-bold">Choose a league</h1>
        <div className="grid gap-3 sm:grid-cols-2">
          {leagues.map((l) => (
            <LeagueTile key={l.id} title={l.title || l.id} subtitle={`${l.players ?? 0} players`} onClick={() => onOpen(l.id)} />
          ))}
          <LeagueTile title="New league" subtitle="Create one" plus onClick={onCreate} />
        </div>
      </div>
    </div>
  );
}

// ========================= App =========================
export default function App() {
  const { leagueId, navigate } = useLeagueId();

  // Roles (Player/Admin) without password
  const [role, setRole] = useState<"player" | "admin">(() => (localStorage.getItem("bia_role") as any) || "player");
  const isAdmin = role === "admin";
  const setPlayer = () => {
    localStorage.setItem("bia_role", "player");
    setRole("player");
  };
  const setAdmin = () => {
    localStorage.setItem("bia_role", "admin");
    setRole("admin");
  };

  // No league selected -> picker
  if (!leagueId) {
    const onOpen = (id: string) => navigate(id);
    const onCreate = async () => {
      const name = prompt("New league name? (e.g. Bia-Tollas 2025/Fall)")?.trim();
      if (!name) return;
      const base = slugify(name) || `league-${uid()}`;
      const id = `${base}-${uid().slice(0, 4)}`;
      const initial: LeagueState = {
        started: false,
        players: [],
        matches: [],
        currentRound: 0,
        title: name,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, "leagues", id), initial, { merge: true });
      navigate(id);
    };
    return <LeaguePicker onOpen={onOpen} onCreate={onCreate} />;
  }

  // League view
  const [state, write] = useLeagueSync(leagueId);
  const { started, players, matches, currentRound, title } = state;

  // Derived
  const playerMap = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const nameOf = useCallback((id: string) => playerMap.get(id)?.name ?? "?", [playerMap]);

  const currentRoundMatches = useMemo(() => matches.filter((m) => m.round === currentRound), [matches, currentRound]);
  const seenTeammates = useMemo(() => {
    const s = new Set<string>();
    matches.forEach((m) => {
      s.add(key(m.teamA[0], m.teamA[1]));
      s.add(key(m.teamB[0], m.teamB[1]));
    });
    return s;
  }, [matches]);

  const usedThisRound = useMemo(() => {
    const s = new Set<string>();
    currentRoundMatches.forEach((m) => {
      m.teamA.forEach((id) => s.add(id));
      m.teamB.forEach((id) => s.add(id));
    });
    return s;
  }, [currentRoundMatches]);

  const availableIds = useMemo(() => players.filter((p) => !usedThisRound.has(p.id)).map((p) => p.id), [players, usedThisRound]);
  const canDraw = useMemo(() => availableIds.length >= 4, [availableIds.length]);

  const standings = useMemo(() => {
    const rows = players.map((p) => {
      const played = matches.filter((m) => m.winner && [m.teamA[0], m.teamA[1], m.teamB[0], m.teamB[1]].includes(p.id));
      const wins = played.filter(
        (m) => (m.winner === "A" && (m.teamA[0] === p.id || m.teamA[1] === p.id)) || (m.winner === "B" && (m.teamB[0] === p.id || m.teamB[1] === p.id))
      ).length;
      const losses = played.length - wins;
      return { id: p.id, name: p.name, wins, losses, points: wins };
    });
    return rows.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  }, [players, matches]);

  // Actions
  const addPlayerByName = (name: string) => {
    const t = name.trim();
    if (!t) return;
    if (players.some((p) => p.name.toLowerCase() === t.toLowerCase())) return;
    write({ players: [...players, { id: uid(), name: t, wins: 0, losses: 0 }] });
  };
  const removePlayer = (id: string) => {
    write({ players: players.filter((p) => p.id !== id) });
  };
  const resetAll = () => {
    if (!confirm("Are you sure you want to clear this league?")) return;
    write({ started: false, players: [], matches: [], currentRound: 0 });
  };

  const startLeague = () => {
    if (players.length < 4) {
      alert("At least 4 players are required for doubles rounds.");
      return;
    }
    write({ started: true, currentRound: 1, matches: [], title: title || `League ${leagueId}` });
  };

  const autoDraw = () => {
    if (!started) return;
    const ids = availableIds; // only players not already on court this round
    if (ids.length < 4) {
      alert("Not enough free players for this round.");
      return;
    }
    const pairs = makePairsForRound(ids, seenTeammates);
    if (pairs.length < 2) {
      alert("Can't form a match now (too few free players?).");
      return;
    }
    const ms: Match[] = [];
    for (let i = 0; i + 1 < pairs.length; i += 2) {
      ms.push({ id: uid(), teamA: pairs[i], teamB: pairs[i + 1], round: currentRound });
    }
    write({ matches: [...matches, ...ms] });
  };

  const createMatch = (a: Pair, b: Pair) => {
    if (!isAdmin) return;
    write({ matches: [...matches, { id: uid(), teamA: a, teamB: b, round: currentRound }] });
  };
  const pickWinner = (matchId: string, winner?: "A" | "B") => {
    if (!isAdmin) return;
    write({ matches: matches.map((m) => (m.id === matchId ? { ...m, winner } : m)) });
  };

  const finalizeRound = () => {
    if (!isAdmin) return;
    const roundMs = matches.filter((m) => m.round === currentRound);
    if (roundMs.length === 0) {
      alert("No matches in this round.");
      return;
    }
    if (roundMs.some((m) => !m.winner)) {
      alert("Please select a winner for every match.");
      return;
    }
    const map = new Map(players.map((p) => [p.id, { ...p }]));
    roundMs.forEach((m) => {
      const winTeam = m.winner === "A" ? m.teamA : m.teamB;
      const loseTeam = m.winner === "A" ? m.teamB : m.teamA;
      winTeam.forEach((pid) => {
        const p = map.get(pid)!;
        p.wins += 1;
      });
      loseTeam.forEach((pid) => {
        const p = map.get(pid)!;
        p.losses += 1;
      });
    });
    write({ players: Array.from(map.values()), currentRound: currentRound + 1 });
  };

  // Render – league
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* key forces remount when switching between picker/league */}
      <div className="mx-auto max-w-5xl p-4 sm:p-6" key={leagueId || "picker"}>
        <Header onReset={resetAll} isAdmin={isAdmin} onSetPlayer={setPlayer} onSetAdmin={setAdmin} title={title || leagueId} />

        {!started ? (
          <section className="grid gap-4 sm:gap-6 md:grid-cols-2">
            <div className={card}>
              <ShuttleBg />
              <h2 className="mb-2 text-lg font-semibold">Rules</h2>
              <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
                <li>Doubles matches only.</li>
                <li>Each round, form new teammate pairs (warning shows if players teamed up before).</li>
                <li>Individual standings: win = 1 point, loss = 0.</li>
              </ul>
            </div>
            <PlayerEditor players={players} onAdd={addPlayerByName} onRemove={removePlayer} disabled={!isAdmin} />
            <div className={`${card} md:col-span-2 flex flex-col items-stretch justify-between gap-2 sm:flex-row sm:items-center`}>
              <ShuttleBg />
              <p className="text-gray-700">
                Players: <b>{players.length}</b> — at least 4 required to start.
              </p>
              <div className="flex gap-2">
                <button className={btnSecondary} onClick={() => navigate(null)}>
                  Back to leagues
                </button>
                <button className={btnPrimary} onClick={startLeague} disabled={!isAdmin || players.length < 4}>
                  Start league
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section className="grid gap-4 sm:gap-6 md:grid-cols-3">
            <div className="space-y-4 md:col-span-2">
              <RoundControls currentRound={currentRound} canDraw={canDraw} onAutoDraw={autoDraw} onFinalize={finalizeRound} isAdmin={isAdmin} />
              {isAdmin && (
                <DnDPairs players={players} availableIds={availableIds} seenTeammates={seenTeammates} onCreateMatch={createMatch} />
              )}
              <MatchList matches={currentRoundMatches} nameOf={nameOf} onPick={pickWinner} disabled={!isAdmin} />
              <History allMatches={matches} nameOf={nameOf} />
            </div>
            <div className="space-y-4">
              <Standings rows={standings} />
              <div className={card}>
                <ShuttleBg />
                <h3 className="mb-2 font-semibold">Add new player</h3>
                <p className="text-sm text-gray-500">
                  You can add players during the league — they join in the <b>next round</b>.
                </p>
                <button className={`${btnSecondary} mt-2`} onClick={() => navigate(null)}>
                  Back to leagues
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
