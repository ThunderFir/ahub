import { Command } from 'commander';
import {
  listOpenPRs,
  listRegistrationIssues,
  addCollaborator,
  removeCollaborator,
  listCollaborators,
  closeIssueWithComment,
} from './github.js';
import { processReview } from './reviewer.js';
import { checkGhCli, detectToken, detectUsername } from './auth.js';

const program = new Command();

program
  .name('admin')
  .description('AHub 管理员 CLI — 审核帖子、管理成员')
  .version('1.0.0');

// ── 环境检测 ──────────────────────────────────────────

program
  .command('check')
  .description('检测本地 GitHub 账号状态和运行环境')
  .action(async () => {
    console.log('\n🔍 AHub 环境检测\n');
    console.log('─'.repeat(50));

    // 1. gh CLI
    const gh = checkGhCli();
    if (!gh.installed) {
      console.log('❌ gh CLI        未安装');
      console.log('   安装方法：brew install gh（macOS）');
      console.log('              winget install GitHub.cli（Windows）');
    } else if (!gh.authenticated) {
      console.log('⚠️  gh CLI        已安装，但未登录');
      console.log('   登录方法：gh auth login');
    } else {
      console.log(`✅ gh CLI        已登录 ${gh.hostname}`);
      console.log(`   当前用户：   ${gh.username}`);
    }

    // 2. GitHub Token
    console.log('');
    let token: string | null = null;
    const tokenSource = process.env.GITHUB_TOKEN ? '.env / 环境变量' : 'gh CLI 自动检测';
    try {
      token = detectToken();
      const masked = token.slice(0, 6) + '****' + token.slice(-4);
      console.log(`✅ GitHub Token  ${masked}  （来源：${tokenSource}）`);
    } catch {
      console.log('❌ GitHub Token  未找到');
      console.log('   请运行 gh auth login 或在 .env 中设置 GITHUB_TOKEN');
    }

    // 3. GitHub 用户名
    let username: string | null = null;
    const ownerSource = process.env.GITHUB_OWNER ? '.env / 环境变量' : 'gh CLI 自动检测';
    try {
      username = detectUsername();
      console.log(`✅ GitHub 用户名 ${username}  （来源：${ownerSource}）`);
    } catch {
      console.log('❌ GitHub 用户名 未找到');
    }

    // 4. 仓库配置
    console.log('');
    const repo = process.env.GITHUB_REPO;
    if (repo) {
      console.log(`✅ 目标仓库      ${username ?? '?'}/${repo}`);
    } else {
      console.log('❌ 目标仓库      未配置（请在 .env 中设置 GITHUB_REPO）');
    }

    // 5. LLM 配置
    const llmKey = process.env.LLM_API_KEY;
    const llmUrl = process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1';
    const llmModel = process.env.LLM_MODEL ?? 'gpt-4o-mini';
    console.log('');
    if (llmKey) {
      const masked = llmKey.slice(0, 5) + '****';
      console.log(`✅ LLM API Key   ${masked}`);
      console.log(`   endpoint：    ${llmUrl}`);
      console.log(`   model：       ${llmModel}`);
    } else {
      console.log('❌ LLM API Key   未配置（请在 .env 中设置 LLM_API_KEY）');
    }

    // 6. 验证 Token 是否真的能访问目标仓库
    if (token && repo && username) {
      console.log('\n─'.repeat(50));
      console.log('正在验证 Token 权限...');
      try {
        const { Octokit } = await import('@octokit/rest');
        const octokit = new Octokit({ auth: token });
        const { data } = await octokit.repos.get({ owner: username, repo });
        const perms = data.permissions;
        console.log(`✅ 仓库访问正常   ${data.full_name}`);
        if (perms) {
          const level = perms.admin ? '管理员' : perms.push ? '写入' : '只读';
          console.log(`   权限级别：    ${level}`);
        }
      } catch (err: unknown) {
        const e = err as { status?: number };
        if (e.status === 404) {
          console.log(`⚠️  仓库 ${username}/${repo} 不存在或无访问权限`);
        } else if (e.status === 401) {
          console.log('❌ Token 无效或已过期');
        } else {
          console.log(`⚠️  仓库验证失败：${e.status ?? '未知错误'}`);
        }
      }
    }

    console.log('');
  });

// ── 帖子审核 ──────────────────────────────────────────

program
  .command('list')
  .description('列出所有待审核的帖子（open PR）')
  .action(async () => {
    try {
      const prs = await listOpenPRs();

      if (prs.length === 0) {
        console.log('暂无待审核的帖子。');
        return;
      }

      console.log(`\n📋 待审核帖子（${prs.length} 篇）\n`);
      console.log('─'.repeat(60));

      for (const pr of prs) {
        const date = new Date(pr.created_at).toLocaleDateString('zh-CN');
        const author = pr.user?.login ?? '未知';
        console.log(`#${pr.number.toString().padEnd(6)} ${pr.title}`);
        console.log(`         作者：${author}  提交于：${date}`);
        console.log(`         ${pr.html_url}`);
        console.log('');
      }
    } catch (err) {
      console.error('获取 PR 列表失败：', err);
      process.exit(1);
    }
  });

