/**
 * Base Provider Interface
 *
 * Defines the contract that all LLM providers must implement.
 */

import type {
  LLMProvider,
  CompletionRequest,
  CompletionResponse,
  Message,
  TokenUsage,
} from '../types';

export type { LLMProvider, CompletionRequest, CompletionResponse, Message, TokenUsage };

/**
 * Base class for LLM providers with common functionality
 */
export abstract class BaseProvider implements LLMProvider {
  protected apiKey: string;
  protected model: string;
  protected baseUrl?: string;

  constructor(apiKey: string, model: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = baseUrl;
  }

  /**
   * Complete a chat request
   */
  abstract complete(request: CompletionRequest): Promise<CompletionResponse>;

  /**
   * Parse JSON response safely
   */
  protected parseJSON<T>(text: string): T | null {
    try {
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  }

  /**
   * Extract JSON from a response that might contain markdown code blocks
   */
  protected extractJSON(text: string): string {
    // Try to extract JSON from markdown code blocks
    const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonBlockMatch) {
      return jsonBlockMatch[1].trim();
    }

    // Try to find JSON object or array directly
    const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      return jsonMatch[1];
    }

    return text;
  }

  /**
   * Get default temperature based on index for voting
   */
  protected getDefaultTemperatures(samples: number): number[] {
    if (samples <= 0) return [];
    if (samples === 1) return [0];

    // First sample at temperature 0, rest at 0.1
    return [0, ...Array(samples - 1).fill(0.1)];
  }
}

/**
 * Factory function type for creating providers
 */
export type ProviderFactory = (
  apiKey: string,
  model: string,
  baseUrl?: string
) => LLMProvider;
