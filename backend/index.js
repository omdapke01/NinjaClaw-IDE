import "dotenv/config";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { createServer } from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { Server } from "socket.io";
import { MongoClient } from "mongodb";
import { v4 as uuid } from "uuid";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET || "ninjaclaw-local-secret";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || "ninjaclaw";
const dataDir = path.join(__dirname, "data");
const usersFile = path.join(dataDir, "users.json");
const projectsFile = path.join(dataDir, "projects.json");
const legacyProjectFilesDir = path.join(dataDir, "projects");
const tempRootDir = path.join(path.resolve(__dirname, ".."), "runner-workspaces");
const runSessions = new Map();

const mongoClient = new MongoClient(MONGODB_URI);
let usersCollection;
let projectsCollection;
let filesCollection;
let foldersCollection;

const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors({ origin: true, credentials: true }));
app.use(helmet());
app.use(express.json({ limit: "1mb" }));
app.use(rateLimit({ windowMs: 60 * 1000, max: 120 }));

function runtimeLabel(language) {
  switch (language) {
    case "javascript": return "JavaScript";
    case "python": return "Python";
    case "cpp": return "C++";
    case "java": return "Java";
    default: return "the active language";
  }
}

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: "7d" });
}

function authMiddleware(request, response, next) {
  const token = request.headers.authorization?.replace("Bearer ", "");
  if (!token) return response.status(401).json({ message: "Missing authentication token" });

  try {
    request.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    response.status(401).json({ message: "Invalid or expired token" });
  }
}

function normalizeRelativePath(relativePath = "") {
  const normalized = path.posix.normalize(String(relativePath).replaceAll("\\", "/"));
  return normalized.replace(/^(\.\.\/)+/, "").replace(/^\/+/, "");
}

function inferRuntime(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case ".js": return "javascript";
    case ".py": return "python";
    case ".java": return "java";
    case ".cpp":
    case ".cc":
    case ".cxx": return "cpp";
    default: return "unknown";
  }
}

function timestamp() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

