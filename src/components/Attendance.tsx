import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { BrandStripe, cardContainer, cardContent, input } from "../design";
import { CHECKIN_URL } from "../constants";
import { weekday, getBaseName, fmt } from "../utils";
import type { Player } from "../types";

export function AttendanceCalendar({
  players,
  attendance,
}: {
  players: Player[];
  attendance: Record<string, string[]>;
}) {
  const [viewDate, setViewDate] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selectedPlayer, setSelectedPlayer] = useState<string>("__all__");
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const HU_DAYS = ["H", "K", "Sze", "Cs", "P", "Szo", "V"];

  const daysInMonth = useMemo(() => {
    const { year, month } = viewDate;
    const days: { date: string; day: number }[] = [];
    const d = new Date(year, month, 1);
    while (d.getMonth() === month) {
      const mo = String(d.getMonth() + 1).padStart(2, "0");
      const da = String(d.getDate()).padStart(2, "0");
      days.push({ date: `${d.getFullYear()}-${mo}-${da}`, day: d.getDate() });
      d.setDate(d.getDate() + 1);
    }
    return days;
  }, [viewDate]);

  const gridOffset = useMemo(() => {
    const { year, month } = viewDate;
    const firstDay = new Date(year, month, 1).getDay();
    return firstDay === 0 ? 6 : firstDay - 1;
  }, [viewDate]);

  const trainingDaysInMonth = useMemo(
    () => daysInMonth.filter((d) => d.date in attendance),
    [daysInMonth, attendance]
  );

  const playerStats = useMemo(() => {
    if (selectedPlayer === "__all__") return null;
    const total = trainingDaysInMonth.length;
    const attended = trainingDaysInMonth.filter((d) =>
      (attendance[d.date] ?? []).includes(selectedPlayer)
    ).length;
    return { attended, total, pct: total ? Math.round((attended / total) * 100) : 0 };
  }, [selectedPlayer, trainingDaysInMonth, attendance]);

  const avgAttendance = useMemo(() => {
    if (!trainingDaysInMonth.length) return 0;
    const total = trainingDaysInMonth.reduce(
      (sum, d) => sum + (attendance[d.date]?.length ?? 0),
      0
    );
    return Math.round(total / trainingDaysInMonth.length);
  }, [trainingDaysInMonth, attendance]);

  const sortedPlayers = useMemo(
    () => [...players].sort((a, b) => getBaseName(a.name).localeCompare(getBaseName(b.name), "hu")),
    [players]
  );

  const prevMonth = () =>
    setViewDate((prev) => {
      const d = new Date(prev.year, prev.month - 1, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  const nextMonth = () =>
    setViewDate((prev) => {
      const d = new Date(prev.year, prev.month + 1, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  const monthLabel = new Date(viewDate.year, viewDate.month, 1).toLocaleDateString("hu-HU", {
    year: "numeric",
    month: "long",
  });

  const cells = Array.from(
    { length: Math.ceil((gridOffset + daysInMonth.length) / 7) * 7 },
    (_, i) => {
      const idx = i - gridOffset;
      return idx >= 0 && idx < daysInMonth.length ? daysInMonth[idx] : null;
    }
  );

  const _today = new Date();
  const todayStr = `${_today.getFullYear()}-${String(_today.getMonth() + 1).padStart(2, "0")}-${String(_today.getDate()).padStart(2, "0")}`;
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? "Ismeretlen";

  // Suppress unused import
  void fmt;

  return (
    <div className={cardContainer}>
      <BrandStripe />
      <div className={cardContent}>
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-500 text-sm font-bold">◀</button>
          <span className="font-bold text-slate-800 text-sm">{monthLabel}</span>
          <button onClick={nextMonth} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-500 text-sm font-bold">▶</button>
        </div>

        <div className="mb-4">
          <select
            className={input}
            value={selectedPlayer}
            onChange={(e) => { setSelectedPlayer(e.target.value); setExpandedDay(null); }}
          >
            <option value="__all__">👥 Mindenki</option>
            {sortedPlayers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-7 mb-1">
          {HU_DAYS.map((d) => (
            <div key={d} className="text-center text-[10px] font-bold text-slate-400 uppercase py-1">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((cell, i) => {
            if (!cell) return <div key={`empty-${i}`} className="min-h-[44px]" />;
            const { date, day } = cell;
            const hasSession = date in attendance;
            const isToday = date === todayStr;
            const baseRing = isToday ? "ring-2 ring-[#84cc16] ring-offset-1" : "";

            if (selectedPlayer === "__all__") {
              const count = hasSession ? (attendance[date]?.length ?? 0) : 0;
              const isExpanded = expandedDay === date;
              return (
                <button
                  key={date}
                  onClick={() => hasSession && setExpandedDay(isExpanded ? null : date)}
                  className={`flex flex-col items-center justify-center rounded-lg py-1 min-h-[44px] transition-colors ${baseRing} ${isExpanded ? "bg-[#f0fdf4]" : hasSession ? "bg-slate-50 hover:bg-slate-100" : "bg-transparent"} ${hasSession ? "cursor-pointer" : "cursor-default"}`}
                >
                  <span className={`text-xs font-medium leading-none ${isToday ? "text-[#84cc16] font-bold" : "text-slate-600"}`}>{day}</span>
                  {hasSession && (
                    <span className="text-[10px] font-bold text-slate-500 bg-slate-200 rounded-full px-1 mt-0.5 min-w-[18px] text-center leading-tight">{count}</span>
                  )}
                </button>
              );
            } else {
              const attended = hasSession && (attendance[date] ?? []).includes(selectedPlayer);
              const missed = hasSession && !attended;
              return (
                <div key={date} className={`flex flex-col items-center justify-center rounded-lg py-1 min-h-[44px] ${baseRing} ${hasSession ? "bg-slate-50" : "bg-transparent"}`}>
                  <span className={`text-xs font-medium leading-none ${isToday ? "text-[#84cc16] font-bold" : "text-slate-600"}`}>{day}</span>
                  {attended && <div className="w-2 h-2 rounded-full bg-emerald-400 mt-0.5 shrink-0" />}
                  {missed   && <div className="w-2 h-2 rounded-full bg-rose-300 mt-0.5 shrink-0" />}
                </div>
              );
            }
          })}
        </div>

        {selectedPlayer === "__all__" && expandedDay && (
          <div className="mt-3 p-3 bg-[#f0fdf4] rounded-lg border border-[#84cc16]/20">
            <div className="text-xs font-bold text-slate-500 mb-2">
              {expandedDay} • {weekday(expandedDay)} • {attendance[expandedDay]?.length ?? 0} fő
            </div>
            <div className="flex flex-wrap gap-1">
              {(attendance[expandedDay] ?? []).map((id) => (
                <span key={id} className="text-xs bg-white border border-[#84cc16]/30 text-slate-700 px-2 py-0.5 rounded-full">{nameOf(id)}</span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 pt-3 border-t border-slate-100">
          {selectedPlayer === "__all__" ? (
            <p className="text-xs text-slate-500 text-center">
              <span className="font-bold text-slate-700">{trainingDaysInMonth.length} edzés</span>
              {trainingDaysInMonth.length > 0 && (
                <> — átlag <span className="font-bold text-slate-700">{avgAttendance} fő</span></>
              )}
            </p>
          ) : playerStats && (
            <p className="text-xs text-slate-500 text-center">
              <span className="font-bold text-slate-700">{playerStats.attended} / {playerStats.total} edzés</span>
              {playerStats.total > 0 && (
                <> (<span className="font-bold text-[#84cc16]">{playerStats.pct}%</span>)</>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function AttendanceView({
  players,
  attendance,
}: {
  players: Player[];
  attendance: Record<string, string[]>;
}) {
  const [openDate, setOpenDate] = useState<string | null>(null);

  const sortedDates = useMemo(
    () => Object.keys(attendance).sort((a, b) => b.localeCompare(a)),
    [attendance]
  );

  useEffect(() => {
    if (sortedDates.length && !openDate) setOpenDate(sortedDates[0]);
  }, [sortedDates, openDate]);

  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? "Ismeretlen";

  return (
    <div className="space-y-6">
      <div className={cardContainer}>
        <BrandStripe />
        <div className={`${cardContent} flex flex-col sm:flex-row items-center gap-6`}>
          <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm shrink-0">
            <QRCodeSVG value={CHECKIN_URL} size={140} />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-lg mb-1">Becsekkolási QR-kód</h3>
            <p className="text-sm text-slate-500 mb-3">
              Mutasd ezt az edzésen. A játékosok beolvassák és 1 kattintással becsekkolnak.
            </p>
            <a href={CHECKIN_URL} target="_blank" rel="noopener noreferrer" className="text-xs text-[#84cc16] font-bold hover:underline break-all">
              {CHECKIN_URL}
            </a>
          </div>
        </div>
      </div>

      <AttendanceCalendar players={players} attendance={attendance} />

      {sortedDates.length === 0 ? (
        <div className={cardContainer}>
          <BrandStripe />
          <div className={cardContent}>
            <p className="text-slate-400 text-sm">Még senki nem csekkoltak be.</p>
          </div>
        </div>
      ) : (
        sortedDates.map((date) => {
          const ids = attendance[date] ?? [];
          const isOpen = openDate === date;
          return (
            <div key={date} className={cardContainer}>
              <div className="p-2">
                <button
                  onClick={() => setOpenDate(isOpen ? null : date)}
                  className={`w-full flex justify-between items-center p-3 rounded-lg transition-all border ${isOpen ? "bg-slate-50 border-slate-100" : "bg-white border-transparent hover:bg-slate-50"}`}
                >
                  <div className="text-left">
                    <h3 className="font-bold text-slate-800 text-lg">{date}</h3>
                    <p className="text-xs text-slate-400 uppercase font-bold">{weekday(date)} • {ids.length} fő</p>
                  </div>
                  <span className="text-slate-400 font-bold">{isOpen ? "▲" : "▼"}</span>
                </button>
                {isOpen && (
                  <div className="mt-3 px-2 pb-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {ids.map((id) => (
                      <div key={id} className="flex items-center gap-2 bg-[#f0fdf4] border border-[#84cc16]/30 rounded-lg px-3 py-2 text-sm font-medium text-slate-700">
                        <div className="w-2 h-2 rounded-full bg-[#84cc16] shrink-0" />
                        <span className="truncate">{nameOf(id)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
