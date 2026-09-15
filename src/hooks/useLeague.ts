import { useCallback, useEffect, useRef, useState } from "react";
import {
  doc,
  onSnapshot,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { db, auth } from "../firebase";
import { stripUndefinedDeep } from "../utils";
import type { LeagueDoc } from "../types";

export function useLeague() {
  const [data, setData] = useState<LeagueDoc>({
    players: [],
    matches: [],
    backups: [],
    attendance: {},
    checkinLog: [],
  });

  const suppress = useRef(false);
  const tRef = useRef<number | null>(null);

  useEffect(() => {
    const ref = doc(db, "leagues", "default");

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        try { await signInAnonymously(auth); } catch (e) { console.error("Anonymous sign-in failed:", e); }
        return;
      }

      const unsubSnap = onSnapshot(
        ref,
        async (snap) => {
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
        },
        (err) => console.error("Firestore snapshot error:", err)
      );

      return () => unsubSnap();
    });

    return () => unsubAuth();
  }, []);

  const write = useCallback((patch: Partial<LeagueDoc>) => {
    if (tRef.current) window.clearTimeout(tRef.current);

    setData((prev) => {
      const next = { ...prev, ...patch };
      if (suppress.current) return next;

      tRef.current = window.setTimeout(async () => {
        try {
          const { checkinLog: _cl, ...rest } = next as any;
          void _cl;
          await setDoc(
            doc(db, "leagues", "default"),
            stripUndefinedDeep({ ...rest, updatedAt: serverTimestamp() } as LeagueDoc),
            { merge: true }
          );
        } catch (err) {
          console.error(err);
        }
      }, 120);

      return next;
    });
  }, []);

  // Replaces players/matches/backups only — attendance and checkinLog are never overwritten
  const replaceAll = useCallback(async (next: LeagueDoc) => {
    suppress.current = true;
    setData((prev) => ({
      ...next,
      attendance: prev.attendance ?? {},
      checkinLog: prev.checkinLog ?? [],
    }));
    setTimeout(() => (suppress.current = false), 0);

    const payload = {
      players: Array.isArray(next.players) ? next.players : [],
      matches: Array.isArray(next.matches) ? next.matches : [],
      backups: Array.isArray(next.backups) ? next.backups : [],
      ...(typeof next.title === "string" ? { title: next.title } : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(doc(db, "leagues", "default"), stripUndefinedDeep(payload), { merge: true });
    } catch (err) {
      console.error(err);
    }
  }, []);

  return [data, write, replaceAll] as const;
}