async function readLegacyJson(target) {
  try {
    const raw = await fs.readFile(target, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function initMongo() {
  await mongoClient.connect();
  const db = mongoClient.db(MONGODB_DB_NAME);
  usersCollection = db.collection("users");
  projectsCollection = db.collection("projects");
  filesCollection = db.collection("files");
  foldersCollection = db.collection("folders");

  await Promise.all([
    usersCollection.createIndex({ email: 1 }, { unique: true }),
    projectsCollection.createIndex({ ownerId: 1, createdAt: -1 }),
    filesCollection.createIndex({ projectId: 1, path: 1 }, { unique: true }),
    filesCollection.createIndex({ ownerId: 1, projectId: 1 }),
    foldersCollection.createIndex({ projectId: 1, path: 1 }, { unique: true })
  ]);
}

async function migrateLegacyStorageIfNeeded() {
  const projectCount = await projectsCollection.countDocuments();
  const userCount = await usersCollection.countDocuments();
  if (projectCount > 0 || userCount > 0) return;

  const legacyUsers = await readLegacyJson(usersFile);
  const legacyProjects = await readLegacyJson(projectsFile);

  if (legacyUsers.length > 0) await usersCollection.insertMany(legacyUsers.map((user) => ({ ...user })));
  if (legacyProjects.length > 0) await projectsCollection.insertMany(legacyProjects.map((project) => ({ ...project })));

  for (const project of legacyProjects) {
    const projectDir = path.join(legacyProjectFilesDir, project.id);
    const collectedFiles = [];
    const collectedFolders = new Set();

    async function walk(currentDir, prefix = "") {
      const entries = await fs.readdir(currentDir, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          collectedFolders.add(relativePath);
          await walk(path.join(currentDir, entry.name), relativePath);
        } else {
          const content = await fs.readFile(path.join(currentDir, entry.name), "utf8").catch(() => "");
          collectedFiles.push({
            id: uuid(), projectId: project.id, ownerId: project.ownerId, name: entry.name,
            path: relativePath.replaceAll("\\", "/"), content, language: inferRuntime(relativePath),
            createdAt: project.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString()
          });
        }
      }
    }

    await walk(projectDir);
    if (collectedFiles.length > 0) await filesCollection.insertMany(collectedFiles);

    const folderDocs = Array.from(collectedFolders).map((folderPath) => ({
      id: uuid(), projectId: project.id, ownerId: project.ownerId, path: folderPath,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    }));
    if (folderDocs.length > 0) await foldersCollection.insertMany(folderDocs);
  }
}

async function getOwnedProject(projectId, ownerId) {
  return projectsCollection.findOne({ id: projectId, ownerId }, { projection: { _id: 0 } });
}

async function listProjectFiles(projectId) {
  const [folders, files] = await Promise.all([
    foldersCollection.find({ projectId }, { projection: { _id: 0, path: 1 } }).sort({ path: 1 }).toArray(),
    filesCollection.find({ projectId }, { projection: { _id: 0, name: 1, path: 1 } }).sort({ path: 1 }).toArray()
  ]);

  return [
    ...folders.map((folder) => ({ name: path.posix.basename(folder.path), path: folder.path, type: "folder" })),
    ...files.map((file) => ({ ...file, type: "file" }))
  ];
}

async function getFileDoc(projectId, ownerId, relativePath) {
  return filesCollection.findOne({ projectId, ownerId, path: normalizeRelativePath(relativePath) }, { projection: { _id: 0 } });
}

async function ensureFolderHierarchy(projectId, ownerId, relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  const directoryPath = path.posix.dirname(normalized);
  if (!directoryPath || directoryPath === ".") return;

  const parts = directoryPath.split("/");
  const now = new Date().toISOString();
  for (let index = 0; index < parts.length; index += 1) {
    const folderPath = parts.slice(0, index + 1).join("/");
    await foldersCollection.updateOne(
      { projectId, path: folderPath },
      { $set: { ownerId, updatedAt: now }, $setOnInsert: { id: uuid(), createdAt: now } },
      { upsert: true }
    );
  }
}

function pathWithTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

async function createFolderEntry(projectId, ownerId, relativePath) {
  const normalizedPath = normalizeRelativePath(relativePath);
  if (!normalizedPath) {
    throw new Error("Folder path is required");
  }

  const now = new Date().toISOString();
  const parts = normalizedPath.split("/");

  for (let index = 0; index < parts.length; index += 1) {
    const folderPath = parts.slice(0, index + 1).join("/");
    await foldersCollection.updateOne(
      { projectId, path: folderPath },
      {
        $set: { ownerId, updatedAt: now },
        $setOnInsert: { id: uuid(), createdAt: now }
      },
      { upsert: true }
    );
  }

  return normalizedPath;
}

async function renameEntry(projectId, ownerId, oldPath, newPath, type) {
  const normalizedOldPath = normalizeRelativePath(oldPath);
  const normalizedNewPath = normalizeRelativePath(newPath);

  if (!normalizedOldPath || !normalizedNewPath) {
    throw new Error("Both old and new paths are required");
  }

  if (normalizedOldPath === normalizedNewPath) {
    return normalizedNewPath;
  }

  if (type === "file") {
    const fileDoc = await getFileDoc(projectId, ownerId, normalizedOldPath);
    if (!fileDoc) {
      throw new Error("File not found");
    }

    await ensureFolderHierarchy(projectId, ownerId, normalizedNewPath);
    await filesCollection.updateOne(
      { projectId, ownerId, path: normalizedOldPath },
      {
        $set: {
          path: normalizedNewPath,
          name: path.posix.basename(normalizedNewPath),
          language: inferRuntime(normalizedNewPath),
          updatedAt: new Date().toISOString()
        }
      }
    );

    return normalizedNewPath;
  }

  const folderDoc = await foldersCollection.findOne({ projectId, ownerId, path: normalizedOldPath }, { projection: { _id: 0 } });
  if (!folderDoc) {
    throw new Error("Folder not found");
  }

  const parentFolder = path.posix.dirname(normalizedNewPath);
  if (parentFolder && parentFolder !== ".") {
    await createFolderEntry(projectId, ownerId, parentFolder);
  }

  const folderPrefix = pathWithTrailingSlash(normalizedOldPath);
  const nextFolderPrefix = pathWithTrailingSlash(normalizedNewPath);
  const nestedFolders = await foldersCollection.find({ projectId, ownerId }).toArray();
  const nestedFiles = await filesCollection.find({ projectId, ownerId }).toArray();

  for (const folder of nestedFolders) {
    if (folder.path === normalizedOldPath || folder.path.startsWith(folderPrefix)) {
      const suffix = folder.path === normalizedOldPath ? "" : folder.path.slice(folderPrefix.length);
      const updatedPath = suffix ? `${nextFolderPrefix}${suffix}` : normalizedNewPath;
      await foldersCollection.updateOne(
        { _id: folder._id },
        { $set: { path: updatedPath, updatedAt: new Date().toISOString() } }
      );
    }
  }

  for (const file of nestedFiles) {
    if (file.path.startsWith(folderPrefix)) {
      const suffix = file.path.slice(folderPrefix.length);
      const updatedPath = `${nextFolderPrefix}${suffix}`;
      await filesCollection.updateOne(
        { _id: file._id },
        {
          $set: {
            path: updatedPath,
            name: path.posix.basename(updatedPath),
            language: inferRuntime(updatedPath),
            updatedAt: new Date().toISOString()
          }
        }
      );
    }
  }

  return normalizedNewPath;
}

async function deleteEntry(projectId, ownerId, targetPath, type) {
  const normalizedPath = normalizeRelativePath(targetPath);
  if (!normalizedPath) {
    throw new Error("Path is required");
  }

  if (type === "file") {
    const result = await filesCollection.deleteOne({ projectId, ownerId, path: normalizedPath });
    return result.deletedCount > 0;
  }

  const prefix = pathWithTrailingSlash(normalizedPath);
  await Promise.all([
    foldersCollection.deleteMany({
      projectId,
      ownerId,
      $or: [{ path: normalizedPath }, { path: { $regex: `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}` } }]
    }),
    filesCollection.deleteMany({
      projectId,
      ownerId,
      path: { $regex: `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}` }
    })
  ]);

  return true;
}

async function materializeProjectWorkspace(projectId, ownerId) {
  const workspaceRoot = path.join(tempRootDir, projectId, uuid());
  await fs.mkdir(workspaceRoot, { recursive: true });
  const projectFiles = await filesCollection.find({ projectId, ownerId }, { projection: { _id: 0, path: 1, content: 1 } }).toArray();

  for (const file of projectFiles) {
    const relativePath = normalizeRelativePath(file.path);
    const absolutePath = path.join(workspaceRoot, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, file.content ?? "", "utf8");
  }

  return workspaceRoot;
}

async function cleanupWorkspace(workspaceRoot) {
  if (!workspaceRoot) return;
  await fs.rm(workspaceRoot, { recursive: true, force: true }).catch(() => {});
}

function consumeSessionOutput(session) {
  const output = session.outputChunks.join("");
  session.outputChunks = [];
  return output;
}

function getRunSession(sessionId, projectId) {
  const session = runSessions.get(sessionId);
  if (!session || session.projectId !== projectId) return null;
  return session;
}

function destroyRunSession(sessionId) {
  runSessions.delete(sessionId);
}

function createRunSession(projectId, runtime, child, workspaceRoot) {
  const sessionId = uuid();
  const session = { id: sessionId, projectId, runtime, child, workspaceRoot, outputChunks: [], status: "running", code: null, createdAt: Date.now() };

  child.stdout.on("data", (chunk) => session.outputChunks.push(chunk.toString()));
  child.stderr.on("data", (chunk) => session.outputChunks.push(chunk.toString()));
  child.on("error", (error) => {
    session.outputChunks.push(`${error.message}\n`);
    session.status = "error";
  });
  child.on("close", async (code) => {
    session.status = session.status === "stopped" ? "stopped" : "exited";
    session.code = code ?? 0;
    await cleanupWorkspace(workspaceRoot);
  });

  runSessions.set(sessionId, session);
  return session;
}

function executeCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    let child;
    let stdout = "";
    let stderr = "";
    let settled = false;

    try {
      child = spawn(command, args, { cwd: options.cwd, shell: false, windowsHide: true });
    } catch (error) {
      resolve({
        ok: false,
        code: -1,
        stdout: "",
        stderr: `${error?.message || "Unable to start process"}${process.platform === "win32" ? "\nWindows blocked backend process execution (spawn EPERM). Check antivirus / Controlled Folder Access / execution policy." : ""}`.trim()
      });
      return;
    }

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill();
        resolve({ ok: false, code: -1, stdout, stderr: `${stderr}\nProcess timed out after ${options.timeoutMs || 12000}ms`.trim() });
      }
    }, options.timeoutMs || 12000);

    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        resolve({ ok: false, code: -1, stdout, stderr: `${stderr}\n${error.message}`.trim() });
      }
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        resolve({ ok: code === 0, code: code ?? 0, stdout, stderr });
      }
    });
  });
}
async function runCommandInWorkspace(workspaceRoot, relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  const filePath = path.join(workspaceRoot, normalized);
  const runtime = inferRuntime(normalized);
  const cwd = path.dirname(filePath);

  if (runtime === "javascript") return { runtime, ...(await executeCommand("node", [filePath], { cwd })) };
  if (runtime === "python") return { runtime, ...(await executeCommand("python", [filePath], { cwd })) };

  if (runtime === "java") {
    const compile = await executeCommand("javac", [filePath], { cwd });
    if (!compile.ok) return { runtime, ...compile };
    const className = path.basename(filePath, ".java");
    return { runtime, ...(await executeCommand("java", ["-cp", cwd, className], { cwd })) };
  }

  if (runtime === "cpp") {
    const outputName = `${path.basename(filePath, path.extname(filePath))}.exe`;
    const outputPath = path.join(cwd, outputName);
    const compile = await executeCommand("g++", [filePath, "-o", outputPath], { cwd });
    if (!compile.ok) return { runtime, ...compile };
    return { runtime, ...(await executeCommand(outputPath, [], { cwd })) };
  }

  return { runtime, ok: false, code: -1, stdout: "", stderr: `Unsupported file type for execution: ${normalized}` };
}

