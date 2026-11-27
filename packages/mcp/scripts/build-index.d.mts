// Types of build-index.mjs for the TypeScript tests.
import type { McpIndex } from '@salmonui/mcp';

export declare const OUTPUT: string;
export declare const SITE_URL: string;
export declare function specifierOf(pkgName: string, subpath: string): string;
export declare function familySubSpecifier(pkg: { name: string }, fam: { name: string; root?: boolean }, sub: string): string;
export declare function cleanText(text: string, options?: { siteUrl?: string }): string;
export declare function firstSentence(text: string, max?: number): string;
export declare function slugify(text: string): string;
export declare function splitSections(title: string, body: string): { heading: string; anchor: string; text: string }[];
export declare function defaultOf(tags: readonly { name: string; text: string }[], docs?: string): string | undefined;
export declare function memberType(name: string, signature: string): string;
export declare function kindOf(symbol: { name: string; kind: string; signature: string }): string;
export declare function buildIndex(input: {
  manifest: readonly object[];
  packageJsons: Record<string, object>;
  api: object;
  docs: readonly object[];
  demos: readonly object[];
  version: string;
  generatedFrom?: string;
  siteUrl?: string;
}): McpIndex;
export declare function buildRepositoryIndex(options?: { apiFile?: string }): Promise<McpIndex>;
export declare function writeIndex(index: McpIndex, file?: string): number;
