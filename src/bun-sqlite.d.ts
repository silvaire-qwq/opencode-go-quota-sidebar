declare module "bun:sqlite" {
  export class Database {
    constructor(filename: string, options?: { readonly?: boolean })
    query(sql: string): {
      get(...params: unknown[]): unknown
      all(...params: unknown[]): unknown[]
    }
    close(): void
  }
}
