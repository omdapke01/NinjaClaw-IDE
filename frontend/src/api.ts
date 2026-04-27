import type { FlatFile, Project, User } from "./types";

const headers = (token?: string) => ({
  "Content-Type": "application/json",
  ...(token ? { Authorization: `Bearer ${token}` } : {})
});

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, options);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || "Request failed");
  }

  return payload as T;
}

export const api = {
  register: (body: { name: string; email: string; password: string }) =>
    request<{ token: string; user: User }>("/api/auth/register", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body)
    }),
  login: (body: { email: string; password: string }) =>
    request<{ token: string; user: User }>("/api/auth/login", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body)
    }),
  getProjects: (token: string) =>
    request<{ projects: Project[] }>("/api/projects", {
      headers: headers(token)
    }),
  createProject: (token: string, body: { name: string; description: string }) =>
    request<{ projects: Project[] }>("/api/projects", {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify(body)
    }),
  deleteProject: (token: string, projectId: string) =>
    request<{ projects: Project[] }>(`/api/projects/${projectId}`, {
      method: "DELETE",
      headers: headers(token)
    }),
  getProjectFiles: (token: string, projectId: string) =>
    request<{ files: FlatFile[] }>(`/api/projects/${projectId}/files`, {
      headers: headers(token)
    }),
  getFileContent: (token: string, projectId: string, filePath: string) =>
    request<{ content: string }>(`/api/projects/${projectId}/files/content?path=${encodeURIComponent(filePath)}`, {
      headers: headers(token)
    }),
  saveFile: (token: string, projectId: string, body: { path: string; content: string }) =>
    request<{ ok: boolean }>(`/api/projects/${projectId}/files`, {
      method: "PUT",
      headers: headers(token),
      body: JSON.stringify(body)
    }),
  createFile: (token: string, projectId: string, body: { path: string; content: string }) =>
    request<{ ok: boolean }>(`/api/projects/${projectId}/files`, {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify(body)
    }),
  createFolder: (token: string, projectId: string, body: { path: string }) =>
    request<{ ok: boolean }>(`/api/projects/${projectId}/folders`, {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify(body)
    }),
  renameEntry: (token: string, projectId: string, body: { oldPath: string; newPath: string; type: "file" | "folder" }) =>
    request<{ ok: boolean; path: string }>(`/api/projects/${projectId}/entries/rename`, {
      method: "PATCH",
      headers: headers(token),
      body: JSON.stringify(body)
    }),
  deleteEntry: (token: string, projectId: string, body: { path: string; type: "file" | "folder" }) =>
    request<{ ok: boolean }>(`/api/projects/${projectId}/entries/delete`, {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify(body)
    }),
  runFile: (token: string, projectId: string, body: { path: string }) =>
    request<{ ok: boolean; code: number | null; output: string; runtime: string; ranAt: string; sessionId: string | null; status: string }>(`/api/projects/${projectId}/run`, {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify(body)
    }),
  terminalCommand: (token: string, projectId: string, body: { command: string }) =>
    request<{ ok: boolean; output: string; openedFile: string | null; executedAt: string }>(`/api/projects/${projectId}/terminal`, {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify(body)
    }),
  terminalInput: (token: string, projectId: string, body: { sessionId: string; input: string }) =>
    request<{ ok: boolean; output: string; status: string; code: number | null }>(`/api/projects/${projectId}/terminal/input`, {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify(body)
    }),
  stopRunSession: (token: string, projectId: string, body: { sessionId: string }) =>
    request<{ ok: boolean; output: string; status: string }>(`/api/projects/${projectId}/terminal/stop`, {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify(body)
    }),
  aiChat: (
    token: string,
    body: {
      message: string;
      projectId?: string;
      activeFilePath?: string;
      activeFileContent?: string;
      language?: string;
      intent?: string;
    },
    signal?: AbortSignal
  ) =>
    request<{ ok: boolean; reply: string; model: string }>("/api/ai/chat", {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify(body),
      signal
    }),
  aiSuggest: (
    token: string,
    body: {
      projectId?: string;
      activeFilePath?: string;
      activeFileContent?: string;
      language?: string;
      prefix?: string;
      suffix?: string;
      lineNumber?: number;
      column?: number;
    },
    signal?: AbortSignal
  ) =>
    request<{ ok: boolean; suggestion: string; model: string }>("/api/ai/suggest", {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify(body),
      signal
    })
};
