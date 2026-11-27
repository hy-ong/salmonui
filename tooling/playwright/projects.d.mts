// Types for projects.mjs (the Playwright configs are type-checked, e.g. by docs:typecheck).
import type { Project } from '@playwright/test';

export declare const PERF_GREP: RegExp;
export declare function functionalWorkers(env?: Record<string, string | undefined>): number | string;
export declare function splitProjects(use: Project['use']): Project[];
