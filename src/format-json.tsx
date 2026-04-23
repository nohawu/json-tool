import {
  Action,
  ActionPanel,
  Clipboard,
  Color,
  Detail,
  Form,
  Icon,
  List,
  showToast,
  Toast,
} from "@raycast/api";
import { useEffect, useMemo, useState } from "react";

import {
  JsonOperation,
  JsonPathSuggestion,
  listJsonPathSuggestions,
  transformJson,
} from "./json-tools";
import { readSelectionOrClipboard } from "./input";

const INDENT_OPTIONS = [2, 4, 8];
const ACCENT_COLORS = [Color.Blue, Color.Purple, Color.Magenta];

const OPERATIONS: Array<{
  title: string;
  value: JsonOperation;
  icon: Icon;
  hint: string;
}> = [
  {
    title: "格式化",
    value: "format",
    icon: Icon.Text,
    hint: "美化 JSON，适合阅读和编辑。",
  },
  {
    title: "压缩",
    value: "minify",
    icon: Icon.MinusCircle,
    hint: "移除空白字符，输出单行 JSON。",
  },
  {
    title: "JSON 修复",
    value: "repair",
    icon: Icon.BandAid,
    hint: "尝试修复注释、尾逗号、未加引号 key、单引号字符串。",
  },
  {
    title: "转义",
    value: "escape",
    icon: Icon.Code,
    hint: "把当前文本转换为 JSON 字符串字面量。",
  },
  {
    title: "反转义",
    value: "unescape",
    icon: Icon.CodeBlock,
    hint: "把 JSON 字符串字面量还原为普通文本或 JSON。",
  },
  {
    title: "Unicode 编码",
    value: "unicode-escape",
    icon: Icon.Globe,
    hint: "把非 ASCII 字符转换为 \\uXXXX。",
  },
  {
    title: "Unicode 解码",
    value: "unicode-unescape",
    icon: Icon.Globe,
    hint: "把 \\uXXXX 转回可读字符。",
  },
  {
    title: "Schema",
    value: "schema",
    icon: Icon.Document,
    hint: "根据当前 JSON 推断基础 JSON Schema。",
  },
  {
    title: "Path 查询",
    value: "path",
    icon: Icon.MagnifyingGlass,
    hint: "输入 user.name 或 items[0] 查询 JSON 片段。",
  },
];

type EditingPanel = "path" | "clipboard-history" | undefined;

type ClipboardHistoryItem = {
  offset: number;
  text: string;
  preview: string;
  summary: string;
};

