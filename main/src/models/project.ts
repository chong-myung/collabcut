/**
 * Project Model (T023)
 * Represents a video editing project containing all associated media,
 * timeline sequences, and collaboration data.
 */

import { Database } from 'sqlite3';
import {
  BaseModel,
  UpdatableModel,
  ProjectStatus,
  ValidationError,
  DatabaseResult,
  PaginationOptions,
  ModelValidator,
} from '../../../shared/types/database';

/** Project entity interface */
export interface Project extends UpdatableModel {
  name: string;
  description?: string;
  created_by: string;
  settings: ProjectSettings;
  status: ProjectStatus;
  cloud_sync_enabled: boolean;
  last_sync_at?: Date;
}

/** Project-specific settings interface */
export interface ProjectSettings {
  resolution?: string;
  framerate?: number;
  [key: string]: any;
}

/** Project creation data */
export interface CreateProjectData {
  name: string;
  description?: string;
  created_by: string;
  settings?: Partial<ProjectSettings>;
  cloud_sync_enabled?: boolean;
}

/** Project update data */
export interface UpdateProjectData {
  name?: string;
  description?: string;
  settings?: Partial<ProjectSettings>;
  status?: ProjectStatus;
  cloud_sync_enabled?: boolean;
}

/** Project with relationships */
export interface ProjectWithRelations extends Project {
  creator?: {
    id: string;
    display_name: string;
    username: string;
  };
  member_count?: number;
  media_count?: number;
  sequence_count?: number;
}

/**
 * Project Model Class
 * Handles CRUD operations and validation for projects
 */
export class ProjectModel implements ModelValidator<Project> {
  private db: Database;

  constructor(database: Database) {
    this.db = database;
  }

  /**
   * Validate project data
   * @param data - Project data to validate
   * @returns Array of validation errors
   */
  validate(data: Partial<CreateProjectData>): ValidationError[] {
    const errors: ValidationError[] = [];

    // Name validation
    if (!data.name) {
      errors.push(new ValidationError('name', 'Name is required'));
    } else if (data.name.length < 1 || data.name.length > 100) {
      errors.push(
        new ValidationError('name', 'Name must be between 1 and 100 characters')
      );
    }

    // Created by validation
    if (!data.created_by) {
      errors.push(
        new ValidationError('created_by', 'Creator user ID is required')
      );
    }

    // Settings validation
    if (data.settings) {
      if (
        data.settings.resolution &&
        !this.isValidResolution(data.settings.resolution)
      ) {
        errors.push(
          new ValidationError(
            'settings.resolution',
            'Invalid resolution format'
          )
        );
      }
      if (data.settings.framerate && data.settings.framerate <= 0) {
        errors.push(
          new ValidationError(
            'settings.framerate',
            'Framerate must be positive'
          )
        );
      }
    }

    return errors;
  }

  /**
   * Validate project update data
   * @param data - Project update data to validate
   * @returns Array of validation errors
   */
  validateUpdate(data: Partial<UpdateProjectData>): ValidationError[] {
    const errors: ValidationError[] = [];

    // Name validation (if provided)
    if (data.name !== undefined) {
      if (data.name.length < 1 || data.name.length > 100) {
        errors.push(
          new ValidationError(
            'name',
            'Name must be between 1 and 100 characters'
          )
        );
      }
    }

    // Status validation (if provided)
    if (
      data.status !== undefined &&
      !Object.values(ProjectStatus).includes(data.status)
    ) {
      errors.push(new ValidationError('status', 'Invalid project status'));
    }

    // Settings validation (if provided)
    if (data.settings) {
      if (
        data.settings.resolution &&
        !this.isValidResolution(data.settings.resolution)
      ) {
        errors.push(
          new ValidationError(
            'settings.resolution',
            'Invalid resolution format'
          )
        );
      }
      if (data.settings.framerate && data.settings.framerate <= 0) {
        errors.push(
          new ValidationError(
            'settings.framerate',
            'Framerate must be positive'
          )
        );
      }
    }

    return errors;
  }

