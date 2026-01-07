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
 * BIA-TOLLAS – Biatorbágy Badminton
 * DESIGN: "Hybrid Pro" v8
 * - Feature 1: "Brand Stripe" on all cards (Lime->Teal Gradient)
 * - Feature 2: "Glassmorphism" Logo container in Sidebar
 * - Feature 3: "Deep Atmosphere" Sidebar background (Blobs)
 * - Kept: Watermark, Light Mode buttons, No Black.
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
const db = getFirestore(app, "default");

console.log("🔥 Firebase projectId:", import.meta.env.VITE_FIREBASE_PROJECT_ID);

// belső mező, csak debugra
// eslint-disable-next-line @typescript-eslint/no-explicit-any
console.log(
  "🔥 Firestore databaseId:",
  (db as any)?._databaseId?.database
);


// ========================= Utils =========================
const uid = () => Math.random().toString(36).slice(2, 10);
const fmt = (d: Date) => d.toISOString().slice(0, 10);
const weekday = (dstr: string) =>
  new Date(dstr + "T12:00:00").toLocaleDateString(undefined, {
    weekday: "long",
  });
const key = (a: string, b: string) => [a, b].sort().join("::");
const getBaseName = (full: string) => full.replace(/^.+?\s/, "");
const isSinglesMatch = (m: Match) => !m.teamA[1] && !m.teamB[1];
const formatTeam = (team: Pair, nameOf: (id: string) => string) =>
  team[1] ? `${nameOf(team[0])} & ${nameOf(team[1])}` : `${nameOf(team[0])}`;
const isHiddenFromStandings = (p: Player) =>
  getBaseName(p.name).trim().toLowerCase() === "orsi";
// ========================= UI Tokens =========================

// 🎨 DESIGN SYSTEM: COLORS & SHAPES

// 1. A Sportos Csík (Brand Stripe)
const BrandStripe = () => (
  <div className="h-1.5 w-full bg-gradient-to-r from-[#84cc16] via-teal-500 to-slate-700" />
);

// 2. Gombok
const btnBase =
  "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-bold transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm";

const btnPrimary = `${btnBase} bg-[#84cc16] text-white hover:bg-[#65a30d] hover:shadow-md focus:ring-[#84cc16] border border-transparent`;
const btnSecondary = `${btnBase} bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 focus:ring-slate-200`;
const btnGhost = "w-full py-2 text-xs font-bold text-slate-500 uppercase tracking-wider bg-white hover:text-[#84cc16] hover:bg-slate-50 rounded transition-colors border border-transparent hover:border-slate-100 cursor-pointer";
const btnDanger = `${btnBase} bg-white text-rose-600 border border-rose-200 hover:bg-rose-50 hover:border-rose-300 focus:ring-rose-200`;

// 3. Kártya alap (Most már padding nélkül a külső konténeren, hogy a csík kilógjon)
const cardContainer =
  "relative overflow-hidden rounded-xl bg-white shadow-[0_4px_20px_-5px_rgba(0,0,0,0.05)] border border-slate-100 z-10 flex flex-col";

// Kártya belső padding
const cardContent = "p-5 flex-1";

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

const ALL_BADGES: Achievement[] = [
    { id: "win5", title: "Novice Winner", description: "Win 5 matches." },
    { id: "win10", title: "Pro Winner", description: "Win 10 matches." },
    { id: "win25", title: "Champion", description: "Win 25 matches." },
    { id: "beatMelinda", title: "Beat Melinda!", description: "Win vs Melinda." },
    { id: "streak3", title: "Regular", description: "3 sessions in a row." },
    { id: "streak6", title: "Dedicated", description: "6 sessions in a row." },
    { id: "streak10", title: "Ironman", description: "10 sessions in a row." },
    { id: "min5matches", title: "Seasoned Player", description: "Play 5 matches." }
  ];

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

const ADMIN_PIN = "2051"; // ide írd a saját 4 jegyű PIN kódod

// ========================= Data Sync =========================
// ========================= Data Sync =========================
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

  // Patch-style write (merge), debounced
  const write = useCallback((patch: Partial<LeagueDoc>) => {
    if (tRef.current) window.clearTimeout(tRef.current);

    setData((prev) => {
      const next = { ...prev, ...patch };

      if (suppress.current) return next;

      tRef.current = window.setTimeout(async () => {
        try {
          await setDoc(
            doc(db, "leagues", "default"),
            { ...next, updatedAt: serverTimestamp() } as LeagueDoc,
            { merge: true }
          );
        } catch (err) {
          console.error(err);
        }
      }, 120);

      return next;
    });
  }, []);

  // Full replace (NO merge) – for restore/import use-cases
  const replaceAll = useCallback(async (next: LeagueDoc) => {
    // local UI update immediately
    suppress.current = true;
    setData(next);
    setTimeout(() => (suppress.current = false), 0);

    const payload: LeagueDoc = {
      players: Array.isArray(next.players) ? next.players : [],
      matches: Array.isArray(next.matches) ? next.matches : [],
      backups: Array.isArray(next.backups) ? next.backups : [],
      title: next.title,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(doc(db, "leagues", "default"), payload as LeagueDoc, {
        merge: false,
      });
    } catch (err) {
      console.error(err);
    }
  }, []);

  return [data, write, replaceAll] as const;
}

