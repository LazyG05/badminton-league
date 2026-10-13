import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { db, auth } from "../firebase";
import { EMOJIS } from "../constants";
import { fmtLocal, weekday, uid, getCurrentWeekTrainingDates, getBaseName } from "../utils";
import type { Player, LeagueDoc, CheckInEvent } from "../types";

const KEYFRAMES = `
  @keyframes sc-float {
    0%,100% { transform: translateY(0px) rotate(-15deg); }
    50%      { transform: translateY(-18px) rotate(-10deg); }
  }
  @keyframes sc-fall1 { 0%{transform:translateY(-70px) rotate(10deg);opacity:0} 8%{opacity:0.12} 92%{opacity:0.09} 100%{transform:translateY(108vh) rotate(150deg);opacity:0} }
  @keyframes sc-fall2 { 0%{transform:translateY(-70px) rotate(-20deg);opacity:0} 8%{opacity:0.1} 92%{opacity:0.07} 100%{transform:translateY(108vh) rotate(-110deg);opacity:0} }
  @keyframes sc-fall3 { 0%{transform:translateY(-70px) rotate(30deg);opacity:0} 8%{opacity:0.11} 92%{opacity:0.08} 100%{transform:translateY(108vh) rotate(200deg);opacity:0} }
  @keyframes sc-fall4 { 0%{transform:translateY(-70px) rotate(-5deg);opacity:0} 8%{opacity:0.13} 92%{opacity:0.09} 100%{transform:translateY(108vh) rotate(130deg);opacity:0} }
  @keyframes sc-fall5 { 0%{transform:translateY(-70px) rotate(25deg);opacity:0} 8%{opacity:0.1} 92%{opacity:0.07} 100%{transform:translateY(108vh) rotate(-170deg);opacity:0} }
  @keyframes sc-fall6 { 0%{transform:translateY(-70px) rotate(-30deg);opacity:0} 8%{opacity:0.11} 92%{opacity:0.08} 100%{transform:translateY(108vh) rotate(90deg);opacity:0} }
  @keyframes sc-fall7 { 0%{transform:translateY(-70px) rotate(15deg);opacity:0} 8%{opacity:0.1} 92%{opacity:0.07} 100%{transform:translateY(108vh) rotate(-140deg);opacity:0} }
  @keyframes sc-btn-idle { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
  @keyframes sc-btn-fly  { 0%{transform:rotate(0deg) translateX(0);opacity:1} 100%{transform:rotate(720deg) translateX(600px);opacity:0} }
  @keyframes sc-done     { 0%{transform:rotate(-20deg) scale(0.6);opacity:0} 60%{transform:rotate(10deg) scale(1.15)} 100%{transform:rotate(0deg) scale(1);opacity:1} }
`;

const Background = () => (
  <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
    <div className="absolute -top-20 -left-20 w-80 h-80 bg-[#84cc16] rounded-full blur-[120px] opacity-10" />
    <div className="absolute bottom-0 right-0 w-80 h-80 bg-teal-500 rounded-full blur-[120px] opacity-10" />
    <div className="absolute top-0 left-[6%]"  style={{ animation: "sc-fall1  9s linear  -4s  infinite" }}><img src="/shuttlecock.svg" width={30} height={40} alt="" /></div>
    <div className="absolute top-0 left-[20%]" style={{ animation: "sc-fall2 12s linear  -9s  infinite" }}><img src="/shuttlecock.svg" width={22} height={29} alt="" /></div>
    <div className="absolute top-0 left-[35%]" style={{ animation: "sc-fall3  8s linear  -2s  infinite" }}><img src="/shuttlecock.svg" width={36} height={48} alt="" /></div>
    <div className="absolute top-0 left-[50%]" style={{ animation: "sc-fall4 11s linear  -7s  infinite" }}><img src="/shuttlecock.svg" width={26} height={35} alt="" /></div>
    <div className="absolute top-0 left-[63%]" style={{ animation: "sc-fall5 14s linear  -5s  infinite" }}><img src="/shuttlecock.svg" width={20} height={27} alt="" /></div>
    <div className="absolute top-0 left-[77%]" style={{ animation: "sc-fall6 10s linear  -1s  infinite" }}><img src="/shuttlecock.svg" width={32} height={43} alt="" /></div>
    <div className="absolute top-0 left-[90%]" style={{ animation: "sc-fall7 13s linear -11s  infinite" }}><img src="/shuttlecock.svg" width={24} height={32} alt="" /></div>
  </div>
);

