import { motion } from "framer-motion";

export function AnimatedBackdrop() {
  return (
    <>
      <div className="animated-gradient absolute inset-0 -z-30" />

      <div className="absolute inset-0 -z-20 opacity-40">
        <motion.div
          animate={{ x: [0, 56, -38, 0], y: [0, -36, 42, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          className="absolute left-[8%] top-[12%] h-72 w-72 rounded-full bg-sky-500/20 blur-3xl"
        />
        <motion.div
          animate={{ x: [0, -42, 24, 0], y: [0, 48, -26, 0] }}
          transition={{ duration: 24, repeat: Infinity, ease: "easeInOut" }}
          className="absolute right-[10%] top-[18%] h-80 w-80 rounded-full bg-violet-500/20 blur-3xl"
        />
        <motion.div
          animate={{ x: [0, 20, -28, 0], y: [0, 24, -18, 0] }}
          transition={{ duration: 28, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-[8%] left-[35%] h-96 w-96 rounded-full bg-cyan-400/10 blur-3xl"
        />
      </div>

      <div className="absolute inset-0 -z-10 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:radial-gradient(circle_at_center,black,transparent_85%)]" />
    </>
  );
}
