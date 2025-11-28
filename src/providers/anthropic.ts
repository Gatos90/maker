/**
 * Anthropic Provider
 *
 * Implements the LLM provider interface for Anthropic's Claude API.
 * Supports Claude 3, Claude 3.5, and Claude 4 models.
 */

import type { CompletionRequest, CompletionResponse } from '../types';
import { BaseProvider } from './base';
import type Anthropic from '@anthropic-ai/sdk';

/**
 * Anthropic Provider class
 *
 * Uses the Anthropic SDK to make API calls.
 * Requires the '@anthropic-ai/sdk' package to be installed as a peer dependency.
 */
export class AnthropicProvider extends BaseProvider {
  private client: Anthropic | null = null;

  constructor(apiKey: string, model = 'claude-sonnet-4-20250514', baseUrl?: string) {
    super(apiKey, model, baseUrl);
    this.initClient();
  }

  /**
   * Initialize the Anthropic client
   */
  private initClient(): void {
    try {
      // Dynamic import to handle peer dependency
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const AnthropicConstructor = require('@anthropic-ai/sdk').default as new (config: {
        apiKey: string;
        baseURL?: string;
      }) => Anthropic;

      this.client = new AnthropicConstructor({
        apiKey: this.apiKey,
        baseURL: this.baseUrl,
      });
    } catch {
      throw new Error(
        'Anthropic SDK not found. Please install it: npm install @anthropic-ai/sdk'
      );
    }
  }

  /**
   * Complete a chat request using Anthropic
   */
  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    if (!this.client) {
      throw new Error('Anthropic client not initialized');
    }

    // Convert messages to Anthropic format
    // Anthropic doesn't have a system role in messages, it uses a separate system parameter
    let systemMessage: string | undefined;
    const messages: Anthropic.MessageCreateParamsNonStreaming['messages'] = [];

    for (const msg of request.messages) {
      if (msg.role === 'system') {
        systemMessage = msg.content;
      } else {
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      }
    }

    // Add JSON instruction to system message if JSON format is requested
    if (request.responseFormat?.type === 'json_object') {
      const jsonInstruction = '\n\nYou must respond with valid JSON only. No other text.';
      systemMessage = systemMessage
        ? systemMessage + jsonInstruction
        : 'You are a helpful assistant.' + jsonInstruction;
    }

    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: this.model,
      messages,
      max_tokens: request.maxTokens ?? 1024,
    };

    // Add optional parameters
    if (request.temperature !== undefined) {
      params.temperature = request.temperature;
    }

    if (systemMessage) {
      params.system = systemMessage;
    }

    const response = await this.client.messages.create(params);

    // Extract text content
    const textContent = response.content.find((c) => c.type === 'text');
    const content = textContent && 'text' in textContent ? textContent.text : '';

    // Parse JSON if requested
    let parsedContent: string | Record<string, unknown> = content;
    if (request.responseFormat?.type === 'json_object') {
      const extracted = this.extractJSON(content);
      const parsed = this.parseJSON<Record<string, unknown>>(extracted);
      if (parsed !== null) {
        parsedContent = parsed;
      }
    }

    return {
      content: parsedContent,
      raw: content,
      usage: response.usage
        ? {
            promptTokens: response.usage.input_tokens,
            completionTokens: response.usage.output_tokens,
            totalTokens: response.usage.input_tokens + response.usage.output_tokens,
          }
        : undefined,
    };
  }
}

/**
 * Create an Anthropic provider instance
 */
export function createAnthropicProvider(
  apiKey: string,
  model = 'claude-sonnet-4-20250514',
  baseUrl?: string
): AnthropicProvider {
  return new AnthropicProvider(apiKey, model, baseUrl);
}
