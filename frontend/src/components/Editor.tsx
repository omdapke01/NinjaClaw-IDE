import MonacoEditor, { type Monaco } from "@monaco-editor/react";
import { Play, Save } from "lucide-react";
import { useEffect, useRef } from "react";
import { getLanguageMeta } from "../lib";
import type { EditorCursorContext, LanguageOption } from "../types";

type EditorProps = {
  filePath: string;
  language: LanguageOption;
  value: string;
  onChange: (value: string) => void;
  onCursorContextChange: (context: EditorCursorContext) => void;
  onSave: () => Promise<void> | void;
  onRun: () => Promise<void> | void;
  onLanguageChange: (language: LanguageOption) => Promise<void> | void;
};

const languageOptions: LanguageOption[] = ["javascript", "python", "cpp", "java"];

export function Editor(props: EditorProps) {
  const editorRef = useRef<any>(null);

  function handleBeforeMount(monaco: Monaco) {
    monaco.editor.defineTheme("ninjaclaw-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "6b7280" },
        { token: "keyword", foreground: "60a5fa" },
        { token: "string", foreground: "86efac" },
        { token: "number", foreground: "f9a8d4" }
      ],
      colors: {
        "editor.background": "#0b0d12",
        "editor.lineHighlightBackground": "#11161f",
        "editorLineNumber.foreground": "#4b5563",
        "editorLineNumber.activeForeground": "#d4d4d8"
      }
    });

    for (const providerLanguage of ["javascript", "python", "cpp", "java"]) {
      monaco.languages.registerCompletionItemProvider(providerLanguage, {
        provideCompletionItems() {
          return {
            suggestions: providerLanguage === "python"
              ? [
                  {
                    label: "ifmain",
                    kind: monaco.languages.CompletionItemKind.Snippet,
                    insertText: "if __name__ == '__main__':\n    main()",
                    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                  }
                ]
              : []
          };
        }
      });
    }
  }

  function handleMount(editor: any, monaco: Monaco) {
    editorRef.current = editor;

    const pushCursorContext = () => {
      const model = editor.getModel();
      const position = editor.getPosition();
      if (!model || !position) return;

      const offset = model.getOffsetAt(position);
      const fullText = model.getValue();
      props.onCursorContextChange({
        lineNumber: position.lineNumber,
        column: position.column,
        prefix: fullText.slice(Math.max(0, offset - 1200), offset),
        suffix: fullText.slice(offset, Math.min(fullText.length, offset + 400))
      });
    };

    editor.onDidChangeCursorPosition(() => {
      pushCursorContext();
    });

    editor.onDidChangeModelContent(() => {
      pushCursorContext();
    });
    pushCursorContext();
  }

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-ide-editor">
      <div className="flex items-center justify-between border-b border-ide-border bg-ide-panel px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-secondary px-3 py-1 text-sm text-foreground">{props.filePath || "untitled"}</div>
          <select
            value={props.language}
            onChange={(event) => props.onLanguageChange(event.target.value as LanguageOption)}
            className="rounded-md border border-ide-border bg-ide-sidebar px-3 py-1.5 text-sm text-foreground outline-none"
          >
            {languageOptions.map((option) => (
              <option key={option} value={option}>
                {getLanguageMeta(option).label}
              </option>
            ))}
          </select>
        </div>
        <button
          className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white transition hover:bg-emerald-500"
          onClick={props.onRun}
        >
          <Play size={14} />
          Run
        </button>
        <button className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground transition hover:bg-primary/90" onClick={props.onSave}>
          <Save size={14} />
          Save
        </button>
      </div>

      <div className="h-full min-h-0 flex-1">
        <MonacoEditor
          beforeMount={handleBeforeMount}
          onMount={handleMount}
          height="100%"
          theme="ninjaclaw-dark"
          language={props.language === "cpp" ? "cpp" : props.language}
          value={props.value}
          onChange={(value) => props.onChange(value ?? "")}
          options={{
            minimap: { enabled: false },
            lineNumbers: "on",
            quickSuggestions: true,
            suggestOnTriggerCharacters: true,
            automaticLayout: true,
            fontSize: 14,
            fontLigatures: true,
            wordWrap: "on",
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            renderLineHighlight: "line",
            smoothScrolling: true,
            bracketPairColorization: { enabled: true },
            padding: { top: 18 }
          }}
        />
      </div>
    </section>
  );
}
