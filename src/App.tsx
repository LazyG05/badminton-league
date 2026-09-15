// 🔹 Polyfillek
import "core-js/stable";
import "regenerator-runtime/runtime";
import "cross-fetch/polyfill";

import { useEffect, useMemo, useState } from "react";
import { Icons } from "./design";
import { useLeague } from "./hooks/useLeague";
import { fmt, nextTrainingDate, getBaseName, uid, computeStandings } from "./utils";
import { Sidebar, MobileHeader, AdminPinModal } from "./components/Layout";
import { CheckInPage } from "./components/CheckIn";
import { AttendanceView } from "./components/Attendance";
import {
  DatePicker, AdminDateJump, AdminAttendanceEditor,
  CheckInHistoryCard, AttendanceExportCard, ImportExportCard, PlayerEditor,
} from "./components/Admin";
import { Standings, MatchesPlayer, PlayerStatsAndAchievements } from "./components/Dashboard";
import type { Role } from "./types";

export default function App() {
  const isCheckIn = new URLSearchParams(window.location.search).has("checkin");
  if (isCheckIn) return <CheckInPage />;
  return <MainApp />;
}

function MainApp() {
  const [league, write, replaceAll] = useLeague();
  const { players, matches } = league;
  const attendance = league.attendance ?? {};
  const checkinLog = league.checkinLog ?? [];

  const [role, setRole] = useState<Role>("attendance");
  const [showPinModal, setShowPinModal] = useState(false);
  const [pendingRole, setPendingRole] = useState<Role | null>(null);
  const [date, setDate] = useState(fmt(nextTrainingDate()));
  const [meId, setMeId] = useState("");
  const [standingsMatchFilter, setStandingsMatchFilter] = useState<"singles" | "all" | "doubles">("all");

  const handleRoleChange = (next: Role) => {
    if (next === "admin") {
      setPendingRole("admin");
      setShowPinModal(true);
    } else {
      setRole(next);
    }
  };

  const handlePinSuccess = () => {
    if (pendingRole === "admin") setRole("admin");
    setShowPinModal(false);
    setPendingRole(null);
  };

  const handlePinClose = () => {
    setShowPinModal(false);
    setPendingRole(null);
  };

  const grouped = useMemo(() => {
    const map = new Map<string, typeof matches>();
    [...matches].reverse().forEach((m) => {
      if (!map.has(m.date)) map.set(m.date, []);
      map.get(m.date)!.push(m);
    });
    return Array.from(map.entries()).map(([d, ms]) => ({ date: d, matches: ms }));
  }, [matches]);

  const groupedAttendance = useMemo(
    () => Object.keys(attendance).sort((a, b) => b.localeCompare(a)).map((d) => ({ date: d, matches: [] })),
    [attendance]
  );

  useEffect(() => {
    if (players.length && !meId) setMeId(players[0].id);
  }, [players, meId]);

  const standings = useMemo(
    () => computeStandings(players, matches, standingsMatchFilter),
    [players, matches, standingsMatchFilter]
  );

  const addPlayer    = (name: string) => write({ players: [...players, { id: uid(), name }] });
  const removePlayer = (id: string)   => write({ players: players.filter((p) => p.id !== id) });
  const updatePlayerEmoji  = (id: string, emoji: string) => write({ players: players.map((p) => p.id === id ? { ...p, name: `${emoji} ${getBaseName(p.name)}` } : p) });
  const updatePlayerGender = (id: string, g: "M" | "F" | null) => write({ players: players.map((p) => p.id === id ? { ...p, gender: g ?? undefined } : p) });
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name || "Unknown";

  return (
    <div className="min-h-screen font-sans text-slate-900 flex flex-col md:flex-row relative bg-[#f1f5f9]">
      <div className="fixed inset-0 z-0 flex items-center justify-center pointer-events-none">
        <img src="/logo.png" alt="" className="w-[80vw] h-[80vw] max-w-[500px] max-h-[500px] object-contain opacity-[0.03] grayscale" onError={(e) => { e.currentTarget.style.display = "none"; }} />
      </div>

      <Sidebar role={role} setRole={handleRoleChange} />
      <MobileHeader role={role} setRole={handleRoleChange} />

      <div className="flex-1 md:ml-64 p-4 md:p-8 transition-all w-full max-w-[100vw] overflow-x-hidden relative z-10">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 px-3 py-1 rounded-lg">
              {role === "admin" ? "Admin Dashboard" : role === "attendance" ? "Jelenlét" : "Dashboard"}
            </h1>
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
              <DatePicker value={date} onChange={setDate} />
              <AdminAttendanceEditor players={players} date={date} attendance={attendance} write={write} checkinLog={checkinLog} />
            </div>
            <div className="space-y-6">
              <PlayerEditor players={players} onAdd={addPlayer} onRemove={removePlayer} onUpdateEmoji={updatePlayerEmoji} onUpdateGender={updatePlayerGender} />
              <CheckInHistoryCard checkinLog={checkinLog} />
              <AdminDateJump grouped={groupedAttendance} date={date} setDate={setDate} />
              <AttendanceExportCard players={players} attendance={attendance} checkinLog={checkinLog} />
              <ImportExportCard league={league} onReplace={replaceAll} />
            </div>
          </div>
        ) : role === "attendance" ? (
          <div className="max-w-2xl">
            <AttendanceView players={players} attendance={attendance} />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="space-y-6 lg:col-span-2">
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 bg-white/60 backdrop-blur-sm text-slate-400">
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8l1 13h12l1-13M10 12h4" /></svg>
                <p className="text-xs font-semibold uppercase tracking-widest">Archived</p>
                <span className="text-xs text-slate-300">·</span>
                <p className="text-xs text-slate-400">Ez az oldal archivált adatokat tartalmaz, jelenléti nyilvántartáshoz használd a <strong className="text-slate-500">Jelenlét</strong> menüpontot.</p>
              </div>
              <Standings rows={standings} showMatchFilterToggle matchFilter={standingsMatchFilter} onMatchFilterChange={setStandingsMatchFilter} />
              <MatchesPlayer grouped={grouped} nameOf={nameOf} />
            </div>
            <div className="space-y-6 min-w-[260px]">
              <PlayerStatsAndAchievements players={players} matches={matches} meId={meId} setMeId={setMeId} />
            </div>
          </div>
        )}

        <AdminPinModal open={showPinModal} onClose={handlePinClose} onSuccess={handlePinSuccess} />
      </div>
    </div>
  );
}