export default function Command() {
  const [content, setContent] = useState("");
  const [source, setSource] = useState<"selection" | "clipboard" | "manual">(
    "manual",
  );
  const [operation, setOperation] = useState<JsonOperation>("format");
  const [indent, setIndent] = useState(2);
  const [path, setPath] = useState("");
  const [sortKeys, setSortKeys] = useState(false);
  const [editingPanel, setEditingPanel] = useState<EditingPanel>();
  const [status, setStatus] = useState("Paste JSON to begin.");
  const [error, setError] = useState<string | undefined>();

  const activeOperation = OPERATIONS.find((item) => item.value === operation);

  useEffect(() => {
    async function loadInitialText() {
      const result = await readSelectionOrClipboard();
      setContent(result.text);
      setSource(result.source);
      setStatus(
        result.text.trim()
          ? `Loaded from ${result.source}.`
          : "Paste JSON to begin.",
      );
    }

    loadInitialText();
  }, []);

  async function runOperation(nextOperation: JsonOperation) {
    if (nextOperation === "path") {
      setOperation("path");
      setEditingPanel("path");
      return;
    }

    if (!content.trim()) {
      setStatus("Paste JSON to begin.");
      setError(undefined);
      return;
    }

    try {
      const result = transformJson(content, {
        operation: nextOperation,
        indent,
        path,
        sortKeys,
      });

      setContent(result.output);
      setOperation(nextOperation);
      setSource("manual");
      setStatus(
        `${
          result.inputKind === "encoded-json-string"
            ? "decoded JSON string"
            : "ready"
        } · ${result.summary}`,
      );
      setError(undefined);
    } catch (error) {
      setStatus("Invalid JSON.");
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  async function copyContent() {
    if (!content) {
      await showToast({
        style: Toast.Style.Failure,
        title: "No content",
        message: error,
      });
      return;
    }

    await Clipboard.copy(content);
    await showToast({ style: Toast.Style.Success, title: "Copied content" });
  }

  async function reloadInput() {
    const result = await readSelectionOrClipboard();
    setContent(result.text);
    setSource(result.source);
    setStatus(
      result.text.trim()
        ? `Loaded from ${result.source}.`
        : "Paste JSON to begin.",
    );
    setError(undefined);
    await showToast({
      style: Toast.Style.Success,
      title: `Loaded from ${result.source}`,
    });
  }

  if (editingPanel === "path") {
    return (
      <PathQueryView
        input={content}
        indent={indent}
        path={path}
        onApplyResult={(nextPath, result) => {
          setPath(nextPath);
          setContent(result);
          setOperation("path");
          setSource("manual");
          setStatus(`Path ${nextPath} · result applied`);
          setError(undefined);
        }}
        onClose={() => setEditingPanel(undefined)}
      />
    );
  }

  if (editingPanel === "clipboard-history") {
    return (
      <ClipboardHistoryView
        onSelect={(text, offset) => {
          setContent(text);
          setSource("clipboard");
          setStatus(`Loaded JSON from clipboard history #${offset}.`);
          setError(undefined);
          setEditingPanel(undefined);
        }}
        onClose={() => setEditingPanel(undefined)}
      />
    );
  }

  return (
    <Form
      navigationTitle="JSON Tool"
      actions={
        <WorkbenchActions
          content={content}
          error={error}
          operation={operation}
          copyContent={copyContent}
          reloadInput={reloadInput}
          runOperation={runOperation}
          setIndent={setIndent}
          indent={indent}
          setSortKeys={setSortKeys}
          sortKeys={sortKeys}
          openClipboardHistory={() => setEditingPanel("clipboard-history")}
          openPathQuery={() => {
            setOperation("path");
            setEditingPanel("path");
          }}
        />
      }
    >
      <Form.Description
        title="JSON Studio"
        text={`${activeOperation?.title ?? "JSON"} · ${activeOperation?.hint ?? ""} · ⌘⇧V 打开 JSON 剪贴板历史`}
      />
      <Form.Dropdown
        id="clipboardHistory"
        title="剪贴板"
        value=""
        onChange={(value) => {
          if (value === "clipboard-history") {
            setEditingPanel("clipboard-history");
          }
        }}
      >
        <Form.Dropdown.Item
          title="JSON 剪贴板历史"
          value="clipboard-history"
          icon={tintedIcon(Icon.Clock, 1)}
        />
        <Form.Dropdown.Item
          title="打开最近 6 条 JSON"
          value=""
          icon={tintedIcon(Icon.Bolt, 0)}
        />
      </Form.Dropdown>
      <Form.Dropdown
        id="operation"
        title="工具"
        value={operation}
        onChange={(value) => setOperation(value as JsonOperation)}
      >
        {OPERATIONS.map((item, index) => (
          <Form.Dropdown.Item
            key={item.value}
            title={item.title}
            value={item.value}
            icon={tintedIcon(item.icon, index)}
          />
        ))}
      </Form.Dropdown>
      <Form.Dropdown
        id="indent"
        title="缩进"
        value={String(indent)}
        onChange={(value) => setIndent(Number(value))}
      >
        {INDENT_OPTIONS.map((spaces) => (
          <Form.Dropdown.Item
            key={spaces}
            title={`${spaces} 空格`}
            value={String(spaces)}
            icon={tintedIcon(Icon.TextCursor, spaces)}
          />
        ))}
      </Form.Dropdown>
      <Form.Checkbox
        id="sortKeys"
        label="键排序"
        value={sortKeys}
        onChange={setSortKeys}
      />
      <Form.Separator />
      <Form.TextArea
        id="content"
        title={`JSON · ${activeOperation?.title ?? "编辑"}`}
        value={content}
        onChange={(value) => {
          setContent(value);
          setSource("manual");
          setError(undefined);
          setStatus(
            value.trim()
              ? "已编辑，选择工具执行转换。"
              : "Paste JSON to begin.",
          );
        }}
        placeholder='{"name":"Raycast"}'
        error={error}
      />
      <Form.Description
        title="状态"
        text={`${status} · 来源 ${source} · 缩进 ${indent} · 键排序 ${
          sortKeys ? "开" : "关"
        }${operation === "path" ? ` · Path ${path || "未选择"}` : ""}`}
      />
    </Form>
  );
}

function WorkbenchActions(props: {
  content: string;
  error?: string;
  operation: JsonOperation;
  copyContent: () => Promise<void>;
  reloadInput: () => Promise<void>;
  runOperation: (operation: JsonOperation) => Promise<void>;
  setIndent: (indent: number) => void;
  indent: number;
  setSortKeys: (sortKeys: boolean) => void;
  sortKeys: boolean;
  primaryOperation?: JsonOperation;
  openClipboardHistory: () => void;
  openPathQuery: () => void;
}) {
  return (
    <ActionPanel>
      <Action
        title="执行当前工具"
        icon={tintedIcon(Icon.Bolt, 1)}
        onAction={() => props.runOperation(props.operation)}
        shortcut={{ modifiers: ["cmd"], key: "return" }}
      />
      <Action
        title="格式化"
        icon={tintedIcon(Icon.Text, 0)}
        onAction={() => props.runOperation("format")}
        shortcut={{ modifiers: ["cmd"], key: "f" }}
      />
      <Action
        title="压缩"
        icon={tintedIcon(Icon.MinusCircle, 1)}
        onAction={() => props.runOperation("minify")}
        shortcut={{ modifiers: ["cmd"], key: "m" }}
      />
      <Action
        title="JSON 修复"
        icon={tintedIcon(Icon.BandAid, 2)}
        onAction={() => props.runOperation("repair")}
        shortcut={{ modifiers: ["cmd"], key: "j" }}
      />
      {props.primaryOperation ? (
        <Action
          title={
            props.primaryOperation === "path" ? "打开 Path 查询" : "使用此工具"
          }
          icon={tintedIcon(Icon.Checkmark, 1)}
          onAction={() => {
            if (props.primaryOperation === "path") {
              props.openPathQuery();
              return;
            }

            props.runOperation(props.primaryOperation as JsonOperation);
          }}
        />
      ) : null}
      <Action
        title="复制内容"
        icon={tintedIcon(Icon.Clipboard, 0)}
        onAction={props.copyContent}
        shortcut={{ modifiers: ["cmd"], key: "c" }}
      />
      <Action.Push
        title="带行号预览"
        icon={tintedIcon(Icon.Eye, 2)}
        target={<CodePreview title="JSON 预览" content={props.content} />}
        shortcut={{ modifiers: ["cmd"], key: "l" }}
      />
      <Action
        title="重新读取选中内容或剪贴板"
        icon={tintedIcon(Icon.Download, 0)}
        onAction={props.reloadInput}
        shortcut={{ modifiers: ["cmd"], key: "r" }}
      />
      <Action
        title="JSON 剪贴板历史"
        icon={tintedIcon(Icon.Clock, 1)}
        onAction={props.openClipboardHistory}
        shortcut={{ modifiers: ["cmd", "shift"], key: "v" }}
      />

      <ActionPanel.Section title="工具">
        {OPERATIONS.map((item, index) => (
          <Action
            key={item.value}
            title={item.title}
            icon={tintedIcon(item.icon, index)}
            onAction={() => {
              if (item.value === "path") {
                props.openPathQuery();
                return;
              }

              props.runOperation(item.value);
            }}
          />
        ))}
      </ActionPanel.Section>

      <ActionPanel.Section title="参数">
        {INDENT_OPTIONS.map((spaces) => (
          <Action
            key={spaces}
            title={`缩进 ${spaces} 空格`}
            icon={props.indent === spaces ? Icon.Checkmark : Icon.BlankDocument}
            onAction={() => props.setIndent(spaces)}
          />
        ))}
        <Action
          title={props.sortKeys ? "关闭键排序" : "开启键排序"}
          icon={props.sortKeys ? Icon.XMarkCircle : Icon.Checkmark}
          onAction={() => props.setSortKeys(!props.sortKeys)}
        />
      </ActionPanel.Section>

      {props.error ? (
        <Action.CopyToClipboard
          title="复制错误信息"
          content={props.error}
          shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
        />
      ) : null}
    </ActionPanel>
  );
}

function PathQueryView(props: {
  input: string;
  indent: number;
  path: string;
  onApplyResult: (path: string, result: string) => void;
  onClose: () => void;
}) {
  const [jsonText, setJsonText] = useState(() =>
    formatJsonReference(props.input, props.indent),
  );
  const [searchText, setSearchText] = useState(props.path);
  const suggestions = useMemo(() => {
    try {
      return listJsonPathSuggestions(jsonText);
    } catch {
      return [];
    }
  }, [jsonText]);

  const normalizedSearch = normalizePathInput(searchText);
  const visibleSuggestions = filterPathSuggestions(
    suggestions,
    normalizedSearch,
  );
  const currentPath = normalizedSearch || visibleSuggestions[0]?.path || "";
  const currentResult = buildPathResult(jsonText, currentPath, props.indent);

  async function applyResult(path: string, output: string, error?: string) {
    if (!path || !output || error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Path 查询失败",
        message: error ?? "请输入 JSONPath。",
      });
      return;
    }

    props.onApplyResult(path, output);
    await showToast({
      style: Toast.Style.Success,
      title: `已应用 Path: ${path}`,
    });
    props.onClose();
  }

  async function copyResult(output: string, error?: string) {
    if (!output || error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Path 查询失败",
        message: error,
      });
      return;
    }

    await Clipboard.copy(output);
    await showToast({ style: Toast.Style.Success, title: "已复制查询结果" });
  }

  return (
    <List
      isShowingDetail
      navigationTitle="JSONPath 查询"
      searchBarPlaceholder="输入 JSONPath，例如 nav_menu.home.href"
      searchText={searchText}
      onSearchTextChange={setSearchText}
    >
      <List.Section title="当前输入">
        <List.Item
          id="current-input"
          title={currentPath || "输入 JSONPath"}
          subtitle={currentResult.error ?? "使用当前输入查询"}
          icon={tintedIcon(Icon.MagnifyingGlass, 0)}
          detail={
            <PathDetail
              jsonText={jsonText}
              path={currentPath}
              output={currentResult.output}
              error={currentResult.error}
              suggestionsCount={suggestions.length}
            />
          }
          actions={
            <PathResultActions
              path={currentPath}
              output={currentResult.output}
              error={currentResult.error}
              jsonText={jsonText}
              setJsonText={setJsonText}
              applyResult={applyResult}
              copyResult={copyResult}
              onClose={props.onClose}
            />
          }
        />
      </List.Section>
      <List.Section title="智能补全">
        {visibleSuggestions.map((suggestion, index) => {
          const suggestionResult = buildPathResult(
            jsonText,
            suggestion.path,
            props.indent,
          );

          return (
            <List.Item
              key={suggestion.path}
              id={suggestion.path}
              title={suggestion.path}
              subtitle={suggestion.preview}
              icon={tintedIcon(iconForSuggestionType(suggestion.type), index)}
              accessories={[{ text: suggestion.type }]}
              detail={
                <PathDetail
                  jsonText={jsonText}
                  path={suggestion.path}
                  output={suggestionResult.output}
                  error={suggestionResult.error}
                  suggestionsCount={suggestions.length}
                />
              }
              actions={
                <PathResultActions
                  path={suggestion.path}
                  output={suggestionResult.output}
                  error={suggestionResult.error}
                  jsonText={jsonText}
                  setJsonText={setJsonText}
                  applyResult={applyResult}
                  copyResult={copyResult}
                  onClose={props.onClose}
                />
              }
            />
          );
        })}
      </List.Section>
    </List>
  );
}

