import { tavily } from "@tavily/core";
import type { TavilySearchAPIResponse } from "../../types";

export class TavilyAPI {
  private client: any; // We'll use any here since Tavily doesn't provide TypeScript types

  constructor() {
    if (!process.env.TAVILY_API_KEY) {
      throw new Error("TAVILY_API_KEY is required");
    }
    this.client = tavily({ apiKey: process.env.TAVILY_API_KEY });
  }

  async search(query: string): Promise<TavilySearchAPIResponse> {
    try {
      const response = await this.client.search(query, {
        searchDepth: "advanced",
        includeAnswer: true,
        maxResults: 5,
      });

      return response;
    } catch (error) {
      console.error("Tavily search failed:", error);
      throw error;
    }
  }
}