async function runProjectFile(projectId, ownerId, relativePath) {
  const workspaceRoot = await materializeProjectWorkspace(projectId, ownerId);
  try {
    return await runCommandInWorkspace(workspaceRoot, relativePath);
  } finally {
    await cleanupWorkspace(workspaceRoot);
  }
}

async function spawnInteractiveProcess(projectId, runtime, command, args, cwd, workspaceRoot) {
  let child;
  try {
    child = spawn(command, args, { cwd, shell: false, windowsHide: true });
  } catch (error) {
    await cleanupWorkspace(workspaceRoot);
    return {
      ok: false,
      sessionId: null,
      code: -1,
      runtime,
      output: `${error?.message || "Unable to start process"}${process.platform === "win32" ? "\nWindows blocked backend process execution (spawn EPERM). Check antivirus / Controlled Folder Access / execution policy." : ""}`.trim(),
      status: "error"
    };
  }
  const session = createRunSession(projectId, runtime, child, workspaceRoot);
  await new Promise((resolve) => setTimeout(resolve, 350));
  return { ok: true, sessionId: session.id, code: session.code, runtime, output: consumeSessionOutput(session).trim(), status: session.status };
}

async function startInteractiveRun(projectId, ownerId, relativePath) {
  const workspaceRoot = await materializeProjectWorkspace(projectId, ownerId);
  const normalized = normalizeRelativePath(relativePath);
  const filePath = path.join(workspaceRoot, normalized);
  const runtime = inferRuntime(normalized);
  const cwd = path.dirname(filePath);

  if (runtime === "javascript") return spawnInteractiveProcess(projectId, runtime, "node", [filePath], cwd, workspaceRoot);
  if (runtime === "python") return spawnInteractiveProcess(projectId, runtime, "python", [filePath], cwd, workspaceRoot);

  if (runtime === "java") {
    const compile = await executeCommand("javac", [filePath], { cwd });
    if (!compile.ok) {
      await cleanupWorkspace(workspaceRoot);
      return { ok: false, code: compile.code, output: [compile.stdout, compile.stderr].filter(Boolean).join("\n").trim() };
    }
    const className = path.basename(filePath, ".java");
    return spawnInteractiveProcess(projectId, runtime, "java", ["-cp", cwd, className], cwd, workspaceRoot);
  }

  if (runtime === "cpp") {
    const outputName = `${path.basename(filePath, path.extname(filePath))}.exe`;
    const outputPath = path.join(cwd, outputName);
    const compile = await executeCommand("g++", [filePath, "-o", outputPath], { cwd });
    if (!compile.ok) {
      await cleanupWorkspace(workspaceRoot);
      return { ok: false, code: compile.code, output: [compile.stdout, compile.stderr].filter(Boolean).join("\n").trim() };
    }
    return spawnInteractiveProcess(projectId, runtime, outputPath, [], cwd, workspaceRoot);
  }

  await cleanupWorkspace(workspaceRoot);
  return { ok: false, code: -1, output: `Unsupported file type for execution: ${normalized}` };
}

