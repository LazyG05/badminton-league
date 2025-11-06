import React, { useEffect, useMemo, useRef, useState } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, onSnapshot, setDoc, serverTimestamp, enableIndexedDbPersistence } from "firebase/firestore";

// ===== Firebase bootstrap =====
// A Vite környezeti változókat a .env-ben add meg VITE_ előtaggal
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
// offline támogatás (opcionális)
enableIndexedDbPersistence(db).catch(() => {/* több tab esetén meghiúsulhat, nem gond */});

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
function shuffle<T>(arr: T[]): T[] { const a = [...arr]; for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
const pairKey = (a:string,b:string) => [a,b].sort().join("::");
function findRoundPairings(ids: string[], playedPairs: Set<string>): [string,string][] {
  const order = shuffle(ids);
  function backtrack(rem: string[], cur: [string,string][]): [string,string][] {
    if (rem.length < 2) return cur;
    const [first, ...rest] = rem; let best = cur; const bestPossible = cur.length + Math.floor(rem.length/2);
    for (let i=0;i<rest.length;i++) { const cand = rest[i]; const key = pairKey(first, cand); if (playedPairs.has(key)) continue; const nextRem = rest.filter((_,idx)=>idx!==i); const next = backtrack(nextRem, [...cur,[first,cand]]); if (next.length>best.length){best=next; if (best.length===bestPossible) return best;} }
    const skip = backtrack(rest, cur); if (skip.length>best.length) best = skip; return best;
  }
  return backtrack(order, []);
}

// ===== App =====
export default function App(){
  // Egy liga azonosítója (URL paraméterből is jöhetne)
  const leagueId = "default";

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

  // --- Firestore subscription ---
  const unsubRef = useRef<(() => void) | null>(null);
  const suppressWriteRef = useRef(false);

  useEffect(()=>{
    const dref = doc(db, "leagues", leagueId);
    unsubRef.current = onSnapshot(dref, async (snap) => {
      // Helyi írás echo-ja? Hagyjuk figyelmen kívül.
      if (snap.metadata.hasPendingWrites) return;
      if (snap.exists()) {
        const data = snap.data() as LeagueState;
        suppressWriteRef.current = true; // ne triggeljük vissza a setDoc-ot
        setStarted(data.started ?? false);
        setMode((data.mode as Mode) ?? "singles");
        setPlayers(data.players ?? []);
        setTeams(data.teams ?? []);
        setMatches(data.matches ?? []);
        setCurrentRound(data.currentRound ?? 0);
        setTimeout(()=>{ suppressWriteRef.current = false; }, 0);
      } else {
        const initial: LeagueState = { started:false, mode:"singles", players:[], teams:[], matches:[], currentRound:0, updatedAt: serverTimestamp() };
        await setDoc(dref, initial, { merge: true });
      }
    });
    return ()=>{ unsubRef.current?.(); };
  }, []);

  // --- Firestore write on state changes (debounced) ---
  const writeTimeout = useRef<number | null>(null);
  function scheduleWrite(){
    if (suppressWriteRef.current) return;
    if (writeTimeout.current) window.clearTimeout(writeTimeout.current);
    writeTimeout.current = window.setTimeout(async ()=>{
      const dref = doc(db, "leagues", leagueId);
      const payload: LeagueState = { started, mode, players, teams, matches, currentRound, updatedAt: serverTimestamp() };
      await setDoc(dref, payload, { merge: true });
    }, 150);
  }
  useEffect(()=>{ scheduleWrite(); }, [started, mode, players, teams, matches, currentRound]);

  // --- Derived ---
  const playerMap = useMemo(()=> new Map(players.map(p=>[p.id,p])),[players]);
  const teamMap = useMemo(()=> new Map(teams.map(t=>[t.id,t])),[teams]);
  const competitorIds = useMemo(()=> mode === "singles" ? players.map(p=>p.id) : teams.map(t=>t.id), [mode, players, teams]);
  function competitorName(id: string){ return mode === "singles" ? (playerMap.get(id)?.name ?? "?") : (teamMap.get(id)?.name ?? "?"); }
  const currentRoundMatches = useMemo(()=> matches.filter(m=>m.round===currentRound), [matches, currentRound]);
  const playedPairs = useMemo(()=> { const s=new Set<string>(); matches.forEach(m=> s.add(pairKey(m.a,m.b))); return s; }, [matches]);
  const standings = useMemo(()=>{
    const rows = (mode === "singles" ? players.map(p=>({ id:p.id, name:p.name })) : teams.map(t=>({ id:t.id, name:t.name })) ).map(row=>{
      const played = matches.filter(m=> m.winner && (m.a===row.id || m.b===row.id));
      const wins = played.filter(m=> m.winner===row.id).length;
      const losses = played.length - wins;
      return { ...row, wins, losses, points:wins };
    });
    return rows.sort((a,b)=> b.points - a.points || a.name.localeCompare(b.name));
  }, [mode, players, teams, matches]);

  // --- Actions ---
  function addPlayerByName(name:string){ const t=name.trim(); if(!t) return; if(players.some(p=>p.name.toLowerCase()===t.toLowerCase())) return; setPlayers(ps=>[...ps,{id:uid(),name:t,wins:0,losses:0}]); }
  function removePlayer(id:string){ if(teams.some(t=>t.members.includes(id))){ alert("Ez a játékos szerepel egy csapatban. Előbb töröld/bonstd szét a csapatot."); return; } setPlayers(ps=>ps.filter(p=>p.id!==id)); }
  function addTeamByMembers(aId:string,bId:string){ if(!aId||!bId) return; if(aId===bId){ alert("Két különböző játékost válassz!"); return; } if(teams.some(t=>t.members.includes(aId)||t.members.includes(bId))){ alert("A kiválasztott játékos(ok) már tagjai egy csapatnak."); return; } const aName=playerMap.get(aId)?.name??"?"; const bName=playerMap.get(bId)?.name??"?"; const name=`${aName} & ${bName}`; setTeams(ts=>[...ts,{id:uid(),name,members:[aId,bId],wins:0,losses:0}]); setTeamA(""); setTeamB(""); }
  function removeTeam(id:string){ setTeams(ts=>ts.filter(t=>t.id!==id)); }
  function startLeague(){ if(competitorIds.length<2){ alert("Legalább 2 versenyző szükséges a bajnokság indításához."); return; } setStarted(true); setCurrentRound(1); setMatches([]); }
  function drawRound(){ if(!started) return; const unfinished = matches.filter(m=>m.round===currentRound && !m.winner); if(unfinished.length>0){ alert("Előbb rögzítsd az aktuális kör eredményeit!"); return; } const pairs = findRoundPairings(competitorIds, playedPairs); if(pairs.length===0){ alert("Nincs több új párosítás. A körmérkőzés véget ért! 🎉"); return; } const newMs:Match[] = pairs.map(([a,b])=>({ id:uid(), a,b, round: currentRound })); setMatches(ms=>[...ms, ...newMs]); }
  function recordWinner(matchId:string, winnerId?:string){ setMatches(ms=> ms.map(m=> m.id===matchId? { ...m, winner:winnerId }: m)); }
  function finalizeRound(){ const roundMs = matches.filter(m=>m.round===currentRound); if(roundMs.length===0){ alert("Nincs meccs ebben a körben."); return; } if(roundMs.some(m=>!m.winner)){ alert("Minden meccshez válaszd ki a győztest!"); return; } if(mode==="singles"){ setPlayers(ps=>{ const map=new Map(ps.map(p=>[p.id,{...p}])); roundMs.forEach(m=>{ const a=map.get(m.a)!; const b=map.get(m.b)!; if(m.winner===a.id){ a.wins+=1; b.losses+=1;} else if(m.winner===b.id){ b.wins+=1; a.losses+=1;} }); return Array.from(map.values()); }); } else { setTeams(ts=>{ const map=new Map(ts.map(t=>[t.id,{...t}])); roundMs.forEach(m=>{ const a=map.get(m.a)!; const b=map.get(m.b)!; if(m.winner===a.id){ a.wins+=1; b.losses+=1;} else if(m.winner===b.id){ b.wins+=1; a.losses+=1;} }); return Array.from(map.values()); }); } setCurrentRound(r=>r+1); }
  function resetAll(){ if(!confirm("Biztosan törlöd a teljes bajnokságot?")) return; setStarted(false); setPlayers([]); setTeams([]); setMatches([]); setCurrentRound(0); setNameInput(""); }

  const tournamentComplete = useMemo(()=>{ const n=competitorIds.length; if(n<2) return false; const totalPairs=(n*(n-1))/2; const unique = new Set(matches.map(m=>pairKey(m.a,m.b))).size; return unique>=totalPairs; }, [competitorIds, matches]);
  const freePlayersForTeams = useMemo(()=>{ const used=new Set<string>(); teams.forEach(t=>t.members.forEach(m=>used.add(m))); return players.filter(p=>!used.has(p.id)); }, [players, teams]);
  const optionsA = useMemo(()=> freePlayersForTeams.filter(p=>p.id!==teamB), [freePlayersForTeams, teamB]);
  const optionsB = useMemo(()=> freePlayersForTeams.filter(p=>p.id!==teamA), [freePlayersForTeams, teamA]);
  useEffect(()=>{ if(teamA && teamB && teamA===teamB) setTeamB(""); }, [teamA, teamB]);

  // ===== UI =====
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="mx-auto max-w-5xl p-6">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">🏸 Badminton bajnokság – közös, valós idejű tabella</h1>
          <button onClick={resetAll} className="rounded-xl border px-3 py-2 text-sm hover:bg-white">Új bajnokság</button>
        </header>

        {!started ? (
          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-white p-4 shadow">
              <h2 className="mb-2 text-lg font-semibold">Versenymód</h2>
              <div className="flex gap-2">
                <button className={`rounded-xl px-4 py-2 border ${mode === 'singles' ? 'bg-black text-white' : ''}`} onClick={() => setMode('singles')}>Egyéni</button>
                <button className={`rounded-xl px-4 py-2 border ${mode === 'doubles' ? 'bg-black text-white' : ''}`} onClick={() => setMode('doubles')}>Páros</button>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-4 shadow">
              <h2 className="mb-2 text-lg font-semibold">Játékosok ({players.length})</h2>
              <div className="flex gap-2">
                <input className="w-full rounded-xl border px-3 py-2" placeholder="Játékos neve" value={nameInput} onChange={e => setNameInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { addPlayerByName(nameInput); setNameInput(''); } }} />
                <button className="rounded-xl bg-black px-4 py-2 text-white" onClick={() => { addPlayerByName(nameInput); setNameInput(''); }}>Hozzáadás</button>
              </div>
              {players.length > 0 && (
                <ul className="mt-3 divide-y text-sm">
                  {players.map(p => (
                    <li key={p.id} className="flex items-center justify-between py-1">
                      <span>{p.name}</span>
                      <button className="text-red-600 hover:underline" onClick={() => removePlayer(p.id)}>eltávolítás</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {mode === 'doubles' && (
              <div className="md:col-span-2 rounded-2xl bg-white p-4 shadow">
                <h2 className="mb-2 text-lg font-semibold">Csapatok ({teams.length})</h2>
                {freePlayersForTeams.length < 2 ? (
                  <p className="text-sm text-gray-500">Legalább két szabad játékos kell a csapat létrehozásához.</p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <select className="rounded-xl border px-3 py-2" value={teamA} onChange={e => setTeamA(e.target.value)}>
                      <option value="">Játékos A</option>
                      {optionsA.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <span>+</span>
                    <select className="rounded-xl border px-3 py-2" value={teamB} onChange={e => setTeamB(e.target.value)}>
                      <option value="">Játékos B</option>
                      {optionsB.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <button className="rounded-xl bg-black px-4 py-2 text-white disabled:opacity-40 disabled:cursor-not-allowed" onClick={() => addTeamByMembers(teamA, teamB)} disabled={!(teamA && teamB)}>Csapat hozzáadása</button>
                  </div>
                )}
              </div>
            )}

            <div className="md:col-span-2 flex items-center justify-between rounded-2xl bg-white p-4 shadow">
              <p className="text-gray-700">Győzelem: 1 pont · Vereség: 0 pont</p>
              <button className="rounded-2xl bg-emerald-600 px-5 py-2.5 font-medium text-white hover:bg-emerald-700" onClick={startLeague} disabled={(mode === 'singles' ? players.length : teams.length) < 2}>Bajnokság indítása</button>
            </div>
          </section>
        ) : (
          <section className="grid gap-6 md:grid-cols-3">
            <div className="md:col-span-2 space-y-4">
              <div className="rounded-2xl bg-white p-4 shadow">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-lg font-semibold">{tournamentComplete ? "Bajnokság vége 🎉" : `Aktuális kör: ${currentRound}`}</h2>
                  <div className="flex gap-2">
                    {!tournamentComplete && (
                      <button className="rounded-xl border px-4 py-2 hover:bg-gray-50" onClick={drawRound}>Sorsolás</button>
                    )}
                    <button className="rounded-xl bg-black px-4 py-2 text-white" onClick={finalizeRound}>Kör lezárása</button>
                  </div>
                </div>

                {currentRoundMatches.length === 0 ? (
                  <p className="text-sm text-gray-500">Még nincs meccs ebben a körben. Kattints a <b>Sorsolás</b> gombra!</p>
                ) : (
                  <ul className="space-y-3">
                    {currentRoundMatches.map(m => (
                      <li key={m.id} className="flex items-center justify-between rounded-xl border p-3">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-gray-100 px-2 py-1 text-xs">#{m.round}</span>
                          <span className="font-medium">{competitorName(m.a)}</span>
                          <span className="text-gray-400">vs</span>
                          <span className="font-medium">{competitorName(m.b)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <label className="flex items-center gap-1">
                            <input type="radio" name={`winner-${m.id}`} checked={m.winner === m.a} onChange={() => recordWinner(m.id, m.a)} /> {competitorName(m.a)}
                          </label>
                          <label className="flex items-center gap-1">
                            <input type="radio" name={`winner-${m.id}`} checked={m.winner === m.b} onChange={() => recordWinner(m.id, m.b)} /> {competitorName(m.b)}
                          </label>
                          <button className="ml-2 text-xs text-gray-500 hover:underline" onClick={() => recordWinner(m.id, undefined)}>törlés</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-2xl bg-white p-4 shadow">
                <h3 className="mb-2 font-semibold">Meccstörténet</h3>
                {matches.length === 0 ? (
                  <p className="text-sm text-gray-500">Még nincs meccs.</p>
                ) : (
                  <ul className="divide-y">
                    {matches.slice().sort((a, b) => a.round - b.round).map(m => (
                      <li key={m.id} className="flex items-center justify-between py-2 text-sm">
                        <div>
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
              <div className="rounded-2xl bg-white p-4 shadow">
                <h2 className="mb-2 text-lg font-semibold">Tabella ({mode === 'singles' ? 'Egyéni' : 'Páros'})</h2>
                {(mode === 'singles' ? players.length : teams.length) === 0 ? (
                  <p className="text-sm text-gray-500">Nincs versenyző.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500">
                        <th className="py-1">#</th>
                        <th className="py-1">{mode === 'singles' ? 'Játékos' : 'Csapat'}</th>
                        <th className="py-1">Győzelem</th>
                        <th className="py-1">Vereség</th>
                        <th className="py-1">Pont</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.map((row, idx) => (
                        <tr key={row.id} className="border-t">
                          <td className="py-1">{idx + 1}</td>
                          <td className="py-1 font-medium">{row.name}</td>
                          <td className="py-1">{row.wins}</td>
                          <td className="py-1">{row.losses}</td>
                          <td className="py-1 font-semibold">{row.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="rounded-2xl bg-white p-4 shadow">
                <h3 className="mb-2 font-semibold">Új {mode === 'singles' ? 'játékos' : 'csapat'} hozzáadása</h3>
                {mode === 'singles' ? (
                  <div className="flex gap-2">
                    <input className="w-full rounded-xl border px-3 py-2" placeholder="Játékos neve" value={nameInput} onChange={e => setNameInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { addPlayerByName(nameInput); setNameInput(''); } }} />
                    <button className="rounded-xl bg-black px-4 py-2 text-white" onClick={() => { addPlayerByName(nameInput); setNameInput(''); }}>Hozzáadás</button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <select className="rounded-xl border px-3 py-2" value={teamA} onChange={e => setTeamA(e.target.value)}>
                      <option value="">Játékos A</option>
                      {optionsA.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <span>+</span>
                    <select className="rounded-xl border px-3 py-2" value={teamB} onChange={e => setTeamB(e.target.value)}>
                      <option value="">Játékos B</option>
                      {optionsB.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <button className="rounded-xl bg-black px-4 py-2 text-white disabled:opacity-40 disabled:cursor-not-allowed" onClick={() => addTeamByMembers(teamA, teamB)} disabled={!(teamA && teamB)}>Csapat hozzáadása</button>
                  </div>
                )}
                <p className="mt-2 text-xs text-gray-500">Az új {mode === 'singles' ? 'játékos' : 'csapat'} a <b>következő kör</b> sorsolásába automatikusan bekerül.</p>
              </div>

              <div className="rounded-2xl bg-white p-4 shadow">
                <h3 className="mb-2 font-semibold">Tippek</h3>
                <ul className="list-disc space-y-1 pl-5 text-sm text-gray-600">
                  <li>Közös, valós idejű adatbázis: Firestore.</li>
                  <li>Új versenyzők/ csapatok a következő körben jelennek meg.</li>
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
