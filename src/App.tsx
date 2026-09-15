// 🔹 Polyfillek
import "core-js/stable";
import "regenerator-runtime/runtime";
import "cross-fetch/polyfill";

import { useMemo, useState } from "react";
import { useLeague } from "./hooks/useLeague";
import { fmt, nextTrainingDate, getBaseName, uid } from "./utils";
import { Sidebar, MobileHeader, AdminPinModal } from "./components/Layout";
import { CheckInPage } from "./components/CheckIn";
import { AttendanceView } from "./components/Attendance";
import {
  DatePicker, AdminDateJump, AdminAttendanceEditor,
  CheckInHistoryCard, AttendanceExportCard, ImportExportCard, PlayerEditor,
} from "./components/Admin";
import type { Role } from "./types";

export default function App() {
  const isCheckIn = new URLSearchParams(window.location.search).has("checkin");
  if (isCheckIn) return <CheckInPage />;
  return <MainApp />;
}

function MainApp() {
  const [league, write, replaceAll] = useLeague();
  const { players } = league;
  const attendance = league.attendance ?? {};
  const checkinLog = league.checkinLog ?? [];

  const [role, setRole] = useState<Role>("attendance");
  const [showPinModal, setShowPinModal] = useState(false);
  const [date, setDate] = useState(fmt(nextTrainingDate()));

  const handleRoleChange = (next: Role) => {
    if (next === "admin") {
      setShowPinModal(true);
    } else {
      setRole(next);
    }
  };

  const handlePinSuccess = () => {
    setRole("admin");
    setShowPinModal(false);
  };

  const handlePinClose = () => {
    setShowPinModal(false);
  };

  const groupedAttendance = useMemo(
    () => Object.keys(attendance).sort((a, b) => b.localeCompare(a)).map((d) => ({ date: d })),
    [attendance]
  );

  const addPlayer    = (name: string) => write({ players: [...players, { id: uid(), name }] });
  const removePlayer = (id: string)   => write({ players: players.filter((p) => p.id !== id) });
  const updatePlayerEmoji  = (id: string, emoji: string) => write({ players: players.map((p) => p.id === id ? { ...p, name: `${emoji} ${getBaseName(p.name)}` } : p) });
  const updatePlayerGender = (id: string, g: "M" | "F" | null) => write({ players: players.map((p) => p.id === id ? { ...p, gender: g ?? undefined } : p) });

  return (
    <div className="min-h-screen font-sans text-slate-900 flex flex-col md:flex-row relative bg-[#f1f5f9]">
      <div className="fixed inset-0 z-0 flex items-center justify-center pointer-events-none">
        <img src="/logo.png" alt="" className="w-[80vw] h-[80vw] max-w-[500px] max-h-[500px] object-contain opacity-[0.03] grayscale" onError={(e) => { e.currentTarget.style.display = "none"; }} />
      </div>

      <Sidebar role={role} setRole={handleRoleChange} />
      <MobileHeader role={role} setRole={handleRoleChange} />

      <div className="flex-1 md:ml-64 p-4 md:p-8 transition-all w-full max-w-[100vw] overflow-x-hidden relative z-10">
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-slate-800 px-3 py-1 rounded-lg">
            {role === "admin" ? "Admin Dashboard" : "Jelenlét"}
          </h1>
          <p className="text-slate-500 text-sm mt-1">Biatorbágy Badminton</p>
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
        ) : (
          <div className="max-w-2xl">
            <AttendanceView players={players} attendance={attendance} />
          </div>
        )}

        <AdminPinModal open={showPinModal} onClose={handlePinClose} onSuccess={handlePinSuccess} />
      </div>
    </div>
  );
}
