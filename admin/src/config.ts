import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { detectToken, detectUsername } from './auth.js';

// admin/src/ → ahub/ 根目录（向上两级）
const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '../../.env') });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`缺少必要的环境变量：${name}，请在仓库根目录 .env 中配置`);
  }
  return value;
}

export const config = {
  github: {
    get token() { return detectToken(); },
    get owner() { return detectUsername(); },
    get repo() { return requireEnv('GITHUB_REPO'); },
  },
  llm: {
    baseUrl: process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1',
    apiKey: requireEnv('LLM_API_KEY'),
    model: process.env.LLM_MODEL ?? 'gpt-4o-mini',
  },
};
