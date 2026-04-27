import {
  ChevronDown,
  ChevronRight,
  File,
  FileCode,
  FileJson,
  FileText,
  Folder,
  FolderOpen,
  Image,
  Pencil,
  Plus,
  Settings,
  FolderPlus,
  Trash2
} from "lucide-react";
import { useMemo, useState } from "react";
import { buildTree } from "../lib";
import type { FileNode, FlatFile, Project } from "../types";

type SidebarProps = {
  projects: Project[];
  activeProject: Project | null;
  files: FlatFile[];
  activeFile: string;
  onChooseProject: (project: Project) => Promise<void> | void;
  onChooseFile: (path: string) => Promise<void> | void;
  onCreateProject: () => Promise<void> | void;
  onCreateFile: () => Promise<void> | void;
  onCreateFolder: () => Promise<void> | void;
  onDeleteProject: (projectId: string) => Promise<void> | void;
  onRenameEntry: (path: string, type: "file" | "folder") => Promise<void> | void;
  onDeleteEntry: (path: string, type: "file" | "folder") => Promise<void> | void;
};

export function Sidebar(props: SidebarProps) {
  const tree = useMemo(() => buildTree(props.files), [props.files]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ src: true, app: true });

  function toggle(path: string) {
    setExpanded((current) => ({ ...current, [path]: !current[path] }));
  }

  return (
    <aside className="flex h-full min-w-[248px] max-w-[300px] flex-col border-r border-ide-border bg-ide-sidebar">
      <div className="flex items-center justify-between border-b border-ide-border px-4 py-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">Explorer</p>
          <h2 className="mt-1 text-sm font-semibold text-foreground">NinjaClaw</h2>
        </div>
        <button
          className="rounded-md border border-ide-border bg-secondary px-2 py-2 text-muted-foreground transition hover:bg-ide-sidebar-hover"
          onClick={props.onCreateProject}
          title="Create project"
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="border-b border-ide-border px-3 py-3">
        <p className="mb-2 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Projects</p>
        <div className="space-y-2">
          {props.projects.map((project) => (
            <div
              key={project.id}
              className={`rounded-xl border px-3 py-2 ${
                props.activeProject?.id === project.id
                  ? "border-primary/50 bg-primary/10"
                  : "border-ide-border bg-ide-panel"
              }`}
            >
              <button className="w-full text-left" onClick={() => props.onChooseProject(project)}>
                <div className="text-sm font-medium text-foreground">{project.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">{project.description || "Local workspace"}</div>
              </button>
              <button
                className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground"
                onClick={() => props.onDeleteProject(project.id)}
              >
                <Trash2 size={12} />
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between px-3 py-3">
        <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Files</p>
        <div className="flex items-center gap-2">
          <button
            className="rounded-md border border-ide-border bg-secondary px-2 py-1 text-xs text-secondary-foreground transition hover:bg-ide-sidebar-hover"
            onClick={props.onCreateFolder}
            title="New folder"
          >
            <FolderPlus size={12} />
          </button>
          <button
            className="rounded-md border border-ide-border bg-secondary px-2 py-1 text-xs text-secondary-foreground transition hover:bg-ide-sidebar-hover"
            onClick={props.onCreateFile}
          >
            New File
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-2 pb-3">
        {tree.length === 0 ? <p className="px-2 text-sm text-muted-foreground">Create a project file to begin.</p> : null}
        {tree.map((node) => (
          <TreeNode
            key={node.path}
            node={node}
            depth={0}
            expanded={expanded}
            activeFile={props.activeFile}
            onToggle={toggle}
            onChooseFile={props.onChooseFile}
            onRenameEntry={props.onRenameEntry}
            onDeleteEntry={props.onDeleteEntry}
          />
        ))}
      </div>
    </aside>
  );
}

type TreeNodeProps = {
  node: FileNode;
  depth: number;
  expanded: Record<string, boolean>;
  activeFile: string;
  onToggle: (path: string) => void;
  onChooseFile: (path: string) => void;
  onRenameEntry: (path: string, type: "file" | "folder") => void;
  onDeleteEntry: (path: string, type: "file" | "folder") => void;
};

function TreeNode({ node, depth, expanded, activeFile, onToggle, onChooseFile, onRenameEntry, onDeleteEntry }: TreeNodeProps) {
  const paddingLeft = 10 + depth * 14;

  if (node.type === "folder") {
    const isOpen = expanded[node.path] ?? true;

    return (
      <div>
        <button
          className="group flex w-full items-center justify-between gap-1.5 rounded-sm px-2 py-1 text-sm text-ide-sidebar-foreground transition hover:bg-ide-sidebar-hover"
          onClick={() => onToggle(node.path)}
          style={{ paddingLeft }}
        >
          <span className="flex items-center gap-1.5">
            {isOpen ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
            {isOpen ? <FolderOpen size={14} className="text-ide-warning" /> : <Folder size={14} className="text-ide-warning" />}
            <span>{node.name}</span>
          </span>
          <span className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <span
              onClick={(event) => {
                event.stopPropagation();
                onRenameEntry(node.path, "folder");
              }}
              className="rounded p-1 hover:bg-secondary"
            >
              <Pencil size={12} />
            </span>
            <span
              onClick={(event) => {
                event.stopPropagation();
                onDeleteEntry(node.path, "folder");
              }}
              className="rounded p-1 hover:bg-secondary"
            >
              <Trash2 size={12} />
            </span>
          </span>
        </button>
        {isOpen
          ? node.children?.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                expanded={expanded}
                activeFile={activeFile}
                onToggle={onToggle}
                onChooseFile={onChooseFile}
                onRenameEntry={onRenameEntry}
                onDeleteEntry={onDeleteEntry}
              />
            ))
          : null}
      </div>
    );
  }

  return (
    <button
      className={`group flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition ${
        activeFile === node.path ? "bg-ide-sidebar-hover text-foreground" : "text-ide-sidebar-foreground hover:bg-ide-sidebar-hover"
      }`}
      onClick={() => onChooseFile(node.path)}
      style={{ paddingLeft }}
    >
      <span className="flex min-w-0 items-center gap-2">
        {getFileIcon(node.name)}
        <span className="truncate">{node.name}</span>
      </span>
      <span className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <span
          onClick={(event) => {
            event.stopPropagation();
            onRenameEntry(node.path, "file");
          }}
          className="rounded p-1 hover:bg-secondary"
        >
          <Pencil size={12} />
        </span>
        <span
          onClick={(event) => {
            event.stopPropagation();
            onDeleteEntry(node.path, "file");
          }}
          className="rounded p-1 hover:bg-secondary"
        >
          <Trash2 size={12} />
        </span>
      </span>
    </button>
  );
}

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();

  switch (ext) {
    case "tsx":
    case "ts":
    case "jsx":
    case "js":
    case "java":
    case "cpp":
    case "py":
      return <FileCode className="h-4 w-4 text-ide-info" />;
    case "json":
      return <FileJson className="h-4 w-4 text-ide-warning" />;
    case "css":
    case "scss":
    case "html":
      return <FileCode className="h-4 w-4 text-accent" />;
    case "md":
    case "txt":
      return <FileText className="h-4 w-4 text-muted-foreground" />;
    case "png":
    case "jpg":
    case "svg":
      return <Image className="h-4 w-4 text-ide-success" />;
    case "toml":
    case "yaml":
    case "yml":
      return <Settings className="h-4 w-4 text-muted-foreground" />;
    default:
      return <File className="h-4 w-4 text-muted-foreground" />;
  }
}
