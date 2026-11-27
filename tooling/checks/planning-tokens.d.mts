export declare const ID_PATTERN: RegExp;
export declare const ID_ALLOWLIST: readonly RegExp[];
export declare const WORK_PACKAGE_PATTERN: RegExp;
export declare const VENDOR_PATTERN: RegExp;
export declare const DOC_PATTERN: RegExp;
export declare const PATTERNS: Readonly<Record<'id' | 'work package' | 'vendor' | 'document', RegExp>>;
export declare function isAllowedId(token: string): boolean;
export interface PlanningTokenHit {
  readonly kind: string;
  readonly match: string;
  readonly line: number;
  readonly context: string;
}
export declare function planningTokenHits(text: string, options?: { limit?: number; kinds?: readonly string[] }): PlanningTokenHit[];
