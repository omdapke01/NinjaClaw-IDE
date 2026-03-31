import { CheckCircle, GitBranch, Wifi } from "lucide-react";

type StatusBarProps = {
  activeFile: string | null;
  language: string;
};

export function StatusBar({ activeFile, language }: StatusBarProps) {
  return (
    <div className="flex items-center justify-between bg-primary px-3 py-1 text-xs text-primary-foreground">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          <GitBranch className="h-3 w-3" />
          main
        </span>
        <span className="flex items-center gap-1">
          <CheckCircle className="h-3 w-3" />0 errors
        </span>
      </div>
      <div className="flex items-center gap-3">
        {activeFile ? <span>{language}</span> : null}
        <span>UTF-8</span>
        <span>Spaces: 2</span>
        <span className="flex items-center gap-1">
          <Wifi className="h-3 w-3" />
          Connected
        </span>
      </div>
    </div>
  );
}

