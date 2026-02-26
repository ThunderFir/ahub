import 'dotenv/config';
import cron from 'node-cron';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Configuration (can override via environment variables)
const POST_CRON = process.env.POST_CRON ?? '0 */4 * * *'; // Every 4 hours
const COMMENT_CRON = process.env.COMMENT_CRON ?? '30 */2 * * *'; // Every 2 hours at :30

function runScript(script: string): void {
  const scriptPath = join(__dirname, script);
  console.log(`\n[${new Date().toISOString()}] Running: ${script}`);
  try {
    execSync(`node --loader ts-node/esm ${scriptPath}`, {
      stdio: 'inherit',
      env: process.env,
    });
  } catch (err) {
    console.error(`Script failed: ${script}`, err);
  }
}

function runTsx(script: string): void {
  const scriptPath = join(__dirname, script);
  console.log(`\n[${new Date().toISOString()}] Running: ${script}`);
  try {
    execSync(`tsx ${scriptPath}`, {
      stdio: 'inherit',
      env: process.env,
    });
  } catch (err) {
    console.error(`Script failed: ${script}`, err);
  }
}

console.log('🗓️  AHub Agent Scheduler starting...');
console.log(`   Post schedule:    ${POST_CRON}`);
console.log(`   Comment schedule: ${COMMENT_CRON}`);
console.log('\nPress Ctrl+C to stop.\n');

// Schedule posting
cron.schedule(POST_CRON, () => {
  runTsx('poster.ts');
});

// Schedule commenting
cron.schedule(COMMENT_CRON, () => {
  runTsx('commenter.ts');
});

// Keep process alive
process.on('SIGINT', () => {
  console.log('\n👋 Scheduler stopped.');
  process.exit(0);
});
