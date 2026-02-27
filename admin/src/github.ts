import { Octokit } from '@octokit/rest';
import { config } from './config.js';

export const octokit = new Octokit({ auth: config.github.token });

export interface PullRequest {
  number: number;
  title: string;
  body: string | null;
  user: { login: string } | null;
  html_url: string;
  head: { ref: string };
  created_at: string;
}

export async function listOpenPRs(): Promise<PullRequest[]> {
  const { data } = await octokit.pulls.list({
    owner: config.github.owner,
    repo: config.github.repo,
    state: 'open',
    per_page: 50,
  });
  return data as PullRequest[];
}

export async function getPRFiles(prNumber: number): Promise<string[]> {
  const { data } = await octokit.pulls.listFiles({
    owner: config.github.owner,
    repo: config.github.repo,
    pull_number: prNumber,
  });
  return data.map((f) => f.filename);
}

export async function getPRFileContent(prNumber: number): Promise<string> {
  const files = await getPRFiles(prNumber);
  const postFiles = files.filter((f) => f.startsWith('community/posts/') && f.endsWith('.md'));

  if (postFiles.length === 0) {
    return '';
  }

  // Get file content from the PR head branch
  const pr = await octokit.pulls.get({
    owner: config.github.owner,
    repo: config.github.repo,
    pull_number: prNumber,
  });

  const headRef = pr.data.head.ref;

  try {
    const { data } = await octokit.repos.getContent({
      owner: config.github.owner,
      repo: config.github.repo,
      path: postFiles[0],
      ref: headRef,
    });

    if ('content' in data && data.content) {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }
  } catch {
    // File might not exist yet
  }

  return '';
}

export async function getRulesContent(): Promise<string> {
  const { data } = await octokit.repos.getContent({
    owner: config.github.owner,
    repo: config.github.repo,
    path: 'community/RULES.md',
    ref: 'main',
  });

  if ('content' in data && data.content) {
    return Buffer.from(data.content, 'base64').toString('utf-8');
  }

  throw new Error('Could not read RULES.md');
}

export async function approvePR(prNumber: number): Promise<void> {
  const { data: pr } = await octokit.pulls.get({
    owner: config.github.owner,
    repo: config.github.repo,
    pull_number: prNumber,
  });

  // GitHub 不允许自己 approve 自己的 PR，直接跳过 review 步骤合并
  const { data: me } = await octokit.users.getAuthenticated();
  const isSelfPR = pr.user?.login === me.login;

  if (!isSelfPR) {
    await octokit.pulls.createReview({
      owner: config.github.owner,
      repo: config.github.repo,
      pull_number: prNumber,
      event: 'APPROVE',
      body: '✅ 帖子符合社区规则，已批准合并。',
    });
  }

  await octokit.pulls.merge({
    owner: config.github.owner,
    repo: config.github.repo,
    pull_number: prNumber,
    merge_method: 'squash',
  });
}

export async function rejectPR(prNumber: number, reason: string): Promise<void> {
  await octokit.issues.createComment({
    owner: config.github.owner,
    repo: config.github.repo,
    issue_number: prNumber,
    body: `❌ **帖子未通过审核**\n\n${reason}\n\n*请修改后重新提交。社区规则参见 [RULES.md](../community/RULES.md)。*`,
  });

  await octokit.pulls.update({
    owner: config.github.owner,
    repo: config.github.repo,
    pull_number: prNumber,
    state: 'closed',
  });
}

// ── 成员管理 ────────────────────────────────────────────

export interface RegistrationIssue {
  number: number;
  title: string;
  body: string | null;
  user: { login: string } | null;
  html_url: string;
  created_at: string;
}

export async function listRegistrationIssues(): Promise<RegistrationIssue[]> {
  const { data } = await octokit.issues.listForRepo({
    owner: config.github.owner,
    repo: config.github.repo,
    state: 'open',
    labels: 'registration',
    per_page: 50,
  });
  return data as RegistrationIssue[];
}

export async function addCollaborator(username: string): Promise<void> {
  await octokit.repos.addCollaborator({
    owner: config.github.owner,
    repo: config.github.repo,
    username,
    permission: 'push',
  });
}

export async function removeCollaborator(username: string): Promise<void> {
  await octokit.repos.removeCollaborator({
    owner: config.github.owner,
    repo: config.github.repo,
    username,
  });
}

export async function listCollaborators(): Promise<{ login: string; permissions?: Record<string, boolean> }[]> {
  const { data } = await octokit.repos.listCollaborators({
    owner: config.github.owner,
    repo: config.github.repo,
    per_page: 100,
  });
  return data.map((c) => ({ login: c.login, permissions: c.permissions as Record<string, boolean> | undefined }));
}

export async function closeIssueWithComment(issueNumber: number, comment: string): Promise<void> {
  await octokit.issues.createComment({
    owner: config.github.owner,
    repo: config.github.repo,
    issue_number: issueNumber,
    body: comment,
  });
  await octokit.issues.update({
    owner: config.github.owner,
    repo: config.github.repo,
    issue_number: issueNumber,
    state: 'closed',
  });
}
