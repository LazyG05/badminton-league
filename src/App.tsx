// 🔹 Polyfillek
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
} from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";

/**
 * =============================================================
 * BIA-TOLLAS – Biatorbágy (Badminton League)
 * DESIGN: "Pure Light" v2 (FINAL FIX)
 * - REMOVED ALL BLACK BACKGROUNDS from Matches, Tabs, Buttons.
 * - Primary Color: Lime Green (#84cc16).
 * - Backgrounds: White & Light Slate.
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
  date: string;
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

// ========================= Utils =========================
const uid = () => Math.random().toString(36).slice(2, 10);
const fmt = (d: Date) => d.toISOString().slice(0, 10);
const weekday = (dstr: string) =>
  new Date(dstr + "T12:00:00").toLocaleDateString(undefined, {
    weekday: "long",
  });
const key = (a: string, b: string) => [a, b].sort().join("::");
const getBaseName = (full: string) => full.replace(/^.+?\s/, "");

// ========================= UI Tokens =========================

// GOMBOK - Szigorúan világos vagy Lime
const btnBase =
  "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-bold transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm";

// Primary: Lime Green
const btnPrimary = `${btnBase} bg-[#84cc16] text-white hover:bg-[#65a30d] hover:shadow-md focus:ring-[#84cc16] border border-transparent`;

// Secondary: Fehér, szürke kerettel (soha nem fekete)
const btnSecondary = `${btnBase} bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-900 focus:ring-slate-300`;

// Ghost: Csak szöveg (pl. "Manage Players" lenyitó)
const btnGhost = "w-full py-2 text-xs font-bold text-slate-400 uppercase tracking-wider hover:text-[#84cc16] hover:bg-slate-50 rounded transition-colors";

// Danger
const btnDanger = `${btnBase} bg-white text-rose-600 border border-rose-200 hover:bg-rose-50 hover:border-rose-300 focus:ring-rose-400`;

const card =
  "relative overflow-hidden rounded-xl bg-white p-5 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07)] border border-slate-100";

const input =
  "w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#84cc16] focus:border-transparent transition-all";

const Icons = {
  Dashboard: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>,
  Admin: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /></svg>,
  Search: () => <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>,
  Bell: () => <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
};

export type Achievement = {
  id: string;
  title: string;
  description: string;
};

// ========================= Achievements Logic =========================
const BADGE_META: Record<string, { icon: string; accent: string; bg: string }> = {
  win5: { icon: "🥉", accent: "text-amber-700", bg: "bg-amber-50" },
  win10: { icon: "🥈", accent: "text-slate-700", bg: "bg-slate-100" },
  win25: { icon: "🥇", accent: "text-yellow-600", bg: "bg-yellow-50" },
  beatMelinda: { icon: "🎯", accent: "text-rose-600", bg: "bg-rose-50" },
  streak3: { icon: "🔥", accent: "text-orange-600", bg: "bg-orange-50" },
  streak6: { icon: "💪", accent: "text-lime-600", bg: "bg-lime-50" },
  streak10: { icon: "🏆", accent: "text-sky-600", bg: "bg-sky-50" },
  min5matches: { icon: "🏸", accent: "text-cyan-600", bg: "bg-cyan-50" },
};

export function computeAchievementsFull(playerId: string, matches: Match[], players: Player[]): Achievement[] {
  const out: Achievement[] = [];
  const playerMatches = matches.filter((m) => m.teamA.includes(playerId) || m.teamB.includes(playerId));
  let wins = 0;
  playerMatches.forEach((m) => {
    const inA = m.teamA.includes(playerId);
    const inB = m.teamB.includes(playerId);
    if (!inA && !inB) return;
    if (m.winner) {
      if ((m.winner === "A" && inA) || (m.winner === "B" && inB)) wins++;
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
      const inA = m.teamA.includes(playerId);
      const inB = m.teamB.includes(playerId);
      if (!(melInA || melInB) || !(inA || inB) || !m.winner) return false;
      if ((melInA && inA) || (melInB && inB)) return false;
      return (m.winner === "A" && inA) || (m.winner === "B" && inB);
    });
    if (beatMelinda) out.push({ id: "beatMelinda", title: "Beat Melinda!", description: "Won vs Melinda." });
  }
  if (playerMatches.length >= 5) out.push({ id: "min5matches", title: "Seasoned Player", description: "Play 5 matches." });
  const streak = computeAttendanceStreak(playerId, matches);
  if (streak >= 3) out.push({ id: "streak3", title: "Regular", description: "Streak: 3" });
  if (streak >= 6) out.push({ id: "streak6", title: "Dedicated", description: "Streak: 6" });
  if (streak >= 10) out.push({ id: "streak10", title: "Ironman", description: "Streak: 10" });
  return out;
}

const TRAINING_DAYS = [1, 3];
function nextTrainingDate(from: Date = new Date()): Date {
  const d = new Date(from);
  while (!TRAINING_DAYS.includes(d.getDay())) d.setDate(d.getDate() + 1);
  return d;
}
function computeAttendanceStreak(playerId: string, matches: Match[]): number {
  if (!matches.length) return 0;
  const allDates = Array.from(new Set(matches.map((m) => m.date))).sort();
  const playedDates = new Set<string>();
  matches.forEach((m) => {
    if (m.teamA.includes(playerId) || m.teamB.includes(playerId)) playedDates.add(m.date);
  });
  let best = 0; let current = 0;
  for (const d of allDates) {
    if (playedDates.has(d)) { current++; if (current > best) best = current; } else { current = 0; }
  }
  return best;
}
const EMOJIS = ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🐔","🐧","🐦","🐤","🦆","🦅","🦉","🐺","🦄","🐝","🐛","🦋","🐌","🐞","🐢","🐍","🦎","🐙","🦑","🦀","🐡","🐠","🐳","🐬","🐊"];

// ========================= Data Sync =========================
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
        await setDoc(ref, { players: [], matches: [], backups: [], createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
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
        try { await setDoc(doc(db, "leagues", "default"), { ...next, updatedAt: serverTimestamp() } as LeagueDoc, { merge: true }); } catch (err) { console.error(err); }
      }, 120);
      return next;
    });
  }, []);
  return [data, write] as const;
}

// ========================= Sidebar =========================
function Sidebar({ role, setRole }: { role: "player" | "admin"; setRole: (r: "player" | "admin") => void }) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="fixed left-0 top-0 h-full w-64 bg-[#1e293b] text-white flex flex-col shadow-2xl z-50 transition-transform duration-300 md:translate-x-0 -translate-x-full md:block hidden">
      {/* Logo */}
      <div className="p-6 flex flex-col items-center border-b border-slate-700/50">
        <div className="w-28 h-28 mb-4 bg-slate-800 rounded-full flex items-center justify-center overflow-hidden border-4 border-slate-700 shadow-inner relative">
            {!imgError ? (
                <img src="/logo.png" alt="Logo" className="w-full h-full object-cover" onError={() => setImgError(true)} />
            ) : (
                <span className="text-4xl">🏸</span>
            )}
        </div>
        <h1 className="text-lg font-bold tracking-wider uppercase text-slate-100">Biatorbágy</h1>
        <p className="text-xs text-[#84cc16] font-medium uppercase tracking-widest">Badminton Klub</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-4 py-6 space-y-2">
        <button
          onClick={() => setRole("player")}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium ${role === "player" ? "bg-[#84cc16] text-white shadow-lg shadow-lime-900/20" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}
        >
          <Icons.Dashboard />
          Dashboard
        </button>
        <button
          onClick={() => setRole("admin")}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium ${role === "admin" ? "bg-[#84cc16] text-white shadow-lg shadow-lime-900/20" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}
        >
          <Icons.Admin />
          Admin Panel
        </button>
      </nav>

      {/* Guest */}
      <div className="p-4 border-t border-slate-700/50">
        <div className="flex items-center gap-3 px-2">
            <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-xl">👤</div>
            <div>
                <p className="text-sm font-semibold text-white">Guest User</p>
                <p className="text-xs text-slate-400">View only mode</p>
            </div>
        </div>
      </div>
    </div>
  );
}

