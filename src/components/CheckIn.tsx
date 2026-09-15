import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { db, auth } from "../firebase";
import { EMOJIS } from "../constants";
import { fmt, weekday, uid, getCurrentTrainingDate, getBaseName } from "../utils";
import type { Player, LeagueDoc, CheckInEvent } from "../types";

type Particle = {
  id: number; angle: number; distance: number; rotate: number;
  size: number; duration: number; ox: number; oy: number;
};

export function ShuttlecockSVG({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 32" width={size} height={Math.round(size * 32 / 24)} xmlns="http://www.w3.org/2000/svg">
      <path d="M12 27 L2 7 Q12 4.5 22 7 Z" fill="rgba(255,255,255,0.07)" />
      <ellipse cx="12" cy="7" rx="10" ry="2.8" fill="rgba(255,255,255,0.1)" stroke="white" strokeWidth="1.2" />
      <path d="M12 27 Q1 17 2 7"     fill="none" stroke="white" strokeWidth="0.9" />
      <path d="M12 27 Q3 14 5.5 5"   fill="none" stroke="white" strokeWidth="0.9" />
      <path d="M12 27 Q7 12 9 4.7"   fill="none" stroke="white" strokeWidth="0.9" />
      <path d="M12 27 Q11 12 12 4.5" fill="none" stroke="white" strokeWidth="0.9" />
      <path d="M12 27 Q13 12 15 4.7" fill="none" stroke="white" strokeWidth="0.9" />
      <path d="M12 27 Q17 12 18.5 5" fill="none" stroke="white" strokeWidth="0.9" />
      <path d="M12 27 Q21 14 22 7"   fill="none" stroke="white" strokeWidth="0.9" />
      <ellipse cx="12" cy="16" rx="6" ry="1.4" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.8" />
      <ellipse cx="12" cy="26.5" rx="3.5" ry="3.8" fill="#f0cc60" />
      <ellipse cx="12" cy="24.5" rx="3.5" ry="1.8" fill="#c48a10" opacity="0.4" />
      <ellipse cx="11" cy="25.5" rx="1.5" ry="1" fill="white" opacity="0.12" />
    </svg>
  );
}