// ========================= Sidebar =========================
function Sidebar({ role, setRole }: { role: "player" | "admin"; setRole: (r: "player" | "admin") => void }) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="fixed left-0 top-0 h-full w-64 bg-[#1e293b] text-white flex flex-col shadow-2xl z-50 transition-transform duration-300 md:translate-x-0 -translate-x-full md:block hidden overflow-hidden">
      
      {/* 🟢 DEKORÁCIÓ: Háttér "Blobs" (Deep Atmosphere) */}
      <div className="absolute -top-20 -left-20 w-60 h-60 bg-[#84cc16] rounded-full blur-[80px] opacity-10 pointer-events-none"></div>
      <div className="absolute bottom-0 right-0 w-60 h-60 bg-teal-500 rounded-full blur-[80px] opacity-10 pointer-events-none"></div>

      {/* 🟢 LOGO: Glassmorphism Design */}
      <div className="p-6 flex flex-col items-center border-b border-white/5 relative z-10">
        <div className="relative w-40 h-40 mb-6 flex items-center justify-center">
            {/* Háttérfény (Glow) */}
            <div className="absolute inset-0 bg-[#84cc16] rounded-full blur-2xl opacity-20"></div>
            
            {/* Üveg Konténer */}
            <div className="relative w-full h-full bg-white/5 backdrop-blur-md border border-white/10 rounded-full flex items-center justify-center shadow-2xl overflow-hidden p-1">
                {!imgError ? (
                    <img src="/logo.png" alt="Logo" className="w-full h-full object-cover rounded-full" onError={() => setImgError(true)} />
                ) : (
                    <span className="text-4xl">🏸</span>
                )}
            </div>
        </div>
        <h1 className="text-xl font-black tracking-wider uppercase text-white drop-shadow-md">Biatorbágy</h1>
        <p className="text-xs text-[#84cc16] font-bold uppercase tracking-[0.2em] mt-1">Badminton</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-4 py-6 space-y-2 relative z-10">
        <button
          onClick={() => setRole("player")}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium border ${role === "player" ? "bg-[#84cc16] border-[#84cc16] text-white shadow-lg shadow-lime-900/20" : "bg-transparent border-transparent text-slate-400 hover:bg-white/5 hover:text-white"}`}
        >
          <Icons.Dashboard />
          Dashboard
        </button>
        <button
          onClick={() => setRole("admin")}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium border ${role === "admin" ? "bg-[#84cc16] border-[#84cc16] text-white shadow-lg shadow-lime-900/20" : "bg-transparent border-transparent text-slate-400 hover:bg-white/5 hover:text-white"}`}
        >
          <Icons.Admin />
          Admin Panel
        </button>
      </nav>

      {/* Guest */}
      <div className="p-4 border-t border-white/5 relative z-10">
        <div className="flex items-center gap-3 px-2">
            <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-xl border border-white/10">👤</div>
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
        <div className="md:hidden bg-[#1e293b] text-white p-4 flex justify-between items-center shadow-md mb-4 rounded-b-xl z-50 relative overflow-hidden">
             {/* Mobile Decor */}
             <div className="absolute top-0 right-0 w-32 h-32 bg-[#84cc16] rounded-full blur-[50px] opacity-10 pointer-events-none"></div>

       <div className="flex items-center gap-3 relative z-10">
  {/* Kicsi, kerek logó konténer */}
  <div className="w-10 h-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center overflow-hidden shadow-lg">
    <img
      src="/logo.png"
      alt="Biatorbágy Badminton logo"
      className="w-full h-full object-cover"
    />
  </div>

  {/* Szöveges rész mellette */}
  <div className="flex flex-col">
    <span className="font-bold tracking-wide text-sm">
      Biatorbágy Badminton
    </span>
  </div>
</div>

            <div className="flex text-xs bg-slate-800/50 backdrop-blur-sm rounded-lg p-1 border border-white/5 relative z-10">
                <button onClick={() => setRole("player")} className={`px-3 py-1 rounded ${role==="player"?"bg-[#84cc16] text-white":"text-slate-300"}`}>Player</button>
                <button onClick={() => setRole("admin")} className={`px-3 py-1 rounded ${role==="admin"?"bg-[#84cc16] text-white":"text-slate-300"}`}>Admin</button>
            </div>
        </div>
    )
}

// ========================= Features =========================

