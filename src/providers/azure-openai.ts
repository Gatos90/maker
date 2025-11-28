/**
 * Azure OpenAI Provider
 *
 * Implements the LLM provider interface for Azure OpenAI Service.
 * Uses the AzureOpenAI client from the openai package.
 */

import type { CompletionRequest, CompletionResponse } from '../types';
import { BaseProvider } from './base';
import type { AzureOpenAI } from 'openai';

/**
 * Configuration for Azure OpenAI provider
 */
export interface AzureOpenAIConfig {
  /** Azure API key */
  apiKey: string;
  /** Azure resource endpoint (e.g., https://your-resource.openai.azure.com/) */
  endpoint: string;
  /** API version (e.g., 2024-02-15-preview) */
  apiVersion: string;
  /** Optional deployment name */
  deployment?: string;
}

/**
 * Azure OpenAI Provider class
 *
 * Uses the AzureOpenAI SDK to make API calls.
 * Requires the 'openai' package to be installed as a peer dependency.
 */
export class AzureOpenAIProvider extends BaseProvider {
  private client: AzureOpenAI | null = null;
  private readonly endpoint: string;
  private readonly apiVersion: string;
  private readonly deployment?: string;

  constructor(config: AzureOpenAIConfig, model: string) {
    super(config.apiKey, model);
    this.endpoint = config.endpoint;
    this.apiVersion = config.apiVersion;
    this.deployment = config.deployment;
    this.initClient();
  }

  /**
   * Initialize the Azure OpenAI client
   */
  private initClient(): void {
    try {
      // Dynamic import to handle peer dependency
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { AzureOpenAI: AzureOpenAIConstructor } = require('openai') as {
        AzureOpenAI: new (config: {
          apiKey: string;
          endpoint: string;
          apiVersion: string;
          deployment?: string;
        }) => AzureOpenAI;
      };

      this.client = new AzureOpenAIConstructor({
        apiKey: this.apiKey,
        endpoint: this.endpoint,
        apiVersion: this.apiVersion,
        deployment: this.deployment,
      });
    } catch {
      throw new Error(
        'OpenAI SDK not found. Please install it: npm install openai'
      );
    }
  }

  /**
   * Complete a chat request using Azure OpenAI
   */
  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    if (!this.client) {
      throw new Error('Azure OpenAI client not initialized');
    }

    // Azure OpenAI uses the same types as OpenAI
    const messages = request.messages.map((m) => ({
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content,
    }));

    const params: {
      model: string;
      messages: typeof messages;
      temperature?: number;
      max_tokens?: number;
      response_format?: { type: 'json_object' };
    } = {
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
 * Create an Azure OpenAI provider instance
 */
export function createAzureOpenAIProvider(
  config: AzureOpenAIConfig,
  model: string
): AzureOpenAIProvider {
  return new AzureOpenAIProvider(config, model);
}
