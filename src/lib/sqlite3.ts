import {EventEmitter} from 'events'
import sqlite3 from 'sqlite3'

/**
 * Allowed types for SQLite parameters.
 */
export type SqliteParameter = string | number | Buffer | null

/**
 * A parameter list may be given as an array of values or as an object mapping names to values.
 */
export type SqliteParameters = SqliteParameter[] | Record<string, SqliteParameter>

/**
 * A type guard to check if a value is a plain object (and not an array or a Buffer).
 */
function isPlainObject(value: unknown): value is Record<string, SqliteParameter> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !(value instanceof Buffer)
  )
}

// Re‑export sqlite3 constants and cached instance.
export const OPEN_READONLY = sqlite3.OPEN_READONLY
export const OPEN_READWRITE = sqlite3.OPEN_READWRITE
export const OPEN_CREATE = sqlite3.OPEN_CREATE
export const OPEN_SHAREDCACHE = sqlite3.OPEN_SHAREDCACHE
export const OPEN_PRIVATECACHE = sqlite3.OPEN_PRIVATECACHE
export const OPEN_URI = sqlite3.OPEN_URI
export const cached = sqlite3.cached

/**
 * A promisified wrapper around sqlite3.Database.
 *
 * This class extends EventEmitter so that underlying events (like "error" or "open")
 * are forwarded.
 */
export class Database extends EventEmitter {
  // Underlying sqlite3.Database instance.
  private _db: sqlite3.Database

  // Overloaded constructors: either supply a filename (with an optional mode) or wrap an existing Database.
  constructor(filename: string, mode?: number)
  constructor(db: sqlite3.Database)
  constructor(arg: string | sqlite3.Database, mode?: number) {
    super()
    if (typeof arg === 'string') {
      this._db = new sqlite3.Database(arg, mode, (err: Error | null) => {
        if (err) {
          this.emit('error', err)
        } else {
          this.emit('open')
        }
      })
    } else {
      this._db = arg
    }
    // Forward events from the underlying database.
    this._db.on('error', (err) => this.emit('error', err))
    this._db.on('trace', (sql) => this.emit('trace', sql))
    this._db.on('profile', (sql, time) => this.emit('profile', sql, time))
    this._db.on('close', () => this.emit('close'))
  }