async function listProjectEntries(projectId, relativePath = "") {
  const normalizedBase = normalizeRelativePath(relativePath);
  const basePrefix = normalizedBase ? `${normalizedBase}/` : "";
  const entries = new Map();
  const folderDocs = await foldersCollection.find({ projectId }, { projection: { _id: 0, path: 1 } }).toArray();
  const fileDocs = await filesCollection.find({ projectId }, { projection: { _id: 0, path: 1 } }).toArray();

  for (const folder of folderDocs) {
    const folderPath = normalizeRelativePath(folder.path);
    if (normalizedBase && folderPath !== normalizedBase && !folderPath.startsWith(basePrefix)) continue;
    const remainder = normalizedBase === folderPath ? "" : folderPath.slice(basePrefix.length);
    if (!remainder) continue;
    const segment = remainder.split("/")[0];
    const isDirect = !remainder.includes("/");
    entries.set(segment, { type: "folder", direct: isDirect || entries.get(segment)?.type === "folder" });
  }

  for (const file of fileDocs) {
    const filePath = normalizeRelativePath(file.path);
    if (normalizedBase && !filePath.startsWith(basePrefix)) continue;
    const remainder = normalizedBase ? filePath.slice(basePrefix.length) : filePath;
    if (!remainder) continue;
    const parts = remainder.split("/");
    const segment = parts[0];
    const isFile = parts.length === 1;
    const existing = entries.get(segment);
    if (isFile) entries.set(segment, { type: "file", direct: true });
    else if (!existing) entries.set(segment, { type: "folder", direct: true });
  }

  return Array.from(entries.entries())
    .filter(([, meta]) => meta.direct)
    .map(([name, meta]) => (meta.type === "folder" ? `${name}/` : name))
    .sort((a, b) => a.localeCompare(b));
}

