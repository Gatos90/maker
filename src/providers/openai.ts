/**
 * OpenAI Provider
 *
 * Implements the LLM provider interface for OpenAI's API.
 * Supports GPT-4, GPT-4.1, and other OpenAI models.
 */

import type { CompletionRequest, CompletionResponse } from '../types';
import { BaseProvider } from './base';
import type OpenAI from 'openai';

/**
 * OpenAI Provider class
 *
 * Uses the OpenAI SDK to make API calls.
 * Requires the 'openai' package to be installed as a peer dependency.
 */
export class OpenAIProvider extends BaseProvider {
  private client: OpenAI | null = null;

  constructor(apiKey: string, model = 'gpt-4.1-mini', baseUrl?: string) {
    super(apiKey, model, baseUrl);
    this.initClient();
  }

  /**
   * Initialize the OpenAI client
   */
  private initClient(): void {
    try {
      // Dynamic import to handle peer dependency
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const OpenAIConstructor = require('openai').default as new (config: {
        apiKey: string;
        baseURL?: string;
      }) => OpenAI;
      this.client = new OpenAIConstructor({
        apiKey: this.apiKey,
        baseURL: this.baseUrl,
      });
    } catch {
      throw new Error(
        'OpenAI SDK not found. Please install it: npm install openai'
      );
    }
  }

  /**
   * Complete a chat request using OpenAI
   */
  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
      request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

    const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming =
      {
        model: this.model,
        messages,
        temperature: request.temperature ?? 0.1,
        max_tokens: request.maxTokens ?? 1024,
      };

    // Add response format if JSON is requested
    if (request.responseFormat?.type === 'json_object') {
      params.response_format = { type: 'json_object' };
    }

    const response = await this.client.chat.completions.create(params);

    const content = response.choices[0]?.message?.content ?? '';

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
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined,
    };
  }
}

/**
 * Create an OpenAI provider instance
 */
export function createOpenAIProvider(
  apiKey: string,
  model = 'gpt-4.1-mini',
  baseUrl?: string
): OpenAIProvider {
  return new OpenAIProvider(apiKey, model, baseUrl);
}
