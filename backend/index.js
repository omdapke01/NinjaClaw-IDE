import "dotenv/config";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { createServer } from "node:http";
import fs from "node:fs/promises";
import { accessSync, constants as fsConstants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { Server } from "socket.io";
import { v4 as uuid } from "uuid";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET || "ninjaclaw-local-secret";
const dataDir = path.join(__dirname, "data");
const usersFile = path.join(dataDir, "users.json");
const projectsFile = path.join(dataDir, "projects.json");
const projectFilesDir = path.join(dataDir, "projects");

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

app.use(
  cors({
    origin: true,
    credentials: true
  })
);
app.use(helmet());
app.use(express.json({ limit: "1mb" }));
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 120
  })
);

async function ensureDataFiles() {
  await fs.mkdir(projectFilesDir, { recursive: true });
  await ensureJsonFile(usersFile);
  await ensureJsonFile(projectsFile);
}

async function ensureJsonFile(target) {
  try {
    await fs.access(target);
  } catch {
    await fs.writeFile(target, "[]", "utf8");
  }
}

async function readJson(target) {
  const raw = await fs.readFile(target, "utf8");
  return JSON.parse(raw);
}

async function writeJson(target, payload) {
  await fs.writeFile(target, JSON.stringify(payload, null, 2), "utf8");
}

async function getOwnedProject(projectId, ownerId) {
  const projects = await readJson(projectsFile);
  return projects.find((project) => project.id === projectId && project.ownerId === ownerId);
}

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: "7d" });
}

function authMiddleware(request, response, next) {
  const token = request.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    return response.status(401).json({ message: "Missing authentication token" });
  }

  try {
    request.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    response.status(401).json({ message: "Invalid or expired token" });
  }
}

function safeProjectDir(projectId) {
  return path.join(projectFilesDir, projectId);
}

function safeFilePath(projectId, relativePath) {
  const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  return path.join(safeProjectDir(projectId), normalized);
}

function normalizeRelativePath(relativePath = "") {
  return path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "").replaceAll("\\", "/");
}

function resolveProjectSubpath(projectId, relativePath = "") {
  const projectRoot = safeProjectDir(projectId);
  const normalized = normalizeRelativePath(relativePath);
  const resolved = path.resolve(projectRoot, normalized);
  const rootResolved = path.resolve(projectRoot);

  if (!resolved.startsWith(rootResolved)) {
    throw new Error("Path escapes project root");
  }

  return resolved;
}

function commandExists(command) {
  try {
    accessSync(command, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function inferRuntime(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  switch (extension) {
    case ".js":
      return "javascript";
    case ".py":
      return "python";
    case ".java":
      return "java";
    case ".cpp":
    case ".cc":
    case ".cxx":
      return "cpp";
    default:
      return "unknown";
  }
}

function timestamp() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function executeCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: false,
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill();
        resolve({
          ok: false,
          code: -1,
          stdout,
          stderr: `${stderr}\nProcess timed out after ${options.timeoutMs || 12000}ms`.trim()
        });
      }
    }, options.timeoutMs || 12000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        resolve({
          ok: false,
          code: -1,
          stdout,
          stderr: `${stderr}\n${error.message}`.trim()
        });
      }
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        resolve({
          ok: code === 0,
          code: code ?? 0,
          stdout,
          stderr
        });
      }
    });
  });
}

async function runProjectFile(projectId, relativePath) {
  const filePath = resolveProjectSubpath(projectId, relativePath);
  const runtime = inferRuntime(relativePath);
  const cwd = path.dirname(filePath);

  if (runtime === "javascript") {
    return executeCommand("node", [filePath], { cwd });
  }

  if (runtime === "python") {
    return executeCommand("python", [filePath], { cwd });
  }

  if (runtime === "java") {
    const compile = await executeCommand("javac", [filePath], { cwd });
    if (!compile.ok) return compile;
    const className = path.basename(filePath, ".java");
    return executeCommand("java", ["-cp", cwd, className], { cwd });
  }

  if (runtime === "cpp") {
    const outputName = `${path.basename(filePath, path.extname(filePath))}.exe`;
    const outputPath = path.join(cwd, outputName);
    const compile = await executeCommand("g++", [filePath, "-o", outputPath], { cwd });
    if (!compile.ok) return compile;
    return executeCommand(outputPath, [], { cwd });
  }

  return {
    ok: false,
    code: -1,
    stdout: "",
    stderr: `Unsupported file type for execution: ${relativePath}`
  };
}

async function listProjectEntries(projectId, relativePath = "") {
  const targetDir = resolveProjectSubpath(projectId, relativePath);
  const entries = await fs.readdir(targetDir, { withFileTypes: true }).catch(() => []);
  return entries
    .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
    .sort((a, b) => a.localeCompare(b));
}