async function runTerminalCommand(projectId, ownerId, projectName, commandLine) {
  const input = commandLine.trim();
  const [command, ...rest] = input.split(/\s+/);
  const args = rest.filter(Boolean);
  if (!input) return { ok: true, output: "", filesChanged: false };
  if (command === "pwd") return { ok: true, output: `/${projectName.replace(/\s+/g, "-").toLowerCase()}`, filesChanged: false };
  if (command === "ls" || command === "dir") {
    const relativeTarget = args[0] || "";
    const entries = await listProjectEntries(projectId, relativeTarget);
    return { ok: true, output: entries.join("\n") || "(empty)", filesChanged: false };
  }
  if (command === "mkdir") {
    const relativeTarget = args[0];
    if (!relativeTarget) return { ok: false, output: "Usage: mkdir <folder>", filesChanged: false };
    await ensureFolderHierarchy(projectId, ownerId, `${normalizeRelativePath(relativeTarget)}/placeholder.txt`);
    return { ok: true, output: `Created folder ${normalizeRelativePath(relativeTarget)}`, filesChanged: true };
  }
  if (command === "touch" || command === "code") {
    const relativeTarget = args[0];
    if (!relativeTarget) return { ok: false, output: `Usage: ${command} <file>`, filesChanged: false };
    const normalizedPath = normalizeRelativePath(relativeTarget);
    const now = new Date().toISOString();
    await ensureFolderHierarchy(projectId, ownerId, normalizedPath);
    await filesCollection.updateOne(
      { projectId, path: normalizedPath },
      {
        $set: { ownerId, name: path.posix.basename(normalizedPath), path: normalizedPath, language: inferRuntime(normalizedPath), updatedAt: now },
        $setOnInsert: { id: uuid(), projectId, content: "", createdAt: now }
      },
      { upsert: true }
    );
    return { ok: true, output: `Opened ${normalizedPath}`, filesChanged: true, openedFile: normalizedPath };
  }
  if (command === "cat" || command === "type") {
    const relativeTarget = args[0];
    if (!relativeTarget) return { ok: false, output: `Usage: ${command} <file>`, filesChanged: false };
    const fileDoc = await getFileDoc(projectId, ownerId, relativeTarget);
    if (!fileDoc) return { ok: false, output: `File not found: ${normalizeRelativePath(relativeTarget)}`, filesChanged: false };
    return { ok: true, output: fileDoc.content || "(empty file)", filesChanged: false };
  }
  if (command === "run") {
    const relativeTarget = args[0];
    if (!relativeTarget) return { ok: false, output: "Usage: run <file>", filesChanged: false };
    const result = await runProjectFile(projectId, ownerId, relativeTarget);
    return { ok: result.ok, output: [result.stdout, result.stderr].filter(Boolean).join("\n").trim() || `(exit code ${result.code})`, filesChanged: false };
  }
  if (command === "help") {
    return { ok: true, output: ["pwd", "ls [folder]", "mkdir <folder>", "code <file>", "touch <file>", "cat <file>", "run <file>"].join("\n"), filesChanged: false };
  }
  return { ok: false, output: `Unsupported command: ${command}. Try: help`, filesChanged: false };
}

async function callGemini(prompt, generationConfig = {}) {
  if (!GEMINI_API_KEY) {
    return { ok: false, status: 500, message: "GEMINI_API_KEY is not configured on the backend" };
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, topP: 0.9, maxOutputTokens: 4096, ...generationConfig }
      })
    }
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, status: response.status, message: payload?.error?.message || "Gemini request failed" };
  }

  const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text).filter(Boolean).join("\n").trim() || "No response returned by Gemini.";
  return { ok: true, text };
}
async function generateGeminiReply({ message, project, activeFilePath, activeFileContent, files, language, intent }) {
  const activeLanguage = language || inferRuntime(activeFilePath || "");
  const fileList = files?.slice(0, 50).map((file) => `- ${file.path}`).join("\n") || "(no files)";
  const intentLine = intent ? `Primary task: ${intent}` : "Primary task: general assistance";
  const lowerMessage = String(message || "").toLowerCase();
  const isCompetitivePrompt =
    /(leetcode|gfg|geeksforgeeks|codeforces|hackerrank|practice problem|dsa|replace o's with x's|surrounded regions)/.test(lowerMessage);
  const prompt = [
    "You are NinjaClaw AI, a strong coding assistant inside a browser IDE.",
    "Respond in a practical, product-quality way.",
    `The user's active language is ${runtimeLabel(activeLanguage)}. Prefer that language unless the user explicitly asks for another one.`,
    "If the user asks for code, provide complete, runnable, self-contained code instead of a fragment.",
    "If the request is about the current file, talk about that file directly.",
    "Use fenced code blocks with the correct language tag whenever you return code.",
    "For debugging requests, explain the issue briefly and then show the corrected code.",
    isCompetitivePrompt
      ? "For coding practice or interview-style problems, return the final minimal solution only, with no long explanation and almost no comments."
      : "Keep comments light unless the user explicitly asks for explanation.",
    isCompetitivePrompt
      ? "Prefer the platform-ready class/function signature over a standalone demo main function unless the user explicitly asks for a full runnable program."
      : "When the user asks for a full file, provide a full file.",
    "",
    intentLine,
    `Project: ${project?.name || "Unknown project"}`,
    `Active file: ${activeFilePath || "None"}`,
    `Active language: ${runtimeLabel(activeLanguage)}`,
    "",
    "Project files:",
    fileList,
    "",
    "Active file content:",
    activeFileContent || "(empty)",
    "",
    "User request:",
    message
  ].join("\n");

  return callGemini(prompt, { temperature: 0.25, topP: 0.85, maxOutputTokens: 4096 });
}

function cleanSuggestionText(text = "") {
  return text.replace(/^```[\w+-]*\s*/i, "").replace(/```$/i, "").replace(/\r/g, "").trimEnd();
}

