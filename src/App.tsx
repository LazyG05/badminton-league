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
 *  BIA-TOLLAS – v5 (pairs-only, individual ranking, password gate)
 * =============================================================
 * - CSAK páros meccsek, de az eredményt EGYÉNILEG számoljuk
 * - Minden körben ÚJ párosok: ugyanaz a két ember nem lehet csapattárs még egyszer
 * - Ha a létszám nem osztható 4-gyel, az utolsó páros vagy pár játékos bye-t kap
 * - Realtime Firestore szinkron (anonim auth), liga azonosító URL-ből
 * - Egyszerű jelszavas belépés: „biatollas” (csak UI-gate)
 */

// ========================= Types =========================
export type Player = { id: string; name: string; wins: number; losses: number };
export type Pair = [string, string];
export type Match = {
  id: string;
  teamA: Pair;
  teamB: Pair;
  winner?: "A" | "B"; // melyik csapat nyert
  round: number;
};
export type LeagueState = {
  started: boolean;
  players: Player[];
  matches: Match[];
  currentRound: number;
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
function shuffle<T>(arr: T[]): T[] { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// Készíts párokat úgy, hogy korábbi CSAPATTÁRS párok ne ismétlődjenek
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
const btnBase = "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed";
const btnPrimary = `${btnBase} bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:ring-indigo-600`;
const btnSecondary = `${btnBase} border border-gray-300 bg-white text-gray-900 hover:bg-gray-50 focus-visible:ring-gray-400`;
const btnDanger = `${btnBase} bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-600`;
const card = "rounded-2xl bg-white p-4 shadow";
const input = "w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500";

// ========================= Hooks =========================
function useLeagueId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("leagueId") || "default";
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

  const write = useCallback((next: Partial<LeagueState>) => {
    setState((prev) => ({ ...prev, ...next }));
    if (suppressWriteRef.current) return;
    if (writeTimeout.current) window.clearTimeout(writeTimeout.current);
    writeTimeout.current = window.setTimeout(async () => {
      const dref = doc(db, "leagues", leagueId);
      const payload = { ...state, ...next, updatedAt: serverTimestamp() } as LeagueState;
      try { await setDoc(dref, payload, { merge: true }); } catch { /* noop */ }
    }, 120);
  }, [leagueId, state]);

  return [state, write] as const;
}

// ========================= Components =========================
function Header({ onReset }: { onReset: () => void }) {
  return (
    <header className="mb-4 flex flex-col gap-2 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
      <h1 className="text-xl font-bold sm:text-2xl">🏸 Bia-Tollas bajnokság – páros meccsek, egyéni tabella</h1>
      <div className="flex gap-2">
        <button onClick={onReset} className={btnSecondary}>Új bajnokság</button>
      </div>
    </header>
  );
}

function PlayerEditor({ players, onAdd, onRemove }: { players: Player[]; onAdd: (name: string) => void; onRemove: (id: string) => void }) {
  const [name, setName] = useState("");
  return (
    <div className={card}>
      <h2 className="mb-2 text-lg font-semibold">Játékosok ({players.length})</h2>
      <div className="flex w-full flex-col gap-2 sm:flex-row">
        <input className={input} placeholder="Játékos neve" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { onAdd(name); setName(''); } }} />
        <button className={btnPrimary} onClick={() => { onAdd(name); setName(''); }}>Hozzáadás</button>
      </div>
      {players.length > 0 && (
        <ul className="mt-3 divide-y text-sm">
          {players.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-2">
              <span className="truncate">{p.name}</span>
              <button className={btnDanger} onClick={() => onRemove(p.id)}>eltávolítás</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RoundControls({ currentRound, tournamentComplete, canDraw, onDraw, onFinalize }: { currentRound: number; tournamentComplete: boolean; canDraw: boolean; onDraw: () => void; onFinalize: () => void; }) {
  return (
    <div className={card}>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">{tournamentComplete ? "Bajnokság vége 🎉" : `Aktuális kör: ${currentRound}`}</h2>
        <div className="flex gap-2">
          {!tournamentComplete && (
            <button className={btnSecondary} onClick={onDraw} disabled={!canDraw}>Sorsolás</button>
          )}
          <button className={btnPrimary} onClick={onFinalize}>Kör lezárása</button>
        </div>
      </div>
    </div>
  );
}

function MatchList({ matches, nameOf, onPick }: { matches: Match[]; nameOf: (id: string) => string; onPick: (matchId: string, winner?: "A" | "B") => void; }) {
  if (matches.length === 0) {
    return (
      <div className={card}>
        <p className="text-sm text-gray-500">Még nincs meccs ebben a körben. Kattints a <b>Sorsolás</b> gombra!</p>
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
                <input className="h-5 w-5" type="radio" name={`winner-${m.id}`} checked={m.winner === 'A'} onChange={() => onPick(m.id, 'A')} />
                <span className="hidden sm:inline">A csapat</span>
              </label>
              <label className="flex items-center gap-2">
                <input className="h-5 w-5" type="radio" name={`winner-${m.id}`} checked={m.winner === 'B'} onChange={() => onPick(m.id, 'B')} />
                <span className="hidden sm:inline">B csapat</span>
              </label>
              <button className={btnSecondary} onClick={() => onPick(m.id, undefined)}>törlés</button>
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

function PasswordGate({ onOk }: { onOk: () => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  return (
    <div className="min-h-screen grid place-items-center bg-slate-50 p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow">
        <h2 className="mb-3 text-lg font-semibold">Belépés</h2>
        <p className="mb-3 text-sm text-gray-600">Add meg a bajnokság jelszavát.</p>
        <input className={input} type="password" placeholder="Jelszó" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { if (pw === 'biatollas') onOk(); else setErr('Hibás jelszó'); } }} />
        <button className={`${btnPrimary} mt-3 w-full`} onClick={() => { if (pw === 'biatollas') onOk(); else setErr('Hibás jelszó'); }}>Belépés</button>
        {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}
      </div>
    </div>
  );
}

// ========================= App =========================
export default function App() {
  const leagueId = useLeagueId();
  const [state, write] = useLeagueSync(leagueId);
  const { started, players, matches, currentRound } = state;

  // Simple password gate (UI only)
  const [authed, setAuthed] = useState(() => localStorage.getItem("bia_auth") === "ok");
  const acceptAuth = () => { localStorage.setItem("bia_auth", "ok"); setAuthed(true); };
  if (!authed) return <PasswordGate onOk={acceptAuth} />;

  // Derived
  const playerMap = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const nameOf = useCallback((id: string) => playerMap.get(id)?.name ?? "?", [playerMap]);

  // Teammates seen so far (for constraint)
  const seenTeammates = useMemo(() => {
    const s = new Set<string>();
    matches.forEach((m) => { s.add(key(m.teamA[0], m.teamA[1])); s.add(key(m.teamB[0], m.teamB[1])); });
    return s;
  }, [matches]);

  const currentRoundMatches = useMemo(() => matches.filter((m) => m.round === currentRound), [matches, currentRound]);
  const canDraw = useMemo(() => currentRoundMatches.length === 0, [currentRoundMatches.length]);

  const standings = useMemo(() => {
    const rows = players.map((p) => {
      const played = matches.filter((m) => m.winner && ([m.teamA[0], m.teamA[1], m.teamB[0], m.teamB[1]].includes(p.id)));
      const wins = played.filter((m) => (m.winner === 'A' && (m.teamA[0] === p.id || m.teamA[1] === p.id)) || (m.winner === 'B' && (m.teamB[0] === p.id || m.teamB[1] === p.id))).length;
      const losses = played.length - wins;
      return { id: p.id, name: p.name, wins, losses, points: wins };
    });
    return rows.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  }, [players, matches]);

  // ========== Actions
  const addPlayerByName = (name: string) => {
    const t = name.trim(); if (!t) return; if (players.some((p) => p.name.toLowerCase() === t.toLowerCase())) return;
    write({ players: [...players, { id: uid(), name: t, wins: 0, losses: 0 }] });
  };
  const removePlayer = (id: string) => { write({ players: players.filter((p) => p.id !== id) }); };

  const startLeague = () => {
    if (players.length < 4) { alert("Legalább 4 játékos szükséges a páros körökhöz."); return; }
    write({ started: true, currentRound: 1, matches: [] });
  };

  const drawRound = () => {
    if (!started) return;
    if (!canDraw) { alert("Ebben a körben már vannak meccsek. Zárd le a kört, majd sorsolj a következőre."); return; }
    const pairs = makePairsForRound(players.map((p) => p.id), seenTeammates);
    if (pairs.length === 0) { alert("Most nem lehet új párosokat összeállítani (minden kombó szerepelt). Próbálj később több játékossal."); return; }
    // Pár párokból csináljunk meccseket (egyszerű párosítás egymás után)
    const ms: Match[] = [];
    for (let i = 0; i + 1 < pairs.length; i += 2) {
      ms.push({ id: uid(), teamA: pairs[i], teamB: pairs[i + 1], round: currentRound });
    }
    if (ms.length === 0) { alert("Ebben a körben nem tudtunk páros meccset kihozni. (Páratlan/kevés játékos?)"); return; }
    write({ matches: [...matches, ...ms] });
  };

  const pickWinner = (matchId: string, winner?: "A" | "B") => {
    write({ matches: matches.map((m) => (m.id === matchId ? { ...m, winner } : m)) });
  };

  const finalizeRound = () => {
    const roundMs = matches.filter((m) => m.round === currentRound);
    if (roundMs.length === 0) { alert("Nincs meccs ebben a körben."); return; }
    if (roundMs.some((m) => !m.winner)) { alert("Minden meccshez válaszd ki a győztest!"); return; }

    // Frissítsük az EGYÉNI statokat
    const map = new Map(players.map((p) => [p.id, { ...p }]));
    roundMs.forEach((m) => {
      const winTeam = m.winner === 'A' ? m.teamA : m.teamB;
      const loseTeam = m.winner === 'A' ? m.teamB : m.teamA;
      winTeam.forEach((pid) => { const p = map.get(pid)!; p.wins += 1; });
      loseTeam.forEach((pid) => { const p = map.get(pid)!; p.losses += 1; });
    });

    write({ players: Array.from(map.values()), currentRound: currentRound + 1 });
  };

  const resetAll = () => {
    if (!confirm("Biztosan törlöd a teljes bajnokságot?")) return;
    write({ started: false, players: [], matches: [], currentRound: 0 });
  };

  // ========================= Render =========================
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-5xl p-4 sm:p-6">
        <Header onReset={resetAll} />

        {!started ? (
          <section className="grid gap-4 sm:gap-6 md:grid-cols-2">
            <div className={card}>
              <h2 className="mb-2 text-lg font-semibold">Szabályok</h2>
              <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
                <li>Csak páros meccsek játszhatók.</li>
                <li>Minden körben új csapattársakat sorsolunk (azonos páros nem ismétel).</li>
                <li>Az egyéni tabellán győzelem = 1 pont, vereség = 0 pont.</li>
              </ul>
            </div>
            <PlayerEditor players={players} onAdd={addPlayerByName} onRemove={removePlayer} />
            <div className={`${card} md:col-span-2 flex flex-col items-stretch justify-between gap-2 sm:flex-row sm:items-center`}>
              <p className="text-gray-700">Játékosok száma: <b>{players.length}</b> — legalább 4 kell a kezdéshez.</p>
              <button className={btnPrimary} onClick={startLeague} disabled={players.length < 4}>Bajnokság indítása</button>
            </div>
          </section>
        ) : (
          <section className="grid gap-4 sm:gap-6 md:grid-cols-3">
            <div className="space-y-4 md:col-span-2">
              <RoundControls currentRound={currentRound} tournamentComplete={false} canDraw={canDraw} onDraw={drawRound} onFinalize={finalizeRound} />
              <MatchList matches={currentRoundMatches} nameOf={nameOf} onPick={pickWinner} />
              <History allMatches={matches} nameOf={nameOf} />
            </div>
            <div className="space-y-4">
              <Standings rows={standings} />
              <div className={card}>
                <h3 className="mb-2 font-semibold">Új játékos felvétele</h3>
                <p className="text-sm text-gray-500">A bajnokság közben is hozzáadhatsz játékost – a <b>következő körben</b> már benne lesz a sorsolásban.</p>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