  /**
   * A helper to open a database.
   */
  static open(filename: string, mode?: number): Promise<Database> {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(filename, mode, (err: Error | null) => {
        if (err) {
          reject(err)
        } else {
          resolve(new Database(db))
        }
      })
    })
  }

  // --- run() overloads ---
  run(sql: string): Promise<sqlite3.RunResult>
  run(sql: string, params: Record<string, SqliteParameter>): Promise<sqlite3.RunResult>
  run(sql: string, ...params: SqliteParameter[]): Promise<sqlite3.RunResult>
  run(sql: string, ...params: unknown[]): Promise<sqlite3.RunResult> {
    return new Promise((resolve, reject) => {
      const callback = function (this: sqlite3.RunResult, err: Error | null): void {
        if (err) {
          reject(err)
        } else {
          resolve(this)
        }
      }
      if (params.length === 1 && isPlainObject(params[0])) {
        this._db.run(sql, params[0], callback)
      } else {
        this._db.run(sql, ...(params as SqliteParameter[]), callback)
      }
    })
  }

  // --- get() overloads ---
  get<T = unknown>(sql: string): Promise<T>
  get<T = unknown>(sql: string, params: Record<string, SqliteParameter>): Promise<T>
  get<T = unknown>(sql: string, ...params: SqliteParameter[]): Promise<T>
  get<T = unknown>(sql: string, ...params: unknown[]): Promise<T> {
    return new Promise((resolve, reject) => {
      const callback = (err: Error | null, row: unknown): void => {
        if (err) {
          reject(err)
        } else {
          resolve(row as T)
        }
      }
      if (params.length === 1 && isPlainObject(params[0])) {
        this._db.get(sql, params[0], callback)
      } else {
        this._db.get(sql, ...(params as SqliteParameter[]), callback)
      }
    })
  }

  // --- all() overloads ---
  all<T = unknown>(sql: string): Promise<T[]>
  all<T = unknown>(sql: string, params: Record<string, SqliteParameter>): Promise<T[]>
  all<T = unknown>(sql: string, ...params: SqliteParameter[]): Promise<T[]>
  all<T = unknown>(sql: string, ...params: unknown[]): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const callback = (err: Error | null, rows: unknown[]): void => {
        if (err) {
          reject(err)
        } else {
          resolve(rows as T[])
        }
      }
      if (params.length === 1 && isPlainObject(params[0])) {
        this._db.all(sql, params[0], callback)
      } else {
        this._db.all(sql, ...(params as SqliteParameter[]), callback)
      }
    })
  }

  /**
   * Instead of using a callback‐based “each”, we now expose it as an async iterator.
   *
   * Example usage:
   *
   * ```ts
   * for await (const row of db.each<User>('SELECT * FROM users WHERE age > ?', 30)) {
   *   console.log(row);
   * }
   * ```
   *
   * @param sql The SQL query.
   * @param params Optional parameters.
   */
  async *each<T = unknown>(
    sql: string,
    params?: SqliteParameters,
  ): AsyncGenerator<T, void, unknown> {
    const queue: T[] = []
    let done = false
    let error: Error | null = null
    let nextRowResolve: (() => void) | null = null

    // A helper that returns a promise which resolves when a new row is available or processing is done.
    const waitForRow = (): Promise<void> =>
      new Promise<void>((resolve) => {
        nextRowResolve = resolve
      })

    const rowCallback = (err: Error | null, row: unknown): void => {
      if (err) {
        error = err
      } else {
        queue.push(row as T)
      }
      if (nextRowResolve) {
        nextRowResolve()
        nextRowResolve = null
      }
    }

    const completeCallback = (err: Error | null, _count: number): void => {
      if (err) {
        error = err
      }
      done = true
      if (nextRowResolve) {
        nextRowResolve()
        nextRowResolve = null
      }
    }

    // Call the underlying sqlite3 each() method.
    if (params !== undefined) {
      this._db.each(sql, params, rowCallback, completeCallback)
    } else {
      this._db.each(sql, rowCallback, completeCallback)
    }

    // Yield rows as they become available.
    while (!done || queue.length > 0) {
      if (queue.length === 0) {
        await waitForRow()
        continue
      }
      yield queue.shift()!
    }
    if (error) {
      throw error
    }
  }

  // --- prepare() overloads ---
  prepare(sql: string): Promise<Statement>
  prepare(sql: string, params: Record<string, SqliteParameter>): Promise<Statement>
  prepare(sql: string, ...params: SqliteParameter[]): Promise<Statement>
  prepare(sql: string, ...params: unknown[]): Promise<Statement> {
    return new Promise((resolve, reject) => {
      const callback = function (this: sqlite3.Statement, err: Error | null): void {
        if (err) {
          reject(err)
        } else {
          resolve(new Statement(this))
        }
      }
      if (params.length === 1 && isPlainObject(params[0])) {
        this._db.prepare(sql, params[0], callback)
      } else {
        this._db.prepare(sql, ...(params as SqliteParameter[]), callback)
      }
    })
  }

  /**
   * Closes the database connection.
   */
  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this._db.close((err: Error | null) => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }

  // These methods simply delegate to the underlying sqlite3.Database.
  serialize(callback?: () => void): void {
    this._db.serialize(callback)
  }
  parallelize(callback?: () => void): void {
    this._db.parallelize(callback)
  }
  configure(option: 'busyTimeout', value: number): void {
    this._db.configure(option, value)
  }
  interrupt(): void {
    this._db.interrupt()
  }
}

/**
 * A promisified wrapper around sqlite3.Statement.
 *
 * The methods below work much like their Database counterparts.
 */
export class Statement {
  private _stmt: sqlite3.Statement
  constructor(stmt: sqlite3.Statement) {
    this._stmt = stmt
  }

  // --- run() overloads ---
  run(): Promise<sqlite3.RunResult>
  run(params: Record<string, SqliteParameter>): Promise<sqlite3.RunResult>
  run(...params: SqliteParameter[]): Promise<sqlite3.RunResult>
  run(...params: unknown[]): Promise<sqlite3.RunResult> {
    return new Promise((resolve, reject) => {
      const callback = function (this: sqlite3.RunResult, err: Error | null): void {
        if (err) {
          reject(err)
        } else {
          resolve(this)
        }
      }
      if (params.length === 1 && isPlainObject(params[0])) {
        this._stmt.run(params[0], callback)
      } else {
        this._stmt.run(...(params as SqliteParameter[]), callback)
      }
    })
  }