  /**
   * Create a new project
   * @param data - Project creation data
   * @returns Promise with created project or error
   */
  async create(data: CreateProjectData): Promise<DatabaseResult<Project>> {
    const validationErrors = this.validate(data);
    if (validationErrors.length > 0) {
      return {
        success: false,
        error: validationErrors.map((e) => e.message).join(', '),
      };
    }

    try {
      const id = this.generateId();
      const now = new Date();
      const settings = JSON.stringify(data.settings || {});

      return new Promise((resolve) => {
        const stmt = this.db.prepare(`
          INSERT INTO projects (
            id, name, description, created_by, settings,
            cloud_sync_enabled, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          [
            id,
            data.name,
            data.description || null,
            data.created_by,
            settings,
            data.cloud_sync_enabled ? 1 : 0,
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
                  name: data.name,
                  description: data.description,
                  created_by: data.created_by,
                  settings: data.settings || {},
                  status: ProjectStatus.ACTIVE,
                  cloud_sync_enabled: data.cloud_sync_enabled || false,
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
   * Find project by ID
   * @param id - Project ID
   * @returns Promise with project or error
   */
  async findById(id: string): Promise<DatabaseResult<Project>> {
    try {
      return new Promise((resolve) => {
        this.db.get(
          'SELECT * FROM projects WHERE id = ? AND status != ?',
          [id, ProjectStatus.DELETED],
          (err, row: any) => {
            if (err) {
              resolve({ success: false, error: err.message });
            } else if (!row) {
              resolve({ success: false, error: 'Project not found' });
            } else {
              resolve({
                success: true,
                data: this.mapRowToProject(row),
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
   * Find projects by user ID
   * @param userId - User ID
   * @param options - Pagination options
   * @returns Promise with projects array or error
   */
  async findByUserId(
    userId: string,
    options: PaginationOptions = {}
  ): Promise<DatabaseResult<Project[]>> {
    try {
      const limit = options.limit || 50;
      const offset = options.offset || 0;
      const orderBy = options.orderBy || 'updated_at';
      const orderDirection = options.orderDirection || 'DESC';

      return new Promise((resolve) => {
        this.db.all(
          `
          SELECT p.*, u.display_name as creator_name, u.username as creator_username
          FROM projects p
          JOIN project_memberships pm ON p.id = pm.project_id
          LEFT JOIN users u ON p.created_by = u.id
          WHERE pm.user_id = ? AND p.status != ?
          ORDER BY p.${orderBy} ${orderDirection}
          LIMIT ? OFFSET ?
        `,
          [userId, ProjectStatus.DELETED, limit, offset],
          (err, rows: any[]) => {
            if (err) {
              resolve({ success: false, error: err.message });
            } else {
              const projects = rows.map((row) => this.mapRowToProject(row));
              resolve({ success: true, data: projects });
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
   * Update project
   * @param id - Project ID
   * @param data - Update data
   * @returns Promise with updated project or error
   */
  async update(
    id: string,
    data: UpdateProjectData
  ): Promise<DatabaseResult<Project>> {
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

      if (data.name !== undefined) {
        updates.push('name = ?');
        values.push(data.name);
      }
      if (data.description !== undefined) {
        updates.push('description = ?');
        values.push(data.description);
      }
      if (data.settings !== undefined) {
        updates.push('settings = ?');
        values.push(JSON.stringify(data.settings));
      }
      if (data.status !== undefined) {
        updates.push('status = ?');
        values.push(data.status);
      }
      if (data.cloud_sync_enabled !== undefined) {
        updates.push('cloud_sync_enabled = ?');
        values.push(data.cloud_sync_enabled ? 1 : 0);
      }

      if (updates.length === 0) {
        return { success: false, error: 'No fields to update' };
      }

      updates.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(id);

      return new Promise((resolve) => {
        this.db.run(
          `UPDATE projects SET ${updates.join(', ')} WHERE id = ?`,
          values,
          function (err) {
            if (err) {
              resolve({ success: false, error: err.message });
            } else if (this.changes === 0) {
              resolve({ success: false, error: 'Project not found' });
            } else {
              // Return updated project
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
   * Delete project (soft delete)
   * @param id - Project ID
   * @returns Promise with success status
   */
  async delete(id: string): Promise<DatabaseResult<boolean>> {
    try {
      return new Promise((resolve) => {
        this.db.run(
          'UPDATE projects SET status = ?, updated_at = ? WHERE id = ?',
          [ProjectStatus.DELETED, new Date().toISOString(), id],
          function (err) {
            if (err) {
              resolve({ success: false, error: err.message });
            } else if (this.changes === 0) {
              resolve({ success: false, error: 'Project not found' });
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
   * Update last sync timestamp
   * @param id - Project ID
   * @returns Promise with success status
   */
  async updateLastSync(id: string): Promise<DatabaseResult<boolean>> {
    try {
      return new Promise((resolve) => {
        this.db.run(
          'UPDATE projects SET last_sync_at = ?, updated_at = ? WHERE id = ?',
          [new Date().toISOString(), new Date().toISOString(), id],
          function (err) {
            if (err) {
              resolve({ success: false, error: err.message });
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
   * Check if resolution format is valid
   * @param resolution - Resolution string (e.g., "1920x1080")
   * @returns Boolean indicating if valid
   */
  private isValidResolution(resolution: string): boolean {
    const resolutionPattern = /^\d+x\d+$/;
    return resolutionPattern.test(resolution);
  }

  /**
   * Map database row to Project object
   * @param row - Database row
   * @returns Project object
   */
  private mapRowToProject(row: any): Project {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      created_by: row.created_by,
      settings: JSON.parse(row.settings || '{}'),
      status: row.status as ProjectStatus,
      cloud_sync_enabled: Boolean(row.cloud_sync_enabled),
      last_sync_at: row.last_sync_at ? new Date(row.last_sync_at) : undefined,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }

  /**
   * Generate unique ID for new projects
   * @returns Unique string ID
   */
  private generateId(): string {
    return `project-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