async function runTerminalCommand(projectId, commandLine) {
  const input = commandLine.trim();
  const [command, ...rest] = input.split(/\s+/);
  const args = rest.filter(Boolean);
  const currentDir = safeProjectDir(projectId);

  if (!input) {
    return { ok: true, output: "", filesChanged: false };
  }

  if (command === "pwd") {
    return { ok: true, output: currentDir, filesChanged: false };
  }

  if (command === "ls" || command === "dir") {
    const relativeTarget = args[0] || "";
    const entries = await listProjectEntries(projectId, relativeTarget);
    return { ok: true, output: entries.join("\n") || "(empty)", filesChanged: false };
  }

  if (command === "mkdir") {
    const relativeTarget = args[0];
    if (!relativeTarget) return { ok: false, output: "Usage: mkdir <folder>", filesChanged: false };
    await fs.mkdir(resolveProjectSubpath(projectId, relativeTarget), { recursive: true });
    return { ok: true, output: `Created folder ${normalizeRelativePath(relativeTarget)}`, filesChanged: true };
  }

  if (command === "touch" || command === "code") {
    const relativeTarget = args[0];
    if (!relativeTarget) return { ok: false, output: `Usage: ${command} <file>`, filesChanged: false };
    const targetPath = resolveProjectSubpath(projectId, relativeTarget);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    try {
      await fs.access(targetPath);
    } catch {
      await fs.writeFile(targetPath, "", "utf8");
    }
    return { ok: true, output: `Opened ${normalizeRelativePath(relativeTarget)}`, filesChanged: true, openedFile: normalizeRelativePath(relativeTarget) };
  }

  if (command === "cat" || command === "type") {
    const relativeTarget = args[0];
    if (!relativeTarget) return { ok: false, output: `Usage: ${command} <file>`, filesChanged: false };
    const content = await fs.readFile(resolveProjectSubpath(projectId, relativeTarget), "utf8");
    return { ok: true, output: content || "(empty file)", filesChanged: false };
  }

  if (command === "run") {
    const relativeTarget = args[0];
    if (!relativeTarget) return { ok: false, output: "Usage: run <file>", filesChanged: false };
    const result = await runProjectFile(projectId, relativeTarget);
    return {
      ok: result.ok,
      output: [result.stdout, result.stderr].filter(Boolean).join("\n").trim() || `(exit code ${result.code})`,
      filesChanged: false
    };
  }

  if (command === "help") {
    return {
      ok: true,
      output: ["pwd", "ls [folder]", "mkdir <folder>", "code <file>", "touch <file>", "cat <file>", "run <file>"].join("\n"),
      filesChanged: false
    };
  }

  return {
    ok: false,
    output: `Unsupported command: ${command}. Try: help`,
    filesChanged: false
  };
}

async function emitProjectUpdate(userId, message) {
  io.to(userId).emit("project:updated", { message, timestamp: Date.now() });
}

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error("Unauthorized"));
  }

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
  response.json({ ok: true, name: "NinjaClaw API", port: PORT });
});

app.post("/api/auth/register", async (request, response) => {
  const { name, email, password } = request.body;
  if (!name || !email || !password) {
    return response.status(400).json({ message: "Name, email, and password are required" });
  }

  const users = await readJson(usersFile);
  if (users.some((user) => user.email === email)) {
    return response.status(409).json({ message: "User already exists" });
  }

  const newUser = {
    id: uuid(),
    name,
    email,
    passwordHash: await bcrypt.hash(password, 10),
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  await writeJson(usersFile, users);

  response.status(201).json({
    token: signToken(newUser),
    user: { id: newUser.id, name: newUser.name, email: newUser.email }
  });
});

app.post("/api/auth/login", async (request, response) => {
  const { email, password } = request.body;
  const users = await readJson(usersFile);
  const user = users.find((entry) => entry.email === email);

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return response.status(401).json({ message: "Invalid credentials" });
  }

  response.json({
    token: signToken(user),
    user: { id: user.id, name: user.name, email: user.email }
  });
});

app.get("/api/projects", authMiddleware, async (request, response) => {
  const projects = await readJson(projectsFile);
  response.json({
    projects: projects.filter((project) => project.ownerId === request.user.sub)
  });
});

app.post("/api/projects", authMiddleware, async (request, response) => {
  const { name, description } = request.body;
  if (!name) {
    return response.status(400).json({ message: "Project name is required" });
  }

  const projects = await readJson(projectsFile);
  const newProject = {
    id: uuid(),
    name,
    description: description || "",
    ownerId: request.user.sub,
    createdAt: new Date().toISOString()
  };

  projects.push(newProject);
  await writeJson(projectsFile, projects);
  await fs.mkdir(safeProjectDir(newProject.id), { recursive: true });
  await emitProjectUpdate(request.user.sub, `Project ${name} created`);

  response.status(201).json({
    projects: projects.filter((project) => project.ownerId === request.user.sub)
  });
});