  // --- get() overloads ---
  get<T = unknown>(): Promise<T>
  get<T = unknown>(params: Record<string, SqliteParameter>): Promise<T>
  get<T = unknown>(...params: SqliteParameter[]): Promise<T>
  get<T = unknown>(...params: unknown[]): Promise<T> {
    return new Promise((resolve, reject) => {
      const callback = (err: Error | null, row: unknown): void => {
        if (err) {
          reject(err)
        } else {
          resolve(row as T)
        }
      }
      if (params.length === 1 && isPlainObject(params[0])) {
        this._stmt.get(params[0], callback)
      } else {
        this._stmt.get(...(params as SqliteParameter[]), callback)
      }
    })
  }

  // --- all() overloads ---
  all<T = unknown>(): Promise<T[]>
  all<T = unknown>(params: Record<string, SqliteParameter>): Promise<T[]>
  all<T = unknown>(...params: SqliteParameter[]): Promise<T[]>
  all<T = unknown>(...params: unknown[]): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const callback = (err: Error | null, rows: unknown[]): void => {
        if (err) {
          reject(err)
        } else {
          resolve(rows as T[])
        }
      }
      if (params.length === 1 && isPlainObject(params[0])) {
        this._stmt.all(params[0], callback)
      } else {
        this._stmt.all(...(params as SqliteParameter[]), callback)
      }
    })
  }

  /**
   * Replaces the callback‑based “each” with an async iterator.
   *
   * Example usage:
   *
   * ```ts
   * for await (const row of stmt.each<MyData>('SELECT * FROM data')) {
   *   console.log(row);
   * }
   * ```
   *
   * @param params Optional parameters for the statement.
   */
  async *each<T = unknown>(params?: SqliteParameters): AsyncGenerator<T, void, unknown> {
    const queue: T[] = []
    let done = false
    let error: Error | null = null
    let nextRowResolve: (() => void) | null = null

    const waitForRow = (): Promise<void> =>
      new Promise<void>((resolve) => {
        nextRowResolve = resolve
      })

    const rowCallback = (err: Error | null, row: unknown): void => {
      if (err) {
        error = err
      } else {
        queue.push(row as T)
      }
      if (nextRowResolve) {
        nextRowResolve()
        nextRowResolve = null
      }
    }

    const completeCallback = (err: Error | null, _count: number): void => {
      if (err) {
        error = err
      }
      done = true
      if (nextRowResolve) {
        nextRowResolve()
        nextRowResolve = null
      }
    }

    if (params !== undefined) {
      this._stmt.each(params, rowCallback, completeCallback)
    } else {
      this._stmt.each(rowCallback, completeCallback)
    }

    while (!done || queue.length > 0) {
      if (queue.length === 0) {
        await waitForRow()
        continue
      }
      yield queue.shift()!
    }
    if (error) {
      throw error
    }
  }

  // --- bind() overloads ---
  bind(): Promise<Statement>
  bind(params: Record<string, SqliteParameter>): Promise<Statement>
  bind(...params: SqliteParameter[]): Promise<Statement>
  bind(...params: unknown[]): Promise<Statement> {
    return new Promise((resolve, reject) => {
      const callback = function (this: sqlite3.Statement, err: Error | null): void {
        if (err) {
          reject(err)
        } else {
          resolve(new Statement(this))
        }
      }
      if (params.length === 1 && isPlainObject(params[0])) {
        this._stmt.bind(params[0], callback)
      } else {
        this._stmt.bind(...(params as SqliteParameter[]), callback)
      }
    })
  }

  /**
   * Resets the statement so it can be re‑executed.
   */
  reset(): Promise<void> {
    return new Promise((resolve, reject) => {
      this._stmt.reset((err: Error | null) => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }

  /**
   * Finalizes the statement, releasing any resources.
   */
  finalize(): Promise<void> {
    return new Promise((resolve, reject) => {
      this._stmt.finalize((err: Error | null) => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }
}

/**
 * The verbose() function sets sqlite3 into verbose mode and returns an object that mimics
 * sqlite3’s API but with our promise‑based Database and Statement wrappers (including async iteration for rows).
 */
export function verbose() {
  sqlite3.verbose()
  return {
    OPEN_READONLY,
    OPEN_READWRITE,
    OPEN_CREATE,
    OPEN_SHAREDCACHE,
    OPEN_PRIVATECACHE,
    OPEN_URI,
    cached,
    Database,
    Statement,
    verbose,
  }
}