async function generateGeminiSuggestion({ project, activeFilePath, activeFileContent, files, language, prefix, suffix, lineNumber, column }) {
  const activeLanguage = language || inferRuntime(activeFilePath || "");
  const fileList = files?.slice(0, 30).map((file) => `- ${file.path}`).join("\n") || "(no files)";
  const prompt = [
    "You are NinjaClaw AI inline completion mode.",
    `The completion must continue the user's code in ${runtimeLabel(activeLanguage)}.`,
    "Return only the next code to insert at the cursor. Do not wrap it in markdown fences.",
    "Do not repeat the existing prefix. Do not explain anything.",
    "Keep it short, useful, and consistent with the surrounding code. Prefer 1 to 8 lines.",
    "",
    `Project: ${project?.name || "Unknown project"}`,
    `Active file: ${activeFilePath || "None"}`,
    `Cursor line: ${lineNumber || 1}`,
    `Cursor column: ${column || 1}`,
    "",
    "Project files:",
    fileList,
    "",
    "Current file:",
    activeFileContent || "(empty)",
    "",
    "Code before cursor:",
    prefix || "",
    "",
    "Code after cursor:",
    suffix || ""
  ].join("\n");

  const result = await callGemini(prompt, { temperature: 0.2, topP: 0.8, maxOutputTokens: 220 });
  if (!result.ok) return result;
  return { ok: true, text: cleanSuggestionText(result.text) };
}

async function emitProjectUpdate(userId, message) {
  io.to(userId).emit("project:updated", { message, timestamp: Date.now() });
}

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("Unauthorized"));

  try {
    socket.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    next(new Error("Unauthorized"));
  }
});

io.on("connection", (socket) => {
  socket.join(socket.user.sub);
});

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, name: "NinjaClaw API", port: PORT, storage: "mongodb" });
});

app.post("/api/auth/register", async (request, response) => {
  const { name, email, password } = request.body;
  if (!name || !email || !password) return response.status(400).json({ message: "Name, email, and password are required" });

  const existingUser = await usersCollection.findOne({ email }, { projection: { _id: 0, id: 1 } });
  if (existingUser) return response.status(409).json({ message: "User already exists" });

  const newUser = { id: uuid(), name, email, passwordHash: await bcrypt.hash(password, 10), createdAt: new Date().toISOString() };
  await usersCollection.insertOne(newUser);
  response.status(201).json({ token: signToken(newUser), user: { id: newUser.id, name: newUser.name, email: newUser.email } });
});