app.delete("/api/projects/:projectId", authMiddleware, async (request, response) => {
  const ownedProject = await getOwnedProject(request.params.projectId, request.user.sub);
  if (!ownedProject) {
    return response.status(404).json({ message: "Project not found" });
  }

  const projects = await readJson(projectsFile);
  const nextProjects = projects.filter(
    (project) => !(project.id === request.params.projectId && project.ownerId === request.user.sub)
  );

  await writeJson(projectsFile, nextProjects);
  await fs.rm(safeProjectDir(request.params.projectId), { recursive: true, force: true });
  await emitProjectUpdate(request.user.sub, `Project ${request.params.projectId} removed`);

  response.json({
    projects: nextProjects.filter((project) => project.ownerId === request.user.sub)
  });
});

app.get("/api/projects/:projectId/files", authMiddleware, async (request, response) => {
  const ownedProject = await getOwnedProject(request.params.projectId, request.user.sub);
  if (!ownedProject) {
    return response.status(404).json({ message: "Project not found" });
  }

  const projectDir = safeProjectDir(request.params.projectId);

  async function walk(currentDir, prefix = "") {
    const entries = await fs.readdir(currentDir, { withFileTypes: true }).catch(() => []);
    const files = [];

    for (const entry of entries) {
      const relativePath = prefix ? path.join(prefix, entry.name) : entry.name;
      if (entry.isDirectory()) {
        files.push(...(await walk(path.join(currentDir, entry.name), relativePath)));
      } else {
        files.push({ name: entry.name, path: relativePath.replaceAll("\\", "/") });
      }
    }

    return files;
  }

  response.json({ files: await walk(projectDir) });
});

app.get("/api/projects/:projectId/files/content", authMiddleware, async (request, response) => {
  const ownedProject = await getOwnedProject(request.params.projectId, request.user.sub);
  if (!ownedProject) {
    return response.status(404).json({ message: "Project not found" });
  }

  const filePath = request.query.path;
  if (!filePath) {
    return response.status(400).json({ message: "File path is required" });
  }

  const content = await fs.readFile(safeFilePath(request.params.projectId, filePath), "utf8");
  response.json({ content });
});

app.post("/api/projects/:projectId/files", authMiddleware, async (request, response) => {
  const ownedProject = await getOwnedProject(request.params.projectId, request.user.sub);
  if (!ownedProject) {
    return response.status(404).json({ message: "Project not found" });
  }

  const { path: relativePath, content = "" } = request.body;
  if (!relativePath) {
    return response.status(400).json({ message: "File path is required" });
  }

  const fullPath = safeFilePath(request.params.projectId, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, "utf8");
  await emitProjectUpdate(request.user.sub, `Created ${relativePath}`);

  response.status(201).json({ ok: true });
});

app.put("/api/projects/:projectId/files", authMiddleware, async (request, response) => {
  const ownedProject = await getOwnedProject(request.params.projectId, request.user.sub);
  if (!ownedProject) {
    return response.status(404).json({ message: "Project not found" });
  }

  const { path: relativePath, content } = request.body;
  if (!relativePath) {
    return response.status(400).json({ message: "File path is required" });
  }

  await fs.writeFile(safeFilePath(request.params.projectId, relativePath), content ?? "", "utf8");
  await emitProjectUpdate(request.user.sub, `Saved ${relativePath}`);

  response.json({ ok: true });
});

app.post("/api/projects/:projectId/run", authMiddleware, async (request, response) => {
  const ownedProject = await getOwnedProject(request.params.projectId, request.user.sub);
  if (!ownedProject) {
    return response.status(404).json({ message: "Project not found" });
  }

  const relativePath = request.body.path;
  if (!relativePath) {
    return response.status(400).json({ message: "File path is required" });
  }

  const result = await runProjectFile(request.params.projectId, relativePath);
  const combinedOutput = [result.stdout, result.stderr].filter(Boolean).join("\n").trim() || `(exit code ${result.code})`;

  response.json({
    ok: result.ok,
    code: result.code,
    output: combinedOutput,
    runtime: inferRuntime(relativePath),
    ranAt: timestamp()
  });
});

app.post("/api/projects/:projectId/terminal", authMiddleware, async (request, response) => {
  const ownedProject = await getOwnedProject(request.params.projectId, request.user.sub);
  if (!ownedProject) {
    return response.status(404).json({ message: "Project not found" });
  }

  const commandLine = String(request.body.command || "");
  const result = await runTerminalCommand(request.params.projectId, commandLine);

  if (result.filesChanged) {
    await emitProjectUpdate(request.user.sub, `Terminal: ${commandLine}`);
  }

  response.json({
    ok: result.ok,
    output: result.output,
    openedFile: result.openedFile || null,
    executedAt: timestamp()
  });
});

ensureDataFiles().then(() => {
  server.listen(PORT, () => {
    console.log(`NinjaClaw backend listening on http://localhost:${PORT}`);
  });
});
