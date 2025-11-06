import { useEffect, useMemo, useRef, useState } from "react";
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

// ===== Firebase bootstrap =====
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
signInAnonymously(auth).catch(console.error);
const db = getFirestore(app);
// offline támogatás (nem baj, ha több tabnál nem engedi)
enableIndexedDbPersistence(db).catch(() => {});

// ===== Típusok =====
type Mode = "singles" | "doubles";

type Player = { id: string; name: string; wins: number; losses: number };

type Team = { id: string; name: string; members: [string, string]; wins: number; losses: number };

type Match = { id: string; a: string; b: string; winner?: string; round: number };

type LeagueState = {
  started: boolean;
  mode: Mode;
  players: Player[];
  teams: Team[];
  matches: Match[];
  currentRound: number;
  updatedAt?: any;
};

// ===== Util =====
const uid = () => Math.random().toString(36).slice(2, 10);
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const pairKey = (a: string, b: string) => [a, b].sort().join("::");
function findRoundPairings(ids: string[], playedPairs: Set<string>): [string, string][] {
  const order = shuffle(ids);
  function backtrack(rem: string[], cur: [string, string][]): [string, string][] {
    if (rem.length < 2) return cur;
    const [first, ...rest] = rem;
    let best = cur;
    const bestPossible = cur.length + Math.floor(rem.length / 2);
    for (let i = 0; i < rest.length; i++) {
      const cand = rest[i];
      const key = pairKey(first, cand);
      if (playedPairs.has(key)) continue;
      const nextRem = rest.filter((_, idx) => idx !== i);
      const next = backtrack(nextRem, [...cur, [first, cand]]);
      if (next.length > best.length) {
        best = next;
        if (best.length === bestPossible) return best;
      }
    }
    const skip = backtrack(rest, cur);
    if (skip.length > best.length) best = skip;
    return best;
  }
  return backtrack(order, []);
}

// ===== Kis UI segédosztályok egységes dizájnhoz =====
const btnBase = "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";
const btnPrimary = `${btnBase} bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:ring-indigo-600`;
const btnSecondary = `${btnBase} border border-gray-300 bg-white text-gray-900 hover:bg-gray-50 focus-visible:ring-gray-400`;
const btnDanger = `${btnBase} bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-600`;
const card = "rounded-2xl bg-white p-4 shadow";
const input = "w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500";

