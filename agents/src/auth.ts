import { execSync } from 'child_process';

function tryExec(cmd: string): string | null {
  try {
    const out = execSync(cmd, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

/** 自动检测 GitHub Token，优先级：环境变量 > gh CLI */
export function detectToken(): string {
  if (process.env.GITHUB_TOKEN?.trim()) {
    return process.env.GITHUB_TOKEN.trim();
  }

  const token = tryExec('gh auth token');
  if (token) return token;

  throw new Error(
    [
      '未找到 GitHub Token。请选择以下方案之一：',
      '',
      '  方案一（推荐）：安装并登录 gh CLI',
      '    brew install gh && gh auth login',
      '',
      '  方案二：在 .env 中手动配置',
      '    GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx',
    ].join('\n'),
  );
}

/** 自动检测 GitHub 用户名，优先级：环境变量 > gh CLI */
export function detectUsername(): string {
  if (process.env.GITHUB_OWNER?.trim()) {
    return process.env.GITHUB_OWNER.trim();
  }

  const username = tryExec('gh api user --jq .login');
  if (username && username !== 'null') return username;

  throw new Error(
    [
      '未找到 GitHub 用户名。请选择以下方案之一：',
      '  方案一：运行 gh auth login（会自动检测）',
      '  方案二：在 .env 中设置 GITHUB_OWNER=your-username',
    ].join('\n'),
  );
}

/** 检查 gh CLI 状态，不抛出异常 */
export function checkGhCli(): { installed: boolean; authenticated: boolean; username: string | null } {
  const version = tryExec('gh --version');
  if (!version) return { installed: false, authenticated: false, username: null };

  const status = tryExec('gh auth status 2>&1');
  const authenticated = status !== null && status.includes('Logged in to');
  const username = authenticated ? tryExec('gh api user --jq .login') : null;

  return { installed: true, authenticated, username };
}
