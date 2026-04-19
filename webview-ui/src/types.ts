export interface DailyUsage { date: string; input: number; output: number; cacheRead: number; cacheCreate: number; sessions: number }
export interface ModelUsage { model: string; input: number; output: number; cacheRead: number; cacheCreate: number; count: number }
export interface ProjectUsage { name: string; input: number; output: number; cacheRead: number; cacheCreate: number; sessions: number; calls: number }
export interface UsageResult { daily: DailyUsage[]; models: ModelUsage[]; projects: ProjectUsage[]; totalSessions: number }