export function CheckInPage() {
  const trainingDate = getCurrentTrainingDate();

  if (!trainingDate) {
    return (
      <div className="min-h-screen w-screen overflow-x-hidden bg-[#1e293b] flex flex-col items-center justify-center p-6 font-sans">
        <style>{`
          @keyframes sc-float {
            0%,100% { transform: translateY(0px) rotate(-15deg); }
            50%      { transform: translateY(-18px) rotate(-10deg); }
          }
          @keyframes sc-drift1 {
            0%   { transform: translate(0,0) rotate(20deg); opacity: 0; }
            10%  { opacity: 0.15; }
            90%  { opacity: 0.15; }
            100% { transform: translate(-30px, -80vh) rotate(-40deg); opacity: 0; }
          }
          @keyframes sc-drift2 {
            0%   { transform: translate(0,0) rotate(-30deg); opacity: 0; }
            10%  { opacity: 0.1; }
            90%  { opacity: 0.1; }
            100% { transform: translate(20px, -80vh) rotate(60deg); opacity: 0; }
          }
          @keyframes sc-drift3 {
            0%   { transform: translate(0,0) rotate(10deg); opacity: 0; }
            10%  { opacity: 0.12; }
            90%  { opacity: 0.12; }
            100% { transform: translate(-10px, -80vh) rotate(-20deg); opacity: 0; }
          }
        `}</style>

        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute -top-20 -left-20 w-80 h-80 bg-[#84cc16] rounded-full blur-[120px] opacity-10" />
          <div className="absolute bottom-0 right-0 w-80 h-80 bg-teal-500 rounded-full blur-[120px] opacity-10" />
          <div className="absolute bottom-10 left-[15%]"  style={{ animation: "sc-drift1 7s ease-in infinite" }}><ShuttlecockSVG size={36} /></div>
          <div className="absolute bottom-10 left-[50%]"  style={{ animation: "sc-drift2 9s ease-in 2s infinite" }}><ShuttlecockSVG size={28} /></div>
          <div className="absolute bottom-10 left-[78%]"  style={{ animation: "sc-drift3 11s ease-in 5s infinite" }}><ShuttlecockSVG size={32} /></div>
        </div>

        <div className="relative z-10 w-full max-w-sm text-center">
          <div className="w-20 h-20 rounded-full bg-white/10 border border-white/20 flex items-center justify-center overflow-hidden mx-auto mb-6">
            <img src="/logo.png" alt="Logo" className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          </div>
          <div className="bg-white/10 backdrop-blur border border-white/10 rounded-2xl p-8">
            <div className="flex justify-center mb-4" style={{ animation: "sc-float 3s ease-in-out infinite" }}>
              <ShuttlecockSVG size={56} />
            </div>
            <h2 className="text-white text-xl font-black mb-2">Mai nap nincsen edzés</h2>
            <p className="text-slate-400 text-sm">Az edzések hétfőn és szerdán vannak.<br />Gyere vissza akkor!</p>
          </div>
        </div>
      </div>
    );
  }

  return <CheckInForm trainingDate={trainingDate} />;
}

function CheckInForm({ trainingDate }: { trainingDate: string }) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [attendance, setAttendance] = useState<Record<string, string[]>>({});
  const [selectedId, setSelectedId] = useState<string>(
    localStorage.getItem("checkin_player_id") ?? ""
  );
  const [mode, setMode] = useState<"select" | "new">("select");
  const [newName, setNewName] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [checkedInName, setCheckedInName] = useState("");
  const [particles, setParticles] = useState<Particle[]>([]);
  const [countdown, setCountdown] = useState<string | null>(null);

  const today = trainingDate;

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

  const sortedPlayers = useMemo(
    () => [...players].sort((a, b) => getBaseName(a.name).localeCompare(getBaseName(b.name), "hu")),
    [players]
  );

  useEffect(() => {
    if (!selectedId && sortedPlayers.length) setSelectedId(sortedPlayers[0].id);
  }, [sortedPlayers, selectedId]);

  const alreadyCheckedIn = mode === "select" && selectedId
    ? (attendance[today] ?? []).includes(selectedId)
    : false;

  const canDelete = (() => {
    const now = new Date();
    return trainingDate === fmt(now) && now.getHours() < 19;
  })();

  const isToday = trainingDate === fmt(new Date());
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

  const triggerBurst = (el?: HTMLElement) => {
    const ox = el ? el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2 : window.innerWidth / 2;
    const oy = el ? el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2 : window.innerHeight * 0.35;
    const count = 14;
    setParticles(Array.from({ length: count }, (_, i) => ({
      id: Date.now() + i,
      ox, oy,
      angle: (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4,
      distance: 90 + Math.random() * 100,
      rotate: (Math.random() - 0.5) * 720,
      size: 16 + Math.floor(Math.random() * 10),
      duration: 1200 + Math.floor(Math.random() * 800),
    })));
    setTimeout(() => setParticles([]), 2200);
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

  const resetForOther = () => { setStatus("idle"); setMode("select"); setNewName(""); };

  return (
    <div className="min-h-screen w-screen overflow-x-hidden bg-[#1e293b] flex flex-col items-center justify-center p-6 font-sans">
      {particles.length > 0 && (
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 100, overflow: "hidden" }}>
          <style>{particles.map(p => `@keyframes sf${p.id}{0%{transform:translate(-50%,-50%) rotate(0deg);opacity:1}100%{transform:translate(-50%,-50%) translate(${Math.round(Math.cos(p.angle) * p.distance)}px,${Math.round(Math.sin(p.angle) * p.distance)}px) rotate(${Math.round(p.rotate)}deg);opacity:0}}`).join("")}</style>
          {particles.map(p => (
            <div key={p.id} style={{ position: "absolute", left: p.ox, top: p.oy, pointerEvents: "none", animation: `sf${p.id} ${p.duration}ms ease-out forwards` } as React.CSSProperties}>
              <ShuttlecockSVG size={p.size} />
            </div>
          ))}
        </div>
      )}

      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-20 -left-20 w-80 h-80 bg-[#84cc16] rounded-full blur-[120px] opacity-10" />
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-teal-500 rounded-full blur-[120px] opacity-10" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-20 h-20 rounded-full bg-white/10 border border-white/20 flex items-center justify-center overflow-hidden mb-4 cursor-pointer active:scale-95 transition-transform"
            onClick={(e) => triggerBurst(e.currentTarget)}
          >
            <img src="/logo.png" alt="Logo" className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          </div>
          <h1 className="text-white text-2xl font-black tracking-wide">Biatorbágy</h1>
          <p className="text-[#84cc16] text-xs font-bold uppercase tracking-widest mt-1">Badminton – Becsekkolás</p>
          <p className="text-slate-400 text-sm mt-2">{today} • {weekday(today)}</p>
          {countdown && (
            <p className="text-white/60 text-xs mt-2 font-mono tracking-widest">
              edzésig <span className="text-white font-bold text-base">{countdown}</span>
            </p>
          )}
        </div>

        {status === "done" ? (
          <div className="bg-white/10 backdrop-blur border border-white/10 rounded-2xl p-10 text-center flex flex-col items-center gap-3">
            <div className="w-20 h-20 rounded-full bg-[#84cc16]/20 border-2 border-[#84cc16]/50 flex items-center justify-center text-5xl mb-2">✅</div>
            <p className="text-white text-2xl font-black">Becsekkolva!</p>
            <p className="text-[#84cc16] text-lg font-bold">{checkedInName}</p>
            <p className="text-slate-400 text-sm">{today} • {weekday(today)}</p>
            <button onClick={resetForOther} className="mt-4 w-full py-3 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:border-white/30 text-sm font-medium transition-colors">
              Más játékos becsekkolása
            </button>
          </div>
        ) : (
          <div className="bg-white/10 backdrop-blur border border-white/10 rounded-2xl p-6 space-y-5">
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
                  <div className="space-y-2">
                    <div className="bg-[#84cc16]/20 border border-[#84cc16]/40 rounded-xl p-4 text-center">
                      <p className="text-[#84cc16] font-bold">Már becsekkoltál ✓</p>
                      <p className="text-slate-300 text-xs mt-1">{players.find((p) => p.id === selectedId)?.name}</p>
                    </div>
                    {canDelete && (
                      <button onClick={handleRemove} disabled={status === "loading"} className="w-full text-center text-xs text-slate-400 hover:text-rose-400 transition-colors py-1">
                        Visszavonom a becsekkolást
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => { triggerBurst(); handleCheckIn(); }}
                    disabled={!selectedId || status === "loading"}
                    className="w-full bg-[#84cc16] hover:bg-[#65a30d] disabled:opacity-50 text-white font-black text-lg py-4 rounded-xl transition-all active:scale-95 shadow-lg shadow-lime-900/30"
                  >
                    {status === "loading" ? "..." : "Becsekkolok 🏸"}
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
                  onClick={() => { triggerBurst(); handleCheckIn(); }}
                  disabled={!newName.trim() || status === "loading"}
                  className="w-full bg-[#84cc16] hover:bg-[#65a30d] disabled:opacity-50 text-white font-black text-lg py-4 rounded-xl transition-all active:scale-95 shadow-lg shadow-lime-900/30"
                >
                  {status === "loading" ? "..." : "Becsekkolok 🏸"}
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

