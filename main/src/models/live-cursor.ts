/**
 * LiveCursor Model (T029)
 * Real-time indicator showing other users' current editing positions.
 * Handles cursor tracking, activity types, and collaborative awareness.
 */

import { Database } from 'sqlite3';
import {
  BaseModel,
  ActivityType,
  ValidationError,
  DatabaseResult,
  ModelValidator,
} from '../../../shared/types/database';

/** Live cursor entity interface */
export interface LiveCursor extends BaseModel {
  user_id: string;
  project_id: string;
  sequence_id: string;
  position: number;
  active: boolean;
  last_updated: Date;
  color: string;
  activity_type: ActivityType;
}

/** Live cursor creation data */
export interface CreateLiveCursorData {
  user_id: string;
  project_id: string;
  sequence_id: string;
  position: number;
  color: string;
  activity_type?: ActivityType;
}

/** Live cursor update data */
export interface UpdateLiveCursorData {
  position?: number;
  active?: boolean;
  activity_type?: ActivityType;
}

/** Live cursor with user information */
export interface LiveCursorWithUser extends LiveCursor {
  user?: {
    id: string;
    username: string;
    display_name: string;
    avatar_url?: string;
  };
}

/** Cursor position data for real-time updates */
export interface CursorPosition {
  user_id: string;
  sequence_id: string;
  position: number;
  activity_type: ActivityType;
  timestamp: Date;
}

/** Active cursors summary for a sequence */
export interface ActiveCursors {
  sequence_id: string;
  cursors: LiveCursorWithUser[];
  total_active: number;
  last_activity: Date;
}

/**
 * LiveCursor Model Class
 * Handles CRUD operations, real-time updates, and validation for live cursors
 */
export class LiveCursorModel implements ModelValidator<LiveCursor> {
  private db: Database;
  private readonly CURSOR_TIMEOUT_MS = 30000; // 30 seconds
  private readonly CURSOR_COLORS = [
    '#FF6B6B',
    '#4ECDC4',
    '#45B7D1',
    '#96CEB4',
    '#FECA57',
    '#FF9FF3',
    '#54A0FF',
    '#5F27CD',
    '#00D2D3',
    '#FF9F43',
    '#10AC84',
    '#EE5A6F',
    '#C44569',
    '#F8B500',
    '#6C5CE7',
  ];

  constructor(database: Database) {
    this.db = database;
    // Start cleanup interval for inactive cursors
    this.startCleanupInterval();
  }

  /**
   * Validate live cursor data
   * @param data - Live cursor data to validate
   * @returns Array of validation errors
   */
  validate(data: Partial<CreateLiveCursorData>): ValidationError[] {
    const errors: ValidationError[] = [];

    // User ID validation
    if (!data.user_id) {
      errors.push(new ValidationError('user_id', 'User ID is required'));
    }

    // Project ID validation
    if (!data.project_id) {
      errors.push(new ValidationError('project_id', 'Project ID is required'));
    }

    // Sequence ID validation
    if (!data.sequence_id) {
      errors.push(
        new ValidationError('sequence_id', 'Sequence ID is required')
      );
    }

    // Position validation
    if (data.position === undefined || data.position === null) {
      errors.push(new ValidationError('position', 'Position is required'));
    } else if (data.position < 0) {
      errors.push(
        new ValidationError('position', 'Position cannot be negative')
      );
    }

    // Color validation
    if (!data.color) {
      errors.push(new ValidationError('color', 'Color is required'));
    } else if (!this.isValidHexColor(data.color)) {
      errors.push(
        new ValidationError('color', 'Color must be a valid hex color code')
      );
    }

    // Activity type validation
    if (
      data.activity_type !== undefined &&
      !Object.values(ActivityType).includes(data.activity_type)
    ) {
      errors.push(
        new ValidationError('activity_type', 'Invalid activity type')
      );
    }

    return errors;
  }

  /**
   * Validate live cursor update data
   * @param data - Live cursor update data to validate
   * @returns Array of validation errors
   */
  validateUpdate(data: Partial<UpdateLiveCursorData>): ValidationError[] {
    const errors: ValidationError[] = [];

    // Position validation (if provided)
    if (data.position !== undefined && data.position < 0) {
      errors.push(
        new ValidationError('position', 'Position cannot be negative')
      );
    }

    // Activity type validation (if provided)
    if (
      data.activity_type !== undefined &&
      !Object.values(ActivityType).includes(data.activity_type)
    ) {
      errors.push(
        new ValidationError('activity_type', 'Invalid activity type')
      );
    }

    return errors;
  }

