/**
 * Database Service (T030)
 * Central SQLite database operations with transaction support
 * Handles all database connections and provides typed query methods
 */

import { Database } from 'sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';
import { DatabaseResult } from '../../../shared/types/database';

export interface DatabaseConfig {
  dbPath?: string;
  enableForeignKeys?: boolean;
  walMode?: boolean;
  busyTimeout?: number;
}

export interface QueryResult {
  lastID?: number;
  changes: number;
}

export interface TransactionCallback<T> {
  (): Promise<T>;
}

/**
 * Database Service Class
 * Provides secure, typed database operations with connection pooling and transactions
 */
export class DatabaseService {
  private db: Database | null = null;
  private isInitialized: boolean = false;
  private readonly config: DatabaseConfig;

  constructor(config: DatabaseConfig = {}) {
    this.config = {
      enableForeignKeys: true,
      walMode: true,
      busyTimeout: 30000,
      ...config,
    };
  }

  /**
   * Initialize database connection and schema
   * @returns Promise<void>
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Get user data directory
      const userDataPath = app.getPath('userData');
      const dbPath =
        this.config.dbPath || path.join(userDataPath, 'collabcut.db');

      console.log('Database path:', dbPath);

      // Ensure directory exists
      const dbDir = path.dirname(dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      // Create database connection
      this.db = new Database(dbPath, (err) => {
        if (err) {
          console.error('Error opening database:', err);
          throw err;
        }
        console.log('Connected to SQLite database');
      });

      // Configure database settings
      await this.configurePragmas();

      // Read and execute schema
      const schemaPath = path.join(__dirname, '../database/schema.sql');
      if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, 'utf8');
        await this.executeScript(schema);
      } else {
        console.warn('Schema file not found, skipping schema initialization');
      }

      this.isInitialized = true;
      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw error;
    }
  }

  /**
   * Configure SQLite pragmas for optimal performance and safety
   * @private
   */
  private async configurePragmas(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const pragmas = [
      'PRAGMA journal_mode = WAL',
      'PRAGMA synchronous = NORMAL',
      'PRAGMA cache_size = 1000',
      'PRAGMA temp_store = memory',
      `PRAGMA busy_timeout = ${this.config.busyTimeout}`,
    ];

    if (this.config.enableForeignKeys) {
      pragmas.push('PRAGMA foreign_keys = ON');
    }

    for (const pragma of pragmas) {
      await this.run(pragma);
    }
  }

  /**
   * Execute SQL script (multiple statements)
   * @param script - SQL script to execute
   * @returns Promise<void>
   */
  executeScript(script: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      this.db.exec(script, (err) => {
        if (err) {
          console.error('Error executing script:', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Execute INSERT, UPDATE, DELETE statements
   * @param sql - SQL statement
   * @param params - Parameters for prepared statement
   * @returns Promise<QueryResult>
   */
  run(sql: string, params: any[] = []): Promise<QueryResult> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      this.db.run(sql, params, function (err) {
        if (err) {
          console.error('SQL Error:', err, 'Query:', sql, 'Params:', params);
          reject(err);
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    });
  }

  /**
   * Execute SELECT statement returning single row
   * @param sql - SQL statement
   * @param params - Parameters for prepared statement
   * @returns Promise<any | undefined>
   */
  get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      this.db.get(sql, params, (err, row: T) => {
        if (err) {
          console.error('SQL Error:', err, 'Query:', sql, 'Params:', params);
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  /**
   * Execute SELECT statement returning all rows
   * @param sql - SQL statement
   * @param params - Parameters for prepared statement
   * @returns Promise<any[]>
   */
  all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      this.db.all(sql, params, (err, rows: T[]) => {
        if (err) {
          console.error('SQL Error:', err, 'Query:', sql, 'Params:', params);
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  /**
   * Execute multiple operations in a transaction
   * @param callback - Transaction operations
   * @returns Promise<T>
   */
  async transaction<T>(
    callback: TransactionCallback<T>
  ): Promise<DatabaseResult<T>> {
    if (!this.db) {
      return { success: false, error: 'Database not initialized' };
    }

    try {
      await this.run('BEGIN TRANSACTION');
      const result = await callback();
      await this.run('COMMIT');
      return { success: true, data: result };
    } catch (error) {
      try {
        await this.run('ROLLBACK');
      } catch (rollbackError) {
        console.error('Rollback failed:', rollbackError);
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Transaction failed',
      };
    }
  }

  /**
   * Check if database is connected and ready
   * @returns boolean
   */
  isConnected(): boolean {
    return this.isInitialized && this.db !== null;
  }

  /**
   * Get database instance (use with caution)
   * @returns Database | null
   */
  getDatabase(): Database | null {
    return this.db;
  }

  /**
   * Execute database backup
   * @param backupPath - Path for backup file
   * @returns Promise<void>
   */
  async backup(backupPath: string): Promise<DatabaseResult<void>> {
    if (!this.db) {
      return { success: false, error: 'Database not initialized' };
    }

    try {
      // Ensure backup directory exists
      const backupDir = path.dirname(backupPath);
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      // Use SQLite backup API
      const backupDb = new Database(backupPath);

      return new Promise((resolve) => {
        // Use type assertion for backup method that's not in @types/sqlite3
        const backup = (this.db as any).backup(
          backupDb,
          'main',
          'main',
          (err: Error | null) => {
            backupDb.close();
            if (err) {
              resolve({ success: false, error: err.message });
            } else {
              resolve({ success: true });
            }
          }
        );

        backup.step(-1); // Copy all pages
        backup.finish();
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Backup failed',
      };
    }
  }

  /**
   * Get database statistics
   * @returns Promise<DatabaseResult<any>>
   */
  async getStats(): Promise<DatabaseResult<any>> {
    try {
      const stats = await this.get(`
        SELECT 
          (SELECT COUNT(*) FROM projects WHERE status != 'deleted') as total_projects,
          (SELECT COUNT(*) FROM users) as total_users,
          (SELECT COUNT(*) FROM media_assets) as total_media_assets,
          (SELECT COUNT(*) FROM timeline_sequences) as total_sequences,
          (SELECT COUNT(*) FROM clips) as total_clips,
          (SELECT COUNT(*) FROM comments WHERE status != 'deleted') as total_comments
      `);

      return { success: true, data: stats };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get stats',
      };
    }
  }

  /**
   * Vacuum database to optimize storage
   * @returns Promise<DatabaseResult<void>>
   */
  async vacuum(): Promise<DatabaseResult<void>> {
    try {
      await this.run('VACUUM');
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Vacuum failed',
      };
    }
  }

  /**
   * Analyze database for query optimization
   * @returns Promise<DatabaseResult<void>>
   */
  async analyze(): Promise<DatabaseResult<void>> {
    try {
      await this.run('ANALYZE');
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Analyze failed',
      };
    }
  }

  /**
   * Generate unique ID for database records
   * @param prefix - Optional prefix for the ID
   * @returns string
   */
  generateId(prefix: string = 'id'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Close database connection
   * @returns Promise<void>
   */
  async close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            console.error('Error closing database:', err);
          } else {
            console.log('Database connection closed');
          }
          this.db = null;
          this.isInitialized = false;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

// Singleton instance
export const databaseService = new DatabaseService();
export default databaseService;
