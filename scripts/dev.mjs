#!/usr/bin/env node
/**
 * Avvia in parallelo il backend (tsx watch) e il frontend (vite dev).
 * Scritto a mano per non introdurre dipendenze tipo concurrently/npm-run-all.
 */
import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const procs = [
  { name: 'server', color: '\x1b[36m', args: ['run', 'dev', '--workspace', 'server'] },
  { name: 'web   ', color: '\x1b[35m', args: ['run', 'dev', '--workspace', 'web'] },
].map(({ name, color, args }) => {
  const child = spawn(npm, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
  const prefix = `${color}[${name}]\x1b[0m `;
  const pipe = (stream, out) => {
    let buf = '';
    stream.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) out.write(prefix + line + '\n');
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  return child;
});

const shutdown = () => {
  for (const p of procs) if (!p.killed) p.kill();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
for (const p of procs) p.on('exit', shutdown);
