import type { ToolDefinition } from "./types";

/**
 * Canonical tool definitions for Wren's agentic mode.
 * Providers map these to their native format (Anthropic tool_use,
 * OpenAI function_calling, Gemini function_declarations).
 */
export const WREN_TOOLS: ToolDefinition[] = [
  {
    name: "read_file",
    description:
      "Read the contents of a file at the given path. Use this to inspect source files, configuration files, or any text file in the project.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute or project-relative path to the file to read",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description:
      "Write content to a file. Creates the file if it does not exist; overwrites it if it does. The parent directory must exist.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute or project-relative path of the file to write",
        },
        content: {
          type: "string",
          description: "UTF-8 string content to write to the file",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "delete_file",
    description: "Delete a file at the given path. Cannot delete directories.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute or project-relative path of the file to delete",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "list_directory",
    description:
      "List the files and subdirectories inside a directory. Returns names, paths, and whether each entry is a directory.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute or project-relative path of the directory to list",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "run_command",
    description:
      "Run a shell command in the project root (or a given working directory) and return stdout, stderr, and exit code. Use this for build commands, tests, linting, etc. Avoid interactive commands.",
    inputSchema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The shell command to run (passed to /bin/sh -c)",
        },
        cwd: {
          type: "string",
          description:
            "Working directory for the command. Defaults to the project root if omitted.",
        },
      },
      required: ["command"],
    },
  },
];

// ── Provider format converters ─────────────────────────────────────────────────

/** Convert WREN_TOOLS to Anthropic tool_use format */
export function toAnthropicTools(
  tools: ToolDefinition[]
): Array<{ name: string; description: string; input_schema: Record<string, unknown> }> {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));
}

/** Convert WREN_TOOLS to OpenAI function_calling format */
export function toOpenAiTools(
  tools: ToolDefinition[]
): Array<{ type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }> {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));
}

/** Convert WREN_TOOLS to Gemini function_declarations format */
export function toGeminiTools(
  tools: ToolDefinition[]
): Array<{ name: string; description: string; parameters: Record<string, unknown> }> {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.inputSchema,
  }));
}
