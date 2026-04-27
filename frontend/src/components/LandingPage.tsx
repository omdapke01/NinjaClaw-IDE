import { motion } from "framer-motion";
import { Code2 } from "lucide-react";
import { useMemo, useState } from "react";
import { AnimatedBackdrop } from "./AnimatedBackdrop";

const featureCards = [
  {
    title: "Instant startup",
    description: "Begin coding instantly - no setup needed."
  },
  {
    title: "Multi-language support",
    description: "Supports Python, JS, C++ and more."
  },
  {
    title: "Cloud saves",
    description: "Your work saved securely in the cloud."
  }
];

export function LandingPage({
  onTry,
  onLearnMore
}: {
  onTry: () => void;
  onLearnMore: () => void;
}) {
  const [hoverPoint, setHoverPoint] = useState({ x: 50, y: 50 });
  const radialGlow = useMemo(
    () => ({
      background: `radial-gradient(circle at ${hoverPoint.x}% ${hoverPoint.y}%, rgba(96, 165, 250, 0.18), transparent 46%)`
    }),
    [hoverPoint]
  );

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#020617] text-white">
      <AnimatedBackdrop />

      <nav className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-5 md:px-10">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-2.5 text-sky-300 shadow-[0_0_30px_rgba(56,189,248,0.15)]">
            <Code2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.38em] text-slate-400">Browser IDE</p>
            <h1 className="text-lg font-semibold text-white">NinjaClaw</h1>
          </div>
        </div>

        <button
          onClick={onTry}
          className="rounded-full border border-white/10 bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:-translate-y-0.5 hover:shadow-[0_0_24px_rgba(255,255,255,0.3)]"
        >
          Try NinjaClaw
        </button>
      </nav>

      <section className="mx-auto grid min-h-[calc(100vh-88px)] w-full max-w-7xl items-center gap-16 px-6 pb-16 pt-6 md:px-10 lg:grid-cols-[1.15fr_0.85fr]">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease: "easeOut" }}
          className="max-w-3xl"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-xs font-medium text-sky-200">
            Browser-based coding workspace
          </div>

          <h2 className="mt-6 text-5xl font-semibold leading-tight text-white md:text-6xl">
            Write, run, and refine code in
            <span className="bg-gradient-to-r from-sky-300 via-cyan-200 to-violet-300 bg-clip-text text-transparent"> one focused workspace</span>.
          </h2>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
            NinjaClaw is a browser IDE with a VS Code inspired layout, AI assistance, file management, and
            multi-language execution for JavaScript, Python, C++, and Java.
          </p>

          <div className="mt-8 flex flex-wrap gap-4">
            <button
              onClick={onTry}
              className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-950 transition hover:-translate-y-0.5 hover:shadow-[0_0_28px_rgba(255,255,255,0.28)]"
            >
              Try NinjaClaw
            </button>
            <button
              onClick={onLearnMore}
              className="rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Learn More
            </button>
          </div>

          <div id="landing-features" className="mt-10 grid gap-4 text-sm text-slate-300 md:grid-cols-3">
            {featureCards.map((card) => (
              <div
                key={card.title}
                className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur transition duration-300 hover:-translate-y-1 hover:border-sky-400/20 hover:bg-white/[0.07]"
              >
                <p className="text-lg font-semibold text-white">{card.title}</p>
                <p className="mt-2 leading-6 text-slate-400">{card.description}</p>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 34, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
          className="group relative transition duration-500 hover:-translate-y-1"
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const x = ((event.clientX - rect.left) / rect.width) * 100;
            const y = ((event.clientY - rect.top) / rect.height) * 100;
            setHoverPoint({ x, y });
          }}
        >
          <div className="absolute -inset-4 rounded-[32px] bg-gradient-to-br from-sky-500/20 to-violet-500/20 blur-2xl transition duration-500 group-hover:from-sky-400/30 group-hover:to-blue-500/20 group-hover:blur-[52px]" />
          <div
            className="pointer-events-none absolute -inset-2 rounded-[30px] opacity-0 blur-2xl transition duration-500 group-hover:opacity-100"
            style={radialGlow}
          />
          <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#0a0f1c]/90 shadow-[0_30px_120px_rgba(2,6,23,0.75)] backdrop-blur transition duration-500 group-hover:border-sky-400/20 group-hover:shadow-[0_26px_120px_rgba(37,99,235,0.22)]">
            <div className="flex items-center gap-2 border-b border-white/10 bg-white/5 px-5 py-3">
              <span className="h-3 w-3 rounded-full bg-rose-400" />
              <span className="h-3 w-3 rounded-full bg-amber-300" />
              <span className="h-3 w-3 rounded-full bg-emerald-400" />
              <span className="ml-3 text-xs text-slate-400">workspace.tsx</span>
            </div>

            <div className="grid gap-0 lg:grid-cols-[220px_1fr]">
              <aside className="border-b border-white/10 bg-[#0b1220] p-4 lg:border-b-0 lg:border-r">
                <p className="text-[11px] uppercase tracking-[0.32em] text-slate-500">Explorer</p>
                <div className="mt-4 space-y-2 text-sm text-slate-300">
                  <div className="rounded-xl bg-slate-800/80 px-3 py-2 text-white">hello-world</div>
                  <div className="rounded-xl px-3 py-2">src</div>
                  <div className="rounded-xl bg-sky-500/10 px-3 py-2 text-sky-200">main.cpp</div>
                  <div className="rounded-xl px-3 py-2">app.py</div>
                  <div className="rounded-xl px-3 py-2">index.js</div>
                </div>
              </aside>

              <div className="bg-[#0f172a]">
                <div className="flex items-center justify-between border-b border-white/10 px-5 py-3 text-sm text-slate-400">
                  <span>AI-assisted editor</span>
                  <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs text-emerald-300">Ready</span>
                </div>
                <pre className="overflow-x-auto px-5 py-5 text-sm leading-7 text-slate-200">
                  <code>{`#include <iostream>
using namespace std;

int main() {
  cout << "Welcome to NinjaClaw" << endl;
  return 0;
}`}</code>
                </pre>
                <div className="border-t border-white/10 bg-[#0b1120] px-5 py-4">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                    Ask AI to explain, fix, or continue the current file in your active language.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>
    </main>
  );
}