app.post("/api/auth/login", async (request, response) => {
  const { email, password } = request.body;
  const user = await usersCollection.findOne({ email }, { projection: { _id: 0 } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return response.status(401).json({ message: "Invalid credentials" });
  }
  response.json({ token: signToken(user), user: { id: user.id, name: user.name, email: user.email } });
});

app.get("/api/projects", authMiddleware, async (request, response) => {
  const projects = await projectsCollection.find({ ownerId: request.user.sub }, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
  response.json({ projects });
});

app.post("/api/projects", authMiddleware, async (request, response) => {
  const { name, description } = request.body;
  if (!name) return response.status(400).json({ message: "Project name is required" });

  const newProject = { id: uuid(), name, description: description || "", ownerId: request.user.sub, createdAt: new Date().toISOString() };
  await projectsCollection.insertOne(newProject);
  await emitProjectUpdate(request.user.sub, `Project ${name} created`);
  const projects = await projectsCollection.find({ ownerId: request.user.sub }, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
  response.status(201).json({ projects });
});

app.delete("/api/projects/:projectId", authMiddleware, async (request, response) => {
  const ownedProject = await getOwnedProject(request.params.projectId, request.user.sub);
  if (!ownedProject) return response.status(404).json({ message: "Project not found" });

  await Promise.all([
    projectsCollection.deleteOne({ id: request.params.projectId, ownerId: request.user.sub }),
    filesCollection.deleteMany({ projectId: request.params.projectId, ownerId: request.user.sub }),
    foldersCollection.deleteMany({ projectId: request.params.projectId, ownerId: request.user.sub })
  ]);

  await emitProjectUpdate(request.user.sub, `Project ${request.params.projectId} removed`);
  const projects = await projectsCollection.find({ ownerId: request.user.sub }, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
  response.json({ projects });
});

app.get("/api/projects/:projectId/files", authMiddleware, async (request, response) => {
  const ownedProject = await getOwnedProject(request.params.projectId, request.user.sub);
  if (!ownedProject) return response.status(404).json({ message: "Project not found" });
  response.json({ files: await listProjectFiles(request.params.projectId) });
});

app.get("/api/projects/:projectId/files/content", authMiddleware, async (request, response) => {
  const ownedProject = await getOwnedProject(request.params.projectId, request.user.sub);
  if (!ownedProject) return response.status(404).json({ message: "Project not found" });

  const filePath = request.query.path;
  if (!filePath) return response.status(400).json({ message: "File path is required" });

  const fileDoc = await getFileDoc(request.params.projectId, request.user.sub, String(filePath));
  if (!fileDoc) return response.status(404).json({ message: "File not found" });
  response.json({ content: fileDoc.content || "" });
});

app.post("/api/projects/:projectId/folders", authMiddleware, async (request, response) => {
  const ownedProject = await getOwnedProject(request.params.projectId, request.user.sub);
  if (!ownedProject) return response.status(404).json({ message: "Project not found" });

  try {
    const folderPath = await createFolderEntry(request.params.projectId, request.user.sub, String(request.body.path || ""));
    await emitProjectUpdate(request.user.sub, `Created folder ${folderPath}`);
    response.status(201).json({ ok: true });
  } catch (error) {
    response.status(400).json({ message: error instanceof Error ? error.message : "Unable to create folder" });
  }
});

app.patch("/api/projects/:projectId/entries/rename", authMiddleware, async (request, response) => {
  const ownedProject = await getOwnedProject(request.params.projectId, request.user.sub);
  if (!ownedProject) return response.status(404).json({ message: "Project not found" });

  try {
    const updatedPath = await renameEntry(
      request.params.projectId,
      request.user.sub,
      String(request.body.oldPath || ""),
      String(request.body.newPath || ""),
      request.body.type === "folder" ? "folder" : "file"
    );
    await emitProjectUpdate(request.user.sub, `Renamed ${request.body.oldPath} to ${updatedPath}`);
    response.json({ ok: true, path: updatedPath });
  } catch (error) {
    response.status(400).json({ message: error instanceof Error ? error.message : "Unable to rename entry" });
  }
});

app.post("/api/projects/:projectId/entries/delete", authMiddleware, async (request, response) => {
  const ownedProject = await getOwnedProject(request.params.projectId, request.user.sub);
  if (!ownedProject) return response.status(404).json({ message: "Project not found" });

  try {
    const deleted = await deleteEntry(
      request.params.projectId,
      request.user.sub,
      String(request.body.path || ""),
      request.body.type === "folder" ? "folder" : "file"
    );

    if (!deleted) {
      return response.status(404).json({ message: "Entry not found" });
    }

    await emitProjectUpdate(request.user.sub, `Deleted ${request.body.path}`);
    response.json({ ok: true });
  } catch (error) {
    response.status(400).json({ message: error instanceof Error ? error.message : "Unable to delete entry" });
  }
});

app.post("/api/projects/:projectId/files", authMiddleware, async (request, response) => {
  const ownedProject = await getOwnedProject(request.params.projectId, request.user.sub);
  if (!ownedProject) return response.status(404).json({ message: "Project not found" });

  const { path: relativePath, content = "" } = request.body;
  if (!relativePath) return response.status(400).json({ message: "File path is required" });

  const normalizedPath = normalizeRelativePath(relativePath);
  const now = new Date().toISOString();
  await ensureFolderHierarchy(request.params.projectId, request.user.sub, normalizedPath);
  await filesCollection.updateOne(
    { projectId: request.params.projectId, path: normalizedPath },
    {
      $set: { ownerId: request.user.sub, name: path.posix.basename(normalizedPath), path: normalizedPath, content, language: inferRuntime(normalizedPath), updatedAt: now },
      $setOnInsert: { id: uuid(), projectId: request.params.projectId, createdAt: now }
    },
    { upsert: true }
  );

  await emitProjectUpdate(request.user.sub, `Created ${normalizedPath}`);
  response.status(201).json({ ok: true });
});

app.put("/api/projects/:projectId/files", authMiddleware, async (request, response) => {
  const ownedProject = await getOwnedProject(request.params.projectId, request.user.sub);
  if (!ownedProject) return response.status(404).json({ message: "Project not found" });

  const { path: relativePath, content } = request.body;
  if (!relativePath) return response.status(400).json({ message: "File path is required" });

  const normalizedPath = normalizeRelativePath(relativePath);
  const fileDoc = await getFileDoc(request.params.projectId, request.user.sub, normalizedPath);
  if (!fileDoc) return response.status(404).json({ message: "File not found" });

  await filesCollection.updateOne(
    { projectId: request.params.projectId, ownerId: request.user.sub, path: normalizedPath },
    { $set: { content: content ?? "", language: inferRuntime(normalizedPath), updatedAt: new Date().toISOString() } }
  );

  await emitProjectUpdate(request.user.sub, `Saved ${normalizedPath}`);
  response.json({ ok: true });
});

app.post("/api/projects/:projectId/run", authMiddleware, async (request, response) => {
  const ownedProject = await getOwnedProject(request.params.projectId, request.user.sub);
  if (!ownedProject) return response.status(404).json({ message: "Project not found" });

  const relativePath = request.body.path;
  if (!relativePath) return response.status(400).json({ message: "File path is required" });

  try {
    const result = await startInteractiveRun(request.params.projectId, request.user.sub, relativePath);
    response.json({
      ok: result.ok,
      code: result.code ?? null,
      output: result.output || (result.ok ? "" : "(no output)"),
      runtime: result.runtime || inferRuntime(relativePath),
      sessionId: result.sessionId || null,
      status: result.status || (result.ok ? "exited" : "error"),
      ranAt: timestamp()
    });
  } catch (error) {
    console.error(error);
    response.status(500).json({
      message: error instanceof Error ? error.message : "Unable to run file",
      output: "",
      status: "error",
      runtime: inferRuntime(relativePath),
      ranAt: timestamp()
    });
  }
});

app.post("/api/projects/:projectId/terminal", authMiddleware, async (request, response) => {
  const ownedProject = await getOwnedProject(request.params.projectId, request.user.sub);
  if (!ownedProject) return response.status(404).json({ message: "Project not found" });

  const commandLine = String(request.body.command || "");
  const result = await runTerminalCommand(request.params.projectId, request.user.sub, ownedProject.name, commandLine);
  if (result.filesChanged) await emitProjectUpdate(request.user.sub, `Terminal: ${commandLine}`);

  response.json({ ok: result.ok, output: result.output, openedFile: result.openedFile || null, executedAt: timestamp() });
});

app.post("/api/projects/:projectId/terminal/input", authMiddleware, async (request, response) => {
  const ownedProject = await getOwnedProject(request.params.projectId, request.user.sub);
  if (!ownedProject) return response.status(404).json({ message: "Project not found" });

  const sessionId = String(request.body.sessionId || "");
  const input = String(request.body.input ?? "");
  const session = getRunSession(sessionId, request.params.projectId);
  if (!session) return response.status(404).json({ message: "Run session not found" });

  if (session.status !== "running") {
    return response.json({ ok: false, output: consumeSessionOutput(session), status: session.status, code: session.code });
  }

  session.child.stdin.write(`${input}\n`);
  await new Promise((resolve) => setTimeout(resolve, 250));
  response.json({ ok: true, output: consumeSessionOutput(session), status: session.status, code: session.code });
});

app.post("/api/projects/:projectId/terminal/stop", authMiddleware, async (request, response) => {
  const ownedProject = await getOwnedProject(request.params.projectId, request.user.sub);
  if (!ownedProject) return response.status(404).json({ message: "Project not found" });

  const sessionId = String(request.body.sessionId || "");
  const session = getRunSession(sessionId, request.params.projectId);
  if (!session) return response.status(404).json({ message: "Run session not found" });

  if (session.status === "running") {
    session.child.kill();
    session.status = "stopped";
    session.outputChunks.push("\nProcess stopped by user.\n");
  }

  const output = consumeSessionOutput(session);
  await cleanupWorkspace(session.workspaceRoot);
  destroyRunSession(sessionId);
  response.json({ ok: true, output, status: "stopped" });
});

app.post("/api/ai/chat", authMiddleware, async (request, response) => {
  const { message, projectId, activeFilePath, activeFileContent, language, intent } = request.body;
  if (!message || !String(message).trim()) return response.status(400).json({ message: "Chat message is required" });

  let project = null;
  let files = [];
  if (projectId) {
    project = await getOwnedProject(projectId, request.user.sub);
    if (!project) return response.status(404).json({ message: "Project not found" });
    files = await listProjectFiles(projectId);
  }

  const aiResult = await generateGeminiReply({
    message: String(message),
    project,
    activeFilePath: activeFilePath ? String(activeFilePath) : "",
    activeFileContent: activeFileContent ? String(activeFileContent) : "",
    files,
    language: language ? String(language) : "",
    intent: intent ? String(intent) : ""
  });

  if (!aiResult.ok) return response.status(aiResult.status || 500).json({ message: aiResult.message });
  response.json({ ok: true, reply: aiResult.text, model: GEMINI_MODEL });
});

app.post("/api/ai/suggest", authMiddleware, async (request, response) => {
  const { projectId, activeFilePath, activeFileContent, language, prefix, suffix, lineNumber, column } = request.body;

  let project = null;
  let files = [];
  if (projectId) {
    project = await getOwnedProject(projectId, request.user.sub);
    if (!project) return response.status(404).json({ message: "Project not found" });
    files = await listProjectFiles(projectId);
  }

  const aiResult = await generateGeminiSuggestion({
    project,
    activeFilePath: activeFilePath ? String(activeFilePath) : "",
    activeFileContent: activeFileContent ? String(activeFileContent) : "",
    files,
    language: language ? String(language) : "",
    prefix: prefix ? String(prefix) : "",
    suffix: suffix ? String(suffix) : "",
    lineNumber: Number(lineNumber || 1),
    column: Number(column || 1)
  });

  if (!aiResult.ok) return response.status(aiResult.status || 500).json({ message: aiResult.message });
  response.json({ ok: true, suggestion: aiResult.text, model: GEMINI_MODEL });
});

async function startServer() {
  await fs.mkdir(tempRootDir, { recursive: true });
  await initMongo();
  await migrateLegacyStorageIfNeeded();
  server.listen(PORT, () => {
    console.log(`NinjaClaw backend listening on http://localhost:${PORT}`);
    console.log(`MongoDB connected: ${MONGODB_URI}/${MONGODB_DB_NAME}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start NinjaClaw backend", error);
  process.exit(1);
});
