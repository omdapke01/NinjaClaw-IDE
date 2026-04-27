import { AlertCircle, CheckCircle, ChevronDown, ChevronUp, GripHorizontal, Info, Square, Terminal, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { ConsoleTab } from "../types";

type ConsoleProps = {
  terminalLogs: string[];
  outputLogs: string[];
  activeTab: ConsoleTab;
  isOpen: boolean;
  onToggle: () => void;
  onClear: (tab: ConsoleTab) => void;
  onCommand: (command: string) => Promise<void> | void;
  height: number;
  onResize: (height: number) => void;
  hasActiveSession: boolean;
  onStop: () => Promise<void> | void;
  onTabChange: (tab: ConsoleTab) => void;
};

export function Console({ terminalLogs, outputLogs, activeTab, isOpen, onToggle, onClear, onCommand, height, onResize, hasActiveSession, onStop, onTabChange }: ConsoleProps) {
  const [command, setCommand] = useState("");
  const [dragging, setDragging] = useState(false);

  async function handleSubmit() {
    const trimmed = command.trim();
    if (!trimmed) return;
    setCommand("");
    await onCommand(trimmed);
  }

  useEffect(() => {
    if (!dragging) return undefined;

    function handleMove(event: MouseEvent) {
      const nextHeight = Math.min(520, Math.max(140, window.innerHeight - event.clientY - 24));
      onResize(nextHeight);
    }

    function handleUp() {
      setDragging(false);
    }

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragging, onResize]);

  return (
    <div className="flex flex-col border-t border-ide-border bg-ide-panel transition-all" style={{ height: isOpen ? height : 36 }}>
      {isOpen ? (
        <button
          className="flex h-2 cursor-row-resize items-center justify-center border-b border-ide-border/60 text-muted-foreground hover:bg-secondary/40"
          onMouseDown={() => setDragging(true)}
          title="Resize console"
        >
          <GripHorizontal className="h-3.5 w-3.5" />
        </button>
      ) : null}
      <div className="flex shrink-0 items-center justify-between border-b border-ide-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Console</span>
          <button
            onClick={() => onTabChange("terminal")}
            className={`rounded px-1.5 py-0.5 text-xs transition-colors ${activeTab === "terminal" ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/60"}`}
          >
            Terminal {terminalLogs.length > 0 ? <span>{terminalLogs.length}</span> : null}
          </button>
          <button
            onClick={() => onTabChange("output")}
            className={`rounded px-1.5 py-0.5 text-xs transition-colors ${activeTab === "output" ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/60"}`}
          >
            Output {outputLogs.length > 0 ? <span>{outputLogs.length}</span> : null}
          </button>
          {hasActiveSession ? <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.2em] text-emerald-300">Running</span> : null}
        </div>
        <div className="flex items-center gap-1">
          {hasActiveSession ? (
            <button onClick={onStop} className="rounded p-1 text-rose-300 transition-colors hover:bg-secondary" title="Stop running program">
              <Square className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <button onClick={() => onClear(activeTab)} className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button onClick={onToggle} className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary">
            {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-ide-border px-3 py-2">
            <div className="flex items-center gap-2 rounded-md border border-ide-border bg-[#0d1117] px-3 py-2">
              <span className="font-mono text-xs text-muted-foreground">$</span>
              <input
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleSubmit();
                  }
                }}
                placeholder={hasActiveSession ? "Program is waiting for input..." : "Try: help, ls, code src/index.js, run hello.cpp"}
                className="flex-1 bg-transparent font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto font-mono text-xs">
            {(activeTab === "terminal" ? terminalLogs : outputLogs).map((log, index) => (
              <div key={`${log}-${index}`} className="flex items-start gap-2 border-b border-ide-border/30 px-3 py-1 hover:bg-ide-sidebar-hover/30">
                {getLogIcon(log)}
                <span className="shrink-0 text-muted-foreground">{formatTime(index)}</span>
                <span className={getLogColor(log)}>{log}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function getLogIcon(log: string) {
  if (log.includes("[Save]") || log.includes("[Create]")) return <CheckCircle className="h-3.5 w-3.5 text-ide-success" />;
  if (log.includes("[Sync]") || log.includes("[Language]")) return <Info className="h-3.5 w-3.5 text-ide-info" />;
  return <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />;
}

function getLogColor(log: string) {
  if (log.includes("[Save]") || log.includes("[Create]")) return "break-all text-ide-success";
  if (log.includes("[Sync]") || log.includes("[Language]")) return "break-all text-ide-info";
  return "break-all text-ide-panel-foreground";
}

function formatTime(index: number) {
  const date = new Date(Date.now() - index * 60000);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
