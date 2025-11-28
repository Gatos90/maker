/**
 * MAKER Framework Types
 *
 * Types for implementing the MAKER framework:
 * - Maximal Agentic Decomposition (MAD)
 * - First-to-ahead-by-K voting
 * - Red-flagging
 */

// ============================================
// Configuration Types
// ============================================

/**
 * Azure OpenAI specific configuration
 */
export interface AzureConfig {
  /** Azure resource endpoint (e.g., https://your-resource.openai.azure.com/) */
  endpoint: string;
  /** API version (e.g., 2024-02-15-preview) */
  apiVersion: string;
  /** Optional deployment name */
  deployment?: string;
}

/**
 * Main configuration for the Maker instance
 */
export interface MakerConfig {
  /** LLM provider to use */
  provider: 'openai' | 'anthropic' | 'azure' | LLMProvider;
  /** API key for the provider */
  apiKey: string;
  /** Model to use (e.g., 'gpt-4.1-mini', 'claude-sonnet-4-20250514') */
  model: string;
  /** Optional base URL for the provider API */
  baseUrl?: string;

  /** Azure-specific configuration (required when provider is 'azure') */
  azure?: AzureConfig;

  /** Decomposition configuration */
  decomposition?: DecompositionConfig;
  /** Voting configuration */
  voting?: VotingConfig;
  /** Red-flag filter configuration */
  redFlags?: RedFlagConfig;
  /** Synthesis configuration */
  synthesis?: SynthesisConfig;
}

/**
 * Configuration for question decomposition (MAD)
 */
export interface DecompositionConfig {
  /** Whether decomposition is enabled (default: true) */
  enabled?: boolean;
  /** Maximum number of sub-questions (default: 8) */
  maxSubQuestions?: number;
  /** Classifier mode or custom function */
  classifier?: 'auto' | ClassifierFunction;
  /** Custom decomposition prompt */
  prompt?: string;
}

/**
 * Configuration for voting consensus
 *
 * Based on MAKER paper Algorithm 2 (do_voting):
 * Continues sampling until one answer is K votes ahead of all others.
 */
export interface VotingConfig {
  /** First-to-ahead-by-K value (default: 2) */
  k?: number;
  /** Maximum votes before giving up - safety limit (default: 100) */
  maxVotes?: number;
  /** Timeout per vote in ms */
  timeout?: number;
  /**
   * @deprecated Not in MAKER paper. Voting continues until consensus.
   * Use maxVotes for safety limit instead.
   */
  samples?: number;
  /**
   * @deprecated Not in MAKER paper. Temperature is determined automatically:
   * first vote at 0, subsequent votes at 0.1.
   */
  temperatures?: number[];
  /**
   * @deprecated Not in MAKER paper. Voting continues until consensus.
   * Use maxVotes for safety limit instead.
   */
  maxRounds?: number;
}

/**
 * Configuration for red-flag filtering
 *
 * Based on MAKER paper Section 3.3:
 * Two red flags: (1) response too long, (2) invalid format (parse failure)
 */
export interface RedFlagConfig {
  /** Maximum tokens before flagging as too long (default: 750, per paper Section 4.4) */
  maxTokens?: number;
  /** Minimum characters before flagging as too short (default: 5) */
  minChars?: number;
  /** Custom validator function for additional checks */
  customValidator?: (answer: string) => RedFlagResult;
  /**
   * @deprecated Not in MAKER paper. Confusion patterns are not used.
   * The paper only flags: (1) too long responses, (2) parse failures.
   */
  patterns?: RegExp[];
  /**
   * @deprecated Not in MAKER paper. Format validation is based on parse success,
   * not sentence formatting (capital letters, punctuation).
   */
  formatValidation?: boolean;
  /**
   * @deprecated Use maxTokens instead. The paper uses token count (750 default).
   */
  maxChars?: number;
}

/**
 * Configuration for answer synthesis
 */
export interface SynthesisConfig {
  /** Whether synthesis is enabled for decomposed questions (default: true) */
  enabled?: boolean;
  /** Language for the response (default: 'en') */
  language?: string;
  /** Custom synthesis prompt */
  prompt?: string;
}

// ============================================
// Result Types
// ============================================

/**
 * Final result from maker.ask()
 */
export interface MakerResult {
  /** The final synthesized answer */
  answer: string;
  /** Overall confidence level */
  confidence: ConfidenceLevel;
  /** Whether all sub-questions reached consensus */
  consensusReached: boolean;

  /** Whether the question was decomposed */
  isDecomposed: boolean;
  /** Results for each sub-question (if decomposed) */
  subQuestions?: SubQuestionResult[];
  /** Strategy used for synthesis */
  synthesisStrategy?: string;

  /** Aggregated voting statistics */
  votingStats: VotingStats;

  /** Total tokens used (estimated) */
  totalTokens: number;
  /** Total execution time in ms */
  executionTimeMs: number;
}

/**
 * Result for a single sub-question
 */
export interface SubQuestionResult {
  /** The sub-question text */
  question: string;
  /** The winning answer */
  answer: string;
  /** Confidence level for this answer */
  confidence: ConfidenceLevel;
  /** Whether consensus was reached */
  consensusReached: boolean;
  /** Voting statistics for this sub-question */
  votingStats: VotingStats;
}

/**
 * Statistics from the voting process
 */
export interface VotingStats {
  /** Total number of votes cast */
  totalVotes: number;
  /** Number of valid (non-red-flagged) votes */
  validVotes: number;
  /** Number of red-flagged votes */
  redFlaggedVotes: number;
  /** Vote count for the winning answer */
  winningVoteCount: number;
  /** Margin between winner and runner-up */
  margin: number;
  /** The k value used for consensus */
  k: number;
}

/**
 * Result of red-flag check
 */
