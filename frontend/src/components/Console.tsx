import { AlertCircle, CheckCircle, ChevronDown, ChevronUp, Info, Terminal, Trash2 } from "lucide-react";
import { useState } from "react";

type ConsoleProps = {
  logs: string[];
  isOpen: boolean;
  onToggle: () => void;
  onClear: () => void;
  onCommand: (command: string) => Promise<void> | void;
};

export function Console({ logs, isOpen, onToggle, onClear, onCommand }: ConsoleProps) {
  const [command, setCommand] = useState("");

  async function handleSubmit() {
    const trimmed = command.trim();
    if (!trimmed) return;
    setCommand("");
    await onCommand(trimmed);
  }

  return (
    <div className={`flex flex-col border-t border-ide-border bg-ide-panel transition-all ${isOpen ? "h-48" : "h-9"}`}>
      <div className="flex shrink-0 items-center justify-between border-b border-ide-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Console</span>
          <span className="rounded bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">{logs.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onClear} className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary">
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
                placeholder="Try: help, ls, code src/index.js, run hello.cpp"
                className="flex-1 bg-transparent font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto font-mono text-xs">
            {logs.map((log, index) => (
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