export function CheckInPage() {
  const dates = getCurrentWeekTrainingDates();
  const [players, setPlayers] = useState<Player[]>([]);
  const [attendance, setAttendance] = useState<Record<string, string[]>>({});

  useEffect(() => {
    const ref = doc(db, "leagues", "default");
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        try { await signInAnonymously(auth); } catch (e) { console.error(e); }
        return;
      }
      const unsub = onSnapshot(ref, (snap) => {
        if (snap.exists()) {
          const d = snap.data() as LeagueDoc;
          setPlayers(d.players ?? []);
          setAttendance(d.attendance ?? {});
        }
      });
      return () => unsub();
    });
    return () => unsubAuth();
  }, []);

  return (
    <div className="min-h-screen w-screen overflow-x-hidden bg-[#1e293b] flex flex-col items-center justify-center p-6 font-sans">
      <style>{KEYFRAMES}</style>
      <Background />

      <div className="relative z-10 w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 rounded-full bg-white/10 border border-white/20 flex items-center justify-center overflow-hidden mb-4">
            <img src="/logo.png" alt="Logo" className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          </div>
          <h1 className="text-white text-2xl font-black tracking-wide">Biatorbágy</h1>
          <p className="text-[#84cc16] text-xs font-bold uppercase tracking-widest mt-1">Badminton – Becsekkolás</p>
        </div>
        <div className="space-y-6">
          {dates.map(({ date, isOpen }) => (
            <CheckInForm key={date} trainingDate={date} isOpen={isOpen} players={players} attendance={attendance} />
          ))}
        </div>
      </div>
    </div>
  );
}

