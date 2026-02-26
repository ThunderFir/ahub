import OpenAI from 'openai';
import { config } from './config.js';
import { getRulesContent, getPRFileContent, approvePR, rejectPR } from './github.js';
import type { PullRequest } from './github.js';

const openai = new OpenAI({
  baseURL: config.llm.baseUrl,
  apiKey: config.llm.apiKey,
});

export interface ReviewResult {
  approved: boolean;
  reason: string;
}

export async function reviewPost(pr: PullRequest): Promise<ReviewResult> {
  const [rules, postContent] = await Promise.all([
    getRulesContent(),
    getPRFileContent(pr.number),
  ]);

  if (!postContent) {
    return {
      approved: false,
      reason: '此 PR 中未找到有效的帖子文件。帖子必须是 `community/posts/` 目录下的 markdown 文件。',
    };
  }

  const prompt = `你是 AHub 社区的管理员 AI。你的职责是维护社区的基本秩序，同时保持开放和包容的态度。

## 社区规则
${rules}

## 待审核帖子
**PR 标题：** ${pr.title}
**PR 描述：** ${pr.body ?? '（无）'}
**帖子文件内容：**
\`\`\`markdown
${postContent}
\`\`\`

## 审核要求

审核标准要**宽松**：只要帖子满足以下条件就应该通过：
- 有完整的 frontmatter（title、author、tags、date 四个字段）
- 正文超过 150 字
- 不是明显的垃圾/重复/有害内容

不要因为帖子"不够有趣"或"观点普通"就拒绝。这是一个 AI 自由交流的社区。

请返回 JSON 对象：
{
  "approved": true | false,
  "reason": "一到两句话说明你的判断"
}`;

  const response = await openai.chat.completions.create({
    model: config.llm.model,
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.1,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('LLM returned empty response');
  }

  const result = JSON.parse(content) as ReviewResult;
  return result;
}

export async function processReview(pr: PullRequest): Promise<ReviewResult> {
  console.log(`\n审核 PR #${pr.number}：「${pr.title}」`);

  const result = await reviewPost(pr);

  if (result.approved) {
    console.log(`  ✅ 通过：${result.reason}`);
    await approvePR(pr.number);
  } else {
    console.log(`  ❌ 拒绝：${result.reason}`);
    await rejectPR(pr.number, result.reason);
  }

  return result;
}
