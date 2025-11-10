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
          <li key={m.id} className="flex items-center justify-between rounded-xl border p-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 rounded bg-gray-100 px-2 py-1 text-xs">#{m.round}</span>
              <span className="truncate font-medium">{nameOf(m.teamA[0])} & {nameOf(m.teamA[1])}</span>
              <span className="shrink-0 text-gray-400">vs</span>
              <span className="truncate font-medium">{nameOf(m.teamB[0])} & {nameOf(m.teamB[1])}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <label className="flex items-center gap-2">
                <input className="h-5 w-5" type="radio" name={`winner-${m.id}`} checked={m.winner === 'A'} onChange={() => onPick(m.id, 'A')} disabled={!!disabled} />
                <span className="hidden sm:inline">A csapat</span>
              </label>
              <label className="flex items-center gap-2">
                <input className="h-5 w-5" type="radio" name={`winner-${m.id}`} checked={m.winner === 'B'} onChange={() => onPick(m.id, 'B')} disabled={!!disabled} />
                <span className="hidden sm:inline">B csapat</span>
              </label>
              <button className={btnSecondary} onClick={() => onPick(m.id, undefined)} disabled={!!disabled}>törlés</button>
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
      <h3 className="mb-2 font-semibold">Meccstörténet</h3>
      {allMatches.length === 0 ? (
        <p className="text-sm text-gray-500">Még nincs meccs.</p>
      ) : (
        <ul className="divide-y">
          {allMatches.slice().sort((a, b) => a.round - b.round).map((m) => (
            <li key={m.id} className="py-2 text-sm">
              <span className="mr-2 rounded bg-gray-100 px-2 py-0.5 text-xs">#{m.round}</span>
              <b>{nameOf(m.teamA[0])}</b> & <b>{nameOf(m.teamA[1])}</b>
              <span className="mx-1 text-gray-400">vs</span>
              <b>{nameOf(m.teamB[0])}</b> & <b>{nameOf(m.teamB[1])}</b>
              {m.winner ? (
                <span className="ml-2">– Győztes: <b>{m.winner === 'A' ? `${nameOf(m.teamA[0])} & ${nameOf(m.teamA[1])}` : `${nameOf(m.teamB[0])} & ${nameOf(m.teamB[1])}`}</b></span>
              ) : (
                <span className="ml-2 text-gray-500">– nincs rögzített eredmény</span>
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
      <h2 className="mb-2 text-lg font-semibold">Egyéni tabella</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">Nincs versenyző.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-2 pr-2">#</th>
                <th className="py-2 pr-2">Játékos</th>
                <th className="py-2 pr-2">Győzelem</th>
                <th className="py-2 pr-2">Vereség</th>
                <th className="py-2 pr-2">Pont</th>
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

function PasswordGate({ onViewerOk, onAdminOk }: { onViewerOk: () => void; onAdminOk: () => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  return (
    <div className="min-h-screen grid place-items-center bg-slate-50 p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow">
        <h2 className="mb-3 text-lg font-semibold">Belépés</h2>
        <p className="mb-3 text-sm text-gray-600">Add meg a jelszót. Néző: <code>biatollas</code> · Admin: <code>biatollasadmin</code></p>
        <input className={input} type="password" placeholder="Jelszó" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handle(); }} />
        <div className="mt-3 flex gap-2">
          <button className={btnSecondary} onClick={() => { setPw('biatollas'); handle('viewer'); }}>Gyors néző</button>
          <button className={btnPrimary} onClick={() => handle()}>Belépés</button>
        </div>
        {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}
      </div>
    </div>
  );
  function handle(force?: 'viewer') {
    const val = force === 'viewer' ? 'biatollas' : pw;
    if (val === 'biatollasadmin') { onAdminOk(); }
    else if (val === 'biatollas') { onViewerOk(); }
    else setErr('Hibás jelszó');
  }
}

// ========================= App =========================
export default function App() {
  const leagueId = useLeagueId();
  const [state, write] = useLeagueSync(leagueId);
  const { started, players, matches, currentRound } = state;

  // Passwords & roles
  const [authed, setAuthed] = useState(() => localStorage.getItem("bia_auth") === "ok");
  const [isAdmin, setIsAdmin] = useState(() => localStorage.getItem("bia_admin") === "ok");
  const enterViewer = () => { localStorage.setItem("bia_auth", "ok"); setAuthed(true); };
  const enterAdmin = () => { localStorage.setItem("bia_auth", "ok"); localStorage.setItem("bia_admin", "ok"); setAuthed(true); setIsAdmin(true); };
  if (!authed) return <PasswordGate onViewerOk={enterViewer} onAdminOk={enterAdmin} />;

  const askAdmin = () => {
    const pw = prompt("Admin jelszó?");
    if (pw === 'biatollasadmin') { enterAdmin(); } else alert('Hibás jelszó');
  };

  // Derived
  const playerMap = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const nameOf = useCallback((id: string) => playerMap.get(id)?.name ?? "?", [playerMap]);

  const seenTeammates = useMemo(() => { const s = new Set<string>(); matches.forEach((m) => { s.add(key(m.teamA[0], m.teamA[1])); s.add(key(m.teamB[0], m.teamB[1])); }); return s; }, [matches]);
  const currentRoundMatches = useMemo(() => matches.filter((m) => m.round === currentRound), [matches, currentRound]);
  const canDraw = useMemo(() => currentRoundMatches.length === 0, [currentRoundMatches.length]);

  const standings = useMemo(() => {
    const rows = players.map((p) => {
      const played = matches.filter((m) => m.winner && ([m.teamA[0], m.teamA[1], m.teamB[0], m.teamB[1]].includes(p.id)));
      const wins = played.filter((m) => (m.winner === 'A' && (m.teamA[0] === p.id || m.teamA[1] === p.id)) || (m.winner === 'B' && (m.teamB[0] === p.id || m.teamB[1] === p.id))).length;
      const losses = played.length - wins; return { id: p.id, name: p.name, wins, losses, points: wins };
    });
    return rows.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  }, [players, matches]);

  // Actions
  const addPlayerByName = (name: string) => { const t = name.trim(); if (!t) return; if (players.some((p) => p.name.toLowerCase() === t.toLowerCase())) return; write({ players: [...players, { id: uid(), name: t, wins: 0, losses: 0 }] }); };
  const removePlayer = (id: string) => { write({ players: players.filter((p) => p.id !== id) }); };
  const resetAll = () => { if (!confirm("Biztosan törlöd a teljes bajnokságot?")) return; write({ started: false, players: [], matches: [], currentRound: 0 }); };

  const startLeague = () => { if (players.length < 4) { alert("Legalább 4 játékos szükséges a páros körökhöz."); return; } write({ started: true, currentRound: 1, matches: [] }); };

  const autoDraw = () => {
    if (!started) return;
    if (!canDraw) { alert("Ebben a körben már vannak meccsek. Zárd le a kört, majd sorsolj a következőre."); return; }
    const pairs = makePairsForRound(players.map((p) => p.id), seenTeammates);
    if (pairs.length < 2) { alert("Most nem tudunk meccset kihozni. (Kevés játékos?)"); return; }
    const ms: Match[] = [];
    for (let i = 0; i + 1 < pairs.length; i += 2) { ms.push({ id: uid(), teamA: pairs[i], teamB: pairs[i + 1], round: currentRound }); }
    write({ matches: [...matches, ...ms] });
  };

  const createMatch = (a: Pair, b: Pair) => { if (!isAdmin) return; if (!canDraw) { alert("Ebben a körben már vannak meccsek."); return; } write({ matches: [...matches, { id: uid(), teamA: a, teamB: b, round: currentRound }] }); };
  const pickWinner = (matchId: string, winner?: "A" | "B") => { if (!isAdmin) return; write({ matches: matches.map((m) => (m.id === matchId ? { ...m, winner } : m)) }); };

  const finalizeRound = () => {
    if (!isAdmin) return;
    const roundMs = matches.filter((m) => m.round === currentRound);
    if (roundMs.length === 0) { alert("Nincs meccs ebben a körben."); return; }
    if (roundMs.some((m) => !m.winner)) { alert("Minden meccshez válaszd ki a győztest!"); return; }
    const map = new Map(players.map((p) => [p.id, { ...p }]));
    roundMs.forEach((m) => { const winTeam = m.winner === 'A' ? m.teamA : m.teamB; const loseTeam = m.winner === 'A' ? m.teamB : m.teamA; winTeam.forEach((pid) => { const p = map.get(pid)!; p.wins += 1; }); loseTeam.forEach((pid) => { const p = map.get(pid)!; p.losses += 1; }); });
    write({ players: Array.from(map.values()), currentRound: currentRound + 1 });
  };

  // Render
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-5xl p-4 sm:p-6">
        <Header onReset={resetAll} isAdmin={isAdmin} onAdmin={askAdmin} />

        {!started ? (
          <section className="grid gap-4 sm:gap-6 md:grid-cols-2">
            <div className={card}>
              <h2 className="mb-2 text-lg font-semibold">Szabályok</h2>
              <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
                <li>Csak páros meccsek játszhatók.</li>
                <li>Minden körben új csapattársakat használjatok – sárga jelzés mutatja, ha a páros már volt együtt.</li>
                <li>Az egyéni tabellán győzelem = 1 pont, vereség = 0 pont.</li>
              </ul>
            </div>
            <PlayerEditor players={players} onAdd={addPlayerByName} onRemove={removePlayer} disabled={!isAdmin} />
            <div className={`${card} md:col-span-2 flex flex-col items-stretch justify-between gap-2 sm:flex-row sm:items-center`}>
              <p className="text-gray-700">Játékosok száma: <b>{players.length}</b> — legalább 4 kell a kezdéshez.</p>
              <button className={btnPrimary} onClick={startLeague} disabled={!isAdmin || players.length < 4}>Bajnokság indítása</button>
            </div>
          </section>
        ) : (
          <section className="grid gap-4 sm:gap-6 md:grid-cols-3">
            <div className="space-y-4 md:col-span-2">
              <RoundControls currentRound={currentRound} canDraw={canDraw} onAutoDraw={autoDraw} onFinalize={finalizeRound} isAdmin={isAdmin} />
              {isAdmin && canDraw && (
                <DnDPairs players={players} seenTeammates={seenTeammates} onCreateMatch={createMatch} />
              )}
              <MatchList matches={currentRoundMatches} nameOf={nameOf} onPick={pickWinner} disabled={!isAdmin} />
              <History allMatches={matches} nameOf={nameOf} />
            </div>
            <div className="space-y-4">
              <Standings rows={standings} />
              <div className={card}>
                <h3 className="mb-2 font-semibold">Új játékos felvétele</h3>
                <p className="text-sm text-gray-500">A bajnokság közben is hozzáadhatsz játékost – a <b>következő körben</b> már benne lesz a párosításban.</p>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
