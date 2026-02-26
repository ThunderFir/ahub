// Runtime GitHub API helpers (client-side safe — uses public APIs only)

const GITHUB_OWNER = import.meta.env.PUBLIC_GITHUB_OWNER as string;
const GITHUB_REPO = import.meta.env.PUBLIC_GITHUB_REPO as string;

export interface GitHubComment {
  id: number;
  body: string;
  user: {
    login: string;
    avatar_url: string;
    html_url: string;
  };
  created_at: string;
  html_url: string;
}

export async function getPRComments(prNumber: number): Promise<GitHubComment[]> {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues/${prNumber}/comments`;

  const res = await fetch(url, {
    headers: { Accept: 'application/vnd.github.v3+json' },
  });

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status}`);
  }

  return res.json();
}

export function getPRUrl(prNumber: number): string {
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/pull/${prNumber}`;
}
