/**
 * Configuration Management
 *
 * Handles loading, validation, and hot-reload of the config file.
 *
 * @packageDocumentation
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { z } from 'zod';
import type { TaskType } from './types.js';

/**
 * Strategy configuration for a task type
 */
const StrategySchema = z.object({
  model: z.string(),
  minConfidence: z.number().min(0).max(1).optional(),
  fallback: z.string().optional(),
});

/**
 * Auth configuration for hybrid API key / MAX token support
 */
const AuthSchema = z.object({
  anthropicApiKey: z.string().optional(),
  anthropicMaxToken: z.string().optional(),
  useMaxForModels: z.array(z.string()).optional(), // Default: ['opus']
}).optional();

/**
 * Full config schema
 */
const ConfigSchema = z.object({
  strategies: z.record(z.string(), StrategySchema).optional(),
  defaults: z.object({
    qualityModel: z.string().optional(),
    costModel: z.string().optional(),
  }).optional(),
  auth: AuthSchema,
});

export type StrategyConfig = z.infer<typeof StrategySchema>;
export type Config = z.infer<typeof ConfigSchema>;

/**
 * Default configuration
 */
export const DEFAULT_CONFIG: Config = {
  strategies: {
    code_review: { model: 'anthropic:claude-sonnet-4-20250514' },
    code_generation: { model: 'anthropic:claude-3-5-haiku-latest' },
    analysis: { model: 'anthropic:claude-sonnet-4-20250514' },
    summarization: { model: 'anthropic:claude-3-5-haiku-latest' },
    creative_writing: { model: 'anthropic:claude-sonnet-4-20250514' },
    data_extraction: { model: 'anthropic:claude-3-5-haiku-latest' },
    translation: { model: 'anthropic:claude-3-5-haiku-latest' },
    question_answering: { model: 'anthropic:claude-3-5-haiku-latest' },
    general: { model: 'anthropic:claude-3-5-haiku-latest' },
  },
  defaults: {
    qualityModel: 'claude-sonnet-4-20250514',
    costModel: 'claude-3-5-haiku-latest',
  },
};

/**
 * Get config file path
 */
export function getConfigPath(): string {
  return path.join(os.homedir(), '.relayplane', 'config.json');
}

/**
 * Write default config file
 */
export function writeDefaultConfig(): void {
  const configPath = getConfigPath();
  const dir = path.dirname(configPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(
      configPath,
      JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n',
      'utf-8'
    );
    console.log(`[relayplane] Created default config at ${configPath}`);
  }
}

/**
 * Load and validate config
 */
export function loadConfig(): Config {
  const configPath = getConfigPath();

  // Create default if doesn't exist
  writeDefaultConfig();

  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    const validated = ConfigSchema.parse(parsed);
    return validated;
  } catch (err) {
    if (err instanceof z.ZodError) {
      console.error(`[relayplane] Invalid config: ${err.message}`);
    } else if (err instanceof SyntaxError) {
      console.error(`[relayplane] Config JSON parse error: ${err.message}`);
    } else {
      console.error(`[relayplane] Failed to load config: ${err}`);
    }
    console.log('[relayplane] Using default config');
    return DEFAULT_CONFIG;
  }
}

/**
 * Get strategy for a task type from config
 */
export function getStrategy(config: Config, taskType: TaskType): StrategyConfig | null {
  return config.strategies?.[taskType] ?? null;
}

/**
 * Determine which Anthropic auth to use based on model
 * Returns: { type: 'apiKey' | 'max', value: string } or null if no auth configured
 */
export function getAnthropicAuth(
  config: Config,
  model: string
): { type: 'apiKey' | 'max'; value: string } | null {
  const auth = config.auth;
  
  // Check if this model should use MAX
  const useMaxForModels = auth?.useMaxForModels ?? ['opus'];
  const shouldUseMax = useMaxForModels.some(m => model.toLowerCase().includes(m.toLowerCase()));
  
  // If MAX token configured and model matches, use MAX
  if (shouldUseMax && auth?.anthropicMaxToken) {
    return { type: 'max', value: auth.anthropicMaxToken };
  }
  
  // Otherwise use API key from config or env
  const apiKey = auth?.anthropicApiKey ?? process.env['ANTHROPIC_API_KEY'];
  if (apiKey) {
    return { type: 'apiKey', value: apiKey };
  }
  
  return null;
}

/**
 * Watch config file for changes
 */
export function watchConfig(onChange: (config: Config) => void): void {
  const configPath = getConfigPath();
  const dir = path.dirname(configPath);

  // Ensure directory exists
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let debounceTimer: NodeJS.Timeout | null = null;

  fs.watch(dir, (eventType, filename) => {
    if (filename === 'config.json') {
      // Debounce to avoid multiple reloads
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        console.log('[relayplane] Config file changed, reloading...');
        const newConfig = loadConfig();
        onChange(newConfig);
      }, 100);
    }
  });
}
