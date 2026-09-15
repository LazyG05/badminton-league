import { useMemo, useState } from "react";
import {
  BrandStripe, cardContainer, cardContent, input,
} from "../design";
import { getBaseName, isSinglesMatch, formatTeam, weekday, computeAchievementsFull, computeAttendanceStreak, BADGE_META, ALL_BADGES } from "../utils";
import type { Player, Match } from "../types";

export function MatchesPlayer({ grouped, nameOf }: any) {
  const [openDate, setOpenDate] = useState<string | null>(null);
  useMemo(() => { if (grouped.length && !openDate) setOpenDate(grouped[0].date); }, [grouped]);

  return (
    <div className="space-y-4">
      {grouped.map((g: any) => {
        const isOpen = openDate === g.date;
        return (
          <div key={g.date} className={cardContainer}>
            <div className="p-2">
              <button
                onClick={() => setOpenDate(isOpen ? null : g.date)}
                className={`w-full flex justify-between items-center p-3 rounded-lg transition-all border ${isOpen ? "bg-slate-50 border-slate-100" : "bg-white border-transparent hover:bg-slate-50"}`}
              >
                <div className="text-left">
                  <h3 className="font-bold text-slate-800 text-lg">{g.date}</h3>
                  <p className="text-xs text-slate-400 uppercase font-bold">{weekday(g.date)} • {g.matches.length} matches</p>
                </div>
                <span className="text-slate-400 font-bold">{isOpen ? "▲" : "▼"}</span>
              </button>
              {isOpen && (
                <div className="mt-4 space-y-3 px-2 pb-2">
                  {g.matches.map((m: any) => {
                    const winnerA = m.winner === "A";
                    const winnerB = m.winner === "B";
                    const played = !!m.winner;
                    return (
                      <div key={m.id} className="flex flex-col sm:flex-row justify-between items-center text-sm p-3 bg-white rounded-lg border border-slate-100 shadow-sm gap-2">
                        <div className={`flex-1 text-center sm:text-left flex items-center gap-2 ${winnerA ? "font-bold text-slate-800" : "text-slate-500"}`}>
                          {winnerA && <span className="text-lg">🏆</span>}
                          <span className={winnerA ? "text-emerald-700" : ""}>{formatTeam(m.teamA, nameOf)}</span>
                        </div>
                        <div className="px-3 py-1 bg-slate-50 rounded text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          {played ? "Finished" : "VS"}
                        </div>
                        <div className={`flex-1 text-center sm:text-right flex items-center justify-end gap-2 ${winnerB ? "font-bold text-slate-800" : "text-slate-500"}`}>
                          <span className={winnerB ? "text-emerald-700" : ""}>{formatTeam(m.teamB, nameOf)}</span>
                          {winnerB && <span className="text-lg">🏆</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Standings({ rows, matchFilter, onMatchFilterChange, showMatchFilterToggle }: any) {
  const [tab, setTab] = useState<"All" | "Women" | "Men">("All");
  type SortKey = "totalPoints" | "winRate" | "matches";
  const [sortKey, setSortKey] = useState<SortKey>("totalPoints");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = (key: SortKey) => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDir((prevDir) => (prevDir === "asc" ? "desc" : "asc"));
        return prevKey;
      } else {
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
    return [...filtered].sort((a: any, b: any) => {
      const va = a[sortKey] ?? 0;
      const vb = b[sortKey] ?? 0;
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [rows, tab, sortKey, sortDir]);

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) return <span className="ml-1 text-[9px] text-slate-300">▲▼</span>;
    return <span className="ml-1 text-[9px] text-slate-500">{sortDir === "desc" ? "▼" : "▲"}</span>;
  };

  // Suppress unused import warning
  void isSinglesMatch;

  return (
    <div className={cardContainer}>
      <BrandStripe />
      <div className={cardContent}>
        <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-3">
          <h3 className="font-bold text-slate-800 text-lg">League Standings</h3>

          {showMatchFilterToggle && (
            <div className="relative flex p-1 rounded-lg" style={{ backgroundColor: "#f8fafc" }}>
              <div
                className="absolute top-1 bottom-1 rounded-md shadow-sm transition-all duration-300 ease-out"
                style={{
                  width: "33.333%",
                  left: matchFilter === "singles" ? "0%" : matchFilter === "all" ? "33.333%" : "66.666%",
                  backgroundColor: "#ffffff",
                }}
              />
              {[{ key: "singles", label: "1v1" }, { key: "all", label: "All" }, { key: "doubles", label: "2v2" }].map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onMatchFilterChange?.(key as any)}
                  className="relative z-10 flex-1 px-6 py-1.5 text-xs font-bold rounded-md transition-colors"
                  style={{ backgroundColor: "transparent", color: matchFilter === key ? "#84cc16" : "#64748b" }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <div className="flex p-1 rounded-lg" style={{ backgroundColor: "#f8fafc" }}>
            {["All", "Women", "Men"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t as any)}
                className={`px-6 py-1.5 text-xs font-bold rounded-md transition-all ${tab === t ? "text-[#84cc16] shadow-sm scale-105" : "text-slate-500 hover:text-slate-700"}`}
                style={{ backgroundColor: tab === t ? "#ffffff" : "#f8fafc" }}
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
                {(["totalPoints", "winRate", "matches"] as SortKey[]).map((k) => (
                  <th key={k} className="px-4 py-3">
                    <button type="button" onClick={() => handleSort(k)} className="flex items-center gap-1 font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-1 rounded-md transition">
                      {k === "totalPoints" ? "Points" : k === "winRate" ? "Win %" : "Matches"}
                      {renderSortIcon(k)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredAndSortedRows.map((r: any, i: number) => (
                <tr key={r.id} className={`hover:bg-slate-50/50 transition-colors ${!r.qualified ? "opacity-60" : ""}`}>
                  <td className="px-4 py-3 font-bold text-slate-500">#{i + 1}</td>
                  <td className="px-4 py-3 font-bold text-slate-700">
                    {r.name}
                    {!r.qualified && <span className="ml-2 text-[10px] text-rose-400 font-normal">(qualifying)</span>}
                  </td>
                  <td className="px-4 py-3 font-black text-slate-800">{r.totalPoints}</td>
                  <td className="px-4 py-3 text-[#84cc16] font-bold">{r.winRate}%</td>
                  <td className="px-4 py-3 text-slate-500">{r.matches}</td>
                </tr>
              ))}
              {filteredAndSortedRows.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-xs italic">No players found in this category.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function PlayerStatsAndAchievements({
  players,
  matches,
  meId,
  setMeId,
}: {
  players: Player[];
  matches: Match[];
  meId: string;
  setMeId: (id: string) => void;
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
    return { wins: w, losses: l, matches: mC, rate: mC ? Math.round((w / mC) * 100) : 0 };
  }, [meId, matches]);

  const ach = useMemo(
    () => (meId ? computeAchievementsFull(meId, matches, players) : []),
    [meId, matches, players]
  );
  const earnedIds = new Set(ach.map((a) => a.id));
  const [showLegend, setShowLegend] = useState(false);

  // Suppress unused import
  void computeAttendanceStreak;

  if (!players.length) return null;

  return (
    <div className={cardContainer}>
      <BrandStripe />
      <div className={cardContent}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-slate-800">My Stats &amp; Achievements</h3>
        </div>

        <div className="w-full mb-4">
          <select className={`${input} w-full`} value={meId} onChange={(e) => setMeId(e.target.value)}>
            {players
              .slice()
              .sort((a, b) => getBaseName(a.name).localeCompare(getBaseName(b.name), "hu"))
              .map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {stats && (
          <div className="grid grid-cols-3 gap-2 mb-4 text-center">
            <div className="bg-slate-50 p-2 rounded-lg">
              <div className="text-xl font-black text-slate-800">{stats.matches}</div>
              <div className="text-xs text-slate-400">Matches</div>
            </div>
            <div className="bg-[#f0fdf4] p-2 rounded-lg">
              <div className="text-xl font-black text-[#84cc16]">{stats.wins}</div>
              <div className="text-xs text-lime-700">Wins</div>
            </div>
            <div className="bg-slate-50 p-2 rounded-lg">
              <div className="text-xl font-black text-slate-800">{stats.rate}%</div>
              <div className="text-xs text-slate-400">Rate</div>
            </div>
          </div>
        )}

        <div className="mt-4 border-t border-slate-100 pt-4">
          <h4 className="mb-2 text-sm font-bold uppercase tracking-wider text-slate-400">Achievements</h4>
          {ach.length === 0 ? (
            <p className="text-sm text-slate-400">No badges yet.</p>
          ) : (
            <div className="space-y-4 mb-4">
              {ach.map((a) => {
                const meta = BADGE_META[a.id] || { icon: "⭐", accent: "text-slate-600" };
                return (
                  <div key={a.id} className="relative pt-2 pb-4">
                    <div className="relative mx-3 flex items-center gap-3 rounded-xl px-3 py-2 border shadow-sm z-10 bg-[linear-gradient(145deg,#f9fafb,#e5e7eb)] border-slate-300 before:absolute before:inset-0 before:rounded-xl before:bg-[linear-gradient(120deg,rgba(255,255,255,0.6),rgba(255,255,255,0))] before:opacity-70 before:pointer-events-none after:absolute after:inset-0 after:rounded-xl after:bg-[url('/brushed-metal.png')] after:mix-blend-overlay after:opacity-30 after:pointer-events-none">
                      <span className={`text-xl ${meta.accent}`}>{meta.icon}</span>
                      <div className="flex flex-col">
                        <span className={`text-xs font-bold ${meta.accent}`}>{a.title}</span>
                        {a.description && <span className="text-[10px] text-slate-500 leading-tight">{a.description}</span>}
                      </div>
                    </div>
                    <div className="absolute inset-x-3 bottom-1 h-[12px] rounded-full shadow-[0_6px_10px_rgba(15,23,42,0.18)] overflow-hidden z-0">
                      <div className="w-full h-full" style={{ backgroundImage: "url('/wood-shelf.png')", backgroundSize: "cover", backgroundPosition: "center" }} />
                    </div>
                    <div className="absolute left-5 bottom-[9px] w-1.5 h-1.5 rounded-full bg-slate-200 shadow-[0_0_0_1px_rgba(148,163,184,0.7)] z-10" />
                    <div className="absolute right-5 bottom-[9px] w-1.5 h-1.5 rounded-full bg-slate-200 shadow-[0_0_0_1px_rgba(148,163,184,0.7)] z-10" />
                  </div>
                );
              })}
            </div>
          )}

          <button
            onClick={() => setShowLegend(!showLegend)}
            className="w-full text-center text-xs font-bold text-slate-400 uppercase hover:text-slate-600 transition-colors border-t border-slate-100 pt-2"
            style={{ backgroundColor: "#ffffff" }}
          >
            {showLegend ? "Hide Badge Legend ⏶" : "Show Badge Legend / Meanings ⏷"}
          </button>

          {showLegend && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ALL_BADGES.map((b) => {
                const meta = BADGE_META[b.id];
                const isEarned = earnedIds.has(b.id);
                return (
                  <div key={b.id} className={`flex items-center gap-2 p-2 rounded-lg border ${isEarned ? "bg-emerald-50/50 border-emerald-100" : "bg-slate-50 border-slate-100 opacity-60"}`}>
                    <span className="text-xl">{meta?.icon}</span>
                    <div>
                      <div className={`text-xs font-bold ${isEarned ? "text-emerald-700" : "text-slate-600"}`}>{b.title}</div>
                      <div className="text-[10px] text-slate-500 leading-tight">{b.description}</div>
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
