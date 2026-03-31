import { FileCode, X } from "lucide-react";

type EditorTabsProps = {
  openFiles: string[];
  activeFile: string | null;
  onTabSelect: (path: string) => void;
  onTabClose: (path: string) => void;
};

export function EditorTabs({ openFiles, activeFile, onTabSelect, onTabClose }: EditorTabsProps) {
  if (openFiles.length === 0) return null;

  return (
    <div className="flex overflow-x-auto border-b border-ide-border bg-ide-tab">
      {openFiles.map((file) => {
        const fileName = file.split("/").pop() || file;
        const isActive = file === activeFile;

        return (
          <button
            key={file}
            onClick={() => onTabSelect(file)}
            className={`group flex min-w-0 shrink-0 items-center gap-1.5 border-r border-ide-border px-3 py-2 text-xs transition-colors ${
              isActive
                ? "border-t-2 border-t-primary bg-ide-tab-active text-ide-tab-active-foreground"
                : "text-ide-tab-foreground hover:bg-ide-tab-active/50"
            }`}
          >
            <FileCode className="h-3.5 w-3.5 shrink-0 text-ide-info" />
            <span className="truncate">{fileName}</span>
            <span
              onClick={(event) => {
                event.stopPropagation();
                onTabClose(file);
              }}
              className="ml-1 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-secondary"
            >
              <X className="h-3 w-3" />
            </span>
          </button>
        );
      })}
    </div>
  );
}

