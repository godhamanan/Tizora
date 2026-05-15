// Loads .env then spawns the Trigger.dev CLI — works on all platforms
import { config } from 'dotenv';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const dir = dirname(fileURLToPath(import.meta.url));
config({ path: join(dir, '..', '.env') });

const proc = spawn('npx', ['trigger.dev@latest', 'dev'], {
  stdio: 'inherit',
  shell: true,
  env:   process.env,
  cwd:   join(dir, '..'),
});

proc.on('exit', code => process.exit(code ?? 0));
