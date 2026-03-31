export type LanguageOption = "javascript" | "python" | "cpp" | "java";

export type FileNode = {
  id: string;
  name: string;
  path: string;
  type: "file" | "folder";
  children?: FileNode[];
};

export type FlatFile = {
  name: string;
  path: string;
};

export type Project = {
  id: string;
  name: string;
  description?: string;
  createdAt?: string;
};

export type User = {
  id: string;
  name: string;
  email: string;
};

export type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

