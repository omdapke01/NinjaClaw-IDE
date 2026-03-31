import { useCallback, useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { Code2, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import { api } from "./api";
import { ChatPanel } from "./components/ChatPanel";
import { Console } from "./components/Console";
import { Editor } from "./components/Editor";
import { EditorTabs } from "./components/EditorTabs";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { getLanguageMeta, inferLanguageFromPath } from "./lib";
import type { ChatMessage, FlatFile, LanguageOption, Project, User } from "./types";

const initialLogs = [
  "[NinjaClaw] WebSocket placeholder connected for live workspace updates.",
  "[NinjaClaw] Monaco Editor is running with its free API through @monaco-editor/react."
];

const initialChat: ChatMessage[] = [
  {
    id: "assistant-1",
    role: "assistant",
    content: "Ready to help shape this IDE UI. Try asking for a counter app, todo app, or project scaffold."
  }
];

export default function App() {
  const [mode, setMode] = useState<"login" | "workspace">("login");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
  const [token, setToken] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<FlatFile[]>([]);
  const [activeFile, setActiveFile] = useState("");
  const [editorValue, setEditorValue] = useState("// Choose a file from the sidebar.");
  const [language, setLanguage] = useState<LanguageOption>("javascript");
  const [logs, setLogs] = useState(initialLogs);
  const [chatMessages, setChatMessages] = useState(initialChat);
  const [isGenerating, setIsGenerating] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(true);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [aiPanelVisible, setAiPanelVisible] = useState(true);
  const [openFiles, setOpenFiles] = useState<string[]>([]);
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState("");

  const activeLanguageLabel = useMemo(() => getLanguageMeta(language).label, [language]);

  useEffect(() => {
    if (!token) return;

    const socket = io("/", { auth: { token } });
    socket.on("project:updated", async (event: { message: string }) => {
      setLogs((current) => [`[Sync] ${event.message}`, ...current].slice(0, 16));
      await loadProjects(token);
      if (activeProject) {
        await loadFiles(token, activeProject, activeFile || undefined);
      }
    });

    return () => socket.disconnect();
  }, [token, activeProject?.id, activeFile]);

  async function handleAuth(nextMode: "register" | "login") {
    try {
      setError("");
      const payload =
        nextMode === "register"
          ? await api.register(authForm)
          : await api.login({ email: authForm.email, password: authForm.password });

      setMode("workspace");
      setToken(payload.token);
      setUser(payload.user);
      setStatus(`Signed in as ${payload.user.name}`);
      await loadProjects(payload.token);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to authenticate");
    }
  }

  async function loadProjects(activeToken: string) {
    const result = await api.getProjects(activeToken);
    setProjects(result.projects);

    if (result.projects.length > 0 && !activeProject) {
      const first = result.projects[0];
      setActiveProject(first);
      await loadFiles(activeToken, first, activeFile || undefined);
    }
  }

  async function loadFiles(activeToken: string, project: Project, preferredPath?: string) {
    const result = await api.getProjectFiles(activeToken, project.id);
    setFiles(result.files);
    setActiveProject(project);

    const nextPath =
      (preferredPath && result.files.some((file) => file.path === preferredPath) ? preferredPath : undefined) ||
      (activeFile && result.files.some((file) => file.path === activeFile) ? activeFile : undefined) ||
      result.files[0]?.path;

    if (nextPath) {
      await openFile(activeToken, project.id, nextPath);
    } else {
      setActiveFile("");
      setEditorValue("// This project does not contain files yet.");
    }
  }

  async function openFile(activeToken: string, projectId: string, filePath: string) {
    const result = await api.getFileContent(activeToken, projectId, filePath);
    setActiveFile(filePath);
    setEditorValue(result.content);
    setLanguage(inferLanguageFromPath(filePath));
    setOpenFiles((current) => (current.includes(filePath) ? current : [...current, filePath]));
    setStatus(`Opened ${filePath}`);
  }

  async function createProject() {
    const name = window.prompt("Project name", "ide-playground");
    if (!name) return;

    const result = await api.createProject(token, { name, description: "Browser IDE workspace" });
    setProjects(result.projects);
    const created = result.projects[result.projects.length - 1];
    if (created) {
      setActiveProject(created);
      setFiles([]);
      setActiveFile("");
      setEditorValue("// Create a file and start building.");
      setStatus(`Created project ${created.name}`);
    }
  }

  async function createFile() {
    if (!activeProject) return;
    const meta = getLanguageMeta(language);
    const path = window.prompt("New file path", `src/main.${meta.extension}`);
    if (!path) return;

    await api.createFile(token, activeProject.id, {
      path,
      content: meta.starter
    });

    setLogs((current) => [`[Create] ${path}`, ...current].slice(0, 16));
    await loadFiles(token, activeProject, activeFile || undefined);
  }

  async function saveFile() {
    if (!activeProject || !activeFile) return;
    await api.saveFile(token, activeProject.id, { path: activeFile, content: editorValue });
    setStatus(`Saved ${activeFile}`);
    setLogs((current) => [`[Save] ${activeFile} updated`, ...current].slice(0, 16));
  }

  async function runActiveFile() {
    if (!activeProject || !activeFile) return;

    await saveFile();
    const result = await api.runFile(token, activeProject.id, { path: activeFile });
    const outputLines = result.output
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => `[Run ${result.ranAt}] ${line}`);

    setConsoleOpen(true);
    setLogs((current) => [`[Run] ${activeFile} (${result.runtime})`, ...outputLines, ...current].slice(0, 40));
    setStatus(result.ok ? `Ran ${activeFile}` : `Run failed for ${activeFile}`);
  }

  async function removeProject(projectId: string) {
    const result = await api.deleteProject(token, projectId);
    setProjects(result.projects);
    const nextProject = result.projects[0] ?? null;
    setActiveProject(nextProject);
    setOpenFiles([]);
    if (nextProject) {
      await loadFiles(token, nextProject, activeFile || undefined);
    } else {
      setFiles([]);
      setActiveFile("");
      setEditorValue("// Create a new project to continue.");
    }
  }

  async function handleLanguageChange(nextLanguage: LanguageOption) {
    setLanguage(nextLanguage);
    setLogs((current) => [`[Language] Switched to ${getLanguageMeta(nextLanguage).label}`, ...current].slice(0, 16));
  }

  async function handleChatSend(content: string) {
    setChatMessages((current) => [...current, { id: `user-${Date.now()}`, role: "user", content }]);
    setIsGenerating(true);

    window.setTimeout(() => {
      setChatMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: `UI placeholder: I can help scaffold a ${content.toLowerCase()} flow next. The AI backend can be improved later without changing this panel layout.`
        }
      ]);
      setIsGenerating(false);
    }, 900);
  }

  async function handleTerminalCommand(command: string) {
    if (!activeProject) return;

    const result = await api.terminalCommand(token, activeProject.id, { command });
    const outputLines = result.output
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => `[Terminal ${result.executedAt}] ${line}`);

    setConsoleOpen(true);
    setLogs((current) => [`$ ${command}`, ...outputLines, ...current].slice(0, 60));

    if (result.openedFile) {
        await loadFiles(token, activeProject, activeFile || undefined);
        await openFile(token, activeProject.id, result.openedFile);
      } else if (/^(mkdir|touch|code)\b/.test(command)) {
        await loadFiles(token, activeProject, activeFile || undefined);
      }
  }

  const handleFileSelect = useCallback(
    async (path: string) => {
      if (!activeProject) return;
      await openFile(token, activeProject.id, path);
    },
    [activeProject, token]
  );

  const handleTabClose = useCallback(
    (path: string) => {
      setOpenFiles((current) => {
        const next = current.filter((file) => file !== path);

        if (activeFile === path) {
          const replacement = next[next.length - 1] ?? "";
          setActiveFile(replacement);

          if (replacement && activeProject) {
            void openFile(token, activeProject.id, replacement);
          } else {
            setEditorValue("// Choose a file from the sidebar.");
          }
        }

        return next;
      });
    },
    [activeFile, activeProject, token]
  );

  if (mode !== "workspace") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#090b10] px-6 text-zinc-100">
        <section className="w-full max-w-xl rounded-3xl border border-border bg-[#111318] p-8 shadow-panel">
          <div className="mb-8 flex items-center gap-3">
            <div className="rounded-2xl bg-emerald-500/15 p-3 text-emerald-300">
              <Code2 size={24} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">NinjaClaw IDE</p>
              <h1 className="mt-1 text-2xl font-semibold text-zinc-100">Browser IDE starter</h1>
            </div>
          </div>

          <p className="mb-6 text-sm leading-7 text-zinc-400">
            Monaco editor, file explorer, AI chat panel, console, and language-aware starter templates for JavaScript,
            Python, C++, and Java.
          </p>

          <div className="grid gap-3">
            <input
              placeholder="Name"
              value={authForm.name}
              onChange={(event) => setAuthForm({ ...authForm, name: event.target.value })}
              className="rounded-2xl border border-border bg-[#0c0f14] px-4 py-3 text-sm outline-none placeholder:text-zinc-600"
            />
            <input
              placeholder="Email"
              value={authForm.email}
              onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })}
              className="rounded-2xl border border-border bg-[#0c0f14] px-4 py-3 text-sm outline-none placeholder:text-zinc-600"
            />
            <input
              type="password"
              placeholder="Password"
              value={authForm.password}
              onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })}
              className="rounded-2xl border border-border bg-[#0c0f14] px-4 py-3 text-sm outline-none placeholder:text-zinc-600"
            />
          </div>

          {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}

          <div className="mt-6 flex gap-3">
            <button className="rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-medium text-black" onClick={() => handleAuth("register")}>
              Register
            </button>
            <button
              className="rounded-2xl border border-border bg-muted px-4 py-3 text-sm font-medium text-zinc-100"
              onClick={() => handleAuth("login")}
            >
              Login
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="h-screen w-screen overflow-hidden bg-background">
      <div className="flex h-full flex-col overflow-hidden bg-background">
        <div className="flex shrink-0 items-center justify-between border-b border-ide-border bg-ide-panel px-4 py-1.5">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Code2 className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">NinjaClaw IDE</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className="cursor-pointer rounded px-2 py-0.5 transition-colors hover:bg-secondary">File</span>
              <span className="cursor-pointer rounded px-2 py-0.5 transition-colors hover:bg-secondary">Edit</span>
              <span className="cursor-pointer rounded px-2 py-0.5 transition-colors hover:bg-secondary">View</span>
              <span className="cursor-pointer rounded px-2 py-0.5 transition-colors hover:bg-secondary">Terminal</span>
              <span className="cursor-pointer rounded px-2 py-0.5 transition-colors hover:bg-secondary">Help</span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setSidebarVisible((current) => !current)}
              className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-secondary"
              title="Toggle file explorer"
            >
              {sidebarVisible ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
            </button>
            <button
              onClick={() => setAiPanelVisible((current) => !current)}
              className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-secondary"
              title="Toggle AI panel"
            >
              {aiPanelVisible ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          {sidebarVisible ? (
            <div className="w-72 shrink-0 border-r border-ide-border">
              <Sidebar
                projects={projects}
                activeProject={activeProject}
                files={files}
                activeFile={activeFile}
                onChooseProject={(project) => loadFiles(token, project, activeFile || undefined)}
                onChooseFile={handleFileSelect}
                onCreateProject={createProject}
                onCreateFile={createFile}
                onDeleteProject={removeProject}
              />
            </div>
          ) : null}

          <section className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center justify-between border-b border-ide-border bg-ide-panel px-3 py-2 text-xs text-muted-foreground">
              <div>{activeProject?.name || "Choose a project"}</div>
              <div>{status}</div>
            </div>

            <EditorTabs
              openFiles={openFiles}
              activeFile={activeFile || null}
              onTabSelect={(path) => {
                void handleFileSelect(path);
              }}
              onTabClose={handleTabClose}
            />

            <div className="min-h-0 flex-1">
              {activeFile ? (
                <Editor
                  filePath={activeFile}
                  language={language}
                  value={editorValue}
                  onChange={setEditorValue}
                  onSave={saveFile}
                  onRun={runActiveFile}
                  onLanguageChange={handleLanguageChange}
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 bg-ide-editor">
                  <Code2 className="h-16 w-16 text-muted-foreground/20" />
                  <p className="text-sm text-muted-foreground">Select a file to start editing</p>
                </div>
              )}
            </div>

            <Console
              logs={logs}
              isOpen={consoleOpen}
              onToggle={() => setConsoleOpen((current) => !current)}
              onClear={() => setLogs([])}
              onCommand={handleTerminalCommand}
            />
          </section>

          {aiPanelVisible ? (
            <div className="w-[340px] shrink-0 border-l border-ide-border">
              <ChatPanel messages={chatMessages} onSend={handleChatSend} isGenerating={isGenerating} />
            </div>
          ) : null}
        </div>

        <StatusBar activeFile={activeFile || null} language={activeLanguageLabel} />
      </div>
    </main>
  );
}
