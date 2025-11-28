/**
 * @maker-framework/core
 *
 * MAKER Framework for reliable multi-step LLM reasoning.
 *
 * Implements:
 * - Maximal Agentic Decomposition (MAD)
 * - First-to-ahead-by-K voting
 * - Red-flagging
 *
 * @packageDocumentation
 */

// Main class
export { Maker } from './maker';

// Core components
export { Decomposer } from './core/decomposer';
export { VotingEngine } from './core/voting';
export { RedFlagFilter, DEFAULT_CONFUSION_PATTERNS } from './core/red-flag-filter';
export { Synthesizer } from './core/synthesizer';

// Providers
export { BaseProvider } from './providers/base';
export { OpenAIProvider, createOpenAIProvider } from './providers/openai';
export { AnthropicProvider, createAnthropicProvider } from './providers/anthropic';
export {
  AzureOpenAIProvider,
  createAzureOpenAIProvider,
  type AzureOpenAIConfig,
} from './providers/azure-openai';

// Prompts
export {
  PROMPTS,
  parseClassification,
  parseDecomposition,
  parseSynthesis,
} from './prompts';

// Types
export type {
  // Configuration
  MakerConfig,
  AzureConfig,
  DecompositionConfig,
  VotingConfig,
  RedFlagConfig,
  SynthesisConfig,

  // Results
  MakerResult,
  SubQuestionResult,
  VotingStats,
  VotingResult,
  RedFlagResult,

  // Internal types
  SubQuestion,
  Vote,
  Classification,

  // Provider types
  LLMProvider,
  CompletionRequest,
  CompletionResponse,
  Message,
  ResponseFormat,
  TokenUsage,

  // Function types
  ClassifierFunction,
  AskOptions,

  // Enum types
  ConfidenceLevel,
  QuestionType,
  RedFlagReason,

  // Event types
  MakerEvents,
} from './types';