function PathDetail(props: {
  jsonText: string;
  path: string;
  output: string;
  error?: string;
  suggestionsCount: number;
}) {
  return (
    <List.Item.Detail
      markdown={buildPathDetailMarkdown(props)}
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Label
            title="JSONPath"
            text={props.path || "未输入"}
          />
          <List.Item.Detail.Metadata.Label
            title="补全"
            text={`${props.suggestionsCount} 个路径`}
          />
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.Label
            title="提示"
            text="不用输入 $ 前缀"
          />
        </List.Item.Detail.Metadata>
      }
    />
  );
}

function PathResultActions(props: {
  path: string;
  output: string;
  error?: string;
  jsonText: string;
  setJsonText: (text: string) => void;
  applyResult: (path: string, output: string, error?: string) => Promise<void>;
  copyResult: (output: string, error?: string) => Promise<void>;
  onClose: () => void;
}) {
  return (
    <ActionPanel>
      <Action
        title="应用查询结果到主编辑器"
        icon={tintedIcon(Icon.Checkmark, 1)}
        onAction={() =>
          props.applyResult(props.path, props.output, props.error)
        }
        shortcut={{ modifiers: ["cmd"], key: "return" }}
      />
      <Action
        title="复制查询结果"
        icon={tintedIcon(Icon.Clipboard, 0)}
        onAction={() => props.copyResult(props.output, props.error)}
        shortcut={{ modifiers: ["cmd"], key: "c" }}
      />
      <Action.Paste title="粘贴查询结果" content={props.output} />
      <Action.CopyToClipboard title="复制 JSONPath" content={props.path} />
      <Action.Push
        title="预览完整 JSON"
        icon={tintedIcon(Icon.Eye, 2)}
        target={<CodePreview title="完整 JSON" content={props.jsonText} />}
      />
      <Action.Push
        title="预览查询结果"
        icon={tintedIcon(Icon.Eye, 1)}
        target={<CodePreview title="查询结果" content={props.output} />}
      />
      <Action
        title="格式化完整 JSON"
        icon={tintedIcon(Icon.Text, 0)}
        onAction={() =>
          props.setJsonText(formatJsonReference(props.jsonText, 2))
        }
        shortcut={{ modifiers: ["cmd"], key: "f" }}
      />
      <Action
        title="返回工具箱"
        icon={Icon.ArrowLeft}
        onAction={props.onClose}
        shortcut={{ modifiers: ["cmd"], key: "." }}
      />
      {props.error ? (
        <Action.CopyToClipboard title="复制错误信息" content={props.error} />
      ) : null}
    </ActionPanel>
  );
}

