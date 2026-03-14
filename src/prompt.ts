import path from "node:path";
import { readTextIfExists } from "./fs-utils.js";
import type { BootstrapFile, RuntimeConfig, RuntimeTool } from "./types.js";

const MAX_BOOTSTRAP_FILE_BYTES = 64 * 1024;
const FILE_ROLE_HINTS: Record<string, string> = {
  "AGENTS.md": "运行规则与工作方式",
  "SOUL.md": "价值观、气质和行为边界",
  "USER.md": "服务对象与偏好",
  "IDENTITY.md": "代理身份与对外风格",
  "TOOLS.md": "本地环境、工具和模型端点备忘",
  "BOOTSTRAP.md": "首次初始化说明",
  "HEARTBEAT.md": "运行节奏与近期状态",
  "MEMORY.md": "长期记忆与稳定事实",
};

export async function loadBootstrapFiles(config: RuntimeConfig): Promise<BootstrapFile[]> {
  const results: BootstrapFile[] = [];
  for (const fileName of config.bootstrapFiles) {
    const absolutePath = path.join(config.workspaceDir, fileName);
    const content = await readTextIfExists(absolutePath);
    if (!content) {
      continue;
    }
    const trimmed = content.slice(0, MAX_BOOTSTRAP_FILE_BYTES).trim();
    if (!trimmed) {
      continue;
    }
    results.push({
      name: fileName,
      path: absolutePath,
      content: trimmed,
    });
  }
  return results;
}

export async function buildSystemPrompt(params: {
  config: RuntimeConfig;
  tools: RuntimeTool[];
  extraSystemPrompt?: string;
}): Promise<string> {
  const bootstrapFiles = await loadBootstrapFiles(params.config);
  const sections: string[] = [
    "You are companyClaw, a pragmatic local general-purpose agent.",
    "Your default role is to help with research, planning, writing, organization, operations, and coding when needed.",
    "Treat coding as one capability among many, not the default objective.",
    "Prefer direct, useful answers over performative assistant language.",
    "Use tools only when they materially help.",
    `Workspace root: ${params.config.workspaceDir}`,
    `Current date: ${new Date().toISOString()}`,
    "",
    "Available tools:",
    ...params.tools.map((tool) => `- ${tool.name}: ${tool.description ?? tool.label ?? tool.name}`),
  ];

  if (bootstrapFiles.length > 0) {
    sections.push("", "Workspace guidance files:");
    for (const file of bootstrapFiles) {
      const roleHint = FILE_ROLE_HINTS[file.name] ? ` - ${FILE_ROLE_HINTS[file.name]}` : "";
      sections.push(`\n### ${file.name}${roleHint}\n${file.content}`);
    }
  }

  if (params.extraSystemPrompt?.trim()) {
    sections.push("", "Extra runtime instructions:", params.extraSystemPrompt.trim());
  }

  return sections.join("\n").trim();
}
