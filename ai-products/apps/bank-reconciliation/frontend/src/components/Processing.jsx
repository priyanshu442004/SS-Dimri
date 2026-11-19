import { useEffect, useState } from "react";
import { motion } from "motion/react";

const STEPS = ["Reading both files", "Matching transactions", "Classifying exceptions", "Generating & emailing the report"];

export default function Processing() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((v) => Math.min(v + 1, STEPS.length - 1)), 450);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="mx-auto max-w-md py-16 sm:py-24">
      <p className="label">Reconciling</p>
      <h1 className="mt-3 text-3xl font-medium">Working through your transactions…</h1>
      <ol className="mt-8 space-y-2">
        {STEPS.map((s, k) => (
          <motion.li key={s} initial={{ x: -8 }} animate={{ x: 0 }} transition={{ delay: k * 0.08 }}
            className={`relative flex items-center gap-3 overflow-hidden rounded-xl border px-4 py-3 text-[15px] ${k < i ? "border-ink/8 bg-white/60 text-muted" : k === i ? "border-teal/40 bg-white" : "border-ink/6 text-muted/60"}`}>
            {k === i && <span className="shimmer absolute inset-0" aria-hidden />}
            <span className={`relative grid size-5 place-items-center rounded-full ${k < i ? "bg-teal-ink text-white" : k === i ? "border-2 border-teal" : "border border-ink/20"}`}>
              {k < i && <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2.5 6.2 5 8.5l4.5-5" /></svg>}
            </span>
            <span className="relative">{s}</span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}
