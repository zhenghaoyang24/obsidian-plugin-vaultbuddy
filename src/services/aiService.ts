import { requestUrl, RequestUrlResponse } from "obsidian";
import { ModelConfig, ChatMessage, AIResponse } from "../core/types";

interface OpenAIResponse {
  choices: { message: { content: string } }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface StreamDelta {
  choices?: { delta?: { content?: string } }[];
}

/**
 * AI 服务模块
 * 封装 API 调用逻辑
 */
export class AIService {
  /**
   * 发送聊天请求
   */
  static async chat(
    model: ModelConfig,
    messages: ChatMessage[],
    maxTokens: number,
  ): Promise<AIResponse> {
    const requestBody = {
      model: model.modelId,
      messages: messages,
      max_tokens: maxTokens,
      temperature: 0.7,
    };

    try {
      const response: RequestUrlResponse = await requestUrl({
        url: model.baseUrl,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${model.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      const data = response.json as OpenAIResponse;

      return {
        content: data.choices[0].message.content,
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens,
              completionTokens: data.usage.completion_tokens,
              totalTokens: data.usage.total_tokens,
            }
          : undefined,
      };
    } catch (error: unknown) {
      console.error("AI API 调用失败:", error);
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`API 调用失败: ${msg}`);
    }
  }

  /**
   * 流式响应（用于实时输出）
   * @param signal AbortSignal 用于中止请求
   */
  static async *chatStream(
    model: ModelConfig,
    messages: ChatMessage[],
    maxTokens: number,
    signal?: AbortSignal,
    temperature: number = 0.7,
  ): AsyncGenerator<string> {
    const requestBody = {
      model: model.modelId,
      messages: messages,
      max_tokens: maxTokens,
      temperature: temperature,
      stream: true,
    };

    // Using fetch instead of requestUrl: requestUrl does not support streaming (ReadableStream / AbortSignal)
    const response = await fetch(model.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${model.apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal,
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error("无法获取响应流");
    }

    while (true) {
      // 检查是否被中止
      if (signal?.aborted) {
        reader.cancel();
        throw new DOMException("Aborted", "AbortError");
      }

      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n").filter((line) => line.trim() !== "");

      for (const line of lines) {
        const trimmedLine = line.replace(/^data: /, "");
        if (trimmedLine === "[DONE]") return;

        try {
          const parsed = JSON.parse(trimmedLine) as StreamDelta;
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            yield content;
          }
        } catch (_) {
          // 忽略解析错误
        }
      }
    }
  }

  /**
   * 测试 API 连接
   */
  static async testConnection(model: ModelConfig): Promise<boolean> {
    try {
      const testMessages: ChatMessage[] = [{ role: "user", content: "Hi" }];
      await this.chat(model, testMessages, 10);
      return true;
    } catch (error) {
      console.error("API 连接测试失败:", error);
      return false;
    }
  }
}
