import OpenAI from 'openai';
import { DiagramPlugin } from './types';
import { ValidationResult } from '../schema';

const plugins = new Map<string, DiagramPlugin>();

let initialized = false;

/** Register a diagram plugin. Must be called before using the registry. */
export function registerPlugin(plugin: DiagramPlugin): void {
  if (plugins.has(plugin.type)) {
    console.warn(`Plugin "${plugin.type}" already registered, overwriting.`);
  }
  plugins.set(plugin.type, plugin);
}

/** Get all registered plugin types */
export function getPluginTypes(): string[] {
  return Array.from(plugins.keys());
}

/** Get a plugin by diagram type */
export function getPlugin(type: string): DiagramPlugin | undefined {
  return plugins.get(type);
}

/** Get all tool definitions for OpenAI function calling */
export function getTools(): OpenAI.ChatCompletionTool[] {
  return Array.from(plugins.values()).map((p) => p.toolDefinition);
}

/** Get all prompt hints concatenated */
export function getPromptHints(): string {
  return Array.from(plugins.values())
    .map((p) => p.promptHint)
    .join('\n\n');
}

/** Compile a diagram schema to Mermaid DSL */
export function compileWithPlugin(type: string, data: unknown): string {
  const plugin = plugins.get(type);
  if (!plugin) throw new Error(`No plugin registered for diagram type: ${type}`);
  return plugin.compiler(data);
}

/** Validate a diagram schema */
export function validateWithPlugin(type: string, data: unknown): ValidationResult {
  const plugin = plugins.get(type);
  if (!plugin) return { valid: false, errors: [`Unknown diagram type: ${type}`] };
  return plugin.validator(data);
}

/** Initialize all built-in plugins. Call once at app startup. */
export async function initPlugins(): Promise<void> {
  if (initialized) return;
  initialized = true;

  // Dynamic imports to avoid circular deps
  const { flowchartPlugin } = await import('./flowchart.plugin');
  const { erPlugin } = await import('./er.plugin');
  const { architecturePlugin } = await import('./architecture.plugin');

  registerPlugin(flowchartPlugin);
  registerPlugin(erPlugin);
  registerPlugin(architecturePlugin);
}
