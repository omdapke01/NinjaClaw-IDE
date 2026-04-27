import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { io } from "socket.io-client";
import { Check, ChevronRight, Code2, GripVertical, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import { api } from "./api";
import { AnimatedBackdrop } from "./components/AnimatedBackdrop";
import { ChatPanel } from "./components/ChatPanel";
import { Console } from "./components/Console";
import { Editor } from "./components/Editor";
import { EditorTabs } from "./components/EditorTabs";
import { LandingPage } from "./components/LandingPage";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import {
  createDefaultDemoState,
  demoFileKey,
  DEMO_STORAGE_KEY,
  loadDemoState,
  saveDemoState,
  simulateAiReply,
  simulateCodeRun
} from "./demo";
import { getLanguageMeta, inferLanguageFromPath } from "./lib";
import type { AiAction, ChatMessage, CodeApplyAction, ConsoleTab, EditorCursorContext, FlatFile, LanguageOption, Project, User } from "./types";

const initialLogs = [
  "[NinjaClaw] Workspace updates channel connected.",
  "[NinjaClaw] IDE is ready."
];

const initialChat: ChatMessage[] = [
  {
    id: "assistant-1",
    role: "assistant",
    content: "Ready to help shape this IDE UI. Try asking for a counter app, todo app, or project scaffold."
  }
];

const isHostedDemo = typeof window !== "undefined" && window.location.hostname.includes("vercel.app");

export default function App() {
  const [demoMode, setDemoMode] = useState(isHostedDemo);
  const [demoState, setDemoState] = useState(() => loadDemoState());
  const [mode, setMode] = useState<"landing" | "login" | "workspace">("landing");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
  const [token, setToken] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<FlatFile[]>([]);
  const [activeFile, setActiveFile] = useState("");
  const [editorValue, setEditorValue] = useState("// Choose a file from the sidebar.");
  const [language, setLanguage] = useState<LanguageOption>("javascript");
  const [outputLogs, setOutputLogs] = useState(initialLogs);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [chatMessages, setChatMessages] = useState(initialChat);
  const [isGenerating, setIsGenerating] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(true);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [aiPanelVisible, setAiPanelVisible] = useState(true);
  const [aiPanelWidth, setAiPanelWidth] = useState(340);
  const [openFiles, setOpenFiles] = useState<string[]>([]);
  const [activeRunSessionId, setActiveRunSessionId] = useState<string | null>(null);
  const [consoleHeight, setConsoleHeight] = useState(260);
  const [consoleTab, setConsoleTab] = useState<ConsoleTab>("output");
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState("");
  const [, setCursorContext] = useState<EditorCursorContext>({
    lineNumber: 1,
    column: 1,
    prefix: "",
    suffix: ""
  });
  const [openMenu, setOpenMenu] = useState<"file" | "edit" | null>(null);
  const [resizingAiPanel, setResizingAiPanel] = useState(false);

  const activeLanguageLabel = useMemo(() => getLanguageMeta(language).label, [language]);

  const pushOutputLogs = useCallback((entries: string[], limit = 60) => {
    setConsoleTab("output");
    setOutputLogs((current) => [...entries, ...current].slice(0, limit));
  }, []);

  const pushTerminalLogs = useCallback((entries: string[], limit = 80, focus = true) => {
    if (focus) {
      setConsoleTab("terminal");
    }
    setTerminalLogs((current) => [...entries, ...current].slice(0, limit));
  }, []);

  const enterDemoMode = useCallback(() => {
    const state = loadDemoState() || createDefaultDemoState();
    const firstProject = state.projects[0] || null;
    const projectFiles = firstProject ? state.filesByProject[firstProject.id] || [] : [];
    const firstFile = projectFiles[0]?.path || "";

    setDemoMode(true);
    setDemoState(state);
    setMode("workspace");
    setToken("demo-token");
    setUser(state.user);
    setProjects(state.projects);
    setActiveProject(firstProject);
    setFiles(projectFiles);
    setActiveFile(firstFile);
    setOpenFiles(firstFile ? [firstFile] : []);
    setChatMessages(initialChat);
    setOutputLogs([
      "[Demo] Browser-only workspace loaded for portfolio mode.",
      "[Demo] Code execution and AI replies are simulated locally.",
      ...initialLogs
    ]);
    setTerminalLogs([]);
    setConsoleOpen(true);
    setActiveRunSessionId(null);
    setError("");
    setStatus(`Demo mode active as ${state.user.name}`);

    if (firstFile && firstProject) {
      setEditorValue(state.fileContents[demoFileKey(firstProject.id, firstFile)] || "");
      setLanguage(inferLanguageFromPath(firstFile));
    } else {
      setEditorValue("// Create a file and start building.");
      setLanguage("javascript");
    }
  }, []);

  useEffect(() => {
    if (demoMode) {
      saveDemoState(demoState);
    }
  }, [demoMode, demoState]);

  useEffect(() => {
    if (!resizingAiPanel) return undefined;

    function handleMove(event: MouseEvent) {
      const nextWidth = Math.min(520, Math.max(280, window.innerWidth - event.clientX));
      setAiPanelWidth(nextWidth);
    }

    function handleUp() {
      setResizingAiPanel(false);
    }

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [resizingAiPanel]);

  useEffect(() => {
    if (!token || demoMode) return;

    const socket = io("/", { auth: { token } });
    socket.on("project:updated", async (event: { message: string }) => {
      pushTerminalLogs([`[Sync] ${event.message}`], 24, false);
      await loadProjects(token);
      if (activeProject) {
        await loadFiles(token, activeProject, activeFile || undefined);
      }
    });
    return () => socket.disconnect();
  }, [token, activeProject?.id, activeFile, demoMode, pushTerminalLogs]);

  async function handleAuth(nextMode: "register" | "login") {
    if (demoMode) {
      enterDemoMode();
      return;
    }

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
    if (demoMode) {
      setProjects(demoState.projects);
      if (demoState.projects.length > 0 && !activeProject) {
        const first = demoState.projects[0];
        setActiveProject(first);
        await loadFiles(activeToken, first, activeFile || undefined);
      }
      return;
    }

    const result = await api.getProjects(activeToken);
    setProjects(result.projects);

    if (result.projects.length > 0 && !activeProject) {
      const first = result.projects[0];
      setActiveProject(first);
      await loadFiles(activeToken, first, activeFile || undefined);
    }
  }

  async function loadFiles(activeToken: string, project: Project, preferredPath?: string) {
    if (demoMode) {
      const projectFiles = demoState.filesByProject[project.id] || [];
      setFiles(projectFiles);
      setActiveProject(project);
      const fileEntries = projectFiles.filter((file) => file.type !== "folder");

      const nextPath =
        (preferredPath && fileEntries.some((file) => file.path === preferredPath) ? preferredPath : undefined) ||
        (activeFile && fileEntries.some((file) => file.path === activeFile) ? activeFile : undefined) ||
        fileEntries[0]?.path;

      if (nextPath) {
        await openFile(activeToken, project.id, nextPath);
      } else {
        setActiveFile("");
        setEditorValue("// This project does not contain files yet.");
      }
      return;
    }

    const result = await api.getProjectFiles(activeToken, project.id);
    setFiles(result.files);
    setActiveProject(project);
    const fileEntries = result.files.filter((file) => file.type !== "folder");

    const nextPath =
      (preferredPath && fileEntries.some((file) => file.path === preferredPath) ? preferredPath : undefined) ||
      (activeFile && fileEntries.some((file) => file.path === activeFile) ? activeFile : undefined) ||
      fileEntries[0]?.path;

    if (nextPath) {
      await openFile(activeToken, project.id, nextPath);
    } else {
      setActiveFile("");
      setEditorValue("// This project does not contain files yet.");
    }
  }

  async function openFile(activeToken: string, projectId: string, filePath: string) {
    if (demoMode) {
      const content = demoState.fileContents[demoFileKey(projectId, filePath)] || "";
      setActiveFile(filePath);
      setEditorValue(content);
      setLanguage(inferLanguageFromPath(filePath));
      setOpenFiles((current) => (current.includes(filePath) ? current : [...current, filePath]));
      setInlineSuggestion(null);
      setStatus(`Opened ${filePath}`);
      return;
    }

    const result = await api.getFileContent(activeToken, projectId, filePath);
    setActiveFile(filePath);
    setEditorValue(result.content);
    setLanguage(inferLanguageFromPath(filePath));
    setOpenFiles((current) => (current.includes(filePath) ? current : [...current, filePath]));
    setInlineSuggestion(null);
    setStatus(`Opened ${filePath}`);
  }

  async function createProject() {
    const name = window.prompt("Project name", "ide-playground");
    if (!name) return;

    if (demoMode) {
      const created = {
        id: `demo-project-${Date.now()}`,
        name,
        description: "Browser IDE workspace"
      };
      setDemoState((current) => ({
        ...current,
        projects: [...current.projects, created],
        filesByProject: { ...current.filesByProject, [created.id]: [] }
      }));
      setProjects((current) => [...current, created]);
      setActiveProject(created);
      setFiles([]);
      setActiveFile("");
      setEditorValue("// Create a file and start building.");
      setStatus(`Created project ${created.name}`);
      return;
    }

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

    if (demoMode) {
      const newFile = { name: path.split("/").pop() || path, path, type: "file" as const };
      const content = meta.starter;
      setDemoState((current) => ({
        ...current,
        filesByProject: {
          ...current.filesByProject,
          [activeProject.id]: [...(current.filesByProject[activeProject.id] || []), newFile]
        },
        fileContents: {
          ...current.fileContents,
          [demoFileKey(activeProject.id, path)]: content
        }
      }));
      pushOutputLogs([`[Create] ${path}`], 16);
      await loadFiles(token, activeProject, path);
      return;
    }

    await api.createFile(token, activeProject.id, {
      path,
      content: meta.starter
    });

    pushOutputLogs([`[Create] ${path}`], 16);
    await loadFiles(token, activeProject, activeFile || undefined);
  }

  async function createTextFile() {
    if (!activeProject) return;
    const filePath = window.prompt("New text file path", "notes.txt");
    if (!filePath) return;

    if (demoMode) {
      const newFile = { name: filePath.split("/").pop() || filePath, path: filePath, type: "file" as const };
      setDemoState((current) => ({
        ...current,
        filesByProject: {
          ...current.filesByProject,
          [activeProject.id]: [...(current.filesByProject[activeProject.id] || []), newFile]
        },
        fileContents: {
          ...current.fileContents,
          [demoFileKey(activeProject.id, filePath)]: ""
        }
      }));
      pushOutputLogs([`[Create] ${filePath}`], 16);
      await loadFiles(token, activeProject, filePath);
      return;
    }

    await api.createFile(token, activeProject.id, { path: filePath, content: "" });
    pushOutputLogs([`[Create] ${filePath}`], 16);
    await loadFiles(token, activeProject, filePath);
  }

  async function createFolder() {
    if (!activeProject) return;
    const folderPath = window.prompt("New folder path", "src/components");
    if (!folderPath) return;

    if (demoMode) {
      const folderEntry = { name: folderPath.split("/").pop() || folderPath, path: folderPath, type: "folder" as const };
      setDemoState((current) => ({
        ...current,
        filesByProject: {
          ...current.filesByProject,
          [activeProject.id]: [...(current.filesByProject[activeProject.id] || []).filter((file) => file.path !== folderPath), folderEntry]
        }
      }));
      pushOutputLogs([`[Create] Folder ${folderPath}`], 16);
      await loadFiles(token, activeProject, activeFile || undefined);
      return;
    }

    await api.createFolder(token, activeProject.id, { path: folderPath });
    pushOutputLogs([`[Create] Folder ${folderPath}`], 16);
    await loadFiles(token, activeProject, activeFile || undefined);
  }

  async function renameEntry(path: string, type: "file" | "folder") {
    if (!activeProject) return;
    const fileName = path.split("/").pop() || path;
    const nextPath = window.prompt(`Rename ${type}`, path.replace(fileName, "") + fileName);
    if (!nextPath || nextPath === path) return;

    if (demoMode) {
      const projectFiles = demoState.filesByProject[activeProject.id] || [];
      const renamedFiles = projectFiles.map((file) => {
        if (type === "file" && file.path === path) {
          return { name: nextPath.split("/").pop() || nextPath, path: nextPath };
        }

        if (type === "folder" && (file.path === path || file.path.startsWith(`${path}/`))) {
          const updatedPath = file.path === path ? nextPath : `${nextPath}/${file.path.slice(path.length + 1)}`;
          return { name: updatedPath.split("/").pop() || updatedPath, path: updatedPath };
        }

        return file;
      });

      const nextFileContents = Object.fromEntries(
        Object.entries(demoState.fileContents).map(([key, value]) => {
          const [, filePath] = key.split(":");
          if (type === "file" && filePath === path) {
            return [`${activeProject.id}:${nextPath}`, value];
          }
          if (type === "folder" && (filePath === path || filePath.startsWith(`${path}/`))) {
            const updatedPath = filePath === path ? nextPath : `${nextPath}/${filePath.slice(path.length + 1)}`;
            return [`${activeProject.id}:${updatedPath}`, value];
          }
          return [key, value];
        })
      );

      setDemoState((current) => ({
        ...current,
        filesByProject: { ...current.filesByProject, [activeProject.id]: renamedFiles },
        fileContents: nextFileContents
      }));
      pushOutputLogs([`[Rename] ${path} -> ${nextPath}`], 16);
      const nextActivePath =
        type === "file"
          ? activeFile === path
            ? nextPath
            : activeFile || undefined
          : activeFile === path || activeFile.startsWith(`${path}/`)
            ? `${nextPath}${activeFile === path ? "" : activeFile.slice(path.length)}`
            : activeFile || undefined;
      await loadFiles(token, activeProject, nextActivePath);
      return;
    }

    const result = await api.renameEntry(token, activeProject.id, { oldPath: path, newPath: nextPath, type });
    pushOutputLogs([`[Rename] ${path} -> ${result.path}`], 16);
    const preferredPath =
      type === "file"
        ? activeFile === path
          ? result.path
          : activeFile || undefined
        : activeFile === path || activeFile.startsWith(`${path}/`)
          ? `${result.path}${activeFile === path ? "" : activeFile.slice(path.length)}`
          : activeFile || undefined;
    await loadFiles(token, activeProject, preferredPath);
  }

  async function deleteEntry(path: string, type: "file" | "folder") {
    if (!activeProject) return;
    if (!window.confirm(`Delete ${type} ${path}?`)) return;

    if (demoMode) {
      const nextFiles = (demoState.filesByProject[activeProject.id] || []).filter((file) =>
        type === "file" ? file.path !== path : !(file.path === path || file.path.startsWith(`${path}/`))
      );
      const nextFileContents = Object.fromEntries(
        Object.entries(demoState.fileContents).filter(([key]) => {
          const [, filePath] = key.split(":");
          return type === "file" ? filePath !== path : !(filePath === path || filePath.startsWith(`${path}/`));
        })
      );

      setDemoState((current) => ({
        ...current,
        filesByProject: { ...current.filesByProject, [activeProject.id]: nextFiles },
        fileContents: nextFileContents
      }));
      setOpenFiles((current) => current.filter((file) => (type === "file" ? file !== path : !file.startsWith(`${path}/`) && file !== path)));
      if (activeFile === path || activeFile.startsWith(`${path}/`)) {
        setActiveFile("");
        setEditorValue("// Choose a file from the sidebar.");
      }
      pushOutputLogs([`[Delete] ${path}`], 16);
      await loadFiles(token, activeProject, activeFile || undefined);
      return;
    }

    await api.deleteEntry(token, activeProject.id, { path, type });
    setOpenFiles((current) => current.filter((file) => (type === "file" ? file !== path : !file.startsWith(`${path}/`) && file !== path)));
    if (activeFile === path || activeFile.startsWith(`${path}/`)) {
      setActiveFile("");
      setEditorValue("// Choose a file from the sidebar.");
    }
    pushOutputLogs([`[Delete] ${path}`], 16);
    await loadFiles(token, activeProject, activeFile || undefined);
  }

  async function saveFile() {
    if (!activeProject || !activeFile) return;

    if (demoMode) {
      setDemoState((current) => ({
        ...current,
        fileContents: {
          ...current.fileContents,
          [demoFileKey(activeProject.id, activeFile)]: editorValue
        }
      }));
      setStatus(`Saved ${activeFile}`);
      pushTerminalLogs([`[Save] ${activeFile} updated`], 24, false);
      return;
    }

    await api.saveFile(token, activeProject.id, { path: activeFile, content: editorValue });
    setStatus(`Saved ${activeFile}`);
    pushTerminalLogs([`[Save] ${activeFile} updated`], 24, false);
  }

  async function runActiveFile() {
    if (!activeProject || !activeFile) return;

    try {
      await saveFile();

      if (demoMode) {
        const output = simulateCodeRun(language, editorValue, activeFile);
        const outputLines = output
          .split(/\r?\n/)
          .filter(Boolean)
          .map((line) => `[Run demo] ${line}`);
        setConsoleOpen(true);
        setActiveRunSessionId(null);
        pushOutputLogs([`[Run] ${activeFile} (${language})`, ...(outputLines.length > 0 ? outputLines : ["[Run demo] (no output)"])], 80);
        setStatus(`Simulated run for ${activeFile}`);
        return;
      }

      const result = await api.runFile(token, activeProject.id, { path: activeFile });
      const outputLines = result.output
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => `[Run ${result.ranAt}] ${line}`);

      const fallbackLine =
        result.status === "running"
          ? `[Run ${result.ranAt}] Program started and is waiting for input. Use the terminal box below.`
          : result.ok
            ? `[Run ${result.ranAt}] Program finished with no output.`
            : `[Run ${result.ranAt}] Execution failed with no output.`;

      setConsoleOpen(true);
      setActiveRunSessionId(result.status === "running" ? result.sessionId : null);
      pushOutputLogs([`[Run] ${activeFile} (${result.runtime})`, ...(outputLines.length > 0 ? outputLines : [fallbackLine])], 80);
      setStatus(result.status === "running" ? `${activeFile} is waiting for input` : result.ok ? `Ran ${activeFile}` : `Run failed for ${activeFile}`);
    } catch (runError) {
      const message = runError instanceof Error ? runError.message : "Run failed";
      setConsoleOpen(true);
      setActiveRunSessionId(null);
      pushOutputLogs([`[Run] ${activeFile} (${language})`, `[Run error] ${message}`], 80);
      setStatus(`Run failed for ${activeFile}`);
    }
  }

  async function removeProject(projectId: string) {
    if (demoMode) {
      const nextProjects = demoState.projects.filter((project) => project.id !== projectId);
      const nextFilesByProject = { ...demoState.filesByProject };
      delete nextFilesByProject[projectId];
      const nextFileContents = Object.fromEntries(
        Object.entries(demoState.fileContents).filter(([key]) => !key.startsWith(`${projectId}:`))
      );
      setDemoState((current) => ({
        ...current,
        projects: nextProjects,
        filesByProject: nextFilesByProject,
        fileContents: nextFileContents
      }));
      setProjects(nextProjects);
      const nextProject = nextProjects[0] ?? null;
      setActiveProject(nextProject);
      setOpenFiles([]);
      if (nextProject) {
        await loadFiles(token, nextProject, activeFile || undefined);
      } else {
        setFiles([]);
        setActiveFile("");
        setEditorValue("// Create a new project to continue.");
      }
      return;
    }

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
      pushTerminalLogs([`[Language] Switched to ${getLanguageMeta(nextLanguage).label}`], 24, false);
  }

  async function handleChatSend(content: string) {
    setChatMessages((current) => [...current, { id: `user-${Date.now()}`, role: "user", content }]);
    setIsGenerating(true);

    if (demoMode) {
      window.setTimeout(() => {
        setChatMessages((current) => [
          ...current,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: simulateAiReply(content, activeFile || undefined)
          }
        ]);
        pushOutputLogs(["[AI] Demo mode reply generated"]);
        setIsGenerating(false);
      }, 500);
      return;
    }

    try {
      const result = await api.aiChat(token, {
        message: content,
        projectId: activeProject?.id,
        activeFilePath: activeFile || undefined,
        activeFileContent: activeFile ? editorValue : undefined,
        language,
        intent: "chat"
      });

      setChatMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: result.reply
        }
      ]);
      pushOutputLogs([`[AI] Reply received from ${result.model}`]);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "AI request failed";
      setChatMessages((current) => [
        ...current,
        {
          id: `assistant-error-${Date.now()}`,
          role: "assistant",
          content: `AI error: ${message}`
        }
      ]);
      pushOutputLogs([`[AI] ${message}`]);
    } finally {
      setIsGenerating(false);
    }
  }

  function actionPrompt(action: AiAction) {
    const label = runtimeLabel(language);

    if (action === "explain") {
      return `Explain the current ${label} file clearly. Focus on what each important block does and mention any issues you notice.`;
    }

    if (action === "fix") {
      return `Fix the current ${label} file. Explain the bug briefly, then return the corrected full code in one fenced ${language} block.`;
    }

    if (action === "continue") {
      return `Continue the current ${label} code in the same style and language. Return the next useful code only if it is obvious, otherwise return the improved full file.`;
    }

    return `Generate a complete, runnable solution in ${label} for the current task and return the full code in one fenced ${language} block.`;
  }

  async function handleAiAction(action: AiAction) {
    const content = actionPrompt(action);
    setChatMessages((current) => [
      ...current,
      {
        id: `action-${action}-${Date.now()}`,
        role: "user",
        content: `${action === "generate" ? "Generate full solution" : action === "continue" ? "Continue in current language" : action === "fix" ? "Fix this code" : "Explain this code"}`
      }
    ]);
    setIsGenerating(true);

    if (demoMode) {
      window.setTimeout(() => {
        setChatMessages((current) => [
          ...current,
          {
            id: `assistant-action-${Date.now()}`,
            role: "assistant",
            content: simulateAiReply(content, activeFile || undefined)
          }
        ]);
        pushOutputLogs([`[AI] Demo ${action} reply generated`]);
        setIsGenerating(false);
      }, 400);
      return;
    }

    try {
      const result = await api.aiChat(token, {
        message: content,
        projectId: activeProject?.id,
        activeFilePath: activeFile || undefined,
        activeFileContent: activeFile ? editorValue : undefined,
        language,
        intent: action
      });

      setChatMessages((current) => [
        ...current,
        {
          id: `assistant-action-${Date.now()}`,
          role: "assistant",
          content: result.reply
        }
      ]);
      pushOutputLogs([`[AI] ${action} reply received from ${result.model}`]);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "AI action failed";
      setChatMessages((current) => [
        ...current,
        {
          id: `assistant-action-error-${Date.now()}`,
          role: "assistant",
          content: `AI error: ${message}`
        }
      ]);
      pushOutputLogs([`[AI] ${message}`]);
    } finally {
      setIsGenerating(false);
    }
  }

  async function applyCodeFromAi(action: CodeApplyAction, payload: { language: string; code: string }) {
    if (!activeProject) return;

    if (action === "replace") {
      if (!activeFile) return;
      setEditorValue(payload.code);
      setLanguage(normalizeLanguage(payload.language, language));
      pushOutputLogs([`[AI] Replaced ${activeFile} from assistant snippet`]);
      return;
    }

    if (action === "append") {
      if (!activeFile) return;
      setEditorValue((current) => `${current.trimEnd()}\n\n${payload.code}`.trim());
      pushOutputLogs([`[AI] Appended assistant snippet into ${activeFile}`]);
      return;
    }

    const targetLanguage = normalizeLanguage(payload.language, language);
    const extension = getLanguageMeta(targetLanguage).extension;
    const filePath = window.prompt("New file path for AI snippet", `src/ai-snippet.${extension}`);
    if (!filePath) return;

    if (demoMode) {
      const newFile = { name: filePath.split("/").pop() || filePath, path: filePath, type: "file" as const };
      setDemoState((current) => ({
        ...current,
        filesByProject: {
          ...current.filesByProject,
          [activeProject.id]: [...(current.filesByProject[activeProject.id] || []), newFile]
        },
        fileContents: {
          ...current.fileContents,
          [demoFileKey(activeProject.id, filePath)]: payload.code
        }
      }));
      pushOutputLogs([`[AI] Created ${filePath} from assistant snippet`]);
      await loadFiles(token, activeProject, filePath);
      return;
    }

    await api.createFile(token, activeProject.id, { path: filePath, content: payload.code });
    pushOutputLogs([`[AI] Created ${filePath} from assistant snippet`]);
    await loadFiles(token, activeProject, filePath);
  }

  function handleMenuAction(action: string) {
    setOpenMenu(null);

    if (action === "new-text-file") {
      void createTextFile();
      return;
    }

    if (action === "new-file") {
      void createFile();
      return;
    }

    if (action === "new-window") {
      window.open(window.location.href, "_blank", "noopener,noreferrer");
      return;
    }

    if (action === "new-window-profile") {
      window.open(window.location.href, "_blank", "noopener,noreferrer");
      pushOutputLogs(["[Window] Opened a new NinjaClaw window"]);
      return;
    }

    if (action === "open-file") {
      const filePath = window.prompt("Open file path", activeFile || "src/main.js");
      if (!filePath || !activeProject) return;
      void handleFileSelect(filePath);
      return;
    }

    if (action === "open-folder") {
      void createFolder();
      return;
    }

    if (action === "open-workspace-file") {
      const projectName = window.prompt("Open project name", projects[0]?.name || "");
      const match = projects.find((project) => project.name.toLowerCase() === String(projectName || "").toLowerCase());
      if (match) {
        void loadFiles(token, match, activeFile || undefined);
      } else {
        setStatus("Workspace not found");
      }
      return;
    }

    if (action === "open-recent") {
      const recent = projects[0];
      if (recent) {
        void loadFiles(token, recent, activeFile || undefined);
      }
      return;
    }

    if (action === "undo" || action === "redo" || action === "cut" || action === "copy") {
      document.execCommand(action);
      return;
    }

    if (action === "paste") {
      navigator.clipboard.readText().then((text) => {
        if (text && activeFile) {
          setEditorValue((current) => `${current}${text}`);
        }
      }).catch(() => {
        setStatus("Paste blocked by browser permissions");
      });
      return;
    }

    if (action === "find") {
      const term = window.prompt("Find text", "");
      if (term) {
        window.find(term);
      }
    }
  }

  async function handleTerminalCommand(command: string) {
    if (!activeProject) return;

    if (demoMode) {
      const input = command.trim();
      const [cmd, ...rest] = input.split(/\s+/);
      const arg = rest[0] || "";

      if (cmd === "help") {
        pushTerminalLogs([`$ ${command}`, "[Demo] help", "pwd", "ls", "mkdir <folder>", "code <file>", "cat <file>", "run <file>"]);
        return;
      }

      if (cmd === "pwd") {
        pushTerminalLogs([`$ ${command}`, `[Demo] /${activeProject.name.replace(/\s+/g, "-").toLowerCase()}`]);
        return;
      }

      if (cmd === "ls" || cmd === "dir") {
        const list = (demoState.filesByProject[activeProject.id] || []).map((file) => file.path).join("\n") || "(empty)";
        pushTerminalLogs([`$ ${command}`, ...list.split("\n")]);
        return;
      }

      if (cmd === "mkdir") {
        pushTerminalLogs([`$ ${command}`, `[Demo] Created folder ${arg || "new-folder"}`]);
        return;
      }

      if (cmd === "code" || cmd === "touch") {
        const filePath = arg || "src/demo.js";
        const inferredLanguage = inferLanguageFromPath(filePath);
        const meta = getLanguageMeta(inferredLanguage);
        const newFile = { name: filePath.split("/").pop() || filePath, path: filePath };
        setDemoState((current) => ({
          ...current,
          filesByProject: {
            ...current.filesByProject,
            [activeProject.id]: [...(current.filesByProject[activeProject.id] || []).filter((file) => file.path !== filePath), newFile]
          },
          fileContents: {
            ...current.fileContents,
            [demoFileKey(activeProject.id, filePath)]: current.fileContents[demoFileKey(activeProject.id, filePath)] || meta.starter
          }
        }));
        await loadFiles(token, activeProject, filePath);
        pushTerminalLogs([`$ ${command}`, `[Demo] Opened ${filePath}`]);
        return;
      }

      if (cmd === "cat" || cmd === "type") {
        const filePath = arg || activeFile;
        const content = demoState.fileContents[demoFileKey(activeProject.id, filePath)] || "(empty file)";
        pushTerminalLogs([`$ ${command}`, ...content.split(/\r?\n/)]);
        return;
      }

      if (cmd === "run") {
        const filePath = arg || activeFile;
        const content = demoState.fileContents[demoFileKey(activeProject.id, filePath)] || "";
        const runtime = inferLanguageFromPath(filePath);
        const output = simulateCodeRun(runtime, content, filePath);
        pushTerminalLogs([`$ ${command}`, `[Demo run] ${filePath}`, ...output.split(/\r?\n/)]);
        return;
      }

      pushTerminalLogs([`$ ${command}`, `[Demo] Unsupported command: ${cmd}`]);
      return;
    }

    if (activeRunSessionId) {
      const result = await api.terminalInput(token, activeProject.id, { sessionId: activeRunSessionId, input: command });
      const outputLines = result.output
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => `[Input] ${line}`);

      setConsoleOpen(true);
      pushTerminalLogs([`> ${command}`, ...outputLines]);
      if (result.status === "running") {
        setStatus("Program is waiting for more input");
      } else {
        setActiveRunSessionId(null);
        setStatus(`Program exited${typeof result.code === "number" ? ` (${result.code})` : ""}`);
      }
      return;
    }

    const result = await api.terminalCommand(token, activeProject.id, { command });
    const outputLines = result.output
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => `[Terminal ${result.executedAt}] ${line}`);

    setConsoleOpen(true);
    pushTerminalLogs([`$ ${command}`, ...outputLines], 60);

    if (result.openedFile) {
        await loadFiles(token, activeProject, activeFile || undefined);
        await openFile(token, activeProject.id, result.openedFile);
      } else if (/^(mkdir|touch|code)\b/.test(command)) {
        await loadFiles(token, activeProject, activeFile || undefined);
      }
  }

  async function handleStopRun() {
    if (demoMode) {
      setActiveRunSessionId(null);
      pushOutputLogs(["[Stop] Demo mode has no active process to terminate"], 80);
      setStatus("Demo mode active");
      return;
    }

    if (!activeProject || !activeRunSessionId) return;

    const result = await api.stopRunSession(token, activeProject.id, { sessionId: activeRunSessionId });
    const outputLines = result.output
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => `[Stop] ${line}`);

    setActiveRunSessionId(null);
    pushOutputLogs([`[Stop] Program terminated`, ...outputLines], 80);
    setStatus("Program stopped");
  }

  const handleFileSelect = useCallback(
    async (path: string) => {
      if (!activeProject) return;
      await openFile(token, activeProject.id, path);
    },
    [activeProject, token, demoMode, demoState]
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
      <AnimatePresence mode="wait">
        {mode === "landing" ? (
          <motion.div
            key="landing"
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.08, filter: "blur(10px)" }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
          >
            <LandingPage
              onTry={() => {
                setError("");
                setMode("login");
              }}
              onLearnMore={() => {
                document.getElementById("landing-features")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            />
          </motion.div>
        ) : (
          <motion.main
            key="login"
            initial={{ opacity: 0, scale: 0.96, filter: "blur(12px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 1.08, filter: "blur(10px)" }}
            transition={{ duration: 0.45, ease: "easeInOut" }}
            className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#020617] px-6 text-zinc-100"
          >
            <AnimatedBackdrop />

            <section className="relative z-10 w-full max-w-xl rounded-[32px] border border-white/10 bg-[#0a0f1c]/80 p-8 shadow-[0_30px_120px_rgba(2,6,23,0.75)] backdrop-blur-xl">
              <div className="mb-8 flex items-center gap-3">
                <div className="rounded-2xl border border-sky-400/15 bg-sky-400/10 p-3 text-sky-200 shadow-[0_0_30px_rgba(56,189,248,0.14)]">
                  <Code2 size={24} />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">NinjaClaw IDE</p>
                  <h1 className="mt-1 text-2xl font-semibold text-white">Enter the workspace</h1>
                </div>
              </div>

              <p className="mb-6 text-sm leading-7 text-slate-300">
                Sign in to open your cloud workspace, continue existing projects, and jump back into NinjaClaw instantly.
              </p>

              <div className="grid gap-3">
                <input
                  placeholder="Name"
                  value={authForm.name}
                  onChange={(event) => setAuthForm({ ...authForm, name: event.target.value })}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-400/40 focus:bg-white/[0.07]"
                />
                <input
                  placeholder="Email"
                  value={authForm.email}
                  onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-400/40 focus:bg-white/[0.07]"
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={authForm.password}
                  onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-400/40 focus:bg-white/[0.07]"
                />
              </div>

              {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  className="rounded-2xl bg-white px-4 py-3 text-sm font-medium text-slate-950 transition hover:-translate-y-0.5 hover:shadow-[0_0_24px_rgba(255,255,255,0.22)]"
                  onClick={() => handleAuth("register")}
                >
                  Register
                </button>
                <button
                  className="rounded-2xl border border-sky-400/20 bg-sky-400/10 px-4 py-3 text-sm font-medium text-sky-100 transition hover:bg-sky-400/15"
                  onClick={() => handleAuth("login")}
                >
                  Login
                </button>
                <button
                  className="rounded-2xl border border-violet-400/20 bg-violet-400/10 px-4 py-3 text-sm font-medium text-violet-100 transition hover:bg-violet-400/15"
                  onClick={enterDemoMode}
                >
                  Demo Mode
                </button>
              </div>

              <button
                className="mt-4 text-sm text-slate-400 transition-colors hover:text-slate-200"
                onClick={() => {
                  setError("");
                  setMode("landing");
                }}
              >
                Back to landing page
              </button>

              {isHostedDemo ? (
                <p className="mt-4 text-xs leading-6 text-slate-500">
                  Hosted build note: demo mode runs entirely in the browser with mock projects, simulated execution, and local AI replies.
                </p>
              ) : null}
            </section>
          </motion.main>
        )}
      </AnimatePresence>
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
            <div className="relative flex items-center gap-1 text-xs text-muted-foreground">
              <TopMenu
                label="File"
                open={openMenu === "file"}
                onToggle={() => setOpenMenu((current) => (current === "file" ? null : "file"))}
                items={[
                  { id: "new-text-file", label: "New Text File" },
                  { id: "new-file", label: "New File...", shortcut: "Ctrl+Alt+N" },
                  { separator: true },
                  { id: "new-window", label: "New Window" },
                  { id: "new-window-profile", label: "New Window with Profile" },
                  { separator: true },
                  { id: "open-file", label: "Open File..." },
                  { id: "open-folder", label: "Open Folder..." },
                  { id: "open-workspace-file", label: "Open Workspace from File..." },
                  { id: "open-recent", label: "Open Recent", submenu: true }
                ]}
                onAction={handleMenuAction}
              />
              <TopMenu
                label="Edit"
                open={openMenu === "edit"}
                onToggle={() => setOpenMenu((current) => (current === "edit" ? null : "edit"))}
                items={[
                  { id: "undo", label: "Undo" },
                  { id: "redo", label: "Redo" },
                  { separator: true },
                  { id: "cut", label: "Cut" },
                  { id: "copy", label: "Copy" },
                  { id: "paste", label: "Paste" },
                  { separator: true },
                  { id: "find", label: "Find" }
                ]}
                onAction={handleMenuAction}
              />
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
                onCreateFolder={createFolder}
                onDeleteProject={removeProject}
                onRenameEntry={renameEntry}
                onDeleteEntry={deleteEntry}
              />
            </div>
          ) : null}

          <section className="flex min-w-0 flex-1 flex-col">
            {demoMode ? (
              <div className="flex items-center justify-between border-b border-emerald-500/20 bg-emerald-500/8 px-3 py-2 text-xs text-emerald-200">
                <span>Demo mode is active. This hosted build uses browser-only state, simulated runs, and local AI replies.</span>
                <button
                  onClick={() => {
                    window.localStorage.removeItem(DEMO_STORAGE_KEY);
                    enterDemoMode();
                  }}
                  className="rounded border border-emerald-400/20 px-2 py-1 text-[11px] font-medium text-emerald-100 transition-colors hover:bg-emerald-500/10"
                >
                  Reset demo
                </button>
              </div>
            ) : null}

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
                  onChange={(value) => {
                    setEditorValue(value);
                  }}
                  onCursorContextChange={setCursorContext}
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
              terminalLogs={terminalLogs}
              outputLogs={outputLogs}
              activeTab={consoleTab}
              isOpen={consoleOpen}
              onToggle={() => setConsoleOpen((current) => !current)}
              onClear={(tab) => {
                if (tab === "terminal") {
                  setTerminalLogs([]);
                  return;
                }
                setOutputLogs([]);
              }}
              onCommand={handleTerminalCommand}
              height={consoleHeight}
              onResize={setConsoleHeight}
              hasActiveSession={Boolean(activeRunSessionId)}
              onStop={handleStopRun}
              onTabChange={setConsoleTab}
            />
          </section>

          {aiPanelVisible ? (
            <>
              <button
                onMouseDown={() => setResizingAiPanel(true)}
                className="flex w-2 shrink-0 cursor-col-resize items-center justify-center border-l border-ide-border bg-ide-panel/60 text-muted-foreground transition hover:bg-secondary/40"
                title="Resize AI panel"
              >
                <GripVertical className="h-4 w-4" />
              </button>
              <div className="shrink-0 border-l border-ide-border" style={{ width: aiPanelWidth }}>
              <ChatPanel
                messages={chatMessages}
                onSend={handleChatSend}
                onAction={handleAiAction}
                onApplyCode={applyCodeFromAi}
                isGenerating={isGenerating}
                activeLanguageLabel={activeLanguageLabel}
                activeFile={activeFile || null}
              />
              </div>
            </>
          ) : null}
        </div>

        <StatusBar activeFile={activeFile || null} language={activeLanguageLabel} />
      </div>
    </main>
  );
}

function runtimeLabel(language: LanguageOption) {
  return getLanguageMeta(language).label;
}

function normalizeLanguage(language: string, fallback: LanguageOption): LanguageOption {
  const normalized = language.toLowerCase();
  if (normalized.includes("python")) return "python";
  if (normalized.includes("java") && !normalized.includes("javascript")) return "java";
  if (normalized.includes("c++") || normalized.includes("cpp")) return "cpp";
  if (normalized.includes("javascript") || normalized.includes("js")) return "javascript";
  return fallback;
}

type MenuItem = {
  id?: string;
  label?: string;
  shortcut?: string;
  submenu?: boolean;
  separator?: boolean;
};

function TopMenu({
  label,
  open,
  onToggle,
  items,
  onAction
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  items: MenuItem[];
  onAction: (action: string) => void;
}) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className={`rounded px-2 py-0.5 transition-colors hover:bg-secondary ${open ? "bg-secondary text-foreground" : ""}`}
      >
        {label}
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-30 mt-1 min-w-[220px] overflow-hidden rounded-lg border border-ide-border bg-[#161822] py-1 shadow-2xl">
          {items.map((item, index) =>
            item.separator ? (
              <div key={`sep-${label}-${index}`} className="my-1 h-px bg-ide-border" />
            ) : (
              <button
                key={`${label}-${item.id}`}
                onClick={() => item.id && onAction(item.id)}
                className="flex w-full items-center justify-between px-4 py-2 text-left text-sm text-zinc-200 transition-colors hover:bg-secondary"
              >
                <span>{item.label}</span>
                <span className="flex items-center gap-3 text-xs text-zinc-500">
                  {item.shortcut ? <span>{item.shortcut}</span> : null}
                  {item.submenu ? <ChevronRight className="h-3.5 w-3.5" /> : null}
                </span>
              </button>
            )
          )}
        </div>
      ) : null}
    </div>
  );
}