// ===== App =====
export default function App() {
  // Liga azonosító URL-ből (mobilbarát több liga egy deployon)
  const params = new URLSearchParams(window.location.search);
  const leagueId = params.get("leagueId") || "default";

  // Állapot
  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState<Mode>("singles");
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [nameInput, setNameInput] = useState("");
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");

  // Firestore sync
  const unsubRef = useRef<() => void | null>(null);
  const suppressWriteRef = useRef(false);

  useEffect(() => {
    const dref = doc(db, "leagues", leagueId);
    unsubRef.current = onSnapshot(dref, async (snap) => {
      if (snap.metadata.hasPendingWrites) return;
      if (snap.exists()) {
        const data = snap.data() as LeagueState;
        suppressWriteRef.current = true;
        setStarted(data.started ?? false);
        setMode((data.mode as Mode) ?? "singles");
        setPlayers(data.players ?? []);
        setTeams(data.teams ?? []);
        setMatches(data.matches ?? []);
        setCurrentRound(data.currentRound ?? 0);
        setTimeout(() => (suppressWriteRef.current = false), 0);
      } else {
        const initial: LeagueState = {
          started: false,
          mode: "singles",
          players: [],
          teams: [],
          matches: [],
          currentRound: 0,
          updatedAt: serverTimestamp(),
        };
        await setDoc(dref, initial, { merge: true });
      }
    });
    return () => {
      unsubRef.current && unsubRef.current();
    };
  }, [leagueId]);

  const writeTimeout = useRef<number | null>(null);
  function scheduleWrite() {
    if (suppressWriteRef.current) return;
    if (writeTimeout.current) window.clearTimeout(writeTimeout.current);
    writeTimeout.current = window.setTimeout(async () => {
      const dref = doc(db, "leagues", leagueId);
      const payload: LeagueState = { started, mode, players, teams, matches, currentRound, updatedAt: serverTimestamp() };
      try {
        await setDoc(dref, payload, { merge: true });
      } catch (e) {
        console.error("[firestore] write failed", e);
      }
    }, 120);
  }
  useEffect(() => {
    scheduleWrite();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, mode, players, teams, matches, currentRound]);

  // Derived
  const playerMap = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const competitorIds = useMemo(() => (mode === "singles" ? players.map((p) => p.id) : teams.map((t) => t.id)), [mode, players, teams]);
  function competitorName(id: string) {
    return mode === "singles" ? playerMap.get(id)?.name ?? "?" : teamMap.get(id)?.name ?? "?";
  }
  const currentRoundMatches = useMemo(() => matches.filter((m) => m.round === currentRound), [matches, currentRound]);
  const playedPairs = useMemo(() => {
    const s = new Set<string>();
    matches.forEach((m) => s.add(pairKey(m.a, m.b)));
    return s;
  }, [matches]);
  const standings = useMemo(() => {
    const rows = (mode === "singles" ? players.map((p) => ({ id: p.id, name: p.name })) : teams.map((t) => ({ id: t.id, name: t.name }))).map((row) => {
      const played = matches.filter((m) => m.winner && (m.a === row.id || m.b === row.id));
      const wins = played.filter((m) => m.winner === row.id).length;
      const losses = played.length - wins;
      return { ...row, wins, losses, points: wins };
    });
    return rows.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  }, [mode, players, teams, matches]);

  // Actions
  function addPlayerByName(name: string) {
    const t = name.trim();
    if (!t) return;
    if (players.some((p) => p.name.toLowerCase() === t.toLowerCase())) return;
    setPlayers((ps) => [...ps, { id: uid(), name: t, wins: 0, losses: 0 }]);
    setNameInput("");
  }
  function removePlayer(id: string) {
    if (teams.some((t) => t.members.includes(id))) {
      alert("Ez a játékos szerepel egy csapatban. Előbb bontsd fel/töröld a csapatot.");
      return;
    }
    setPlayers((ps) => ps.filter((p) => p.id !== id));
  }
  function addTeamByMembers(aId: string, bId: string) {
    if (!aId || !bId) return;
    if (aId === bId) {
      alert("Két különböző játékost válassz!");
      return;
    }
    if (teams.some((t) => t.members.includes(aId) || t.members.includes(bId))) {
      alert("A kiválasztott játékos(ok) már tagjai egy csapatnak.");
      return;
    }
    const aName = playerMap.get(aId)?.name ?? "?";
    const bName = playerMap.get(bId)?.name ?? "?";
    const name = `${aName} & ${bName}`;
    setTeams((ts) => [...ts, { id: uid(), name, members: [aId, bId], wins: 0, losses: 0 }]);
    setTeamA("");
    setTeamB("");
  }
  function removeTeam(id: string) {
    setTeams((ts) => ts.filter((t) => t.id !== id));
  }
  function startLeague() {
    if (competitorIds.length < 2) {
      alert("Legalább 2 versenyző szükséges a bajnokság indításához.");
      return;
    }
    setStarted(true);
    setCurrentRound(1);
    setMatches([]);
  }
  function drawRound() {
    if (!started) return;
    // Ne lehessen újra sorsolni ugyanarra a körre, ha már vannak meccsek benne
    const anyThisRound = matches.some((m) => m.round === currentRound);
    if (anyThisRound) {
      alert("Ebben a körben már vannak meccsek. Zárd le a kört, majd sorsolj a következőre.");
      return;
    }
    const pairs = findRoundPairings(competitorIds, playedPairs);
    if (pairs.length === 0) {
      alert("Nincs több új párosítás. A körmérkőzés véget ért! 🎉");
      return;
    }
    const newMs: Match[] = pairs.map(([a, b]) => ({ id: uid(), a, b, round: currentRound }));
    setMatches((ms) => [...ms, ...newMs]);
  }
  function recordWinner(matchId: string, winnerId?: string) {
    setMatches((ms) => ms.map((m) => (m.id === matchId ? { ...m, winner: winnerId } : m)));
  }
  function finalizeRound() {
    const roundMs = matches.filter((m) => m.round === currentRound);
    if (roundMs.length === 0) {
      alert("Nincs meccs ebben a körben.");
      return;
    }
    if (roundMs.some((m) => !m.winner)) {
      alert("Minden meccshez válaszd ki a győztest!");
      return;
    }
    if (mode === "singles") {
      setPlayers((ps) => {
        const map = new Map(ps.map((p) => [p.id, { ...p }]));
        roundMs.forEach((m) => {
          const a = map.get(m.a)!;
          const b = map.get(m.b)!;
          if (m.winner === a.id) {
            a.wins += 1;
            b.losses += 1;
          } else if (m.winner === b.id) {
            b.wins += 1;
            a.losses += 1;
          }
        });
        return Array.from(map.values());
      });
    } else {
      setTeams((ts) => {
        const map = new Map(ts.map((t) => [t.id, { ...t }]));
        roundMs.forEach((m) => {
          const a = map.get(m.a)!;
          const b = map.get(m.b)!;
          if (m.winner === a.id) {
            a.wins += 1;
            b.losses += 1;
          } else if (m.winner === b.id) {
            b.wins += 1;
            a.losses += 1;
          }
        });
        return Array.from(map.values());
      });
    }
    setCurrentRound((r) => r + 1);
  }
  function resetAll() {
    if (!confirm("Biztosan törlöd a teljes bajnokságot?")) return;
    setStarted(false);
    setPlayers([]);
    setTeams([]);
    setMatches([]);
    setCurrentRound(0);
    setNameInput("");
  }

  const tournamentComplete = useMemo(() => {
    const n = competitorIds.length;
    if (n < 2) return false;
    const totalPairs = (n * (n - 1)) / 2;
    const unique = new Set(matches.map((m) => pairKey(m.a, m.b))).size;
    return unique >= totalPairs;
  }, [competitorIds, matches]);
  const freePlayersForTeams = useMemo(() => {
    const used = new Set<string>();
    teams.forEach((t) => t.members.forEach((m) => used.add(m)));
    return players.filter((p) => !used.has(p.id));
  }, [players, teams]);
  const optionsA = useMemo(() => freePlayersForTeams.filter((p) => p.id !== teamB), [freePlayersForTeams, teamB]);
  const optionsB = useMemo(() => freePlayersForTeams.filter((p) => p.id !== teamA), [freePlayersForTeams, teamA]);
  useEffect(() => {
    if (teamA && teamB && teamA === teamB) setTeamB("");
  }, [teamA, teamB]);

  // ===== UI =====
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-5xl p-4 sm:p-6">
        <header className="mb-4 flex flex-col gap-2 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-bold sm:text-2xl">🏸 Bia-Tollas bajnokság – közös, valós idejű tabella</h1>
          <div className="flex gap-2">
            <button onClick={resetAll} className={btnSecondary}>Új bajnokság</button>
          </div>
        </header>

        {!started ? (
          <section className="grid gap-4 sm:gap-6 md:grid-cols-2">
            <div className={card}>
              <h2 className="mb-2 text-lg font-semibold">Versenymód</h2>
              <div className="flex gap-2">
                <button className={`${mode === 'singles' ? btnPrimary : btnSecondary}`} onClick={() => setMode('singles')}>Egyéni</button>
                <button className={`${mode === 'doubles' ? btnPrimary : btnSecondary}`} onClick={() => setMode('doubles')}>Páros</button>
              </div>
            </div>

            <div className={card}>
              <h2 className="mb-2 text-lg font-semibold">Játékosok ({players.length})</h2>
              <div className="flex w-full flex-col gap-2 sm:flex-row">
                <input className={input} placeholder="Játékos neve" value={nameInput} onChange={(e) => setNameInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addPlayerByName(nameInput); }} />
                <button className={btnPrimary} onClick={() => addPlayerByName(nameInput)}>Hozzáadás</button>
              </div>
              {players.length > 0 && (
                <ul className="mt-3 divide-y text-sm">
                  {players.map((p) => (
                    <li key={p.id} className="flex items-center justify-between py-2">
                      <span className="truncate">{p.name}</span>
                      <button className={btnDanger} onClick={() => removePlayer(p.id)}>eltávolítás</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {mode === 'doubles' && (
              <div className={`${card} md:col-span-2`}>
                <h2 className="mb-2 text-lg font-semibold">Csapatok ({teams.length})</h2>
                {freePlayersForTeams.length < 2 ? (
                  <p className="text-sm text-gray-500">Legalább két szabad játékos kell a csapat létrehozásához.</p>
                ) : (
                  <div className="flex flex-col flex-wrap items-stretch gap-2 sm:flex-row sm:items-center">
                    <select className={input} value={teamA} onChange={(e) => setTeamA(e.target.value)}>
                      <option value="">Játékos A</option>
                      {optionsA.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <span className="hidden sm:inline">+</span>
                    <select className={input} value={teamB} onChange={(e) => setTeamB(e.target.value)}>
                      <option value="">Játékos B</option>
                      {optionsB.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <button className={btnPrimary} onClick={() => addTeamByMembers(teamA, teamB)} disabled={!(teamA && teamB)}>Csapat hozzáadása</button>
                  </div>
                )}
                {teams.length > 0 && (
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {teams.map((t) => (
                      <li key={t.id} className="flex items-center justify-between rounded-xl border p-2 text-sm">
                        <span className="font-medium">{t.name}</span>
                        <button className={btnDanger} onClick={() => removeTeam(t.id)}>törlés</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className={`${card} md:col-span-2 flex flex-col items-stretch justify-between gap-2 sm:flex-row sm:items-center`}>
              <p className="text-gray-700">Győzelem: 1 pont · Vereség: 0 pont</p>
              <button className={btnPrimary} onClick={startLeague} disabled={(mode === 'singles' ? players.length : teams.length) < 2}>Bajnokság indítása</button>
            </div>
          </section>
        ) : (
          <section className="grid gap-4 sm:gap-6 md:grid-cols-3">
            <div className="space-y-4 md:col-span-2">
              <div className={card}>
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="text-lg font-semibold">{tournamentComplete ? "Bajnokság vége 🎉" : `Aktuális kör: ${currentRound}`}</h2>
                  <div className="flex gap-2">
                    {!tournamentComplete && (
                      <button className={btnSecondary} onClick={drawRound} disabled={currentRoundMatches.length > 0 || tournamentComplete}>Sorsolás</button>
                    )}
                    <button className={btnPrimary} onClick={finalizeRound}>Kör lezárása</button>
                  </div>
                </div>

                {currentRoundMatches.length === 0 ? (
                  <p className="text-sm text-gray-500">Még nincs meccs ebben a körben. Kattints a <b>Sorsolás</b> gombra!</p>
                ) : (
                  <ul className="space-y-3">
                    {currentRoundMatches.map((m) => (
                      <li key={m.id} className="flex items-center justify-between rounded-xl border p-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="shrink-0 rounded bg-gray-100 px-2 py-1 text-xs">#{m.round}</span>
                          <span className="truncate font-medium">{competitorName(m.a)}</span>
                          <span className="shrink-0 text-gray-400">vs</span>
                          <span className="truncate font-medium">{competitorName(m.b)}</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          <label className="flex items-center gap-2">
                            <input className="h-5 w-5" type="radio" name={`winner-${m.id}`} checked={m.winner === m.a} onChange={() => recordWinner(m.id, m.a)} />
                            <span className="hidden sm:inline">{competitorName(m.a)}</span>
                          </label>
                          <label className="flex items-center gap-2">
                            <input className="h-5 w-5" type="radio" name={`winner-${m.id}`} checked={m.winner === m.b} onChange={() => recordWinner(m.id, m.b)} />
                            <span className="hidden sm:inline">{competitorName(m.b)}</span>
                          </label>
                          <button className={btnSecondary} onClick={() => recordWinner(m.id, undefined)}>törlés</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className={card}>
                <h3 className="mb-2 font-semibold">Meccstörténet</h3>
                {matches.length === 0 ? (
                  <p className="text-sm text-gray-500">Még nincs meccs.</p>
                ) : (
                  <ul className="divide-y">
                    {matches
                      .slice()
                      .sort((a, b) => a.round - b.round)
                      .map((m) => (
                        <li key={m.id} className="flex items-center justify-between py-2 text-sm">
                          <div className="min-w-0">
                            <span className="mr-2 rounded bg-gray-100 px-2 py-0.5 text-xs">#{m.round}</span>
                            <span className="font-medium">{competitorName(m.a)}</span>
                            <span className="mx-1 text-gray-400">vs</span>
                            <span className="font-medium">{competitorName(m.b)}</span>
                          </div>
                          <div className="text-right">
                            {m.winner ? (
                              <span>Győztes: <b>{competitorName(m.winner)}</b></span>
                            ) : (
                              <span className="text-gray-500">nincs rögzített eredmény</span>
                            )}
                          </div>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className={card}>
                <h2 className="mb-2 text-lg font-semibold">Tabella ({mode === 'singles' ? 'Egyéni' : 'Páros'})</h2>
                {(mode === 'singles' ? players.length : teams.length) === 0 ? (
                  <p className="text-sm text-gray-500">Nincs versenyző.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-500">
                          <th className="py-2 pr-2">#</th>
                          <th className="py-2 pr-2">{mode === 'singles' ? 'Játékos' : 'Csapat'}</th>
                          <th className="py-2 pr-2">Győzelem</th>
                          <th className="py-2 pr-2">Vereség</th>
                          <th className="py-2 pr-2">Pont</th>
                        </tr>
                      </thead>
                      <tbody>
                        {standings.map((row, idx) => (
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

              <div className={card}>
                <h3 className="mb-2 font-semibold">Új {mode === 'singles' ? 'játékos' : 'csapat'} hozzáadása</h3>
                {mode === 'singles' ? (
                  <div className="flex w-full flex-col gap-2 sm:flex-row">
                    <input className={input} placeholder="Játékos neve" value={nameInput} onChange={(e) => setNameInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addPlayerByName(nameInput); }} />
                    <button className={btnPrimary} onClick={() => addPlayerByName(nameInput)}>Hozzáadás</button>
                  </div>
                ) : (
                  <div className="flex flex-col flex-wrap items-stretch gap-2 sm:flex-row sm:items-center">
                    <select className={input} value={teamA} onChange={(e) => setTeamA(e.target.value)}>
                      <option value="">Játékos A</option>
                      {optionsA.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <span className="hidden sm:inline">+</span>
                    <select className={input} value={teamB} onChange={(e) => setTeamB(e.target.value)}>
                      <option value="">Játékos B</option>
                      {optionsB.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <button className={btnPrimary} onClick={() => addTeamByMembers(teamA, teamB)} disabled={!(teamA && teamB)}>Csapat hozzáadása</button>
                  </div>
                )}
                <p className="mt-2 text-xs text-gray-500">Az új {mode === 'singles' ? 'játékos' : 'csapat'} a <b>következő kör</b> sorsolásába automatikusan bekerül.</p>
              </div>

              <div className={card}>
                <h3 className="mb-2 font-semibold">Tippek</h3>
                <ul className="list-disc space-y-1 pl-5 text-sm text-gray-600">
                  <li>Reszponzív: mobilon egy hasáb, nagyobb érintési felületek.</li>
                  <li>Egységes gombstílusok jó kontraszttal.</li>
                  <li>A sorsolás nem ismétli a korábbi párokat.</li>
                </ul>
              </div>
            </div>
          </section>
        )}

        <footer className="mt-8 text-center text-xs text-gray-500">Készítette: Te 🫶 – Használd bátran, alakítsd igény szerint.</footer>
      </div>
    </div>
  );
}
