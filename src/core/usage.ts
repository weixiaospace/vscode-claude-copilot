import * as fs from 'fs/promises';
import * as path from 'path';
import { projectSlug } from './memory';

export interface DailyUsage { date: string; input: number; output: number; cacheRead: number; cacheCreate: number; sessions: number }
export interface ModelUsage { model: string; input: number; output: number; cacheRead: number; cacheCreate: number; count: number }
export interface ProjectUsage { name: string; input: number; output: number; cacheRead: number; cacheCreate: number; sessions: number; calls: number }
export interface UsageResult { daily: DailyUsage[]; models: ModelUsage[]; projects: ProjectUsage[]; totalSessions: number }

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

export async function queryUsage(home: string, projectPathFilter: string | null): Promise<UsageResult> {
  try {
    const projectsDir = path.join(home, 'projects');
    if (!await exists(projectsDir)) return { daily: [], models: [], projects: [], totalSessions: 0 };

    let dirEntries: { dirPath: string; projectName: string }[] = [];
    if (projectPathFilter) {
      const slug = projectSlug(projectPathFilter);
      const dir = path.join(projectsDir, slug);
      if (await exists(dir)) dirEntries = [{ dirPath: dir, projectName: slug }];
    } else {
      const entries = await fs.readdir(projectsDir, { withFileTypes: true });
      dirEntries = entries.filter(e => e.isDirectory() && !e.name.startsWith('.'))
        .map(e => ({ dirPath: path.join(projectsDir, e.name), projectName: e.name }));
    }

    const dailyMap: Record<string, DailyUsage> = {};
    const modelMap: Record<string, ModelUsage> = {};
    const projectMap: Record<string, ProjectUsage> = {};
    let totalSessions = 0;

    for (const { dirPath, projectName } of dirEntries) {
      const files = (await fs.readdir(dirPath)).filter(f => f.endsWith('.jsonl'));
      if (!projectMap[projectName]) {
        projectMap[projectName] = { name: projectName, input: 0, output: 0, cacheRead: 0, cacheCreate: 0, sessions: 0, calls: 0 };
      }
      for (const file of files) {
        let sessionCounted = false;
        const content = await fs.readFile(path.join(dirPath, file), 'utf-8');
        for (const line of content.split('\n')) {
          if (!line.includes('"assistant"') || !line.includes('"usage"')) continue;
          try {
            const entry = JSON.parse(line);
            if (entry.type !== 'assistant') continue;
            const msg = entry.message;
            if (!msg?.usage) continue;
            const u = msg.usage;
            const model = msg.model || 'unknown';
            const input = u.input_tokens || 0;
            const output = u.output_tokens || 0;
            const cacheRead = u.cache_read_input_tokens || 0;
            const cacheCreate = u.cache_creation_input_tokens || 0;
            if (input === 0 && output === 0) continue;

            const date = entry.timestamp ? entry.timestamp.slice(0, 10) : 'unknown';
            if (!dailyMap[date]) dailyMap[date] = { date, input: 0, output: 0, cacheRead: 0, cacheCreate: 0, sessions: 0 };
            dailyMap[date].input += input;
            dailyMap[date].output += output;
            dailyMap[date].cacheRead += cacheRead;
            dailyMap[date].cacheCreate += cacheCreate;
            if (!sessionCounted && date !== 'unknown') {
              dailyMap[date].sessions++;
              sessionCounted = true;
            }

            if (!modelMap[model]) modelMap[model] = { model, input: 0, output: 0, cacheRead: 0, cacheCreate: 0, count: 0 };
            modelMap[model].input += input;
            modelMap[model].output += output;
            modelMap[model].cacheRead += cacheRead;
            modelMap[model].cacheCreate += cacheCreate;
            modelMap[model].count++;

            projectMap[projectName].input += input;
            projectMap[projectName].output += output;
            projectMap[projectName].cacheRead += cacheRead;
            projectMap[projectName].cacheCreate += cacheCreate;
            projectMap[projectName].calls++;
          } catch { /* skip */ }
        }
        if (sessionCounted) {
          totalSessions++;
          projectMap[projectName].sessions++;
        }
      }
    }

    const daily = Object.values(dailyMap).sort((a, b) => b.date.localeCompare(a.date));
    const models = Object.values(modelMap).filter(m => m.model !== 'unknown' && m.model !== '<synthetic>')
      .sort((a, b) => b.output - a.output);
    const projects = Object.values(projectMap).filter(p => p.calls > 0).sort((a, b) => b.output - a.output);

    return { daily, models, projects, totalSessions };
  } catch {
    return { daily: [], models: [], projects: [], totalSessions: 0 };
  }
}
