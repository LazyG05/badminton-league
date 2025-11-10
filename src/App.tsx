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
 *  BIA-TOLLAS – v6
 *  - PÁROS ONLY, EGYÉNI TABELLA
 *  - Nézői jelszó: "biatollas" (UI gate)
 *  - Admin jelszó: "biatollasadmin" → szerkesztő mód
 *  - Admin: Drag & Drop párosítás az aktuális körre + opcionális "Párok sorsolása" gomb
 *  - Firestore realtime, anonim auth
 * =============================================================
 */

// ========================= Types =========================
export type Player = { id: string; name: string; wins: number; losses: number };
export type Pair = [string, string];
export type Match = { id: string; teamA: Pair; teamB: Pair; winner?: "A" | "B"; round: number };
export type LeagueState = { started: boolean; players: Player[]; matches: Match[]; currentRound: number; updatedAt?: unknown };

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
function shuffle<T>(arr: T[]): T[] { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// Autó sorsoló: készít párokat úgy, hogy korábbi CSAPATTÁRS párok ne ismétlődjenek
function makePairsForRound(playerIds: string[], seenTeammates: Set<string>): Pair[] {
  const ids = shuffle(playerIds);
  function backtrack(rem: string[], cur: Pair[]): Pair[] {
    if (rem.length < 2) return cur;
    const [first, ...rest] = rem; let best = cur; const bestPossible = cur.length + Math.floor(rem.length / 2);
    for (let i = 0; i < rest.length; i++) {
      const cand = rest[i]; const k = key(first, cand); if (seenTeammates.has(k)) continue;
      const nextRem = rest.filter((_, idx) => idx !== i);
      const next = backtrack(nextRem, [...cur, [first, cand]] as Pair[]);
      if (next.length > best.length) { best = next; if (best.length === bestPossible) return best; }
    }
    const skip = backtrack(rest, cur); if (skip.length > best.length) best = skip; return best;
  }
  return backtrack(ids, []);
}

// ========================= UI tokens =========================
const btnBase = "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed";
const btnPrimary = `${btnBase} bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:ring-indigo-600`;
const btnSecondary = `${btnBase} border border-gray-300 bg-white text-gray-900 hover:bg-gray-50 focus-visible:ring-gray-400`;
const btnDanger = `${btnBase} bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-600`;
const card = "rounded-2xl bg-white p-4 shadow";
const input = "w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500";

// ========================= Hooks =========================
function useLeagueId() { const params = new URLSearchParams(window.location.search); return params.get("leagueId") || "default"; }
function useLeagueSync(leagueId: string) {
  const [state, setState] = useState<LeagueState>({ started: false, players: [], matches: [], currentRound: 0 });
  const suppressWriteRef = useRef(false); const writeTimeout = useRef<number | null>(null);
  useEffect(() => {
    const dref = doc(db, "leagues", leagueId);
    const unsub = onSnapshot(dref, async (snap) => {
      if (snap.metadata.hasPendingWrites) return;
      if (snap.exists()) { suppressWriteRef.current = true; setState((prev) => ({ ...prev, ...(snap.data() as LeagueState) })); setTimeout(() => (suppressWriteRef.current = false), 0); }
      else { await setDoc(dref, { ...state, updatedAt: serverTimestamp() }, { merge: true }); }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId]);
  const write = useCallback((next: Partial<LeagueState>) => {
    setState((prev) => ({ ...prev, ...next }));
    if (suppressWriteRef.current) return;
    if (writeTimeout.current) window.clearTimeout(writeTimeout.current);
    writeTimeout.current = window.setTimeout(async () => {
      const dref = doc(db, "leagues", leagueId);
      const payload = { ...state, ...next, updatedAt: serverTimestamp() } as LeagueState;
      try { await setDoc(dref, payload, { merge: true }); } catch {}
    }, 120);
  }, [leagueId, state]);
  return [state, write] as const;
}

// ========================= Components =========================
function Header({ onReset, isAdmin, onAdmin }: { onReset: () => void; isAdmin: boolean; onAdmin: () => void }) {
  return (
    <header className="mb-4 flex flex-col gap-2 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
      <h1 className="text-xl font-bold sm:text-2xl">🏸 Bia-Tollas bajnokság – páros meccsek, egyéni tabella</h1>
      <div className="flex gap-2">
        {!isAdmin && <button onClick={onAdmin} className={btnSecondary}>Szerkesztő mód</button>}
        <button onClick={onReset} className={btnSecondary}>Új bajnokság</button>
      </div>
    </header>
  );
}

function PlayerEditor({ players, onAdd, onRemove, disabled }: { players: Player[]; onAdd: (name: string) => void; onRemove: (id: string) => void; disabled?: boolean }) {
  const [name, setName] = useState("");
  return (
    <div className={card}>
      <h2 className="mb-2 text-lg font-semibold">Játékosok ({players.length})</h2>
      <div className="flex w-full flex-col gap-2 sm:flex-row">
        <input className={input} placeholder="Játékos neve" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !disabled) { onAdd(name); setName(''); } }} disabled={!!disabled} />
        <button className={btnPrimary} onClick={() => { if (!disabled) { onAdd(name); setName(''); } }} disabled={!!disabled}>Hozzáadás</button>
      </div>
      {players.length > 0 && (
        <ul className="mt-3 divide-y text-sm">
          {players.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-2">
              <span className="truncate">{p.name}</span>
              <button className={btnDanger} onClick={() => onRemove(p.id)} disabled={!!disabled}>eltávolítás</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RoundControls({ currentRound, canDraw, onAutoDraw, onFinalize, isAdmin }: { currentRound: number; canDraw: boolean; onAutoDraw: () => void; onFinalize: () => void; isAdmin: boolean; }) {
  return (
    <div className={card}>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">Aktuális kör: {currentRound}</h2>
        <div className="flex gap-2">
          <button className={btnSecondary} onClick={onAutoDraw} disabled={!canDraw || !isAdmin}>Párok sorsolása</button>
          <button className={btnPrimary} onClick={onFinalize} disabled={!isAdmin}>Kör lezárása</button>
        </div>
      </div>
      {!isAdmin && <p className="text-sm text-gray-500">Néző mód: csak az admin rögzíthet eredményt és sorsolhat párokat.</p>}
    </div>
  );
}

// ---- Drag & Drop párosító (admin) ----
function DnDPairs({ players, seenTeammates, onCreateMatch, disabled }: { players: Player[]; seenTeammates: Set<string>; onCreateMatch: (a: Pair, b: Pair) => void; disabled?: boolean; }) {
  const [pool, setPool] = useState<string[]>(players.map((p) => p.id));
  const [teamA, setTeamA] = useState<string[]>([]);
  const [teamB, setTeamB] = useState<string[]>([]);
  useEffect(() => { setPool(players.map((p) => p.id)); setTeamA([]); setTeamB([]); }, [players]);

  const onDragStart = (pid: string) => (e: React.DragEvent) => { e.dataTransfer.setData("text/plain", pid); };
  const onDropFactory = (target: 'A' | 'B' | 'POOL') => (e: React.DragEvent) => {
    e.preventDefault(); const pid = e.dataTransfer.getData("text/plain"); if (!pid) return;
    // remove from all
    setTeamA((t) => t.filter((x) => x !== pid)); setTeamB((t) => t.filter((x) => x !== pid)); setPool((t) => t.filter((x) => x !== pid));
    if (target === 'A') setTeamA((t) => (t.length < 2 ? [...t, pid] : t));
    else if (target === 'B') setTeamB((t) => (t.length < 2 ? [...t, pid] : t));
    else setPool((t) => [...t, pid]);
  };
  const allowDrop = (e: React.DragEvent) => e.preventDefault();

  const warnA = teamA.length === 2 && seenTeammates.has(key(teamA[0], teamA[1]));
  const warnB = teamB.length === 2 && seenTeammates.has(key(teamB[0], teamB[1]));
  const canCreate = teamA.length === 2 && teamB.length === 2 && !disabled;

  return (
    <div className={card}>
      <h3 className="mb-2 font-semibold">Párosítás (Drag & Drop)</h3>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border p-3" onDrop={onDropFactory('POOL')} onDragOver={allowDrop}>
          <div className="mb-2 text-sm font-medium text-gray-600">Választhatók</div>
          <div className="flex flex-wrap gap-2">
            {pool.map((pid) => (
              <span key={pid} draggable={!disabled} onDragStart={onDragStart(pid)} className="cursor-move select-none rounded-lg bg-gray-100 px-3 py-1 text-sm">{players.find(p=>p.id===pid)?.name}</span>
            ))}
          </div>
        </div>
        <div className={`rounded-xl border p-3 ${warnA ? 'border-amber-400' : ''}`} onDrop={onDropFactory('A')} onDragOver={allowDrop}>
          <div className="mb-2 text-sm font-medium">Csapat A {warnA && <span className="ml-2 text-amber-600">(már voltak csapattársak)</span>}</div>
          <div className="flex flex-wrap gap-2 min-h-[2.25rem]">
            {teamA.map((pid) => (
              <span key={pid} draggable={!disabled} onDragStart={onDragStart(pid)} className="cursor-move select-none rounded-lg bg-indigo-100 px-3 py-1 text-sm">{players.find(p=>p.id===pid)?.name}</span>
            ))}
          </div>
        </div>
        <div className={`rounded-xl border p-3 ${warnB ? 'border-amber-400' : ''}`} onDrop={onDropFactory('B')} onDragOver={allowDrop}>
          <div className="mb-2 text-sm font-medium">Csapat B {warnB && <span className="ml-2 text-amber-600">(már voltak csapattársak)</span>}</div>
          <div className="flex flex-wrap gap-2 min-h-[2.25rem]">
            {teamB.map((pid) => (
              <span key={pid} draggable={!disabled} onDragStart={onDragStart(pid)} className="cursor-move select-none rounded-lg bg-indigo-100 px-3 py-1 text-sm">{players.find(p=>p.id===pid)?.name}</span>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button className={btnPrimary} disabled={!canCreate} onClick={() => { onCreateMatch([teamA[0], teamA[1]], [teamB[0], teamB[1]]); setTeamA([]); setTeamB([]); }}>Meccs hozzáadása ehhez a körhöz</button>
        <button className={btnSecondary} onClick={() => { setPool(players.map(p=>p.id)); setTeamA([]); setTeamB([]); }} disabled={!!disabled}>Visszaállítás</button>
      </div>
      <p className="mt-2 text-xs text-gray-500">Tipp: a sárga keret jelzi, ha a kiválasztott páros már volt együtt.</p>
    </div>
  );
}

function MatchList({ matches, nameOf, onPick, disabled }: { matches: Match[]; nameOf: (id: string) => string; onPick: (matchId: string, winner?: "A" | "B") => void; disabled?: boolean; }) {
  if (matches.length === 0) {
    return (
      <div className={card}>
        <p className="text-sm text-gray-500">Még nincs meccs ebben a körben. Hozz létre kettőt Drag & Drop-pal vagy használd a sorsolót.</p>
      </div>
    );
  }
  return (
    <div className={card}>
      <ul className="space-y-3">
        {matches.map((m) => (
          <li key={m.id} className="flex items-center justify-between rou