function MobileHeader({ role, setRole }: { role: "player" | "admin"; setRole: (r: "player" | "admin") => void }) {
    return (
        <div className="md:hidden bg-[#1e293b] text-white p-4 flex justify-between items-center shadow-md mb-4 rounded-b-xl">
            <div className="flex items-center gap-3">
                 <div className="w-8 h-8 bg-[#84cc16] rounded-full flex items-center justify-center font-bold">B</div>
                 <span className="font-bold">Biatorbágy Badminton</span>
            </div>
            <div className="flex text-xs bg-slate-700 rounded-lg p-1">
                <button onClick={() => setRole("player")} className={`px-3 py-1 rounded ${role==="player"?"bg-[#84cc16] text-white":"text-slate-300"}`}>Player</button>
                <button onClick={() => setRole("admin")} className={`px-3 py-1 rounded ${role==="admin"?"bg-[#84cc16] text-white":"text-slate-300"}`}>Admin</button>
            </div>
        </div>
    )
}

// ========================= Features =========================

function DatePicker({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  return (
    <div className={card}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Session Date</h2>
          <p className="text-sm text-slate-500 font-medium mt-1">Manage matches for this day.</p>
        </div>
        <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-lg border border-slate-200">
             <span className="text-xs font-bold text-[#84cc16] uppercase px-2">{weekday(value)}</span>
             <input className="bg-transparent text-slate-700 font-bold focus:outline-none cursor-pointer" type="date" value={value} onChange={(e) => onChange(e.target.value)} />
        </div>
      </div>
    </div>
  );
}

function AttendanceList({ players, presentIds, setPresentIds }: any) {
  const isPresent = (id: string) => presentIds.includes(id);
  const toggle = (id: string) => setPresentIds(isPresent(id) ? presentIds.filter((p:string) => p !== id) : [...presentIds, id]);
  const sorted = useMemo(() => [...players].sort((a:any,b:any) => a.name.localeCompare(b.name, "hu")), [players]);
  return (
    <div className={card}>
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-slate-800">Attendance ({presentIds.length})</h3>
        <div className="flex gap-2">
            <button className={`${btnSecondary} text-xs py-1`} onClick={() => setPresentIds(players.map((p:any) => p.id))}>All</button>
            <button className={`${btnSecondary} text-xs py-1`} onClick={() => setPresentIds([])}>None</button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
        {sorted.map((p: any) => (
          <button key={p.id} onClick={() => toggle(p.id)} className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm border transition-all ${isPresent(p.id) ? "bg-[#f0fdf4] border-[#84cc16] text-slate-800" : "bg-white border-slate-100 text-slate-400 hover:bg-slate-50"}`}>
            <span className="truncate font-medium">{p.name}</span>
            {isPresent(p.id) && <div className="w-2 h-2 rounded-full bg-[#84cc16]" />}
          </button>
        ))}
      </div>
    </div>
  );
}

function AdminDateJump({ grouped, date, setDate }: any) {
  return (
    <div className={card}>
        <h3 className="font-bold text-slate-800 mb-3">Jump to Date</h3>
        {grouped.length === 0 ? <p className="text-sm text-slate-400">No sessions yet.</p> : (
            <ul className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {grouped.map((g:any) => (
                    <li key={g.date}>
                        {/* FIX: Removed dark bg classes explicitly */}
                        <button 
                            onClick={() => setDate(g.date)} 
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm flex justify-between border ${
                                date === g.date 
                                    ? "bg-[#f0fdf4] border-[#84cc16] text-[#65a30d] font-bold" 
                                    : "bg-white border-slate-100 text-slate-600 hover:bg-slate-50"
                            }`}
                        >
                            <span>{g.date}</span>
                            <span className="text-xs opacity-60">{weekday(g.date)}</span>
                        </button>
                    </li>
                ))}
            </ul>
        )}
    </div>
  )
}

