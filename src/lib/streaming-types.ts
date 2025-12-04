/**
 * Type definitions for streaming server action responses
 */

export type StreamUpdate =
    | { type: "status"; message: string; progress: number }
    | { type: "content"; text: string; append: boolean }
    | { type: "files"; files: string[] }
    | { type: "complete"; relevantFiles: string[] }
    | { type: "error"; message: string };

export interface StreamingMessage {
    id: string;
    role: "user" | "model";
    content: string;
    relevantFiles?: string[];
}

export interface StreamingState {
    status: string;
    progress: number;
    isStreaming: boolean;
}
