import OpenAI from 'openai';
import { ZodSchema } from 'zod';
import { ValidationResult } from '../schema';

export interface DiagramPlugin<T = any> {
  /** Diagram type value matching diagramType field */
  type: string;
  /** OpenAI function tool definition for generate_xxx */
  toolDefinition: OpenAI.ChatCompletionTool;
  /** Zod schema for this diagram type's data */
  schema: ZodSchema<T>;
  /** Compile parsed data to Mermaid DSL */
  compiler: (data: T) => string;
  /** Validate parsed data (beyond Zod schema) */
  validator: (data: T) => ValidationResult;
  /** Injected into system prompt to describe this diagram type */
  promptHint: string;
}
