import { useEffect, useMemo, useRef, useState } from "react";
import {
  BrandStripe, cardContainer, cardContent,
  btnPrimary, btnSecondary, btnDanger, btnGhost, input,
} from "../design";
import { EMOJIS, TRAINING_DAYS } from "../constants";
import { fmt, fmtTime, weekday, getBaseName, stripUndefinedDeep } from "../utils";
import type { Player, LeagueDoc, CheckInEvent, Backup, Match } from "../types";

export function DatePicker({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  const trainingDates = useMemo(() => {
    const dates: string[] = [];
    const d = new Date();
    for (let i = 0; i < 8; i++) {
      if (TRAINING_DAYS.includes(d.getDay())) dates.push(fmt(new Date(d)));
      d.setDate(d.getDate() - 1);
    }
    return dates;
  }, []);

  return (
    <div className={cardContainer}>
      <BrandStripe />
      <div className={cardContent}>
        <h2 className="text-lg font-bold text-slate-800 mb-3">Session dátum</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          {trainingDates.map((d) => (
            <button
              key={d}
              onClick={() => onChange(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                value === d
                  ? "bg-[#84cc16] border-[#84cc16] text-white shadow-sm"
                  : "bg-white border-slate-200 text-slate-600 hover:border-[#84cc16] hover:text-[#84cc16]"
              }`}
            >
              {d} <span className="opacity-60">({weekday(d).slice(0, 3)})</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
          <span className="text-xs text-slate-400">Egyéb:</span>
          <input className="bg-transparent text-slate-700 font-bold focus:outline-none cursor-pointer text-sm" type="date" value={value} onChange={(e) => onChange(e.target.value)} />
        </div>
      </div>
    </div>
  );
}

export function AdminDateJump({
  grouped,
  date,
  setDate,
}: {
  grouped: { date: string }[];
  date: string;
  setDate: (d: string) => void;
}) {
  return (
    <div className={cardContainer}>
      <BrandStripe />
      <div className={cardContent}>
        <h3 className="font-bold text-slate-800 mb-3">Jump to Date</h3>
        {grouped.length === 0 ? (
          <p className="text-sm text-slate-400">No sessions yet.</p>
        ) : (
          <ul className="space-y-2 max-h-40 overflow-y-auto pr-1">
            {grouped.map((g) => (
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
  );
}

export function AdminAttendanceEditor({
  players,
  date,
  attendance,
  write,
  checkinLog,
}: {
  players: Player[];
  date: string;
  attendance: Record<string, string[]>;
  write: (patch: Partial<LeagueDoc>) => void;
  checkinLog: CheckInEvent[];
}) {
  const sessionExists = date in attendance;
  const checkedIn = attendance[date] ?? [];

  const timestampMap = useMemo(() => {
    const map = new Map<string, string>();
    checkinLog
      .filter((e) => e.trainingDate === date && e.action === "in")
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      .forEach((e) => map.set(e.playerId, e.timestamp));
    return map;
  }, [checkinLog, date]);

  const createSession = () => {
    if (!sessionExists) write({ attendance: { ...attendance, [date]: [] } });
  };

  const toggle = (id: string) => {
    const current = attendance[date] ?? [];
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    write({ attendance: { ...attendance, [date]: next } });
  };

  const sorted = useMemo(
    () => [...players].sort((a, b) => getBaseName(a.name).localeCompare(getBaseName(b.name), "hu")),
    [players]
  );

  const sortedWithStatus = useMemo(() => {
    const inList = sorted
      .filter((p) => checkedIn.includes(p.id))
      .sort((a, b) => (timestampMap.get(a.id) ?? "").localeCompare(timestampMap.get(b.id) ?? ""));
    const outList = sorted.filter((p) => !checkedIn.includes(p.id));
    return [...inList, ...outList];
  }, [sorted, checkedIn, timestampMap]);

  return (
    <div className={cardContainer}>
      <BrandStripe />
      <div className={cardContent}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-slate-800">Jelenlét szerkesztése</h3>
          <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded">{checkedIn.length} / {players.length} fő</span>
        </div>

        {!sessionExists ? (
          <div className="text-center py-4">
            <p className="text-sm text-slate-400 mb-3">Erre a dátumra még nincs edzés rögzítve.</p>
            <button onClick={createSession} className={btnPrimary}>+ Session létrehozása</button>
          </div>
        ) : (
          <ul className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
            {sortedWithStatus.map((p) => {
              const isIn = checkedIn.includes(p.id);
              const ts = timestampMap.get(p.id);
              return (
                <li key={p.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${isIn ? "bg-[#f0fdf4] border-[#84cc16]/30" : "bg-white border-slate-100"}`}>
                  <div className={`w-2 h-2 rounded-full shrink-0 ${isIn ? "bg-[#84cc16]" : "bg-slate-200"}`} />
                  <span className={`flex-1 text-sm font-medium truncate ${isIn ? "text-slate-800" : "text-slate-400"}`}>{p.name}</span>
                  {isIn && <span className="text-xs tabular-nums shrink-0 text-slate-400">{ts ? fmtTime(ts) : "—"}</span>}
                  <button
                    onClick={() => toggle(p.id)}
                    className={`text-xs px-2.5 py-1 rounded-lg border font-bold transition-all shrink-0 ${
                      isIn ? "border-rose-200 text-rose-400 hover:bg-rose-50" : "border-[#84cc16]/60 text-[#84cc16] hover:bg-[#f0fdf4]"
                    }`}
                  >
                    {isIn ? "ki" : "+ be"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export function CheckInHistoryCard({ checkinLog }: { checkinLog: CheckInEvent[] }) {
  const sorted = useMemo(
    () => [...checkinLog].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 50),
    [checkinLog]
  );

  return (
    <div className={cardContainer}>
      <BrandStripe />
      <div className={cardContent}>
        <h3 className="font-bold text-slate-800 mb-3">Becsekkolási napló</h3>
        {sorted.length === 0 ? (
          <p className="text-sm text-slate-400">Még nincs esemény.</p>
        ) : (
          <ul className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {sorted.map((e, i) => (
              <li key={i} className="flex items-center gap-2 text-xs">
                <span className={`font-bold shrink-0 w-6 text-center ${e.action === "in" ? "text-emerald-500" : "text-rose-400"}`}>
                  {e.action === "in" ? "▲" : "▼"}
                </span>
                <span className="flex-1 truncate text-slate-700 font-medium">{e.playerName}</span>
                <span className="text-slate-400 shrink-0">{e.trainingDate}</span>
                <span className="text-slate-300 shrink-0 tabular-nums">{fmtTime(e.timestamp)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function AttendanceExportCard({
  players,
  attendance,
  checkinLog,
}: {
  players: Player[];
  attendance: Record<string, string[]>;
  checkinLog: CheckInEvent[];
}) {
  const months = useMemo(() => {
    const set = new Set<string>();
    Object.keys(attendance).forEach((d) => set.add(d.slice(0, 7)));
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [attendance]);

  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const monthSessions = useMemo(
    () =>
      Object.entries(attendance)
        .filter(([d]) => d.startsWith(selectedMonth))
        .sort(([a], [b]) => a.localeCompare(b)),
    [attendance, selectedMonth]
  );

  const totalCheckins = monthSessions.reduce((sum, [, ids]) => sum + ids.length, 0);
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? id;

  const doExport = () => {
    const sessions = monthSessions.map(([date, ids]) => ({
      date,
      weekday: weekday(date),
      count: ids.length,
      players: ids.map((id) => ({ id, name: nameOf(id) })),
    }));
    const log = checkinLog
      .filter((e) => e.trainingDate.startsWith(selectedMonth))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    const content = JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      month: selectedMonth,
      summary: {
        sessions: sessions.length,
        totalCheckins,
        avgPerSession: sessions.length ? Math.round(totalCheckins / sessions.length) : 0,
      },
      sessions,
      checkinLog: log,
    }, null, 2);

    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bia-jelenlét-${selectedMonth}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className={cardContainer}>
      <BrandStripe />
      <div className={cardContent}>
        <h3 className="font-bold text-slate-800 mb-1">Jelenlét export</h3>
        <p className="text-xs text-slate-500 mb-4">Havi jelenléti adatok letöltése elszámoláshoz.</p>

        {months.length === 0 ? (
          <p className="text-sm text-slate-400">Még nincs jelenlét adat.</p>
        ) : (
          <>
            <select className={`${input} mb-3`} value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
              {months.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <div className="flex gap-2 mb-4">
              <div className="flex-1 bg-slate-50 rounded-lg p-3 text-center">
                <div className="text-lg font-black text-slate-800">{monthSessions.length}</div>
                <div className="text-xs text-slate-400">edzés</div>
              </div>
              <div className="flex-1 bg-[#f0fdf4] rounded-lg p-3 text-center">
                <div className="text-lg font-black text-[#84cc16]">{totalCheckins}</div>
                <div className="text-xs text-lime-700">becsekkolás</div>
              </div>
              <div className="flex-1 bg-slate-50 rounded-lg p-3 text-center">
                <div className="text-lg font-black text-slate-800">
                  {monthSessions.length ? Math.round(totalCheckins / monthSessions.length) : 0}
                </div>
                <div className="text-xs text-slate-400">átlag fő</div>
              </div>
            </div>
            <button className={`${btnPrimary} w-full`} onClick={doExport}>⬇️ Letöltés – {selectedMonth}</button>
          </>
        )}
      </div>
    </div>
  );
}

export function PlayerEditor({
  players,
  onAdd,
  onRemove,
  onUpdateEmoji,
  onUpdateGender,
}: {
  players: Player[];
  onAdd: (name: string) => void;
  onRemove: (id: string) => void;
  onUpdateEmoji: (id: string, emoji: string) => void;
  onUpdateGender: (id: string, g: "M" | "F" | null) => void;
}) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState("");

  useEffect(() => {
    if (!selectedPlayerId && players.length) setSelectedPlayerId(players[0].id);
  }, [players, selectedPlayerId]);

  const selectedPlayer = players.find((p) => p.id === selectedPlayerId);

  return (
    <div className={cardContainer}>
      <BrandStripe />
      <div className={cardContent}>
        <h3 className="font-bold text-slate-800 mb-4">Add Player</h3>
        <div className="flex gap-2 mb-4">
          <button className="text-2xl bg-slate-50 rounded-lg w-12 h-10 border border-slate-200 flex items-center justify-center" onClick={() => setShowEmoji(!showEmoji)}>{emoji}</button>
          <input className={input} placeholder="Name..." value={name} onChange={(e) => setName(e.target.value)} />
          <button className={btnPrimary} onClick={() => { if (name) { onAdd(`${emoji} ${name}`); setName(""); } }}>Add</button>
        </div>
        {showEmoji && (
          <div className="flex gap-1 overflow-x-auto pb-2 mb-2">
            {EMOJIS.map((e) => <button key={e} onClick={() => { setEmoji(e); setShowEmoji(false); }} className="text-xl hover:bg-slate-100 p-1 rounded">{e}</button>)}
          </div>
        )}
        <button onClick={() => setShowManage(!showManage)} className={btnGhost}>
          {showManage ? "Hide Options ⏶" : "Manage Players / Options ⏷"}
        </button>
        {showManage && (
          <div className="border-t border-slate-100 pt-3 space-y-3">
            <select className={input} value={selectedPlayerId} onChange={(e) => setSelectedPlayerId(e.target.value)}>
              {players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {selectedPlayer && (
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-3">
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase mb-1">Gender</div>
                  <div className="flex gap-2">
                    {(["M", "F", null] as ("M" | "F" | null)[]).map((g) => (
                      <button key={String(g)} onClick={() => onUpdateGender(selectedPlayer.id, g)} className={`px-3 py-1 text-xs rounded-full border ${selectedPlayer.gender === g ? "bg-[#84cc16] text-white border-[#84cc16]" : "bg-white text-slate-500 border-slate-200"}`}>
                        {g === "M" ? "Man" : g === "F" ? "Woman" : "Not Set"}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase mb-1">Change Emoji</div>
                  <div className="flex gap-1 overflow-x-auto pb-2">
                    {EMOJIS.slice(0, 8).map((e) => <button key={e} onClick={() => onUpdateEmoji(selectedPlayer.id, e)} className="text-lg hover:scale-110 transition-transform">{e}</button>)}
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

export function ImportExportCard({
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
    return JSON.stringify(stripUndefinedDeep(bundle), null, 2);
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
        ...(p.gender === "M" || p.gender === "F" ? { gender: p.gender } : {}),
      }));

    const cleanMatches: Match[] = matches
      .filter((m: any) => m && typeof m.id === "string" && typeof m.date === "string" && Array.isArray(m.teamA) && Array.isArray(m.teamB))
      .map((m: any) => ({
        id: m.id,
        date: m.date,
        teamA: [String(m.teamA[0] ?? ""), String(m.teamA[1] ?? "")] as [string, string],
        teamB: [String(m.teamB[0] ?? ""), String(m.teamB[1] ?? "")] as [string, string],
        ...(m.winner === "A" || m.winner === "B" ? { winner: m.winner } : {}),
      }));

    const backups: Backup[] = Array.isArray(src?.backups)
      ? src.backups
          .filter((b: any) => b && typeof b.id === "string" && b.data)
          .map((b: any) => ({
            id: b.id,
            createdAt: typeof b.createdAt === "string" ? b.createdAt : new Date().toISOString(),
            ...(typeof b.note === "string" ? { note: b.note } : {}),
            data: {
              players: Array.isArray(b.data?.players) ? b.data.players : [],
              matches: Array.isArray(b.data?.matches) ? b.data.matches : [],
            },
          }))
      : [];

    return {
      ...(typeof src?.title === "string" ? { title: src.title } : {}),
      players: cleanPlayers,
      matches: cleanMatches,
      backups,
    };
  };

  const doExport = () => {
    setStatus(null);
    try {
      download(`bia-tollas-backup-${fmt(new Date())}.json`, buildExport());
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
          <br /><span className="text-emerald-700 font-medium">Attendance and check-in log are never overwritten by import.</span>
        </p>
        <div className="grid grid-cols-1 gap-2">
          <button className={btnSecondary} onClick={doExport}>⬇️ Export JSON backup</button>
          <button className={btnDanger} onClick={() => fileRef.current?.click()} title="This will overwrite players, matches and backups">
            ⬆️ Import JSON (overwrite)
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void doImport(f); }} />
        </div>
        <div className="mt-3 text-[11px] text-slate-500">
          Tip: import replaces <b>players</b>, <b>matches</b>, <b>backups</b> — attendance is protected.
        </div>
        {status && (
          <div className={`mt-3 text-xs font-semibold ${status.kind === "ok" ? "text-emerald-700" : "text-rose-600"}`}>
            {status.msg}
          </div>
        )}
      </div>
    </div>
  );
}
