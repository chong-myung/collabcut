/**
 * Comment Model (T028)
 * User feedback attached to specific clips or timeline positions.
 * Supports threading, status tracking, and timeline-based comments.
 */

import { Database } from 'sqlite3';
import {
  BaseModel,
  UpdatableModel,
  CommentStatus,
  ValidationError,
  DatabaseResult,
  PaginationOptions,
  ModelValidator,
} from '../../../shared/types/database';

/** Comment entity interface */
export interface Comment extends UpdatableModel {
  project_id: string;
  clip_id?: string;
  sequence_id?: string;
  author_id: string;
  content: string;
  timestamp?: number;
  status: CommentStatus;
  reply_to?: string;
}

/** Comment creation data */
export interface CreateCommentData {
  project_id: string;
  clip_id?: string;
  sequence_id?: string;
  author_id: string;
  content: string;
  timestamp?: number;
  reply_to?: string;
}

/** Comment update data */
export interface UpdateCommentData {
  content?: string;
  status?: CommentStatus;
  timestamp?: number;
}

/** Comment with author information */
export interface CommentWithAuthor extends Comment {
  author?: {
    id: string;
    username: string;
    display_name: string;
    avatar_url?: string;
  };
}

/** Comment with replies (threaded comments) */
export interface CommentWithReplies extends CommentWithAuthor {
  replies?: CommentWithAuthor[];
  reply_count?: number;
}

/** Comment thread structure */
export interface CommentThread {
  parent: CommentWithAuthor;
  replies: CommentWithAuthor[];
  total_replies: number;
}

/** Comment statistics for a project/clip/sequence */
export interface CommentStats {
  total_comments: number;
  active_comments: number;
  resolved_comments: number;
  unread_comments: number;
}

/**
 * Comment Model Class
 * Handles CRUD operations, threading, and validation for comments
 */
export class CommentModel implements ModelValidator<Comment> {
  private db: Database;

  constructor(database: Database) {
    this.db = database;
  }

  /**
   * Validate comment data
   * @param data - Comment data to validate
   * @returns Array of validation errors
   */
  validate(data: Partial<CreateCommentData>): ValidationError[] {
    const errors: ValidationError[] = [];

    // Project ID validation
    if (!data.project_id) {
      errors.push(new ValidationError('project_id', 'Project ID is required'));
    }

    // Target validation (must have either clip_id or sequence_id)
    if (!data.clip_id && !data.sequence_id) {
      errors.push(
        new ValidationError(
          'target',
          'Either clip_id or sequence_id must be specified'
        )
      );
    }

    if (data.clip_id && data.sequence_id) {
      errors.push(
        new ValidationError(
          'target',
          'Cannot specify both clip_id and sequence_id'
        )
      );
    }

    // Author validation
    if (!data.author_id) {
      errors.push(new ValidationError('author_id', 'Author ID is required'));
    }

    // Content validation
    if (!data.content) {
      errors.push(
        new ValidationError('content', 'Comment content is required')
      );
    } else if (data.content.trim().length === 0) {
      errors.push(
        new ValidationError('content', 'Comment content cannot be empty')
      );
    } else if (data.content.length > 5000) {
      errors.push(
        new ValidationError(
          'content',
          'Comment content cannot exceed 5000 characters'
        )
      );
    }

    // Timestamp validation
    if (data.timestamp !== undefined && data.timestamp < 0) {
      errors.push(
        new ValidationError('timestamp', 'Timestamp cannot be negative')
      );
    }

    return errors;
  }

  /**
   * Validate comment update data
   * @param data - Comment update data to validate
   * @returns Array of validation errors
   */
  validateUpdate(data: Partial<UpdateCommentData>): ValidationError[] {
    const errors: ValidationError[] = [];

    // Content validation (if provided)
    if (data.content !== undefined) {
      if (data.content.trim().length === 0) {
        errors.push(
          new ValidationError('content', 'Comment content cannot be empty')
        );
      } else if (data.content.length > 5000) {
        errors.push(
          new ValidationError(
            'content',
            'Comment content cannot exceed 5000 characters'
          )
        );
      }
    }

    // Status validation (if provided)
    if (
      data.status !== undefined &&
      !Object.values(CommentStatus).includes(data.status)
    ) {
      errors.push(new ValidationError('status', 'Invalid comment status'));
    }

    // Timestamp validation (if provided)
    if (data.timestamp !== undefined && data.timestamp < 0) {
      errors.push(
        new ValidationError('timestamp', 'Timestamp cannot be negative')
      );
    }

    return errors;
  }

