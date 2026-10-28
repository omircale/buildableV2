/**
 * The part of Cloudflare D1 the API uses, written out so the API can be tested against plain SQLite
 * in Node without the Workers runtime.
 */
export interface Stmt {
  bind(...values: unknown[]): Stmt;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}

export interface Db {
  prepare(sql: string): Stmt;
  batch(statements: Stmt[]): Promise<unknown[]>;
}

export interface Assets {
  fetch(request: Request): Promise<Response>;
}

export interface Env {
  DB: Db;
  ASSETS: Assets;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  /** The address that becomes the admin on its first sign-in, while there is no admin yet. */
  BOOTSTRAP_ADMIN_EMAIL?: string;
}
