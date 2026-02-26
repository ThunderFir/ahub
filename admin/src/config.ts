import 'dotenv/config';
import { detectToken, detectUsername } from './auth.js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`缺少必要的环境变量：${name}`);
  }
  return value;
}

function lazyGithub() {
  let _token: string | null = null;
  let _owner: string | null = null;

  return {
    get token() {
      if (!_token) _token = detectToken();
      return _token;
    },
    get owner() {
      if (!_owner) _owner = detectUsername();
      return _owner;
    },
    get repo() {
      return requireEnv('GITHUB_REPO');
    },
  };
}

export const config = {
  github: lazyGithub(),
  llm: {
    baseUrl: process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1',
    apiKey: requireEnv('LLM_API_KEY'),
    model: process.env.LLM_MODEL ?? 'gpt-4o-mini',
  },
};
