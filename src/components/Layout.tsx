import { useEffect, useRef, useState } from "react";
import { Icons } from "../design";
import { ADMIN_PIN } from "../constants";
import type { Role } from "../types";

export function Sidebar({ role, setRole }: { role: Role; setRole: (r: Role) => void }) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="fixed left-0 top-0 h-full w-64 bg-[#1e293b] text-white flex flex-col shadow-2xl z-50 transition-transform duration-300 md:translate-x-0 -translate-x-full md:block hidden overflow-hidden">
      <div className="absolute -top-20 -left-20 w-60 h-60 bg-[#84cc16] rounded-full blur-[80px] opacity-10 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-60 h-60 bg-teal-500 rounded-full blur-[80px] opacity-10 pointer-events-none" />

      <div className="p-6 flex flex-col items-center border-b border-white/5 relative z-10">
        <div className="relative w-40 h-40 mb-6 flex items-center justify-center">
          <div className="absolute inset-0 bg-[#84cc16] rounded-full blur-2xl opacity-20" />
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

      <nav className="flex-1 px-4 py-6 space-y-2 relative z-10">
        <button
          onClick={() => setRole("attendance")}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium border ${
            role === "attendance"
              ? "bg-[#84cc16] border-[#84cc16] text-white shadow-lg shadow-lime-900/20"
              : "bg-transparent border-transparent text-slate-400 hover:bg-white/5 hover:text-white"
          }`}
        >
          <Icons.Attendance />
          Jelenlét
        </button>

        <a
          href="https://ttsport.hu/partnereink-termekei/bia-sc/bia-sc-tollaslabda"
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium border bg-white/5 border-white/10 text-white hover:bg-white/10 hover:border-white/20 shadow-sm"
        >
          <Icons.Shop />
          BIA SC Webshop
          <span className="ml-auto text-xs text-slate-300">↗</span>
        </a>

        <button
          onClick={() => setRole("admin")}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium border ${
            role === "admin"
              ? "bg-[#84cc16] border-[#84cc16] text-white shadow-lg shadow-lime-900/20"
              : "bg-transparent border-transparent text-slate-400 hover:bg-white/5 hover:text-white"
          }`}
        >
          <Icons.Admin />
          Admin Panel
        </button>
      </nav>

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

export function MobileHeader({ role, setRole }: { role: Role; setRole: (r: Role) => void }) {
  return (
    <div className="md:hidden bg-[#1e293b] text-white p-4 flex justify-between items-center shadow-md mb-4 rounded-b-xl z-50 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-[#84cc16] rounded-full blur-[50px] opacity-10 pointer-events-none" />

      <div className="flex items-center gap-3 relative z-10">
        <div className="w-10 h-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center overflow-hidden shadow-lg">
          <img src="/logo.png" alt="Biatorbágy Badminton logo" className="w-full h-full object-cover" />
        </div>
        <div className="flex flex-col">
          <span className="font-bold tracking-wide text-sm">Biatorbágy Badminton</span>
        </div>
      </div>

      <div className="flex items-center gap-2 relative z-10">
        <a
          href="https://ttsport.hu/partnereink-termekei/bia-sc/bia-sc-tollaslabda"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-slate-800/50 backdrop-blur-sm border border-white/5 text-white hover:bg-white/10 transition"
          title="Webshop"
        >
          <Icons.Shop />
        </a>
        <div className="flex text-xs bg-slate-800/50 backdrop-blur-sm rounded-lg p-1 border border-white/5">
          {(["attendance", "admin"] as Role[]).map((r) => (
            <button
              key={r}
              onClick={() => setRole(r)}
              className={`px-3 py-1 rounded ${role === r ? "bg-[#84cc16] text-white" : "text-slate-300"}`}
            >
              {r === "attendance" ? "Jelenlét" : "Admin"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AdminPinModal({
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
          <span className="text-sm bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">PIN</span>
        </h2>
        <p className="text-xs text-slate-500 mb-4">Please enter the 4-digit admin PIN code.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex justify-center">
            <input
              ref={inputRef}
              type="password"
              maxLength={4}
              inputMode="numeric"
              pattern="\d*"
              className="w-32 text-center text-2xl tracking-[0.4em] bg-slate-50 border border-slate-200 rounded-xl py-2 focus:outline-none focus:ring-2 focus:ring-[#84cc16] focus:bg-white"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
              placeholder="PIN"
            />
          </div>
          {error && <p className="text-xs text-center text-rose-500 font-medium">{error}</p>}
          <div className="flex gap-2 mt-2">
            <button type="button" onClick={onClose} className="flex-1 inline-flex items-center justify-center rounded-lg px-3 py-2 text-xs font-bold border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" className="flex-1 inline-flex items-center justify-center rounded-lg px-3 py-2 text-xs font-bold bg-[#84cc16] text-white hover:bg-[#65a30d] shadow-sm">
              Enter
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
