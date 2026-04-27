import type { FlatFile, LanguageOption, Project, User } from "./types";

export type DemoWorkspaceState = {
  user: User;
  projects: Project[];
  filesByProject: Record<string, FlatFile[]>;
  fileContents: Record<string, string>;
};

export const DEMO_STORAGE_KEY = "ninjaclaw-demo-state-v1";

export function createDefaultDemoState(): DemoWorkspaceState {
  const projectId = "demo-project";

  return {
    user: {
      id: "demo-user",
      name: "Demo User",
      email: "demo@ninjaclaw.dev"
    },
    projects: [
      {
        id: projectId,
        name: "Frontend Showcase",
        description: "Interactive browser IDE demo"
      }
    ],
    filesByProject: {
      [projectId]: [
        { name: "app.js", path: "src/app.js" },
        { name: "counter.py", path: "scripts/counter.py" },
        { name: "hello.cpp", path: "cpp/hello.cpp" }
      ]
    },
    fileContents: {
      [`${projectId}:src/app.js`]:
        "export function App() {\n  const features = ['Instant startup', 'Demo mode', 'AI chat'];\n  return features.map((item) => console.log(item));\n}\n\nApp();\n",
      [`${projectId}:scripts/counter.py`]:
        "count = 0\nfor i in range(1, 6):\n    count += i\nprint('Counter total:', count)\n",
      [`${projectId}:cpp/hello.cpp`]:
        "#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << \"Hello from demo mode\" << endl;\n    return 0;\n}\n"
    }
  };
}

export function loadDemoState(): DemoWorkspaceState {
  if (typeof window === "undefined") {
    return createDefaultDemoState();
  }

  try {
    const raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return createDefaultDemoState();
    return JSON.parse(raw) as DemoWorkspaceState;
  } catch {
    return createDefaultDemoState();
  }
}

export function saveDemoState(state: DemoWorkspaceState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
}

export function demoFileKey(projectId: string, filePath: string) {
  return `${projectId}:${filePath}`;
}

export function simulateCodeRun(language: LanguageOption, code: string, filePath: string) {
  const quotedStrings = Array.from(code.matchAll(/["'`](.*?)["'`]/g)).map((match) => match[1]).filter(Boolean);

  if (language === "python" || language === "javascript" || language === "cpp" || language === "java") {
    if (quotedStrings.length > 0) {
      return quotedStrings.join("\n");
    }
  }

  return `Demo mode simulated execution for ${filePath}\nNo backend runtime is connected in the hosted frontend build.`;
}

export function simulateAiReply(message: string, activeFilePath?: string) {
  const lower = message.toLowerCase();

  if (lower.includes("counter")) {
    return [
      "```javascript",
      "import { useState } from 'react';",
      "",
      "export default function Counter() {",
      "  const [count, setCount] = useState(0);",
      "",
      "  return (",
      "    <div className=\"counter-card\">",
      "      <h1>Count: {count}</h1>",
      "      <button onClick={() => setCount(count + 1)}>Increment</button>",
      "    </div>",
      "  );",
      "}",
      "```"
    ].join("\n");
  }

  if (lower.includes("todo")) {
    return [
      "```cpp",
      "#include <iostream>",
      "#include <vector>",
      "#include <string>",
      "using namespace std;",
      "",
      "int main() {",
      "    vector<string> tasks;",
      "    int choice;",
      "    while (true) {",
      "        cout << \"1. Add Task\\n2. List Tasks\\n3. Exit\\nEnter choice: \";",
      "        cin >> choice;",
      "        cin.ignore();",
      "        if (choice == 1) {",
      "            string task;",
      "            getline(cin, task);",
      "            tasks.push_back(task);",
      "        } else if (choice == 2) {",
      "            for (const auto& task : tasks) cout << \"- \" << task << endl;",
      "        } else {",
      "            break;",
      "        }",
      "    }",
      "    return 0;",
      "}",
      "```"
    ].join("\n");
  }

  return `Demo mode AI reply for ${activeFilePath || "current file"}:\n\nI can still help explain structure, suggest UI, and generate sample code in the hosted frontend build.`;
}
