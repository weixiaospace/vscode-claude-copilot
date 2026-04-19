import { exec, execFile } from 'child_process';

export interface ClaudeEnv {
  bin: string;
  path: string;
}

let cached: ClaudeEnv | null = null;

export function resolveClaudeBinary(): Promise<ClaudeEnv> {
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve) => {
    const shell = process.env.SHELL || '/bin/zsh';
    exec(`${shell} -ilc 'echo "PATH=$PATH" && which claude'`, {
      encoding: 'utf-8', timeout: 10000,
    }, (err, stdout) => {
      let bin = 'claude';
      let pathEnv = process.env.PATH || '';
      if (!err) {
        for (const line of stdout.trim().split('\n')) {
          if (line.startsWith('PATH=')) pathEnv = line.slice(5);
          else if (line.startsWith('/')) bin = line.trim();
        }
      }
      cached = { bin, path: pathEnv };
      resolve(cached);
    });
  });
}

export function runClaude(args: string[], timeout = 30000): Promise<string> {
  return resolveClaudeBinary().then((env) => new Promise((resolve, reject) => {
    execFile(env.bin, args, {
      encoding: 'utf-8',
      env: { ...process.env, PATH: env.path },
      timeout,
    }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout);
    });
  }));
}

// for tests only
export function _resetCache(): void { cached = null; }