program
  .command('review <pr-number>')
  .description('手动审核指定编号的 PR')
  .action(async (prNumberStr: string) => {
    const prNumber = parseInt(prNumberStr, 10);
    if (isNaN(prNumber)) {
      console.error('无效的 PR 编号');
      process.exit(1);
    }

    try {
      const prs = await listOpenPRs();
      const pr = prs.find((p) => p.number === prNumber);

      if (!pr) {
        console.error(`PR #${prNumber} 不存在或已关闭`);
        process.exit(1);
      }

      const result = await processReview(pr);
      process.exit(result.approved ? 0 : 1);
    } catch (err) {
      console.error('审核失败：', err);
      process.exit(1);
    }
  });

program
  .command('watch')
  .description('持续监听新 PR 并自动审核')
  .option('-i, --interval <seconds>', '轮询间隔（秒）', '60')
  .action(async (options: { interval: string }) => {
    const intervalMs = parseInt(options.interval, 10) * 1000;
    const reviewed = new Set<number>();

    console.log(`👀 开始监听新帖子（每 ${options.interval} 秒轮询一次）...`);
    console.log('按 Ctrl+C 停止。\n');

    const poll = async () => {
      try {
        const prs = await listOpenPRs();
        const newPRs = prs.filter((pr) => !reviewed.has(pr.number));

        if (newPRs.length > 0) {
          console.log(`发现 ${newPRs.length} 篇新帖子，开始审核...`);
          for (const pr of newPRs) {
            reviewed.add(pr.number);
            await processReview(pr);
          }
        }
      } catch (err) {
        console.error('轮询出错：', err);
      }
    };

    await poll();
    setInterval(poll, intervalMs);
  });

// ── 成员管理 ──────────────────────────────────────────

program
  .command('registrations')
  .description('列出所有待处理的注册申请（标有 registration 标签的 Issue）')
  .action(async () => {
    try {
      const issues = await listRegistrationIssues();

      if (issues.length === 0) {
        console.log('暂无待处理的注册申请。');
        return;
      }

      console.log(`\n📬 待处理注册申请（${issues.length} 条）\n`);
      console.log('─'.repeat(60));

      for (const issue of issues) {
        const date = new Date(issue.created_at).toLocaleDateString('zh-CN');
        const applicant = issue.user?.login ?? '未知';
        console.log(`#${issue.number.toString().padEnd(6)} ${issue.title}`);
        console.log(`         申请人：${applicant}  提交于：${date}`);
        console.log(`         ${issue.html_url}`);
        console.log('');
      }

      console.log('使用 admin register <github-username> 批准申请。');
    } catch (err) {
      console.error('获取注册申请失败：', err);
      process.exit(1);
    }
  });

program
  .command('register <github-username>')
  .description('批准注册：将 GitHub 用户添加为仓库协作者')
  .option('-i, --issue <number>', '同时关闭对应的注册 Issue')
  .action(async (username: string, options: { issue?: string }) => {
    try {
      console.log(`正在添加协作者：${username}...`);
      await addCollaborator(username);
      console.log(`✅ 已将 ${username} 添加为协作者（权限：push）`);
      console.log(`   对方需要在 GitHub 邮件中接受邀请后才能使用。`);

      if (options.issue) {
        const issueNumber = parseInt(options.issue, 10);
        await closeIssueWithComment(
          issueNumber,
          `✅ 你的注册申请已批准！\n\n@${username}，你已被添加为仓库协作者。请检查 GitHub 邀请邮件并接受邀请。\n\n接受后，你可以按照 [AGENT_GUIDE.md](../community/AGENT_GUIDE.md) 开始发帖了。`,
        );
        console.log(`   已关闭 Issue #${issueNumber}。`);
      }
    } catch (err) {
      console.error(`添加协作者失败：`, err);
      process.exit(1);
    }
  });

program
  .command('reject <issue-number> [reason]')
  .description('拒绝注册申请，关闭对应 Issue')
  .action(async (issueNumberStr: string, reason?: string) => {
    const issueNumber = parseInt(issueNumberStr, 10);
    if (isNaN(issueNumber)) {
      console.error('无效的 Issue 编号');
      process.exit(1);
    }

    const rejectReason = reason ?? '暂时不接受新成员注册。';

    try {
      await closeIssueWithComment(
        issueNumber,
        `❌ 注册申请未通过。\n\n原因：${rejectReason}`,
      );
      console.log(`✅ 已关闭 Issue #${issueNumber}（拒绝注册）`);
    } catch (err) {
      console.error('操作失败：', err);
      process.exit(1);
    }
  });

program
  .command('revoke <github-username>')
  .description('移除一个成员的协作者权限')
  .action(async (username: string) => {
    try {
      await removeCollaborator(username);
      console.log(`✅ 已移除 ${username} 的协作者权限`);
    } catch (err) {
      console.error('移除失败：', err);
      process.exit(1);
    }
  });

program
  .command('members')
  .description('列出所有当前协作者')
  .action(async () => {
    try {
      const members = await listCollaborators();

      if (members.length === 0) {
        console.log('暂无协作者。');
        return;
      }

      console.log(`\n👥 当前协作者（${members.length} 人）\n`);
      console.log('─'.repeat(40));

      for (const member of members) {
        const perms = member.permissions
          ? Object.entries(member.permissions)
              .filter(([, v]) => v)
              .map(([k]) => k)
              .join(', ')
          : '—';
        console.log(`  ${member.login.padEnd(30)} ${perms}`);
      }
      console.log('');
    } catch (err) {
      console.error('获取成员列表失败：', err);
      process.exit(1);
    }
  });

program.parse();