  /**
   * Create a new comment
   * @param data - Comment creation data
   * @returns Promise with created comment or error
   */
  async create(data: CreateCommentData): Promise<DatabaseResult<Comment>> {
    const validationErrors = this.validate(data);
    if (validationErrors.length > 0) {
      return {
        success: false,
        error: validationErrors.map((e) => e.message).join(', '),
      };
    }

    try {
      // If this is a reply, validate the parent comment exists
      if (data.reply_to) {
        const parentComment = await this.findById(data.reply_to);
        if (!parentComment.success || !parentComment.data) {
          return { success: false, error: 'Parent comment not found' };
        }

        // Ensure reply is in the same project
        if (parentComment.data.project_id !== data.project_id) {
          return {
            success: false,
            error: 'Reply must be in the same project as parent comment',
          };
        }
      }

      const id = this.generateId();
      const now = new Date();

      return new Promise((resolve) => {
        const stmt = this.db.prepare(`
          INSERT INTO comments (
            id, project_id, clip_id, sequence_id, author_id, content,
            timestamp, status, reply_to, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          [
            id,
            data.project_id,
            data.clip_id || null,
            data.sequence_id || null,
            data.author_id,
            data.content,
            data.timestamp || null,
            CommentStatus.ACTIVE,
            data.reply_to || null,
            now.toISOString(),
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
                  project_id: data.project_id,
                  clip_id: data.clip_id,
                  sequence_id: data.sequence_id,
                  author_id: data.author_id,
                  content: data.content,
                  timestamp: data.timestamp,
                  status: CommentStatus.ACTIVE,
                  reply_to: data.reply_to,
                  created_at: now,
                  updated_at: now,
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
   * Find comment by ID
   * @param id - Comment ID
   * @returns Promise with comment or error
   */
  async findById(id: string): Promise<DatabaseResult<Comment>> {
    try {
      return new Promise((resolve) => {
        this.db.get(
          'SELECT * FROM comments WHERE id = ?',
          [id],
          (err, row: any) => {
            if (err) {
              resolve({ success: false, error: err.message });
            } else if (!row) {
              resolve({ success: false, error: 'Comment not found' });
            } else {
              resolve({
                success: true,
                data: this.mapRowToComment(row),
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
   * Find comments by project ID
   * @param projectId - Project ID
   * @param options - Pagination and filtering options
   * @returns Promise with comments array or error
   */
  async findByProjectId(
    projectId: string,
    options: PaginationOptions & {
      status?: CommentStatus;
      includeReplies?: boolean;
    } = {}
  ): Promise<DatabaseResult<CommentWithAuthor[]>> {
    try {
      const limit = options.limit || 50;
      const offset = options.offset || 0;
      const orderBy = options.orderBy || 'created_at';
      const orderDirection = options.orderDirection || 'DESC';
      const includeReplies = options.includeReplies !== false;

      let query = `
        SELECT c.*, u.username, u.display_name, u.avatar_url
        FROM comments c
        JOIN users u ON c.author_id = u.id
        WHERE c.project_id = ?
      `;
      const params: any[] = [projectId];

      // Filter by status if provided
      if (options.status) {
        query += ' AND c.status = ?';
        params.push(options.status);
      }

      // Exclude replies unless specifically requested
      if (!includeReplies) {
        query += ' AND c.reply_to IS NULL';
      }

      query += ` ORDER BY c.${orderBy} ${orderDirection} LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      return new Promise((resolve) => {
        this.db.all(query, params, (err, rows: any[]) => {
          if (err) {
            resolve({ success: false, error: err.message });
          } else {
            const comments = rows.map((row) =>
              this.mapRowToCommentWithAuthor(row)
            );
            resolve({ success: true, data: comments });
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
   * Find comments by clip ID
   * @param clipId - Clip ID
   * @param options - Pagination options
   * @returns Promise with comments array or error
   */
  async findByClipId(
    clipId: string,
    options: PaginationOptions = {}
  ): Promise<DatabaseResult<CommentWithAuthor[]>> {
    try {
      const limit = options.limit || 50;
      const offset = options.offset || 0;

      return new Promise((resolve) => {
        this.db.all(
          `
          SELECT c.*, u.username, u.display_name, u.avatar_url
          FROM comments c
          JOIN users u ON c.author_id = u.id
          WHERE c.clip_id = ? AND c.status != ?
          ORDER BY c.created_at ASC
          LIMIT ? OFFSET ?
        `,
          [clipId, CommentStatus.DELETED, limit, offset],
          (err, rows: any[]) => {
            if (err) {
              resolve({ success: false, error: err.message });
            } else {
              const comments = rows.map((row) =>
                this.mapRowToCommentWithAuthor(row)
              );
              resolve({ success: true, data: comments });
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
   * Find comments by sequence ID
   * @param sequenceId - Timeline sequence ID
   * @param options - Pagination options
   * @returns Promise with comments array or error
   */
  async findBySequenceId(
    sequenceId: string,
    options: PaginationOptions = {}
  ): Promise<DatabaseResult<CommentWithAuthor[]>> {
    try {
      const limit = options.limit || 50;
      const offset = options.offset || 0;

      return new Promise((resolve) => {
        this.db.all(
          `
          SELECT c.*, u.username, u.display_name, u.avatar_url
          FROM comments c
          JOIN users u ON c.author_id = u.id
          WHERE c.sequence_id = ? AND c.status != ?
          ORDER BY c.timestamp ASC, c.created_at ASC
          LIMIT ? OFFSET ?
        `,
          [sequenceId, CommentStatus.DELETED, limit, offset],
          (err, rows: any[]) => {
            if (err) {
              resolve({ success: false, error: err.message });
            } else {
              const comments = rows.map((row) =>
                this.mapRowToCommentWithAuthor(row)
              );
              resolve({ success: true, data: comments });
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
   * Find comment thread (parent with all replies)
   * @param parentId - Parent comment ID
   * @returns Promise with comment thread or error
   */
  async findThread(parentId: string): Promise<DatabaseResult<CommentThread>> {
    try {
      const parentResult = await this.findById(parentId);
      if (!parentResult.success || !parentResult.data) {
        return { success: false, error: 'Parent comment not found' };
      }

      return new Promise((resolve) => {
        this.db.all(
          `
          SELECT c.*, u.username, u.display_name, u.avatar_url
          FROM comments c
          JOIN users u ON c.author_id = u.id
          WHERE c.reply_to = ? AND c.status != ?
          ORDER BY c.created_at ASC
        `,
          [parentId, CommentStatus.DELETED],
          (err, rows: any[]) => {
            if (err) {
              resolve({ success: false, error: err.message });
            } else {
              const replies = rows.map((row) =>
                this.mapRowToCommentWithAuthor(row)
              );

              // Get parent with author info
              this.db.get(
                `
              SELECT c.*, u.username, u.display_name, u.avatar_url
              FROM comments c
              JOIN users u ON c.author_id = u.id
              WHERE c.id = ?
            `,
                [parentId],
                (parentErr, parentRow: any) => {
                  if (parentErr) {
                    resolve({ success: false, error: parentErr.message });
                  } else {
                    const parent = this.mapRowToCommentWithAuthor(parentRow);
                    resolve({
                      success: true,
                      data: {
                        parent,
                        replies,
                        total_replies: replies.length,
                      },
                    });
                  }
                }
              );
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
   * Find replies to a comment
   * @param parentId - Parent comment ID
   * @param options - Pagination options
   * @returns Promise with replies array or error
   */
  async findReplies(
    parentId: string,
    options: PaginationOptions = {}
  ): Promise<DatabaseResult<CommentWithAuthor[]>> {
    try {
      const limit = options.limit || 50;
      const offset = options.offset || 0;

      return new Promise((resolve) => {
        this.db.all(
          `
          SELECT c.*, u.username, u.display_name, u.avatar_url
          FROM comments c
          JOIN users u ON c.author_id = u.id
          WHERE c.reply_to = ? AND c.status != ?
          ORDER BY c.created_at ASC
          LIMIT ? OFFSET ?
        `,
          [parentId, CommentStatus.DELETED, limit, offset],
          (err, rows: any[]) => {
            if (err) {
              resolve({ success: false, error: err.message });
            } else {
              const replies = rows.map((row) =>
                this.mapRowToCommentWithAuthor(row)
              );
              resolve({ success: true, data: replies });
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
   * Update comment
   * @param id - Comment ID
   * @param data - Update data
   * @returns Promise with updated comment or error
   */
  async update(
    id: string,
    data: UpdateCommentData
  ): Promise<DatabaseResult<Comment>> {
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

      if (data.content !== undefined) {
        updates.push('content = ?');
        values.push(data.content);
      }
      if (data.status !== undefined) {
        updates.push('status = ?');
        values.push(data.status);
      }
      if (data.timestamp !== undefined) {
        updates.push('timestamp = ?');
        values.push(data.timestamp);
      }

      if (updates.length === 0) {
        return { success: false, error: 'No fields to update' };
      }

      updates.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(id);

      return new Promise((resolve) => {
        this.db.run(
          `UPDATE comments SET ${updates.join(', ')} WHERE id = ?`,
          values,
          function (err) {
            if (err) {
              resolve({ success: false, error: err.message });
            } else if (this.changes === 0) {
              resolve({ success: false, error: 'Comment not found' });
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
   * Resolve comment (set status to resolved)
   * @param id - Comment ID
   * @returns Promise with success status
   */
  async resolve(id: string): Promise<DatabaseResult<boolean>> {
    return this.updateStatus(id, CommentStatus.RESOLVED);
  }

  /**
   * Reopen comment (set status to active)
   * @param id - Comment ID
   * @returns Promise with success status
   */
  async reopen(id: string): Promise<DatabaseResult<boolean>> {
    return this.updateStatus(id, CommentStatus.ACTIVE);
  }

  /**
   * Delete comment (soft delete - set status to deleted)
   * @param id - Comment ID
   * @returns Promise with success status
   */
  async delete(id: string): Promise<DatabaseResult<boolean>> {
    return this.updateStatus(id, CommentStatus.DELETED);
  }

  /**
   * Get comment statistics for a project
   * @param projectId - Project ID
   * @returns Promise with comment statistics
   */
  async getProjectStats(
    projectId: string
  ): Promise<DatabaseResult<CommentStats>> {
    try {
      return new Promise((resolve) => {
        this.db.get(
          `
          SELECT
            COUNT(*) as total_comments,
            COUNT(CASE WHEN status = 'active' THEN 1 END) as active_comments,
            COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved_comments,
            0 as unread_comments
          FROM comments
          WHERE project_id = ? AND status != 'deleted'
        `,
          [projectId],
          (err, row: any) => {
            if (err) {
              resolve({ success: false, error: err.message });
            } else {
              resolve({
                success: true,
                data: {
                  total_comments: row.total_comments,
                  active_comments: row.active_comments,
                  resolved_comments: row.resolved_comments,
                  unread_comments: row.unread_comments,
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
   * Update comment status
   * @param id - Comment ID
   * @param status - New status
   * @returns Promise with success status
   */
  private async updateStatus(
    id: string,
    status: CommentStatus
  ): Promise<DatabaseResult<boolean>> {
    try {
      return new Promise((resolve) => {
        this.db.run(
          'UPDATE comments SET status = ?, updated_at = ? WHERE id = ?',
          [status, new Date().toISOString(), id],
          function (err) {
            if (err) {
              resolve({ success: false, error: err.message });
            } else if (this.changes === 0) {
              resolve({ success: false, error: 'Comment not found' });
            } else {
              resolve({ success: true, data: true });
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
   * Map database row to Comment object
   * @param row - Database row
   * @returns Comment object
   */
  private mapRowToComment(row: any): Comment {
    return {
      id: row.id,
      project_id: row.project_id,
      clip_id: row.clip_id,
      sequence_id: row.sequence_id,
      author_id: row.author_id,
      content: row.content,
      timestamp: row.timestamp,
      status: row.status as CommentStatus,
      reply_to: row.reply_to,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }

  /**
   * Map database row to CommentWithAuthor object
   * @param row - Database row with user information
   * @returns CommentWithAuthor object
   */
  private mapRowToCommentWithAuthor(row: any): CommentWithAuthor {
    return {
      ...this.mapRowToComment(row),
      author: {
        id: row.author_id,
        username: row.username,
        display_name: row.display_name,
        avatar_url: row.avatar_url,
      },
    };
  }

  /**
   * Generate unique ID for new comments
   * @returns Unique string ID
   */
  private generateId(): string {
    return `comment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