function DatePicker({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  return (
    <div className={cardContainer}>
      <BrandStripe />
      <div className={cardContent}>
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
    </div>
  );
}

function AttendanceList({ players, presentIds, setPresentIds }: any) {
  const isPresent = (id: string) => presentIds.includes(id);
  const toggle = (id: string) => setPresentIds(isPresent(id) ? presentIds.filter((p:string) => p !== id) : [...presentIds, id]);
  const sorted = useMemo(() => [...players].sort((a:any,b:any) => a.name.localeCompare(b.name, "hu")), [players]);
  return (
    <div className={cardContainer}>
      <BrandStripe />
      <div className={cardContent}>
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
    </div>
  );
}

function AdminDateJump({ grouped, date, setDate }: any) {
  return (
    <div className={cardContainer}>
        <BrandStripe />
        <div className={cardContent}>
            <h3 className="font-bold text-slate-800 mb-3">Jump to Date</h3>
            {grouped.length === 0 ? <p className="text-sm text-slate-400">No sessions yet.</p> : (
                <ul className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {grouped.map((g:any) => (
                        <li key={g.date}>
                            <button 
                                onClick={() => setDate(g.date)} 
                                className={`w-full text-left px-3 py-2 rounded-lg text-sm flex justify-between border transition-all ${
                                    date === g.date 
                                        ? "bg-[#f0fdf4] border-[#84cc16] text-[#65a30d] font-bold shadow-sm" 
                                        : "bg-white border-slate-100 text-slate-600 hover:bg-slate-50 hover:border-slate-200"
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
    </div>
  )
}

function ImportExportCard({
  league,
  onReplace,
}: {
  league: LeagueDoc;
  onReplace: (doc: LeagueDoc) => Promise<void> | void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const download = (filename: string, content: string) => {
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const buildExport = () => {
    const bundle = {
      version: 1,
      exportedAt: new Date().toISOString(),
      league: {
        title: league.title ?? "",
        players: league.players ?? [],
        matches: league.matches ?? [],
        backups: league.backups ?? [],
      },
    };
    return JSON.stringify(bundle, null, 2);
  };

  const sanitizeLeague = (raw: any): LeagueDoc | null => {
    const src = raw?.league && (raw.version || raw.exportedAt) ? raw.league : raw;

    const players = Array.isArray(src?.players) ? src.players : null;
    const matches = Array.isArray(src?.matches) ? src.matches : null;
    if (!players || !matches) return null;

    const cleanPlayers: Player[] = players
      .filter((p: any) => p && typeof p.id === "string" && typeof p.name === "string")
      .map((p: any) => ({
        id: p.id,
        name: p.name,
        gender: p.gender === "M" || p.gender === "F" ? p.gender : undefined,
      }));

    const cleanMatches: Match[] = matches
      .filter(
        (m: any) =>
          m &&
          typeof m.id === "string" &&
          typeof m.date === "string" &&
          Array.isArray(m.teamA) &&
          Array.isArray(m.teamB)
      )
      .map((m: any) => ({
        id: m.id,
        date: m.date,
        teamA: [String(m.teamA[0] ?? ""), String(m.teamA[1] ?? "")] as Pair,
        teamB: [String(m.teamB[0] ?? ""), String(m.teamB[1] ?? "")] as Pair,
        winner: m.winner === "A" || m.winner === "B" ? m.winner : undefined,
      }));

    const backups: Backup[] = Array.isArray(src?.backups)
      ? src.backups
          .filter((b: any) => b && typeof b.id === "string" && b.data)
          .map((b: any) => ({
            id: b.id,
            createdAt: typeof b.createdAt === "string" ? b.createdAt : new Date().toISOString(),
            note: typeof b.note === "string" ? b.note : undefined,
            data: {
              players: Array.isArray(b.data?.players) ? b.data.players : [],
              matches: Array.isArray(b.data?.matches) ? b.data.matches : [],
            },
          }))
      : [];

    return {
      title: typeof src?.title === "string" ? src.title : undefined,
      players: cleanPlayers,
      matches: cleanMatches,
      backups,
    };
  };

  const doExport = () => {
    setStatus(null);
    try {
      const content = buildExport();
      download(`bia-tollas-backup-${fmt(new Date())}.json`, content);
      setStatus({ kind: "ok", msg: "Backup exported." });
    } catch (e: any) {
      setStatus({ kind: "err", msg: e?.message || "Export failed." });
    }
  };

  const doImport = async (file: File) => {
    setStatus(null);
    try {
      const txt = await file.text();
      const raw = JSON.parse(txt);
      const cleaned = sanitizeLeague(raw);
      if (!cleaned) throw new Error("Invalid backup format (need players + matches).");

      await onReplace(cleaned);
      setStatus({ kind: "ok", msg: "Backup imported (database replaced)." });
    } catch (e: any) {
      setStatus({ kind: "err", msg: e?.message || "Import failed." });
    }
  };

  return (
    <div className={cardContainer}>
      <BrandStripe />
      <div className={cardContent}>
        <h3 className="font-bold text-slate-800 mb-1">Import / Export</h3>
        <p className="text-xs text-slate-500 mb-4">
          Export a full JSON backup, or import one to fully restore the database.
        </p>

        <div className="grid grid-cols-1 gap-2">
          <button className={btnSecondary} onClick={doExport}>
            ⬇️ Export JSON backup
          </button>

          <button
            className={btnDanger}
            onClick={() => fileRef.current?.click()}
            title="This will overwrite the current database"
          >
            ⬆️ Import JSON (overwrite)
          </button>

          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void doImport(f);
            }}
          />
        </div>

        <div className="mt-3 text-[11px] text-slate-500">
          Tip: keep a backup before importing. Import replaces <b>players</b>, <b>matches</b> (and backups, if present).
        </div>

        {status && (
          <div
            className={`mt-3 text-xs font-semibold ${
              status.kind === "ok" ? "text-emerald-700" : "text-rose-600"
            }`}
          >
            {status.msg}
          </div>
        )}
      </div>
    </div>
  );
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
    <div className={cardContainer}>
      <BrandStripe />
      <div className={cardContent}>
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
    </div>
  );
}

function SelectPairs({ players, freeIds, seenTeammates, onCreate }: any) {
  const [mode, setMode] = useState<"singles" | "doubles">("doubles");

  const [a1, setA1] = useState("");
  const [a2, setA2] = useState("");
  const [b1, setB1] = useState("");
  const [b2, setB2] = useState("");

  const allIds = useMemo(() => {
    const ids = mode === "singles" ? [a1, b1] : [a1, a2, b1, b2];
    return ids.filter(Boolean);
  }, [mode, a1, a2, b1, b2]);

  const isValid =
    mode === "singles"
      ? allIds.length === 2 && new Set(allIds).size === 2
      : allIds.length === 4 && new Set(allIds).size === 4;

  const pairA = [a1, a2].sort().join("::");
  const pairB = [b1, b2].sort().join("::");
  const warnA = mode === "doubles" && a1 && a2 && seenTeammates.has(pairA);
  const warnB = mode === "doubles" && b1 && b2 && seenTeammates.has(pairB);

  const reset = () => {
    setA1(""); setA2(""); setB1(""); setB2("");
  };

  const create = () => {
    if (!isValid) return;
    if (mode === "singles") onCreate([a1, ""], [b1, ""]);
    else onCreate([a1, a2], [b1, b2]);
    reset();
  };

  const renderSelect = (val: string, set: any, label: string) => (
    <div className="flex-1">
      <label className="text-[10px] uppercase font-bold text-slate-400">{label}</label>
      <select className={`${input} text-sm py-1`} value={val} onChange={(e) => set(e.target.value)}>
        <option value="" disabled>-</option>
        {players.map((p: any) => (
          <option
            key={p.id}
            value={p.id}
            disabled={allIds.includes(p.id) && p.id !== val}
          >
            {p.name} {freeIds && !freeIds.includes(p.id) ? "(played)" : ""}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className={cardContainer}>
      <BrandStripe />
      <div className={cardContent}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800">Manual Match</h3>

          {/* Match type toggle */}
          <div className="flex p-1 rounded-lg border border-slate-200 bg-slate-50">
            <button
              type="button"
              onClick={() => setMode("singles")}
              className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all ${
                mode === "singles" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              1v1
            </button>
            <button
              type="button"
              onClick={() => setMode("doubles")}
              className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all ${
                mode === "doubles" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              2v2
            </button>
          </div>
        </div>

        {mode === "singles" ? (
          <div className="flex gap-2 mb-2">
            <div className="flex-1 space-y-2 p-2 rounded-lg border bg-slate-50 border-slate-100">
              <div className="text-xs font-bold text-[#84cc16]">PLAYER A</div>
              {renderSelect(a1, setA1, "P1")}
            </div>
            <div className="flex-1 space-y-2 p-2 rounded-lg border bg-slate-50 border-slate-100">
              <div className="text-xs font-bold text-rose-500">PLAYER B</div>
              {renderSelect(b1, setB1, "P1")}
            </div>
          </div>
        ) : (
          <div className="flex gap-2 mb-2">
            <div
              className={`flex-1 space-y-2 p-2 rounded-lg border ${
                warnA ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-100"
              }`}
            >
              <div className="flex justify-between">
                <div className="text-xs font-bold text-[#84cc16]">TEAM A</div>
                {warnA && <span className="text-[10px] text-amber-600 font-bold">⚠️ Played</span>}
              </div>
              <div className="flex gap-2">
                {renderSelect(a1, setA1, "P1")}
                {renderSelect(a2, setA2, "P2")}
              </div>
            </div>

            <div
              className={`flex-1 space-y-2 p-2 rounded-lg border ${
                warnB ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-100"
              }`}
            >
              <div className="flex justify-between">
                <div className="text-xs font-bold text-rose-500">TEAM B</div>
                {warnB && <span className="text-[10px] text-amber-600 font-bold">⚠️ Played</span>}
              </div>
              <div className="flex gap-2">
                {renderSelect(b1, setB1, "P1")}
                {renderSelect(b2, setB2, "P2")}
              </div>
            </div>
          </div>
        )}

        <button onClick={create} disabled={!isValid} className={`${btnPrimary} w-full`}>
          Add Match
        </button>
      </div>
    </div>
  );
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
    <div className={cardContainer}>
        <BrandStripe />
        <div className={cardContent}>
            <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-slate-800">Auto Draw</h3>
                <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded">3 Rounds</span>
            </div>
            <p className="text-xs text-slate-500 mb-4">Generate matches based on today's performance.</p>
            <button onClick={draw} disabled={!canDraw} className={`${btnPrimary} w-full`}>
                Generate Matches
            </button>
        </div>
    </div>
  );
}

function MatchesList({ matches, nameOf, onPick, onDelete, onClear, isAdmin }: any) {
    return (
        <div className={cardContainer}>
            <BrandStripe />
            <div className={cardContent}>
                <h3 className="font-bold text-slate-800 mb-4">Matches ({matches.length})</h3>
                {matches.length === 0 ? <p className="text-sm text-slate-400">No matches found.</p> : (
                    <div className="space-y-3">
                        {matches.map((m:any) => (
                            <div key={m.id} className="border border-slate-100 rounded-xl p-3 bg-slate-50/30">
                                <div className="flex justify-between items-center text-sm mb-2">
                                    <span className={`font-bold ${m.winner==='A'?'text-[#84cc16]':'text-slate-700'}`}>{formatTeam(m.teamA, nameOf)}</span>
                                    <span className="text-xs text-slate-400">vs</span>
                                    <span className={`font-bold ${m.winner==='B'?'text-[#84cc16]':'text-slate-700'}`}>{formatTeam(m.teamB, nameOf)}</span>
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
                    <div key={g.date} className={cardContainer}>
                        {/* Note: BrandStripe not needed for this collapsible list, it looks cleaner without */}
                        <div className="p-2">
                            <button 
                                onClick={() => setOpenDate(isOpen ? null : g.date)} 
                                className={`w-full flex justify-between items-center p-3 rounded-lg transition-all border ${
                                    isOpen ? "bg-slate-50 border-slate-100" : "bg-white border-transparent hover:bg-slate-50"
                                }`}
                            >
                                <div className="text-left">
                                    <h3 className="font-bold text-slate-800 text-lg">{g.date}</h3>
                                    <p className="text-xs text-slate-400 uppercase font-bold">{weekday(g.date)} • {g.matches.length} matches</p>
                                </div>
                                <span className="text-slate-400 font-bold">{isOpen ? "▲" : "▼"}</span>
                            </button>
                            {isOpen && (
                                <div className="mt-4 space-y-3 px-2 pb-2">
                                    {g.matches.map((m:any) => {
                                        const winnerA = m.winner === 'A';
                                        const winnerB = m.winner === 'B';
                                        const played = !!m.winner;

                                        return (
                                        <div key={m.id} className="flex flex-col sm:flex-row justify-between items-center text-sm p-3 bg-white rounded-lg border border-slate-100 shadow-sm gap-2">
                                            
                                            {/* TEAM A */}
                                            <div className={`flex-1 text-center sm:text-left flex items-center gap-2 ${winnerA ? 'font-bold text-slate-800' : 'text-slate-500'}`}>
                                                {winnerA && <span className="text-lg">🏆</span>}
                                                <span className={winnerA ? "text-emerald-700" : ""}>
                                                    {formatTeam(m.teamA, nameOf)}
                                                </span>
                                            </div>

                                            {/* VS */}
                                            <div className="px-3 py-1 bg-slate-50 rounded text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                                {played ? "Finished" : "VS"}
                                            </div>

                                            {/* TEAM B */}
                                            <div className={`flex-1 text-center sm:text-right flex items-center justify-end gap-2 ${winnerB ? 'font-bold text-slate-800' : 'text-slate-500'}`}>
                                                <span className={winnerB ? "text-emerald-700" : ""}>
                                                    {formatTeam(m.teamB, nameOf)}
                                                </span>
                                                {winnerB && <span className="text-lg">🏆</span>}
                                            </div>
                                        </div>
                                    )})}
                                </div>
                            )}
                        </div>
                    </div>
                 )
             })}
        </div>
    )
}

function Standings({ rows, matchFilter, onMatchFilterChange, showMatchFilterToggle }: any) {
  const [tab, setTab] = useState<"All" | "Women" | "Men">("All");

  type SortKey = "totalPoints" | "winRate" | "matches";
  const [sortKey, setSortKey] = useState<SortKey>("totalPoints");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = (key: SortKey) => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        // ugyanazt a fejlecet nyomtuk: irány váltás
        setSortDir((prevDir) => (prevDir === "asc" ? "desc" : "asc"));
        return prevKey;
      } else {
        // új oszlop: default DESC
        setSortDir("desc");
        return key;
      }
    });
  };

  const filteredAndSortedRows = useMemo(() => {
    let filtered = rows;
    if (tab !== "All") {
      const targetGender = tab === "Men" ? "M" : "F";
      filtered = rows.filter((r: any) => r.gender === targetGender);
    }

    const sorted = [...filtered].sort((a: any, b: any) => {
      const va = a[sortKey] ?? 0;
      const vb = b[sortKey] ?? 0;

      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [rows, tab, sortKey, sortDir]);

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) {
      // halvány „semleges” ikon
      return (
        <span className="ml-1 text-[9px] text-slate-300">
          ▲▼
        </span>
      );
    }
    return (
      <span className="ml-1 text-[9px] text-slate-500">
        {sortDir === "desc" ? "▼" : "▲"}
      </span>
    );
  };

  return (
    <div className={cardContainer}>
      <BrandStripe />
      <div className={cardContent}>
        <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-3">
          <h3 className="font-bold text-slate-800 text-lg">League Standings</h3>

{showMatchFilterToggle && (
  <div
    className="relative flex p-1 rounded-lg"
    style={{ backgroundColor: "#f8fafc" }}
  >
    {/* SLIDING BACKGROUND */}
    <div
      className="absolute top-1 bottom-1 rounded-md shadow-sm transition-all duration-300 ease-out"
      style={{
        width: "33.333%",
        left:
          matchFilter === "singles"
            ? "0%"
            : matchFilter === "all"
            ? "33.333%"
            : "66.666%",
        backgroundColor: "#ffffff",
      }}
    />

    {[
      { key: "singles", label: "1v1" },
      { key: "all", label: "All" },
      { key: "doubles", label: "2v2" },
    ].map(({ key, label }) => {
      const active = matchFilter === key;

      return (
        <button
          key={key}
          type="button"
          onClick={() => onMatchFilterChange?.(key as any)}
          className="relative z-10 flex-1 px-6 py-1.5 text-xs font-bold rounded-md transition-colors"
          style={{
            backgroundColor: "transparent",   // 🔥 EZ A KULCS
            color: active ? "#84cc16" : "#64748b",
          }}
        >
          {label}
        </button>
      );
    })}
  </div>
)}





          {/* iOS-style pill tabs */}
          <div className="flex p-1 rounded-lg" style={{ backgroundColor: "#f8fafc" }}>
            {["All", "Women", "Men"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t as any)}
                className={`px-6 py-1.5 text-xs font-bold rounded-md transition-all ${
                  tab === t
                    ? "text-[#84cc16] shadow-sm scale-105"
                    : "text-slate-500 hover:text-slate-700"
                }`}
                style={{
                  backgroundColor: tab === t ? "#ffffff" : "#f8fafc",
                }}
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

    {/* POINTS */}
    <th className="px-4 py-3">
      <button
        type="button"
        onClick={() => handleSort("totalPoints")}
        className="
          flex items-center gap-1 font-semibold text-slate-700
          bg-slate-100 hover:bg-slate-200
          px-3 py-1 rounded-md transition
        "
      >
        Points
        {renderSortIcon("totalPoints")}
      </button>
    </th>

    {/* WIN % */}
    <th className="px-4 py-3">
      <button
        type="button"
        onClick={() => handleSort("winRate")}
        className="
          flex items-center gap-1 font-semibold text-slate-700
          bg-slate-100 hover:bg-slate-200
          px-3 py-1 rounded-md transition
        "
      >
        Win %
        {renderSortIcon("winRate")}
      </button>
    </th>

    {/* MATCHES */}
    <th className="px-4 py-3">
      <button
        type="button"
        onClick={() => handleSort("matches")}
        className="
          flex items-center gap-1 font-semibold text-slate-700
          bg-slate-100 hover:bg-slate-200
          px-3 py-1 rounded-md transition
        "
      >
        Matches
        {renderSortIcon("matches")}
      </button>
    </th>
  </tr>
</thead>

            <tbody className="divide-y divide-slate-50">
              {filteredAndSortedRows.map((r: any, i: number) => (
                <tr
                  key={r.id}
                  className={`hover:bg-slate-50/50 transition-colors ${
                    !r.qualified ? "opacity-60" : ""
                  }`}
                >
                  <td className="px-4 py-3 font-bold text-slate-500">#{i + 1}</td>
                  <td className="px-4 py-3 font-bold text-slate-700">
                    {r.name}
                    {!r.qualified && (
                      <span className="ml-2 text-[10px] text-rose-400 font-normal">
                        (qualifying)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-black text-slate-800">
                    {r.totalPoints}
                  </td>
                  <td className="px-4 py-3 text-[#84cc16] font-bold">
                    {r.winRate}%
                  </td>
                  <td className="px-4 py-3 text-slate-500">{r.matches}</td>
                </tr>
              ))}
              {filteredAndSortedRows.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-slate-400 text-xs italic"
                  >
                    No players found in this category.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


function PlayerStatsAndAchievements({
  players,
  matches,
  meId,
  setMeId,
  christmasMode,
}: {
  players: Player[];
  matches: Match[];
  meId: string;
  setMeId: (id: string) => void;
  christmasMode?: boolean;
}) {
  const stats = useMemo(() => {
    if (!meId) return null;
    let w = 0, l = 0, mC = 0;
    matches.forEach((m: any) => {
      if (!m.winner) return;
      const inA = m.teamA.includes(meId);
      const inB = m.teamB.includes(meId);
      if (!inA && !inB) return;
      mC++;
      if ((m.winner === "A" && inA) || (m.winner === "B" && inB)) w++;
      else l++;
    });
    return {
      wins: w,
      losses: l,
      matches: mC,
      rate: mC ? Math.round((w / mC) * 100) : 0,
    };
  }, [meId, matches]);

  const ach = useMemo(
    () => (meId ? computeAchievementsFull(meId, matches, players) : []),
    [meId, matches, players]
  );
  const earnedIds = new Set(ach.map((a) => a.id));
  const [showLegend, setShowLegend] = useState(false);

  if (!players.length) return null;

  return (
    <div className={cardContainer}>
      <BrandStripe />
      <div className={cardContent}>
        {/* Fejléc + karácsonyi hangulat, ha be van kapcsolva */}
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-slate-800">
            My Stats &amp; Achievements
          </h3>

          {christmasMode && (
            <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
              <span>🎄 Christmas mode</span>
              <span className="text-rose-500">⭐ extra cheer</span>
            </div>
          )}
        </div>

        {/* Játékos választó (ABC szerint, emoji nélkül) */}
        <div className="w-full mb-4">
          <select
            className={`${input} w-full`}
            value={meId}
            onChange={(e) => setMeId(e.target.value)}
          >
            {players
              .slice()
              .sort((a, b) =>
                getBaseName(a.name).localeCompare(getBaseName(b.name), "hu")
              )
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </div>

        {/* Statisztika blokk */}
        {stats && (
          <div className="grid grid-cols-3 gap-2 mb-4 text-center">
            <div className="bg-slate-50 p-2 rounded-lg relative overflow-hidden">
              {christmasMode && (
                <span className="absolute -top-1 -left-1 text-lg">❄️</span>
              )}
              <div className="text-xl font-black text-slate-800">
                {stats.matches}
              </div>
              <div className="text-xs text-slate-400">Matches</div>
            </div>
            <div className="bg-[#f0fdf4] p-2 rounded-lg relative overflow-hidden">
              {christmasMode && (
                <span className="absolute -top-1 right-1 text-lg">🎁</span>
              )}
              <div className="text-xl font-black text-[#84cc16]">
                {stats.wins}
              </div>
              <div className="text-xs text-lime-700">
                Wins {christmasMode && "• nice list ✅"}
              </div>
            </div>
            <div className="bg-slate-50 p-2 rounded-lg relative overflow-hidden">
              {christmasMode && (
                <span className="absolute -top-1 left-1 text-lg">🎅</span>
              )}
              <div className="text-xl font-black text-slate-800">
                {stats.rate}%
              </div>
              <div className="text-xs text-slate-400">Rate</div>
            </div>
          </div>
        )}

        {/* Achievements blokk (polc + alumínium plakettek) */}
        <div className="mt-4 border-t border-slate-100 pt-4">
          <h4 className="mb-2 text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            {christmasMode && <span>🕯️</span>}
            <span>Achievements</span>
            {christmasMode && <span>⭐</span>}
          </h4>

          {ach.length === 0 ? (
            <p className="text-sm text-slate-400">No badges yet.</p>
          ) : (
            <div className="space-y-4 mb-4">
              {ach.map((a) => {
                const meta =
                  BADGE_META[a.id] || {
                    icon: "⭐",
                    accent: "text-slate-600",
                  };

                return (
                  <div key={a.id} className="relative pt-2 pb-4">
                    {/* BADGE – felül, a polcon ülve (alumínium plakett) */}
                    <div
                      className="
                        relative mx-3 flex items-center gap-3 rounded-xl px-3 py-2 border shadow-sm z-10
                        bg-[linear-gradient(145deg,#f9fafb,#e5e7eb)]
                        border-slate-300
                        before:absolute before:inset-0 before:rounded-xl
                        before:bg-[linear-gradient(120deg,rgba(255,255,255,0.6),rgba(255,255,255,0))]
                        before:opacity-70 before:pointer-events-none
                        after:absolute after:inset-0 after:rounded-xl
                        after:bg-[url('/brushed-metal.png')]
                        after:mix-blend-overlay after:opacity-30 after:pointer-events-none
                      "
                    >
                      {christmasMode && (
                        <span className="absolute -top-3 right-2 text-xl">
                          🎅
                        </span>
                      )}
                      <span className={`text-xl ${meta.accent}`}>
                        {meta.icon}
                      </span>
                      <div className="flex flex-col">
                        <span
                          className={`text-xs font-bold ${meta.accent}`}
                        >
                          {a.title}
                        </span>
                        {a.description && (
                          <span className="text-[10px] text-slate-500 leading-tight">
                            {a.description}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* REALISTIC WOOD SHELF – közvetlenül a kártya alatt */}
                    <div className="absolute inset-x-3 bottom-1 h-[12px] rounded-full shadow-[0_6px_10px_rgba(15,23,42,0.18)] overflow-hidden z-0">
                      <div
                        className="w-full h-full"
                        style={{
                          backgroundImage: "url('/wood-shelf.png')",
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }}
                      />
                    </div>

                    {/* kis fém pöckök a polc végén */}
                    <div className="absolute left-5 bottom-[9px] w-1.5 h-1.5 rounded-full bg-slate-200 shadow-[0_0_0_1px_rgba(148,163,184,0.7)] z-10" />
                    <div className="absolute right-5 bottom-[9px] w-1.5 h-1.5 rounded-full bg-slate-200 shadow-[0_0_0_1px_rgba(148,163,184,0.7)] z-10" />
                  </div>
                );
              })}
            </div>
          )}

          {/* Legend gomb + lista */}
          <button
            onClick={() => setShowLegend(!showLegend)}
            className="w-full text-center text-xs font-bold text-slate-400 uppercase hover:text-slate-600 transition-colors border-t border-slate-100 pt-2"
            style={{ backgroundColor: "#ffffff" }}
          >
            {showLegend
              ? "Hide Badge Legend ⏶"
              : "Show Badge Legend / Meanings ⏷"}
          </button>

          {showLegend && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ALL_BADGES.map((b) => {
                const meta = BADGE_META[b.id];
                const isEarned = earnedIds.has(b.id);
                return (
                  <div
                    key={b.id}
                    className={`flex items-center gap-2 p-2 rounded-lg border ${
                      isEarned
                        ? "bg-emerald-50/50 border-emerald-100"
                        : "bg-slate-50 border-slate-100 opacity-60"
                    }`}
                  >
                    <span className="text-xl">{meta?.icon}</span>
                    <div>
                      <div
                        className={`text-xs font-bold ${
                          isEarned ? "text-emerald-700" : "text-slate-600"
                        }`}
                      >
                        {b.title}
                      </div>
                      <div className="text-[10px] text-slate-500 leading-tight">
                        {b.description}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LightGarland() {
  return (
    <svg
      viewBox="0 0 420 60"
      className="w-full h-full"
      preserveAspectRatio="none"
    >
      {/* Kábel */}
      <path
        d="M5 40 Q 120 5 210 25 T 415 40"
        stroke="#4b5563"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />

      {/* Izzók */}
      <g>
        {/* Bulb template (position + color + delay) */}

        {/* Bulb 1 – orange */}
        <g>
          <line x1="45" y1="32" x2="45" y2="36" stroke="#4b5563" strokeWidth="2" />
          <circle cx="45" cy="42" r="6" fill="#f97316">
            <animate attributeName="opacity" values="0.3;1;0.3" dur="1.6s" repeatCount="indefinite" begin="0s" />
          </circle>
        </g>

        {/* Bulb 2 – green */}
        <g>
          <line x1="95" y1="22" x2="95" y2="26" stroke="#4b5563" strokeWidth="2" />
          <circle cx="95" cy="32" r="6" fill="#22c55e">
            <animate attributeName="opacity" values="0.3;1;0.3" dur="1.7s" repeatCount="indefinite" begin="0.2s" />
          </circle>
        </g>

        {/* Bulb 3 – yellow */}
        <g>
          <line x1="145" y1="15" x2="145" y2="20" stroke="#4b5563" strokeWidth="2" />
          <circle cx="145" cy="28" r="6" fill="#eab308">
            <animate attributeName="opacity" values="0.3;1;0.3" dur="1.8s" repeatCount="indefinite" begin="0.4s" />
          </circle>
        </g>

        {/* Bulb 4 – blue */}
        <g>
          <line x1="195" y1="20" x2="195" y2="25" stroke="#4b5563" strokeWidth="2" />
          <circle cx="195" cy="32" r="6" fill="#38bdf8">
            <animate attributeName="opacity" values="0.3;1;0.3" dur="1.5s" repeatCount="indefinite" begin="0.1s" />
          </circle>
        </g>

        {/* Bulb 5 – orange */}
        <g>
          <line x1="245" y1="25" x2="245" y2="30" stroke="#4b5563" strokeWidth="2" />
          <circle cx="245" cy="36" r="6" fill="#f97316">
            <animate attributeName="opacity" values="0.3;1;0.3" dur="1.4s" repeatCount="indefinite" begin="0.3s" />
          </circle>
        </g>

        {/* Bulb 6 – green */}
        <g>
          <line x1="295" y1="30" x2="295" y2="34" stroke="#4b5563" strokeWidth="2" />
          <circle cx="295" cy="42" r="6" fill="#22c55e">
            <animate attributeName="opacity" values="0.3;1;0.3" dur="1.9s" repeatCount="indefinite" begin="0.1s" />
          </circle>
        </g>

        {/* Bulb 7 – yellow */}
        <g>
          <line x1="345" y1="25" x2="345" y2="30" stroke="#4b5563" strokeWidth="2" />
          <circle cx="345" cy="38" r="6" fill="#eab308">
            <animate attributeName="opacity" values="0.3;1;1;0.3" dur="1.7s" repeatCount="indefinite" begin="0.5s" />
          </circle>
        </g>

        {/* Bulb 8 – blue */}
        <g>
          <line x1="395" y1="32" x2="395" y2="36" stroke="#4b5563" strokeWidth="2" />
          <circle cx="395" cy="42" r="6" fill="#38bdf8">
            <animate attributeName="opacity" values="0.3;1;0.3" dur="1.6s" repeatCount="indefinite" begin="0.25s" />
          </circle>
        </g>
      </g>
    </svg>
  );
}



function Snowfall() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);

    const flakes = Array.from({ length: 120 }).map(() => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 3 + 1,
      d: Math.random() + 0.5,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      for (const f of flakes) {
        ctx.moveTo(f.x, f.y);
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      }
      ctx.fill();

      for (const f of flakes) {
        f.y += f.d;
        if (f.y > h + 5) {
          f.y = -10;
          f.x = Math.random() * w;
        }
      }

      requestAnimationFrame(draw);
    };

    const handleResize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };

    window.addEventListener("resize", handleResize);
    draw();

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="w-full h-full" />;
}

function AdminPinModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setPin("");
      setError("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === ADMIN_PIN) {
      onSuccess();
    } else {
      setError("Incorrect PIN code.");
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-xs p-6 relative">
        
        <h2 className="text-lg font-bold text-slate-800 mb-1 flex items-center gap-2">
          Admin Access
          <span className="text-sm bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
            PIN
          </span>
        </h2>

        <p className="text-xs text-slate-500 mb-4">
          Please enter the 4-digit admin PIN code.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* PIN input – password dots (••••) */}
          <div className="flex justify-center">
            <input
              ref={inputRef}
              type="password"
              maxLength={4}
              inputMode="numeric"
              pattern="\d*"
              className="w-32 text-center text-2xl tracking-[0.4em] bg-slate-50 
                         border border-slate-200 rounded-xl py-2 
                         focus:outline-none focus:ring-2 focus:ring-[#84cc16] focus:bg-white"
              value={pin}
              onChange={(e) =>
                setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))
              }
              placeholder="PIN"
            />
          </div>

          {error && (
            <p className="text-xs text-center text-rose-500 font-medium">
              {error}
            </p>
          )}

          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 inline-flex items-center justify-center rounded-lg 
                         px-3 py-2 text-xs font-bold border border-slate-200 
                         bg-white text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              className="flex-1 inline-flex items-center justify-center rounded-lg 
                         px-3 py-2 text-xs font-bold bg-[#84cc16] text-white 
                         hover:bg-[#65a30d] shadow-sm"
            >
              Enter
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}




// ========================= MAIN APP =========================
export default function App() {
  const [league, write, replaceAll] = useLeague();
  const { players, matches } = league;

  const [role, setRole] = useState<"player" | "admin">("player");
  const [showPinModal, setShowPinModal] = useState(false);
  const [pendingRole, setPendingRole] = useState<"player" | "admin" | null>(null);

  const [date, setDate] = useState(fmt(nextTrainingDate()));
  const [presentIds, setPresentIds] = useState<string[]>([]);
  const matchesForDate = useMemo(
    () => matches.filter((m) => m.date === date),
    [matches, date]
  );
  const [meId, setMeId] = useState("");
  const [christmasMode, setChristmasMode] = useState(false);
  const [standingsMatchFilter, setStandingsMatchFilter] = useState<"singles" | "all" | "doubles">("all");
  const handleRoleChange = (next: "player" | "admin") => {
    if (next === "admin") {
      // MINDIG kérjen PIN-t adminra váltáskor
      setPendingRole("admin");
      setShowPinModal(true);
    } else {
      setRole("player");
    }
  };

  const handlePinSuccess = () => {
    if (pendingRole === "admin") {
      setRole("admin");
    }
    setShowPinModal(false);
    setPendingRole(null);
  };

  const handlePinClose = () => {
    setShowPinModal(false);
    setPendingRole(null);
  };


  
  const grouped = useMemo(() => {
      const map = new Map<string, Match[]>();
      [...matches].reverse().forEach(m => { if(!map.has(m.date)) map.set(m.date, []); map.get(m.date)!.push(m); });
      return Array.from(map.entries()).map(([date, matches]) => ({ date, matches }));
  }, [matches]);

  useEffect(() => { if(players.length && !meId) setMeId(players[0].id); }, [players, meId]);

  const standings = useMemo(() => {
    const s = new Map();
    const MIN_MATCHES = 5;
    const matchesForStandings =
      standingsMatchFilter === "all"
        ? matches
        : matches.filter((m) =>
            standingsMatchFilter === "singles" ? isSinglesMatch(m) : !isSinglesMatch(m)
          );
players
  .filter((p) => !isHiddenFromStandings(p))
  .forEach((p) =>
    s.set(p.id, { ...p, wins: 0, matches: 0, totalPoints: 0, qualified: false })
  );    matchesForStandings.forEach(m => {
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
  }, [players, matches, standingsMatchFilter]);

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
<div 
  className={`min-h-screen font-sans text-slate-900 flex flex-col md:flex-row relative 
    ${christmasMode ? "bg-[#55ADD5]" : "bg-[#f1f5f9]"}`}
>      
      {/* 🔹 Vízjel a háttérben */}
      <div className="fixed inset-0 z-0 flex items-center justify-center pointer-events-none">
          <img 
            src="/logo.png" 
            alt=""
            className="w-[80vw] h-[80vw] max-w-[500px] max-h-[500px] object-contain opacity-[0.03] grayscale"
            onError={(e) => { e.currentTarget.style.display = 'none'; }} 
          />
      </div>

      {christmasMode && (
        <div className="pointer-events-none fixed inset-0 z-10 overflow-hidden">
          <Snowfall />
        </div>
      )}

      <Sidebar role={role} setRole={handleRoleChange} />
      <MobileHeader role={role} setRole={handleRoleChange} />


      <div className="flex-1 md:ml-64 p-4 md:p-8 transition-all w-full max-w-[100vw] overflow-x-hidden relative z-10">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div className="relative">
    <div className="relative inline-block">
      {/* Fényfüzér – csak Player Dashboard + Christmas módban */}
      {christmasMode && role === "player" && (
        <div className="pointer-events-none absolute inset-x-0 -top-6 h-8">
          <LightGarland />
        </div>
      )}

      <h1 className="text-2xl font-bold text-slate-800 px-3 py-1 rounded-lg relative z-10">
        {role === "admin" ? "Admin Dashboard" : "Player Dashboard"}
      </h1>
    </div>

    <p className="text-slate-500 text-sm mt-1">Biatorbágy Badminton</p>
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
                    <ImportExportCard league={league} onReplace={replaceAll} />
                    <Standings rows={standings} />
                </div>
            </div>
        ) : (
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <div className="space-y-6 lg:col-span-2">
      <Standings rows={standings} showMatchFilterToggle matchFilter={standingsMatchFilter} onMatchFilterChange={setStandingsMatchFilter} />
      <MatchesPlayer grouped={grouped} nameOf={nameOf} />
    </div>
    <div className="space-y-6 min-w-[260px]">
   <PlayerStatsAndAchievements
  players={players}
  matches={matches}
  meId={meId}
  setMeId={setMeId}
  christmasMode={christmasMode}
/>

    </div>
  </div>
)}
        {/* Christmas Mood toggle */}
        <div className="fixed bottom-3 left-3 md:left-72 z-[9999]">
          <button
            onClick={() => setChristmasMode(!christmasMode)}
            className="px-4 py-2 rounded-full shadow-lg text-sm font-bold transition-all
                       bg-white border border-slate-300 hover:bg-slate-50"
          >
            {christmasMode ? "🎄 Christmas ON" : "❄️ Christmas OFF"}
          </button>
        </div>

        {/* Admin PIN modal */}
        <AdminPinModal
          open={showPinModal}
          onClose={handlePinClose}
          onSuccess={handlePinSuccess}
        />
      </div>
    </div>
  );
}