function CheckInForm({
  trainingDate,
  isOpen,
  players,
  attendance,
}: {
  trainingDate: string;
  isOpen: boolean;
  players: Player[];
  attendance: Record<string, string[]>;
}) {
  const [selectedId, setSelectedId] = useState<string>(
    localStorage.getItem("checkin_player_id") ?? ""
  );
  const [mode, setMode] = useState<"select" | "new">("select");
  const [newName, setNewName] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [checkingInOther, setCheckingInOther] = useState(false);
  const [checkedInName, setCheckedInName] = useState("");
  const [checkedInId, setCheckedInId] = useState("");
  const [btnFlying, setBtnFlying] = useState(false);
  const [countdown, setCountdown] = useState<string | null>(null);

  const today = trainingDate;

  const sortedPlayers = useMemo(
    () => [...players].sort((a, b) => getBaseName(a.name).localeCompare(getBaseName(b.name), "hu")),
    [players]
  );

  useEffect(() => {
    if (!selectedId && sortedPlayers.length) setSelectedId(sortedPlayers[0].id);
  }, [sortedPlayers, selectedId]);

  const alreadyCheckedIn = !checkingInOther && mode === "select" && selectedId
    ? (attendance[today] ?? []).includes(selectedId)
    : false;

  const canDelete = (() => {
    const now = new Date();
    return trainingDate === fmtLocal(now) && now.getHours() < 19;
  })();

  const isToday = trainingDate === fmtLocal(new Date());
  useEffect(() => {
    if (!isToday) return;
    const tick = () => {
      const now = new Date();
      const target = new Date(now);
      target.setHours(20, 0, 0, 0);
      const diff = target.getTime() - now.getTime();
      if (diff <= 0) { setCountdown(null); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isToday]);

  const handleButtonClick = () => {
    if (btnFlying || status === "loading") return;
    setBtnFlying(true);
    setTimeout(() => {
      setBtnFlying(false);
      handleCheckIn();
    }, 580);
  };

  const handleCheckIn = async () => {
    if (status === "loading") return;
    setStatus("loading");
    try {
      const ref = doc(db, "leagues", "default");
      if (mode === "new") {
        const trimmed = newName.trim();
        if (!trimmed) { setStatus("idle"); return; }
        const emoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
        const newPlayer: Player = { id: uid(), name: `${emoji} ${trimmed}` };
        const event: CheckInEvent = { playerId: newPlayer.id, playerName: newPlayer.name, trainingDate: today, timestamp: new Date().toISOString(), action: "in" };
        await updateDoc(ref, {
          players: arrayUnion(newPlayer),
          [`attendance.${today}`]: arrayUnion(newPlayer.id),
          checkinLog: arrayUnion(event),
        });
        localStorage.setItem("checkin_player_id", newPlayer.id);
        setCheckedInName(newPlayer.name);
        setCheckedInId(newPlayer.id);
      } else {
        if (!selectedId) { setStatus("idle"); return; }
        const pName = players.find((p) => p.id === selectedId)?.name ?? "";
        const event: CheckInEvent = { playerId: selectedId, playerName: pName, trainingDate: today, timestamp: new Date().toISOString(), action: "in" };
        await updateDoc(ref, {
          [`attendance.${today}`]: arrayUnion(selectedId),
          checkinLog: arrayUnion(event),
        });
        localStorage.setItem("checkin_player_id", selectedId);
        setCheckedInName(pName);
        setCheckedInId(selectedId);
      }
      setStatus("done");
    } catch (e) {
      console.error(e);
      setStatus("idle");
    }
  };

  const handleRemove = async () => {
    if (!selectedId || status === "loading") return;
    setStatus("loading");
    try {
      const ref = doc(db, "leagues", "default");
      const pName = players.find((p) => p.id === selectedId)?.name ?? "";
      const event: CheckInEvent = { playerId: selectedId, playerName: pName, trainingDate: today, timestamp: new Date().toISOString(), action: "out" };
      await updateDoc(ref, {
        [`attendance.${today}`]: arrayRemove(selectedId),
        checkinLog: arrayUnion(event),
      });
      setStatus("idle");
    } catch (e) {
      console.error(e);
      setStatus("idle");
    }
  };

  const resetForOther = () => {
    setStatus("idle"); setMode("select"); setNewName("");
    setCheckedInId(""); setCheckingInOther(true);
  };

  const AttendeeList = ({ highlightId }: { highlightId: string }) => {
    const ids = attendance[today] ?? [];
    if (!ids.length) return null;
    const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? "?";
    return (
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
          Ott lesznek · <span className="text-white">{ids.length} fő</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {ids.map((id) => (
            <span key={id} className={`text-sm rounded-full px-3 py-1 font-medium ${id === highlightId ? "bg-[#84cc16]/30 border border-[#84cc16]/50 text-[#84cc16]" : "bg-white/10 border border-white/10 text-slate-200"}`}>
              {nameOf(id)}
            </span>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white/10 backdrop-blur border border-white/10 rounded-2xl overflow-hidden">
      <div className="px-6 pt-4 pb-3 border-b border-white/10 flex items-center justify-between">
        <div>
          <p className="text-white font-black">{weekday(trainingDate)}</p>
          <p className="text-slate-400 text-sm">{trainingDate}</p>
        </div>
        <div className="flex items-center gap-2">
          {!isOpen && (
            <span className="text-xs text-slate-400 bg-white/5 border border-white/10 rounded-full px-2 py-0.5">Lezárva</span>
          )}
          {countdown && (
            <p className="text-white/60 text-xs font-mono text-right">
              edzésig<br /><span className="text-white font-bold text-sm">{countdown}</span>
            </p>
          )}
        </div>
      </div>

      <div className="p-6">
        {!isOpen ? (
          <div className="space-y-3">
            <AttendeeList highlightId="" />
            {(attendance[today] ?? []).length === 0 && (
              <p className="text-sm text-slate-500 text-center">Senki nem csekkolódott be.</p>
            )}
          </div>
        ) : status === "done" ? (
          <div className="space-y-4">
            <div className="text-center flex flex-col items-center gap-2">
              <div className="w-16 h-16 rounded-full bg-[#84cc16]/20 border-2 border-[#84cc16]/50 flex items-center justify-center">
                <img src="/shuttlecock.svg" width={36} height={47} alt="" style={{ animation: "sc-done 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards" }} />
              </div>
              <p className="text-white text-xl font-black">Becsekkolva!</p>
              <p className="text-[#84cc16] font-bold">{checkedInName}</p>
            </div>
            <AttendeeList highlightId={checkedInId} />
            <button onClick={resetForOther} className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-sm transition-colors">
              + Más játékos becsekkolása
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            {mode === "select" ? (
              <>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Ki vagy te?</label>
                  <select
                    className="w-full bg-white/10 border border-white/20 text-white rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[#84cc16]"
                    value={selectedId}
                    onChange={(e) => setSelectedId(e.target.value)}
                  >
                    {sortedPlayers.map((p) => (
                      <option key={p.id} value={p.id} className="text-slate-900 bg-white">{p.name}</option>
                    ))}
                  </select>
                </div>

                {alreadyCheckedIn ? (
                  <div className="space-y-3">
                    <div className="bg-[#84cc16]/20 border border-[#84cc16]/40 rounded-xl p-4 text-center">
                      <p className="text-[#84cc16] font-bold">Már becsekkoltál ✓</p>
                      <p className="text-slate-300 text-xs mt-1">{players.find((p) => p.id === selectedId)?.name}</p>
                    </div>
                    <AttendeeList highlightId={selectedId} />
                    <button onClick={() => setCheckingInOther(true)} className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-sm transition-colors">
                      + Más játékos becsekkolása
                    </button>
                    {canDelete && (
                      <button onClick={handleRemove} disabled={status === "loading"} className="w-full text-center text-xs text-slate-400 hover:text-rose-400 transition-colors py-1">
                        Visszavonom a becsekkolást
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={handleButtonClick}
                    disabled={!selectedId || status === "loading" || btnFlying}
                    className="relative w-full bg-[#84cc16] hover:bg-[#65a30d] disabled:opacity-50 text-white font-black text-lg py-4 rounded-xl transition-all active:scale-95 shadow-lg shadow-lime-900/30 pl-12"
                  >
                    <div className="absolute left-4 top-0 bottom-0 flex items-center pointer-events-none">
                      <img src="/shuttlecock.svg" width={24} height={32} alt=""
                        style={{ animation: btnFlying ? "sc-btn-fly 0.58s ease-in forwards" : "sc-btn-idle 3s linear infinite" }} />
                    </div>
                    {status === "loading" ? "..." : "Becsekkolok"}
                  </button>
                )}

                <button onClick={() => setMode("new")} className="w-full text-center text-xs text-slate-400 hover:text-white transition-colors pt-1">
                  Nem találom a nevem →
                </button>
              </>
            ) : (
              <>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Add meg a neved</label>
                  <input
                    autoFocus
                    type="text"
                    placeholder="Pl. Kovács Péter"
                    className="w-full bg-white/10 border border-white/20 text-white placeholder:text-slate-500 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[#84cc16]"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) handleCheckIn(); }}
                  />
                  <p className="text-xs text-slate-500 mt-2">Ez felkerül a játékoslistára is.</p>
                </div>
                <button
                  onClick={handleButtonClick}
                  disabled={!newName.trim() || status === "loading" || btnFlying}
                  className="relative w-full bg-[#84cc16] hover:bg-[#65a30d] disabled:opacity-50 text-white font-black text-lg py-4 rounded-xl transition-all active:scale-95 shadow-lg shadow-lime-900/30 pl-12"
                >
                  <div className="absolute left-4 top-0 bottom-0 flex items-center pointer-events-none">
                    <img src="/shuttlecock.svg" width={24} height={32} alt=""
                      style={{ animation: btnFlying ? "sc-btn-fly 0.58s ease-in forwards" : "sc-btn-idle 3s linear infinite" }} />
                  </div>
                  {status === "loading" ? "..." : "Becsekkolok"}
                </button>
                <button onClick={() => setMode("select")} className="w-full text-center text-xs text-slate-400 hover:text-white transition-colors pt-1">
                  ← Vissza a listához
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