function PlayerEditor({ players, onAdd, onRemove, onUpdateEmoji, onUpdateGender }: any) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  
  useEffect(() => { if(!selectedPlayerId && players.length) setSelectedPlayerId(players[0].id); }, [players, selectedPlayerId]);
  const selectedPlayer = players.find((p:any) => p.id === selectedPlayerId);

  return (
    <div className={card}>
      <h3 className="font-bold text-slate-800 mb-4">Add Player</h3>
      <div className="flex gap-2 mb-4">
        <button className="text-2xl bg-slate-50 rounded-lg w-12 h-10 border border-slate-200 flex items-center justify-center" onClick={() => setShowEmoji(!showEmoji)}>{emoji}</button>
        <input className={input} placeholder="Name..." value={name} onChange={e => setName(e.target.value)} />
        <button className={btnPrimary} onClick={() => { if(name) { onAdd(`${emoji} ${name}`); setName(""); } }}>Add</button>
      </div>
      {showEmoji && (
          <div className="flex gap-1 overflow-x-auto pb-2 mb-2">
              {EMOJIS.map(e => <button key={e} onClick={() => { setEmoji(e); setShowEmoji(false); }} className="text-xl hover:bg-slate-100 p-1 rounded">{e}</button>)}
          </div>
      )}

      {/* FIX: Ghost button instead of dark block */}
      <button onClick={() => setShowManage(!showManage)} className={btnGhost}>
          {showManage ? "Hide Options ⏶" : "Manage Players / Options ⏷"}
      </button>

      {showManage && (
          <div className="border-t border-slate-100 pt-3 space-y-3">
              <select className={input} value={selectedPlayerId} onChange={(e) => setSelectedPlayerId(e.target.value)}>
                   {players.map((p:any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {selectedPlayer && (
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-3">
                      <div>
                          <div className="text-xs font-bold text-slate-400 uppercase mb-1">Gender</div>
                          <div className="flex gap-2">
                              {["M", "F", null].map(g => (
                                  <button key={String(g)} onClick={() => onUpdateGender(selectedPlayer.id, g)} className={`px-3 py-1 text-xs rounded-full border ${selectedPlayer.gender === g ? "bg-[#84cc16] text-white border-[#84cc16]" : "bg-white text-slate-500 border-slate-200"}`}>
                                      {g === "M" ? "Man" : g === "F" ? "Woman" : "Not Set"}
                                  </button>
                              ))}
                          </div>
                      </div>
                      <div>
                          <div className="text-xs font-bold text-slate-400 uppercase mb-1">Change Emoji</div>
                          <div className="flex gap-1 overflow-x-auto pb-2">
                            {EMOJIS.slice(0,8).map(e => <button key={e} onClick={() => onUpdateEmoji(selectedPlayer.id, e)} className="text-lg hover:scale-110 transition-transform">{e}</button>)}
                          </div>
                      </div>
                      <button onClick={() => onRemove(selectedPlayer.id)} className={`${btnDanger} w-full py-1 text-xs`}>Remove Player</button>
                  </div>
              )}
          </div>
      )}
    </div>
  );
}

function SelectPairs({ players, freeIds, seenTeammates, onCreate }: any) {
  const [a1, setA1] = useState(""); const [a2, setA2] = useState("");
  const [b1, setB1] = useState(""); const [b2, setB2] = useState("");
  
  const create = () => { onCreate([a1, a2], [b1, b2]); setA1(""); setA2(""); setB1(""); setB2(""); };
  const allIds = [a1, a2, b1, b2].filter(Boolean);
  const isValid = allIds.length === 4 && new Set(allIds).size === 4;

  const pairA = [a1, a2].sort().join("::");
  const pairB = [b1, b2].sort().join("::");
  const warnA = a1 && a2 && seenTeammates.has(pairA);
  const warnB = b1 && b2 && seenTeammates.has(pairB);
  
  const renderSelect = (val: string, set: any, label: string) => (
      <div className="flex-1">
          <label className="text-[10px] uppercase font-bold text-slate-400">{label}</label>
          <select className={`${input} text-sm py-1`} value={val} onChange={e => set(e.target.value)}>
              <option value="" disabled>-</option>
              {players.map((p:any) => (
                  <option key={p.id} value={p.id} disabled={allIds.includes(p.id) && p.id !== val}>
                      {p.name} {freeIds && !freeIds.includes(p.id) ? "(played)" : ""}
                  </option>
              ))}
          </select>
      </div>
  );

  return (
      <div className={card}>
          <h3 className="font-bold text-slate-800 mb-3">Manual Match</h3>
          <div className="flex gap-2 mb-2">
              <div className={`flex-1 space-y-2 p-2 rounded-lg border ${warnA ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-100"}`}>
                  <div className="flex justify-between">
                      <div className="text-xs font-bold text-[#84cc16]">TEAM A</div>
                      {warnA && <span className="text-[10px] text-amber-600 font-bold">⚠️ Played</span>}
                  </div>
                  <div className="flex gap-2">{renderSelect(a1, setA1, "P1")}{renderSelect(a2, setA2, "P2")}</div>
              </div>
              <div className={`flex-1 space-y-2 p-2 rounded-lg border ${warnB ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-100"}`}>
                  <div className="flex justify-between">
                      <div className="text-xs font-bold text-rose-500">TEAM B</div>
                      {warnB && <span className="text-[10px] text-amber-600 font-bold">⚠️ Played</span>}
                  </div>
                  <div className="flex gap-2">{renderSelect(b1, setB1, "P1")}{renderSelect(b2, setB2, "P2")}</div>
              </div>
          </div>
          <button onClick={create} disabled={!isValid} className={`${btnPrimary} w-full`}>Add Match</button>
      </div>
  )
}

function DrawMatches({ players, presentIds, matchesForDate, date, league, write }: any) {
  const presentPlayers = players.filter((p:any) => presentIds.includes(p.id));
  const canDraw = presentPlayers.length >= 4;

  const draw = () => {
    if (!canDraw) return;
    const getScore = (pid: string) => {
        let s = 0; let mC = 0;
        matchesForDate.forEach((m:any) => {
            if(!m.winner) return;
            const inA = m.teamA.includes(pid); const inB = m.teamB.includes(pid);
            if(!inA && !inB) return;
            mC++;
            if((m.winner==="A"&&inA)||(m.winner==="B"&&inB)) s++;
        });
        return { id: pid, score: s, matches: mC };
    };
    const sorted = presentPlayers.map((p:any) => p.id).map(getScore).sort((a:any,b:any) => (b.score - a.score) || (b.matches - a.matches));
    
    // Simple pairing
    const newMatches: Match[] = [];
    const pool = sorted.map((s:any) => s.id);
    const teams: Pair[] = [];
    while(pool.length >= 2) { teams.push([pool[0], pool[pool.length-1]]); pool.shift(); pool.pop(); }
    while(teams.length >= 2) { newMatches.push({ id: uid(), date, teamA: teams[0], teamB: teams[1] }); teams.shift(); teams.shift(); }
    write({ matches: [...league.matches, ...newMatches] });
  };

  return (
    <div className={card}>
        <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-slate-800">Auto Draw</h3>
            <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded">3 Rounds</span>
        </div>
        <p className="text-xs text-slate-500 mb-4">Generate matches based on today's performance.</p>
        <button onClick={draw} disabled={!canDraw} className={`${btnPrimary} w-full`}>
            Generate Matches
        </button>
    </div>
  );
}

function MatchesList({ matches, nameOf, onPick, onDelete, onClear, isAdmin }: any) {
    return (
        <div className={card}>
            <h3 className="font-bold text-slate-800 mb-4">Matches ({matches.length})</h3>
            {matches.length === 0 ? <p className="text-sm text-slate-400">No matches found.</p> : (
                <div className="space-y-3">
                    {matches.map((m:any) => (
                        <div key={m.id} className="border border-slate-100 rounded-xl p-3 bg-slate-50/30">
                            <div className="flex justify-between items-center text-sm mb-2">
                                <span className={`font-bold ${m.winner==='A'?'text-[#84cc16]':'text-slate-700'}`}>{nameOf(m.teamA[0])} & {nameOf(m.teamA[1])}</span>
                                <span className="text-xs text-slate-400">vs</span>
                                <span className={`font-bold ${m.winner==='B'?'text-[#84cc16]':'text-slate-700'}`}>{nameOf(m.teamB[0])} & {nameOf(m.teamB[1])}</span>
                            </div>
                            {isAdmin && (
                                <div className="flex gap-2 mt-2">
                                    <button onClick={() => onPick(m.id, 'A')} className={`flex-1 py-1 text-xs rounded font-bold ${m.winner==='A'?'bg-[#84cc16] text-white':'bg-white border hover:bg-slate-50'}`}>A Wins</button>
                                    <button onClick={() => onPick(m.id, 'B')} className={`flex-1 py-1 text-xs rounded font-bold ${m.winner==='B'?'bg-[#84cc16] text-white':'bg-white border hover:bg-slate-50'}`}>B Wins</button>
                                    {m.winner && <button onClick={() => onClear(m.id)} className="px-2 bg-slate-200 rounded text-xs hover:bg-slate-300 transition">↺</button>}
                                    <button onClick={() => onDelete(m.id)} className="px-2 text-rose-500 font-bold hover:text-rose-700 transition">✕</button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

function MatchesPlayer({ grouped, nameOf }: any) {
    const [openDate, setOpenDate] = useState<string | null>(null);
    useEffect(() => { if(grouped.length && !openDate) setOpenDate(grouped[0].date); }, [grouped]);

    return (
        <div className="space-y-4">
             {grouped.map((g:any) => {
                 const isOpen = openDate === g.date;
                 return (
                    <div key={g.date} className={card}>
                        {/* FIX: Explicit light classes for toggle header */}
                        <button 
                            onClick={() => setOpenDate(isOpen ? null : g.date)} 
                            className={`w-full flex justify-between items-center p-2 rounded-lg transition-colors ${
                                isOpen ? "bg-slate-50" : "hover:bg-slate-50"
                            }`}
                        >
                            <div className="text-left">
                                <h3 className="font-bold text-slate-800 text-lg">{g.date}</h3>
                                <p className="text-xs text-slate-400 uppercase font-bold">{weekday(g.date)} • {g.matches.length} matches</p>
                            </div>
                            <span className="text-slate-400 font-bold">{isOpen ? "▲" : "▼"}</span>
                        </button>
                        {isOpen && (
                            <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                                {g.matches.map((m:any) => (
                                    <div key={m.id} className="flex justify-between items-center text-sm p-2 bg-slate-50 rounded-lg border border-slate-100">
                                        <div className={`${m.winner==='A'?'font-bold text-[#84cc16]':'text-slate-600'}`}>{nameOf(m.teamA[0])} & {nameOf(m.teamA[1])}</div>
                                        <div className="text-xs text-slate-300">vs</div>
                                        <div className={`${m.winner==='B'?'font-bold text-[#84cc16]':'text-slate-600'}`}>{nameOf(m.teamB[0])} & {nameOf(m.teamB[1])}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                 )
             })}
        </div>
    )
}

function Standings({ rows }: any) {
  const [tab, setTab] = useState<"All"|"Women"|"Men">("All");

  const filteredRows = useMemo(() => {
      if (tab === "All") return rows;
      const targetGender = tab === "Men" ? "M" : "F";
      return rows.filter((r:any) => r.gender === targetGender);
  }, [rows, tab]);

  return (
    <div className={card}>
      <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-3">
        <h3 className="font-bold text-slate-800 text-lg">League Standings</h3>
        
        {/* FIX: Light/Gray Pill Tabs, NO BLACK */}
        <div className="flex bg-slate-100 p-1 rounded-lg">
            {["All", "Women", "Men"].map(t => (
                <button
                    key={t}
                    onClick={() => setTab(t as any)}
                    className={`px-4 py-1 text-xs font-bold rounded-md transition-all ${
                        tab === t 
                            ? "bg-white text-[#84cc16] shadow-sm" 
                            : "text-slate-500 hover:text-slate-700"
                    }`}
                >
                    {t}
                </button>
            ))}
        </div>
      </div>

      <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-400 uppercase bg-slate-50/50 border-b border-slate-100">
                  <tr>
                      <th className="px-4 py-3">Rank</th>
                      <th className="px-4 py-3">Player</th>
                      <th className="px-4 py-3">Points</th>
                      <th className="px-4 py-3">Win %</th>
                      <th className="px-4 py-3">Matches</th>
                  </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                  {filteredRows.map((r:any, i:number) => (
                      <tr key={r.id} className={`hover:bg-slate-50/50 transition-colors ${!r.qualified ? "opacity-60" : ""}`}>
                          <td className="px-4 py-3 font-bold text-slate-500">#{i+1}</td>
                          <td className="px-4 py-3 font-bold text-slate-700">
                              {r.name}
                              {!r.qualified && <span className="ml-2 text-[10px] text-rose-400 font-normal">(qualifying)</span>}
                          </td>
                          <td className="px-4 py-3 font-black text-slate-800">{r.totalPoints}</td>
                          <td className="px-4 py-3 text-[#84cc16] font-bold">{r.winRate}%</td>
                          <td className="px-4 py-3 text-slate-500">{r.matches}</td>
                      </tr>
                  ))}
                  {filteredRows.length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-xs italic">No players found in this category.</td></tr>
                  )}
              </tbody>
          </table>
      </div>
    </div>
  );
}

function PlayerAchievements({ players, matches, meId }: { players: Player[]; matches: Match[]; meId: string }) {
  const me = players.find((p) => p.id === meId);
  if (!me || !players.length) return null;
  const ach = computeAchievementsFull(meId, matches, players);

  return (
    <div className={card}>
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-400">Achievements</h3>
      {ach.length === 0 ? (
        <p className="text-sm text-slate-400">No badges yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {ach.map((a) => {
            const meta = BADGE_META[a.id] || { icon: "⭐", accent: "text-slate-600", bg: "bg-slate-50" };
            return (
              <div key={a.id} className={`flex items-center gap-2 rounded-lg px-3 py-2 ${meta.bg} border border-transparent`}>
                <span className={`text-lg ${meta.accent}`}>{meta.icon}</span>
                <div className="flex flex-col">
                  <span className={`text-xs font-bold ${meta.accent}`}>{a.title}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PlayerStats({ players, matches, meId, setMeId }: any) {
  const stats = useMemo(() => {
    if(!meId) return null;
    let w=0, l=0, mC=0;
    matches.forEach((m:any) => {
        if(!m.winner) return;
        const inA = m.teamA.includes(meId); const inB = m.teamB.includes(meId);
        if(!inA && !inB) return;
        mC++;
        if((m.winner==="A" && inA) || (m.winner==="B" && inB)) w++; else l++;
    });
    return { wins:w, losses:l, matches:mC, rate: mC?Math.round(w/mC*100):0 };
  }, [meId, matches]);

  return (
      <div className={card}>
          <h3 className="font-bold text-slate-800 mb-3">My Stats</h3>
          <div className="w-full">
            <select className={`${input} w-full`} value={meId} onChange={e => setMeId(e.target.value)}>
                {players.map((p:any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {stats && (
              <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                  <div className="bg-slate-50 p-2 rounded-lg"><div className="text-xl font-black text-slate-800">{stats.matches}</div><div className="text-xs text-slate-400">Matches</div></div>
                  <div className="bg-[#f0fdf4] p-2 rounded-lg"><div className="text-xl font-black text-[#84cc16]">{stats.wins}</div><div className="text-xs text-lime-700">Wins</div></div>
                  <div className="bg-slate-50 p-2 rounded-lg"><div className="text-xl font-black text-slate-800">{stats.rate}%</div><div className="text-xs text-slate-400">Rate</div></div>
              </div>
          )}
      </div>
  )
}

// ========================= MAIN APP =========================
export default function App() {
  const [league, write] = useLeague();
  const { players, matches } = league;
  const [role, setRole] = useState<"player" | "admin">("player");
  const [date, setDate] = useState(fmt(nextTrainingDate()));
  const [presentIds, setPresentIds] = useState<string[]>([]);
  const matchesForDate = useMemo(() => matches.filter(m => m.date === date), [matches, date]);
  const [meId, setMeId] = useState("");
  
  const grouped = useMemo(() => {
      const map = new Map<string, Match[]>();
      [...matches].reverse().forEach(m => { if(!map.has(m.date)) map.set(m.date, []); map.get(m.date)!.push(m); });
      return Array.from(map.entries()).map(([date, matches]) => ({ date, matches }));
  }, [matches]);

  useEffect(() => { if(players.length && !meId) setMeId(players[0].id); }, [players, meId]);

  const standings = useMemo(() => {
    const s = new Map();
    const MIN_MATCHES = 5;
    players.forEach(p => s.set(p.id, { ...p, wins:0, matches:0, totalPoints:0, qualified: false }));
    matches.forEach(m => {
        if(!m.winner) return;
        [...m.teamA,...m.teamB].forEach(id => { const d = s.get(id); if(d) d.matches++; });
        const w = m.winner==='A'?m.teamA:m.teamB;
        w.forEach(id => { const d = s.get(id); if(d) { d.wins++; d.totalPoints+=3; } });
        const l = m.winner==='A'?m.teamB:m.teamA;
        l.forEach(id => { const d = s.get(id); if(d) d.totalPoints+=1; });
    });
    return Array.from(s.values()).map((p:any) => ({ 
        ...p, 
        winRate: p.matches?Math.round(p.wins/p.matches*100):0,
        qualified: p.matches >= MIN_MATCHES
    })).sort((a,b) => b.totalPoints - a.totalPoints);
  }, [players, matches]);

  const addPlayer = (name: string) => write({ players: [...players, { id: uid(), name }] });
  const removePlayer = (id: string) => write({ players: players.filter(p => p.id !== id) });
  const updatePlayerEmoji = (id:string, emoji:string) => {
      write({ players: players.map(p => p.id === id ? { ...p, name: `${emoji} ${getBaseName(p.name)}` } : p) });
  };
  const updatePlayerGender = (id:string, g: "M"|"F"|null) => {
      write({ players: players.map(p => p.id === id ? { ...p, gender: g??undefined } : p) });
  };
  const nameOf = (id: string) => players.find(p => p.id === id)?.name || "Unknown";
  const pickWinner = (id: string, w: "A"|"B") => write({ matches: matches.map(m => m.id === id ? { ...m, winner: w } : m) });
  const clearWinner = (id: string) => write({ matches: matches.map(m => { if(m.id===id) { const {winner,...rest}=m; return rest as Match; } return m; }) });
  const deleteMatch = (id: string) => write({ matches: matches.filter(m => m.id !== id) });
  const createMatch = (tA: Pair, tB: Pair) => write({ matches: [...matches, { id: uid(), date, teamA: tA, teamB: tB }] });

  const playedToday = new Set<string>();
  matchesForDate.forEach(m => { [...m.teamA, ...m.teamB].forEach(id => playedToday.add(id)); });
  const freeIds = presentIds.filter(id => !playedToday.has(id));
  const seenTeammates = new Set<string>();
  matchesForDate.forEach(m => { if(m.winner) { seenTeammates.add(key(m.teamA[0], m.teamA[1])); seenTeammates.add(key(m.teamB[0], m.teamB[1])); }});

  return (
    <div className="min-h-screen bg-[#f1f5f9] font-sans text-slate-900 flex flex-col md:flex-row">
      <Sidebar role={role} setRole={setRole} />
      <MobileHeader role={role} setRole={setRole} />

      <div className="flex-1 md:ml-64 p-4 md:p-8 transition-all w-full max-w-[100vw] overflow-x-hidden">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
                {role === "admin" ? "Admin Dashboard" : "Player Dashboard"}
            </h1>
            <p className="text-slate-500 text-sm mt-1">Biatorbágy Badminton Klub</p>
          </div>
          <div className="flex items-center gap-4 w-full md:w-auto">
              <div className="relative w-full md:w-auto">
                  <span className="absolute left-3 top-2.5 text-slate-400"><Icons.Search /></span>
                  <input className="pl-10 pr-4 py-2 bg-white rounded-full border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#84cc16] w-full md:w-64 shadow-sm" placeholder="Search..." />
              </div>
              <button className="p-2 bg-white rounded-full border border-slate-200 hover:bg-slate-50 text-slate-500 shadow-sm"><Icons.Bell /></button>
          </div>
        </header>

        {role === "admin" ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="space-y-6 lg:col-span-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <DatePicker value={date} onChange={setDate} />
                        <DrawMatches players={players} presentIds={presentIds} matchesForDate={matchesForDate} date={date} league={league} write={write} />
                    </div>
                    <AttendanceList players={players} presentIds={presentIds} setPresentIds={setPresentIds} />
                    <MatchesList matches={matchesForDate} nameOf={nameOf} onPick={pickWinner} onDelete={deleteMatch} onClear={clearWinner} isAdmin={true} />
                    <SelectPairs players={players} freeIds={freeIds} seenTeammates={seenTeammates} onCreate={createMatch} />
                </div>
                <div className="space-y-6">
                    <PlayerEditor players={players} onAdd={addPlayer} onRemove={removePlayer} onUpdateEmoji={updatePlayerEmoji} onUpdateGender={updatePlayerGender} />
                    <AdminDateJump grouped={grouped} date={date} setDate={setDate} />
                    <Standings rows={standings} />
                </div>
            </div>
        ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="space-y-6 lg:col-span-2">
                     {/* Dashboard: Standings legfelül */}
                     <Standings rows={standings} />
                     {/* Alatta a meccsek */}
                     <MatchesPlayer grouped={grouped} nameOf={nameOf} />
                </div>
                <div className="space-y-6 min-w-0">
                     <PlayerStats players={players} matches={matches} meId={meId} setMeId={setMeId} />
                     <PlayerAchievements players={players} matches={matches} meId={meId} />
                </div>
            </div>
        )}
      </div>
    </div>
  );
}