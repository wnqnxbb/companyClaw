export type ModelInput = "text" | "image";

export type ModelDefinition = {
  provider: string;
  id: string;
  api: string;
  baseUrl?: string;
  apiKey?: string;
  apiKeyEnv?: string;
  contextWindow: number;
  maxTokens: number;
  reasoning: boolean;
  input: ModelInput[];
};

export type RuntimeConfig = {
  clawHomeDir: string;
  sharedAgentSeedDir: string;
  workspaceTemplateDir: string;
  workspaceDir: string;
  stateDir: string;
  agentDir: string;
  sessionsDir: string;
  sessionStorePath: string;
  agentId?: string;
  agentRootDir?: string;
  bootstrapFiles: string[];
  runtime: {
    thinkingLevel: string;
    timeoutMs: number;
    execTimeoutMs: number;
    observability: {
      enabled: boolean;
      console: boolean;
      includePrompts: boolean;
      includeToolArgs: boolean;
      includeToolResults: boolean;
      includeAssistantDeltas: boolean;
      includeLlmRequests: boolean;
    };
  };
  primaryModel: ModelDefinition;
  fallbackModels: ModelDefinition[];
};

export type SessionEntry = {
  sessionId: string;
  updatedAt: number;
  sessionFile: string;
  modelProvider?: string;
  model?: string;
};

export type SessionStore = Record<string, SessionEntry>;

export type ResolvedSession = {
  sessionId: string;
  sessionKey: string;
  sessionFile: string;
  entry: SessionEntry;
  store: SessionStore;
};

export type BootstrapFile = {
  name: string;
  path: string;
  content: string;
};

export type AgentMetadata = {
  name: string;
  agentId: string;
  createdAt: string;
};

export type AgentRunInput = {
  message: string;
  paths?: string[];
  sessionKey?: string;
  sessionId?: string;
  workspaceDir?: string;
  configPath?: string;
  extraSystemPrompt?: string;
};

export type AgentRunEvent =
  | { type: "lifecycle"; phase: "start" | "attempt" | "end" | "error"; detail?: string }
  | { type: "assistant"; text: string }
  | { type: "tool"; name: string; phase: "start" | "end"; detail?: string };

export type AgentRunResult = {
  runId?: string;
  sessionId: string;
  sessionKey: string;
  sessionFile: string;
  logFile?: string;
  text: string;
  model: {
    provider: string;
    model: string;
  };
};

export type RunAgentOptions = {
  config?: RuntimeConfig;
  onEvent?: (event: AgentRunEvent) => void;
  onRecord?: (record: TraceRecord) => void | Promise<void>;
  sdk?: RuntimeSdk;
  traceEnabled?: boolean;
  traceConsole?: boolean;
  runId?: string;
  abortSignal?: AbortSignal;
};

export type TraceRecord = {
  seq: number;
  ts: string;
  runId: string;
  type: string;
} & Record<string, unknown>;

export type ToolResult = {
  content: Array<{ type: string; text?: string }>;
  details?: unknown;
};

export type RuntimeTool = {
  name: string;
  label?: string;
  description?: string;
  parameters?: unknown;
  execute: (
    toolCallId: string,
    args: unknown,
    signal?: AbortSignal,
    onUpdate?: ((update: unknown) => void) | undefined,
  ) => Promise<ToolResult> | ToolResult;
};

export type RuntimeSession = {
  sessionId: string;
  messages: Array<unknown>;
  prompt: (prompt: string, options?: Record<string, unknown>) => Promise<void>;
  dispose?: () => void;
  subscribe?: (listener: (event: unknown) => void) => () => void;
  agent: {
    setSystemPrompt?: (prompt: string) => void;
    replaceMessages?: (messages: Array<unknown>) => void;
    streamFn?: (model: unknown, context: unknown, options?: unknown) => Promise<unknown> | unknown;
  };
};

export type RuntimeSessionManager = {
  getLeafEntry?: () => { type?: string; parentId?: string; message?: { role?: string } } | null;
  branch?: (parentId: string) => void;
  resetLeaf?: () => void;
  buildSessionContext?: () => { messages: Array<unknown> };
};

export type RuntimeSdk = {
  ensureRuntimeState: (config: RuntimeConfig) => Promise<void>;
  createSessionManager: (sessionFile: string) => RuntimeSessionManager;
  createToolDefinitions: (tools: RuntimeTool[]) => unknown[];
  resolveModel: (
    config: RuntimeConfig,
    model: ModelDefinition,
  ) => Promise<{ model: unknown; authStorage: unknown; modelRegistry: unknown }>;
  createSession: (params: {
    workspaceDir: string;
    agentDir: string;
    sessionManager: RuntimeSessionManager;
    authStorage: unknown;
    modelRegistry: unknown;
    model: unknown;
    thinkingLevel: string;
    tools: RuntimeTool[];
    systemPrompt: string;
  }) => Promise<RuntimeSession>;
};