function buildPathDetailMarkdown(props: {
  jsonText: string;
  path: string;
  output: string;
  error?: string;
}) {
  const fullJson = formatJsonReference(props.jsonText, 2);

  if (!props.path) {
    return `# JSONPath 查询\n\n输入路径后，左侧会立即显示可选补全。\n\n## 完整 JSON\n\n\`\`\`json\n${escapeCodeFence(addLineNumbers(fullJson))}\n\`\`\``;
  }

  if (props.error) {
    return `# ${props.path}\n\n## 查询错误\n\n\`\`\`text\n${escapeCodeFence(props.error)}\n\`\`\`\n\n## 完整 JSON\n\n\`\`\`json\n${escapeCodeFence(addLineNumbers(fullJson))}\n\`\`\``;
  }

  return `# ${props.path}\n\n## 查询结果\n\n\`\`\`json\n${escapeCodeFence(addLineNumbers(props.output))}\n\`\`\`\n\n## 完整 JSON\n\n\`\`\`json\n${escapeCodeFence(addLineNumbers(fullJson))}\n\`\`\``;
}

function ClipboardHistoryView(props: {
  onSelect: (text: string, offset: number) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<ClipboardHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadHistory() {
      setIsLoading(true);
      setItems(await readJsonClipboardHistory());
      setIsLoading(false);
    }

    loadHistory();
  }, []);

  async function refresh() {
    setIsLoading(true);
    setItems(await readJsonClipboardHistory());
    setIsLoading(false);
    await showToast({
      style: Toast.Style.Success,
      title: "已刷新剪贴板历史",
    });
  }

  return (
    <List
      isLoading={isLoading}
      isShowingDetail
      navigationTitle="JSON 剪贴板历史"
      searchBarPlaceholder="搜索最近 6 条 Raycast 剪贴板 JSON"
    >
      <List.EmptyView
        title="没有找到 JSON"
        description="Raycast API 只能读取最近 6 条剪贴板历史；复制 JSON 后再刷新试试。"
        icon={tintedIcon(Icon.Clock, 1)}
        actions={
          <ActionPanel>
            <Action
              title="刷新"
              icon={Icon.ArrowClockwise}
              onAction={refresh}
            />
            <Action
              title="返回工具箱"
              icon={Icon.ArrowLeft}
              onAction={props.onClose}
            />
          </ActionPanel>
        }
      />
      {items.map((item, index) => (
        <List.Item
          key={`${item.offset}-${item.preview}`}
          title={`历史 #${item.offset}`}
          subtitle={item.preview}
          icon={tintedIcon(Icon.Clipboard, index)}
          accessories={[{ text: item.summary }]}
          detail={
            <List.Item.Detail
              markdown={`# 剪贴板历史 #${item.offset}\n\n\`\`\`json\n${escapeCodeFence(addLineNumbers(formatJsonReference(item.text, 2)))}\n\`\`\``}
              metadata={
                <List.Item.Detail.Metadata>
                  <List.Item.Detail.Metadata.Label
                    title="Offset"
                    text={String(item.offset)}
                  />
                  <List.Item.Detail.Metadata.Label
                    title="摘要"
                    text={item.summary}
                  />
                  <List.Item.Detail.Metadata.Separator />
                  <List.Item.Detail.Metadata.Label
                    title="来源"
                    text="Raycast Clipboard History"
                  />
                </List.Item.Detail.Metadata>
              }
            />
          }
          actions={
            <ActionPanel>
              <Action
                title="使用此 JSON"
                icon={tintedIcon(Icon.Checkmark, index)}
                onAction={() => props.onSelect(item.text, item.offset)}
                shortcut={{ modifiers: ["cmd"], key: "return" }}
              />
              <Action
                title="使用格式化 JSON"
                icon={tintedIcon(Icon.Text, index)}
                onAction={() =>
                  props.onSelect(formatJsonReference(item.text, 2), item.offset)
                }
              />
              <Action.CopyToClipboard
                title="复制此 JSON"
                content={item.text}
                shortcut={{ modifiers: ["cmd"], key: "c" }}
              />
              <Action
                title="刷新"
                icon={Icon.ArrowClockwise}
                onAction={refresh}
                shortcut={{ modifiers: ["cmd"], key: "r" }}
              />
              <Action
                title="返回工具箱"
                icon={Icon.ArrowLeft}
                onAction={props.onClose}
                shortcut={{ modifiers: ["cmd"], key: "." }}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

function CodePreview(props: { title: string; content: string }) {
  return (
    <Detail
      navigationTitle={props.title}
      markdown={`# ${props.title}\n\n\`\`\`json\n${escapeCodeFence(addLineNumbers(props.content || ""))}\n\`\`\``}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard
            title="复制原始内容"
            content={props.content}
            shortcut={{ modifiers: ["cmd"], key: "c" }}
          />
        </ActionPanel>
      }
    />
  );
}

function tintedIcon(icon: Icon, seed: number) {
  return {
    source: icon,
    tintColor: ACCENT_COLORS[seed % ACCENT_COLORS.length],
  };
}

function formatJsonReference(input: string, indent: number): string {
  try {
    return transformJson(input, {
      operation: "format",
      indent,
    }).output;
  } catch {
    return input;
  }
}

async function readJsonClipboardHistory(): Promise<ClipboardHistoryItem[]> {
  const entries = await Promise.all(
    Array.from({ length: 6 }, async (_, offset) => {
      try {
        const text = await Clipboard.readText({ offset });

        if (!text?.trim()) {
          return undefined;
        }

        const formatted = transformJson(text, {
          operation: "format",
          indent: 2,
        });

        return {
          offset,
          text,
          preview: summarizeClipboardText(text),
          summary: formatted.summary,
        };
      } catch {
        return undefined;
      }
    }),
  );

  const seen = new Set<string>();
  return entries.filter((entry): entry is ClipboardHistoryItem => {
    if (!entry) {
      return false;
    }

    const fingerprint = entry.text.trim();

    if (seen.has(fingerprint)) {
      return false;
    }

    seen.add(fingerprint);
    return true;
  });
}

function summarizeClipboardText(text: string): string {
  return text.trim().replace(/\s+/g, " ").slice(0, 120);
}

function addLineNumbers(content: string): string {
  const lines = content.split(/\r\n|\r|\n/);
  const width = String(lines.length).length;

  return lines
    .map((line, index) => `${String(index + 1).padStart(width, " ")} │ ${line}`)
    .join("\n");
}

function escapeCodeFence(text: string): string {
  return text.replace(/```/g, "`\\`\\`");
}

function normalizePathInput(path: string): string {
  return path.trim().replace(/^\$\.?/, "");
}

function filterPathSuggestions(
  suggestions: JsonPathSuggestion[],
  searchText: string,
): JsonPathSuggestion[] {
  if (!searchText) {
    return suggestions;
  }

  const query = searchText.toLowerCase();

  return suggestions.filter((suggestion) => {
    const path = suggestion.path.toLowerCase();
    return path.includes(query) || path.endsWith(`.${query}`);
  });
}

function buildPathResult(input: string, path: string, indent: number) {
  if (!path) {
    return {
      output: "",
      error: "输入字段名或从补全列表选择一个 Path。",
    };
  }

  try {
    const result = transformJson(input, {
      operation: "path",
      path,
      indent,
    });

    return {
      output: result.output,
      error: undefined,
    };
  } catch (error) {
    return {
      output: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function iconForSuggestionType(type: string): Icon {
  if (type.startsWith("object")) {
    return Icon.Box;
  }

  if (type.startsWith("array")) {
    return Icon.List;
  }

  if (type === "string") {
    return Icon.Text;
  }

  if (type === "number") {
    return Icon.Hashtag;
  }

  if (type === "boolean") {
    return Icon.CheckCircle;
  }

  return Icon.Dot;
}