  /**
   * Create or update live cursor
   * @param data - Live cursor creation data
   * @returns Promise with created/updated live cursor or error
   */
  async upsert(
    data: CreateLiveCursorData
  ): Promise<DatabaseResult<LiveCursor>> {
    const validationErrors = this.validate(data);
    if (validationErrors.length > 0) {
      return {
        success: false,
        error: validationErrors.map((e) => e.message).join(', '),
      };
    }

    try {
      // Check if cursor already exists for this user/sequence combination
      const existingCursor = await this.findByUserAndSequence(
        data.user_id,
        data.sequence_id
      );

      if (existingCursor.success && existingCursor.data) {
        // Update existing cursor
        return this.update(existingCursor.data.id, {
          position: data.position,
          active: true,
          activity_type: data.activity_type || ActivityType.VIEWING,
        });
      } else {
        // Create new cursor
        return this.create(data);
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Create a new live cursor
   * @param data - Live cursor creation data
   * @returns Promise with created live cursor or error
   */
  async create(
    data: CreateLiveCursorData
  ): Promise<DatabaseResult<LiveCursor>> {
    try {
      const id = this.generateId();
      const now = new Date();
      const activityType = data.activity_type || ActivityType.VIEWING;

      return new Promise((resolve) => {
        const stmt = this.db.prepare(`
          INSERT INTO live_cursors (
            id, user_id, project_id, sequence_id, position, active,
            last_updated, color, activity_type, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          [
            id,
            data.user_id,
            data.project_id,
            data.sequence_id,
            data.position,
            1, // active = true
            now.toISOString(),
            data.color,
            activityType,
            now.toISOString(),
          ],
          function (err) {
            if (err) {
              resolve({ success: false, error: err.message });
            } else {
              resolve({
                success: true,
                data: {
                  id,
                  user_id: data.user_id,
                  project_id: data.project_id,
                  sequence_id: data.sequence_id,
                  position: data.position,
                  active: true,
                  last_updated: now,
                  color: data.color,
                  activity_type: activityType,
                  created_at: now,
                },
              });
            }
          }
        );
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Find live cursor by ID
   * @param id - Live cursor ID
   * @returns Promise with live cursor or error
   */
  async findById(id: string): Promise<DatabaseResult<LiveCursor>> {
    try {
      return new Promise((resolve) => {
        this.db.get(
          'SELECT * FROM live_cursors WHERE id = ?',
          [id],
          (err, row: any) => {
            if (err) {
              resolve({ success: false, error: err.message });
            } else if (!row) {
              resolve({ success: false, error: 'Live cursor not found' });
            } else {
              resolve({
                success: true,
                data: this.mapRowToLiveCursor(row),
              });
            }
          }
        );
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Find live cursor by user and sequence
   * @param userId - User ID
   * @param sequenceId - Sequence ID
   * @returns Promise with live cursor or error
   */
  async findByUserAndSequence(
    userId: string,
    sequenceId: string
  ): Promise<DatabaseResult<LiveCursor>> {
    try {
      return new Promise((resolve) => {
        this.db.get(
          'SELECT * FROM live_cursors WHERE user_id = ? AND sequence_id = ?',
          [userId, sequenceId],
          (err, row: any) => {
            if (err) {
              resolve({ success: false, error: err.message });
            } else if (!row) {
              resolve({ success: false, error: 'Live cursor not found' });
            } else {
              resolve({
                success: true,
                data: this.mapRowToLiveCursor(row),
              });
            }
          }
        );
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Find active cursors by sequence ID
   * @param sequenceId - Timeline sequence ID
   * @param excludeUserId - User ID to exclude from results
   * @returns Promise with active cursors or error
   */
  async findActiveBySequenceId(
    sequenceId: string,
    excludeUserId?: string
  ): Promise<DatabaseResult<LiveCursorWithUser[]>> {
    try {
      let query = `
        SELECT lc.*, u.username, u.display_name, u.avatar_url
        FROM live_cursors lc
        JOIN users u ON lc.user_id = u.id
        WHERE lc.sequence_id = ? AND lc.active = 1
        AND lc.last_updated > datetime('now', '-30 seconds')
      `;
      const params: any[] = [sequenceId];

      if (excludeUserId) {
        query += ' AND lc.user_id != ?';
        params.push(excludeUserId);
      }

      query += ' ORDER BY lc.last_updated DESC';

      return new Promise((resolve) => {
        this.db.all(query, params, (err, rows: any[]) => {
          if (err) {
            resolve({ success: false, error: err.message });
          } else {
            const cursors = rows.map((row) =>
              this.mapRowToLiveCursorWithUser(row)
            );
            resolve({ success: true, data: cursors });
          }
        });
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Find active cursors by project ID
   * @param projectId - Project ID
   * @param excludeUserId - User ID to exclude from results
   * @returns Promise with active cursors grouped by sequence
   */
  async findActiveByProjectId(
    projectId: string,
    excludeUserId?: string
  ): Promise<DatabaseResult<ActiveCursors[]>> {
    try {
      let query = `
        SELECT lc.*, u.username, u.display_name, u.avatar_url
        FROM live_cursors lc
        JOIN users u ON lc.user_id = u.id
        WHERE lc.project_id = ? AND lc.active = 1
        AND lc.last_updated > datetime('now', '-30 seconds')
      `;
      const params: any[] = [projectId];

      if (excludeUserId) {
        query += ' AND lc.user_id != ?';
        params.push(excludeUserId);
      }

      query += ' ORDER BY lc.sequence_id, lc.last_updated DESC';

      return new Promise((resolve) => {
        this.db.all(query, params, (err, rows: any[]) => {
          if (err) {
            resolve({ success: false, error: err.message });
          } else {
            // Group cursors by sequence
            const cursorsBySequence = new Map<string, LiveCursorWithUser[]>();
            let latestActivity = new Date(0);

            rows.forEach((row) => {
              const cursor = this.mapRowToLiveCursorWithUser(row);
              if (!cursorsBySequence.has(cursor.sequence_id)) {
                cursorsBySequence.set(cursor.sequence_id, []);
              }
              cursorsBySequence.get(cursor.sequence_id)!.push(cursor);

              if (cursor.last_updated > latestActivity) {
                latestActivity = cursor.last_updated;
              }
            });

            const result: ActiveCursors[] = Array.from(
              cursorsBySequence.entries()
            ).map(([sequenceId, cursors]) => ({
              sequence_id: sequenceId,
              cursors: cursors,
              total_active: cursors.length,
              last_activity: cursors.reduce(
                (latest, cursor) =>
                  cursor.last_updated > latest ? cursor.last_updated : latest,
                new Date(0)
              ),
            }));

            resolve({ success: true, data: result });
          }
        });
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Update live cursor
   * @param id - Live cursor ID
   * @param data - Update data
   * @returns Promise with updated live cursor or error
   */
  async update(
    id: string,
    data: UpdateLiveCursorData
  ): Promise<DatabaseResult<LiveCursor>> {
    const validationErrors = this.validateUpdate(data);
    if (validationErrors.length > 0) {
      return {
        success: false,
        error: validationErrors.map((e) => e.message).join(', '),
      };
    }

    try {
      const updates: string[] = [];
      const values: any[] = [];

      if (data.position !== undefined) {
        updates.push('position = ?');
        values.push(data.position);
      }
      if (data.active !== undefined) {
        updates.push('active = ?');
        values.push(data.active ? 1 : 0);
      }
      if (data.activity_type !== undefined) {
        updates.push('activity_type = ?');
        values.push(data.activity_type);
      }

      // Always update last_updated timestamp
      updates.push('last_updated = ?');
      values.push(new Date().toISOString());
      values.push(id);

      return new Promise((resolve) => {
        this.db.run(
          `UPDATE live_cursors SET ${updates.join(', ')} WHERE id = ?`,
          values,
          function (err) {
            if (err) {
              resolve({ success: false, error: err.message });
            } else if (this.changes === 0) {
              resolve({ success: false, error: 'Live cursor not found' });
            } else {
              resolve({ success: true, data: undefined });
            }
          }
        );
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Update cursor position
   * @param userId - User ID
   * @param sequenceId - Sequence ID
   * @param position - New position
   * @param activityType - Activity type
   * @returns Promise with success status
   */
  async updatePosition(
    userId: string,
    sequenceId: string,
    position: number,
    activityType: ActivityType = ActivityType.VIEWING
  ): Promise<DatabaseResult<boolean>> {
    try {
      const cursor = await this.findByUserAndSequence(userId, sequenceId);
      if (!cursor.success || !cursor.data) {
        return { success: false, error: 'Cursor not found' };
      }

      const updateResult = await this.update(cursor.data.id, {
        position,
        active: true,
        activity_type: activityType,
      });

      return {
        success: updateResult.success,
        data: updateResult.success,
        error: updateResult.error,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Deactivate cursor for user
   * @param userId - User ID
   * @param sequenceId - Sequence ID (optional, deactivates all if not provided)
   * @returns Promise with success status
   */
  async deactivate(
    userId: string,
    sequenceId?: string
  ): Promise<DatabaseResult<boolean>> {
    try {
      let query =
        'UPDATE live_cursors SET active = 0, last_updated = ? WHERE user_id = ?';
      const params = [new Date().toISOString(), userId];

      if (sequenceId) {
        query += ' AND sequence_id = ?';
        params.push(sequenceId);
      }

      return new Promise((resolve) => {
        this.db.run(query, params, function (err) {
          if (err) {
            resolve({ success: false, error: err.message });
          } else {
            resolve({ success: true, data: true });
          }
        });
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get available cursor color for user
   * @param projectId - Project ID
   * @param userId - User ID
   * @returns Available color hex code
   */
  async getAvailableColor(projectId: string, userId: string): Promise<string> {
    try {
      // Get colors currently in use
      const usedColors = await new Promise<string[]>((resolve) => {
        this.db.all(
          'SELECT DISTINCT color FROM live_cursors WHERE project_id = ? AND user_id != ? AND active = 1',
          [projectId, userId],
          (err, rows: any[]) => {
            if (err) {
              resolve([]);
            } else {
              resolve(rows.map((row) => row.color));
            }
          }
        );
      });

      // Find first available color
      for (const color of this.CURSOR_COLORS) {
        if (!usedColors.includes(color)) {
          return color;
        }
      }

      // If all colors are used, return a random one
      return this.CURSOR_COLORS[
        Math.floor(Math.random() * this.CURSOR_COLORS.length)
      ];
    } catch {
      // Fallback to first color if there's an error
      return this.CURSOR_COLORS[0];
    }
  }

  /**
   * Clean up inactive cursors
   * @returns Promise with number of cleaned cursors
   */
  async cleanupInactive(): Promise<DatabaseResult<number>> {
    try {
      const cutoffTime = new Date(Date.now() - this.CURSOR_TIMEOUT_MS);

      return new Promise((resolve) => {
        this.db.run(
          'UPDATE live_cursors SET active = 0 WHERE last_updated < ?',
          [cutoffTime.toISOString()],
          function (err) {
            if (err) {
              resolve({ success: false, error: err.message });
            } else {
              resolve({ success: true, data: this.changes });
            }
          }
        );
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Delete old inactive cursors
   * @returns Promise with number of deleted cursors
   */
  async deleteOldCursors(): Promise<DatabaseResult<number>> {
    try {
      const cutoffTime = new Date(Date.now() - this.CURSOR_TIMEOUT_MS * 10); // 5 minutes old

      return new Promise((resolve) => {
        this.db.run(
          'DELETE FROM live_cursors WHERE active = 0 AND last_updated < ?',
          [cutoffTime.toISOString()],
          function (err) {
            if (err) {
              resolve({ success: false, error: err.message });
            } else {
              resolve({ success: true, data: this.changes });
            }
          }
        );
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Start cleanup interval for inactive cursors
   */
  private startCleanupInterval(): void {
    setInterval(async () => {
      await this.cleanupInactive();
      await this.deleteOldCursors();
    }, 60000); // Run every minute
  }

  /**
   * Validate hex color format
   * @param color - Color string to validate
   * @returns Boolean indicating if valid
   */
  private isValidHexColor(color: string): boolean {
    const hexColorPattern = /^#[0-9A-Fa-f]{6}$/;
    return hexColorPattern.test(color);
  }

  /**
   * Map database row to LiveCursor object
   * @param row - Database row
   * @returns LiveCursor object
   */
  private mapRowToLiveCursor(row: any): LiveCursor {
    return {
      id: row.id,
      user_id: row.user_id,
      project_id: row.project_id,
      sequence_id: row.sequence_id,
      position: row.position,
      active: Boolean(row.active),
      last_updated: new Date(row.last_updated),
      color: row.color,
      activity_type: row.activity_type as ActivityType,
      created_at: new Date(row.created_at),
    };
  }

  /**
   * Map database row to LiveCursorWithUser object
   * @param row - Database row with user information
   * @returns LiveCursorWithUser object
   */
  private mapRowToLiveCursorWithUser(row: any): LiveCursorWithUser {
    return {
      ...this.mapRowToLiveCursor(row),
      user: {
        id: row.user_id,
        username: row.username,
        display_name: row.display_name,
        avatar_url: row.avatar_url,
      },
    };
  }

  /**
   * Generate unique ID for new live cursors
   * @returns Unique string ID
   */
  private generateId(): string {
    return `cursor-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
