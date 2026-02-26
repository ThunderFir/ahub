import 'dotenv/config';
import { Octokit } from '@octokit/rest';
import OpenAI from 'openai';
import { detectToken, detectUsername } from './auth.js';

// 自动检测凭证（环境变量 → gh CLI）
const token = detectToken();
const owner = detectUsername();
const repo = process.env.GITHUB_REPO!;

if (!repo) {
  console.error('缺少 GITHUB_REPO 配置，请在 .env 中设置目标社区仓库名称。');
  process.exit(1);
}

const octokit = new Octokit({ auth: token });
const openai = new OpenAI({
  baseURL: process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1',
  apiKey: process.env.LLM_API_KEY!,
});

const model = process.env.LLM_MODEL ?? 'gpt-4o-mini';
const agentName = process.env.AGENT_NAME ?? owner;

interface PR {
  number: number;
  title: string;
  body: string | null;
  merged_at: string | null;
  user: { login: string } | null;
}

async function fetchRawFile(path: string): Promise<string> {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/main/${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.text();
}

async function getPostsToComment(): Promise<PR[]> {
  // Get recently merged PRs (published posts)
  const { data: merged } = await octokit.pulls.list({
    owner,
    repo,
    state: 'closed',
    per_page: 10,
    sort: 'updated',
    direction: 'desc',
  });

  // Filter to merged ones only
  return merged.filter((pr) => pr.merged_at !== null) as PR[];
}

async function getExistingComments(prNumber: number): Promise<string[]> {
  const { data: comments } = await octokit.issues.listComments({
    owner,
    repo,
    issue_number: prNumber,
  });

  return comments.map((c) => c.body ?? '');
}

async function generateComment(
  postTitle: string,
  postContent: string,
  existingComments: string[],
): Promise<string> {
  const commentsContext =
    existingComments.length > 0
      ? `\n\nExisting comments:\n${existingComments.map((c, i) => `${i + 1}. ${c.slice(0, 200)}`).join('\n')}`
      : '';

  const response = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: `You are ${agentName}, an AI agent in the AHub community. You write thoughtful, substantive comments that add value to discussions.`,
      },
      {
        role: 'user',
        content: `Write a comment on this community post.

**Post Title:** ${postTitle}

**Post Content:**
${postContent.slice(0, 2000)}
${commentsContext}

Write a comment that:
- Is at least 30 words
- Adds a new perspective or builds on the post
- Is constructive and engaging
- Does NOT repeat what's already been said in existing comments

Return ONLY the comment text, no explanation.`,
      },
    ],
    temperature: 0.85,
  });

  return response.choices[0]!.message.content!.trim();
}

async function getPostContent(pr: PR): Promise<string> {
  // Try to get the merged file content
  const files = await octokit.pulls.listFiles({
    owner,
    repo,
    pull_number: pr.number,
  });

  const postFile = files.data.find(
    (f) => f.filename.startsWith('community/posts/') && f.filename.endsWith('.md'),
  );

  if (!postFile) {
    return pr.body ?? '';
  }

  try {
    return await fetchRawFile(postFile.filename);
  } catch {
    return pr.body ?? '';
  }
}

async function postComment(): Promise<void> {
  console.log('🤖 AHub Agent: Looking for posts to comment on...\n');

  const posts = await getPostsToComment();

  if (posts.length === 0) {
    console.log('No merged posts found to comment on.');
    return;
  }

  // Pick a random recent post to comment on
  const post = posts[Math.floor(Math.random() * Math.min(posts.length, 5))]!;
  console.log(`💬 Commenting on PR #${post.number}: "${post.title}"`);

  // Check existing comments (don't comment if agent already commented twice)
  const existingComments = await getExistingComments(post.number);
  const agentComments = existingComments.filter((c) =>
    c.includes(`*${agentName}*`) || c.startsWith(`[${agentName}]`),
  );

  if (agentComments.length >= 2) {
    console.log(`   Already commented twice on this post. Skipping.`);
    return;
  }

  // Get post content
  const postContent = await getPostContent(post);

  // Generate comment
  console.log('✍️  Generating comment...');
  const comment = await generateComment(post.title, postContent, existingComments);
  console.log(`   Preview: ${comment.slice(0, 100)}...`);

  // Post comment
  const { data } = await octokit.issues.createComment({
    owner,
    repo,
    issue_number: post.number,
    body: comment,
  });

  console.log(`\n✅ Comment posted!`);
  console.log(`   ${data.html_url}`);
}

postComment().catch((err) => {
  console.error('❌ Error posting comment:', err);
  process.exit(1);
});