export interface RedFlagResult {
  /** Whether the response was red-flagged */
  redFlagged: boolean;
  /** Reason for red-flagging (if applicable) */
  reason?: RedFlagReason;
}

// ============================================
// Internal Types
// ============================================

/**
 * A sub-question from decomposition
 */
export interface SubQuestion {
  /** Unique identifier */
  id: string;
  /** The sub-question text */
  question: string;
  /** IDs of sub-questions this depends on */
  dependencies: string[];
  /** Type of question */
  type: QuestionType;
  /** Index in the sequence */
  index?: number;
}

/**
 * A single vote (LLM response sample)
 */
export interface Vote {
  /** Index of this vote sample */
  voteIndex: number;
  /** The answer text */
  answer: string;
  /** Confidence from the LLM */
  confidence: ConfidenceLevel;
  /** Optional reasoning */
  reasoning?: string;
  /** Temperature used for this vote */
  temperature: number;
  /** Whether the response was successfully parsed (for format validation) */
  parseSucceeded?: boolean;
  /** Whether this vote was red-flagged */
  redFlagged?: boolean;
  /** Red-flag reason (if flagged) */
  redFlagReason?: RedFlagReason;
}

/**
 * Result from voting engine
 */
export interface VotingResult {
  /** Whether consensus was reached */
  consensusReached: boolean;
  /** The winning answer (null if no consensus) */
  winner: string | null;
  /** Confidence of the winner */
  confidence?: ConfidenceLevel;
  /** Voting statistics */
  stats: VotingStats;
}

/**
 * Classification result for a question
 */
export interface Classification {
  /** Whether the question needs decomposition */
  needsDecomposition: boolean;
  /** Complexity score (1-10) */
  complexity: number;
  /** Type of question */
  questionType: QuestionType;
  /** Reasoning for the classification */
  reasoning?: string;
}

// ============================================
// Provider Types
// ============================================

/**
 * LLM Provider interface
 */
export interface LLMProvider {
  /** Complete a chat request */
  complete(request: CompletionRequest): Promise<CompletionResponse>;
}

/**
 * Request to LLM provider
 */
export interface CompletionRequest {
  /** Messages to send */
  messages: Message[];
  /** Temperature for generation */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Response format specification */
  responseFormat?: ResponseFormat;
}

/**
 * Response from LLM provider
 */
export interface CompletionResponse {
  /** Parsed content - string for text responses, object for JSON responses */
  content: string | Record<string, unknown>;
  /** Raw text response */
  raw: string;
  /** Token usage (if available) */
  usage?: TokenUsage;
}

/**
 * Chat message
 */
export interface Message {
  /** Role of the message sender */
  role: 'system' | 'user' | 'assistant';
  /** Content of the message */
  content: string;
}

/**
 * Response format specification
 */
export interface ResponseFormat {
  /** Type of response format */
  type: 'text' | 'json_object';
  /** JSON schema (for structured outputs) */
  schema?: Record<string, unknown>;
}

/**
 * Token usage statistics
 */
export interface TokenUsage {
  /** Tokens in the prompt */
  promptTokens: number;
  /** Tokens in the completion */
  completionTokens: number;
  /** Total tokens used */
  totalTokens: number;
}

// ============================================
// Function Types
// ============================================

/**
 * Custom classifier function type
 */
export type ClassifierFunction = (
  question: string,
  context?: string
) => Promise<Classification>;

/**
 * Options for the ask() method
 */
export interface AskOptions {
  /** Context or knowledge base to use */
  context?: string;
  /** Override voting k for this question */
  k?: number;
  /** Override sample count for this question */
  samples?: number;
}

// ============================================
// Enum-like Types
// ============================================

/**
 * Confidence levels
 */
export type ConfidenceLevel = 'high' | 'medium' | 'low';

/**
 * Question types for classification
 */
export type QuestionType =
  | 'factual'      // Simple fact lookup
  | 'comparative'  // Comparing multiple items
  | 'multi-hop'    // Requires multiple reasoning steps
  | 'aggregative'  // Requires aggregating multiple facts
  | 'procedural'   // Step-by-step procedure
  | 'analytical';  // Analysis/reasoning

/**
 * Reasons for red-flagging
 */
export type RedFlagReason =
  | 'response_too_long'
  | 'response_too_short'
  | 'circular_reasoning'
  | 'invalid_format'
  | 'low_confidence_error'
  | 'custom';

// ============================================
// Event Types
// ============================================

/**
 * Events emitted by Maker
 */
export interface MakerEvents {
  /** Emitted after question classification */
  classificationComplete: Classification;
  /** Emitted after question decomposition */
  decomposed: SubQuestion[];
  /** Emitted when voting starts for a sub-question */
  votingStart: { subQuestionIndex: number; question: string };
  /** Emitted on each vote during continuous voting (Algorithm 2) */
  voteProgress: {
    subQuestionIndex: number;
    voteIndex: number;
    voteCounts: Record<string, number>;
    redFlagged: boolean;
  };
  /** Emitted after each vote is collected @deprecated Use voteProgress instead */
  voteCollected: { subQuestionIndex: number; voteIndex: number; redFlagged: boolean };
  /** Emitted when voting completes for a sub-question */
  votingComplete: { subQuestionIndex: number; consensusReached: boolean; answer: string };
  /** Emitted when a vote is red-flagged */
  redFlagged: { answer: string; reason: RedFlagReason };
  /** Emitted when a sub-question is resolved */
  subQuestionResolved: { index: number; result: SubQuestionResult };
  /** Emitted before synthesis starts */
  synthesisStart: { subAnswers: SubQuestionResult[] };
  /** Emitted after synthesis completes */
  synthesisComplete: { answer: string };
  /** Emitted when processing is complete */
  complete: MakerResult;
}
