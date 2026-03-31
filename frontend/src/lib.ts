import type { FileNode, FlatFile, LanguageOption } from "./types";

const languageMap: Record<LanguageOption, { label: string; extension: string; starter: string }> = {
  javascript: {
    label: "JavaScript",
    extension: "js",
    starter: "function main() {\n  console.log('NinjaClaw JS ready');\n}\n\nmain();\n"
  },
  python: {
    label: "Python",
    extension: "py",
    starter: "def main():\n    print('NinjaClaw Python ready')\n\n\nif __name__ == '__main__':\n    main()\n"
  },
  cpp: {
    label: "C++",
    extension: "cpp",
    starter:
      "#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << \"NinjaClaw C++ ready\" << endl;\n    return 0;\n}\n"
  },
  java: {
    label: "Java",
    extension: "java",
    starter:
      "public class Main {\n  public static void main(String[] args) {\n    System.out.println(\"NinjaClaw Java ready\");\n  }\n}\n"
  }
};

export function getLanguageMeta(language: LanguageOption) {
  return languageMap[language];
}

export function inferLanguageFromPath(filePath: string): LanguageOption {
  if (filePath.endsWith(".py")) return "python";
  if (filePath.endsWith(".cpp") || filePath.endsWith(".cc") || filePath.endsWith(".cxx")) return "cpp";
  if (filePath.endsWith(".java")) return "java";
  return "javascript";
}

export function buildTree(files: FlatFile[]): FileNode[] {
  const root: FileNode[] = [];

  for (const file of files) {
    const segments = file.path.split("/");
    let pointer = root;
    let currentPath = "";

    segments.forEach((segment, index) => {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const isLast = index === segments.length - 1;
      let existing = pointer.find((node) => node.name === segment);

      if (!existing) {
        existing = {
          id: currentPath,
          name: segment,
          path: currentPath,
          type: isLast ? "file" : "folder",
          children: isLast ? undefined : []
        };
        pointer.push(existing);
      }

      if (!isLast) {
        existing.children ??= [];
        pointer = existing.children;
      }
    });
  }

  return root.sort(sortNodes).map((node) => sortRecursively(node));
}

function sortRecursively(node: FileNode): FileNode {
  if (!node.children) return node;
  return {
    ...node,
    children: node.children.sort(sortNodes).map((child) => sortRecursively(child))
  };
}

function sortNodes(a: FileNode, b: FileNode) {
  if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
  return a.name.localeCompare(b.name);
}

