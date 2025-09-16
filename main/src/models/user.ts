/**
 * User Model (T024)
 * Individual team member with access to collaborate on projects.
 * Includes authentication and user management functionality.
 */

import { Database } from 'sqlite3';
import * as crypto from 'crypto';
import {
  BaseModel,
  UserStatus,
  ValidationError,
  DatabaseResult,
  PaginationOptions,
  ModelValidator,
} from '../../../shared/types/database';

/** User entity interface */
export interface User extends BaseModel {
  username: string;
  email: string;
  display_name: string;
  avatar_url?: string;
  last_active_at: Date;
  status: UserStatus;
  preferences: UserPreferences;
}

/** User preferences interface */
export interface UserPreferences {
  theme?: 'light' | 'dark';
  shortcuts?: { [key: string]: string };
  [key: string]: any;
}

/** User creation data */
export interface CreateUserData {
  username: string;
  email: string;
  display_name: string;
  avatar_url?: string;
  preferences?: Partial<UserPreferences>;
}

/** User update data */
export interface UpdateUserData {
  username?: string;
  email?: string;
  display_name?: string;
  avatar_url?: string;
  status?: UserStatus;
  preferences?: Partial<UserPreferences>;
}

/** User authentication data */
export interface UserAuth {
  user: User;
  session_id: string;
  expires_at: Date;
}

/** User with project statistics */
export interface UserWithStats extends User {
  project_count?: number;
  active_project_count?: number;
  last_project_name?: string;
}

/**
 * User Model Class
 * Handles CRUD operations, validation, and authentication for users
 */
export class UserModel implements ModelValidator<User> {
  private db: Database;
  private activeSessions: Map<string, UserAuth> = new Map();

  constructor(database: Database) {
    this.db = database;
  }

  /**
   * Validate user data
   * @param data - User data to validate
   * @returns Array of validation errors
   */
  validate(data: Partial<CreateUserData>): ValidationError[] {
    const errors: ValidationError[] = [];

    // Username validation
    if (!data.username) {
      errors.push(new ValidationError('username', 'Username is required'));
    } else if (!this.isValidUsername(data.username)) {
      errors.push(
        new ValidationError(
          'username',
          'Username must be 3-30 characters, alphanumeric and underscores only'
        )
      );
    }

    // Email validation
    if (!data.email) {
      errors.push(new ValidationError('email', 'Email is required'));
    } else if (!this.isValidEmail(data.email)) {
      errors.push(new ValidationError('email', 'Invalid email format'));
    }

    // Display name validation
    if (!data.display_name) {
      errors.push(
        new ValidationError('display_name', 'Display name is required')
      );
    } else if (data.display_name.length < 1 || data.display_name.length > 50) {
      errors.push(
        new ValidationError(
          'display_name',
          'Display name must be between 1 and 50 characters'
        )
      );
    }

    // Avatar URL validation
    if (data.avatar_url && !this.isValidUrl(data.avatar_url)) {
      errors.push(
        new ValidationError('avatar_url', 'Invalid avatar URL format')
      );
    }

    return errors;
  }

  /**
   * Validate user update data
   * @param data - User update data to validate
   * @returns Array of validation errors
   */
  validateUpdate(data: Partial<UpdateUserData>): ValidationError[] {
    const errors: ValidationError[] = [];

    // Username validation (if provided)
    if (data.username !== undefined && !this.isValidUsername(data.username)) {
      errors.push(
        new ValidationError(
          'username',
          'Username must be 3-30 characters, alphanumeric and underscores only'
        )
      );
    }

    // Email validation (if provided)
    if (data.email !== undefined && !this.isValidEmail(data.email)) {
      errors.push(new ValidationError('email', 'Invalid email format'));
    }

    // Display name validation (if provided)
    if (data.display_name !== undefined) {
      if (data.display_name.length < 1 || data.display_name.length > 50) {
        errors.push(
          new ValidationError(
            'display_name',
            'Display name must be between 1 and 50 characters'
          )
        );
      }
    }

    // Avatar URL validation (if provided)
    if (
      data.avatar_url !== undefined &&
      data.avatar_url &&
      !this.isValidUrl(data.avatar_url)
    ) {
      errors.push(
        new ValidationError('avatar_url', 'Invalid avatar URL format')
      );
    }

    // Status validation (if provided)
    if (
      data.status !== undefined &&
      !Object.values(UserStatus).includes(data.status)
    ) {
      errors.push(new ValidationError('status', 'Invalid user status'));
    }

    return errors;
  }

  /**
   * Create a new user
   * @param data - User creation data
   * @returns Promise with created user or error
   */
  async create(data: CreateUserData): Promise<DatabaseResult<User>> {
    const validationErrors = this.validate(data);
    if (validationErrors.length > 0) {
      return {
        success: false,
        error: validationErrors.map((e) => e.message).join(', '),
      };
    }

    try {
      // Check for existing username/email
      const existingUser = await this.checkExistingUser(
        data.username,
        data.email
      );
      if (!existingUser.success) {
        return {
          success: false,
          error: existingUser.error,
        };
      }

      const id = this.generateId();
      const now = new Date();
      const preferences = JSON.stringify(data.preferences || {});

      return new Promise((resolve) => {
        const stmt = this.db.prepare(`
          INSERT INTO users (
            id, username, email, display_name, avatar_url,
            preferences, created_at, last_active_at, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          [
            id,
            data.username,
            data.email,
            data.display_name,
            data.avatar_url || null,
            preferences,
            now.toISOString(),
            now.toISOString(),
            UserStatus.OFFLINE,
          ],
          function (err) {
            if (err) {
              resolve({ success: false, error: err.message });
            } else {
              resolve({
                success: true,
                data: {
                  id,
                  username: data.username,
                  email: data.email,
                  display_name: data.display_name,
                  avatar_url: data.avatar_url,
                  preferences: data.preferences || {},
                  status: UserStatus.OFFLINE,
                  created_at: now,
                  last_active_at: now,
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
   * Find user by ID
   * @param id - User ID
   * @returns Promise with user or error
   */
  async findById(id: string): Promise<DatabaseResult<User>> {
    try {
      return new Promise((resolve) => {
        this.db.get(
          'SELECT * FROM users WHERE id = ?',
          [id],
          (err, row: any) => {
            if (err) {
              resolve({ success: false, error: err.message });
            } else if (!row) {
              resolve({ success: false, error: 'User not found' });
            } else {
              resolve({
                success: true,
                data: this.mapRowToUser(row),
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
   * Find user by username
   * @param username - Username
   * @returns Promise with user or error
   */
  async findByUsername(username: string): Promise<DatabaseResult<User>> {
    try {
      return new Promise((resolve) => {
        this.db.get(
          'SELECT * FROM users WHERE username = ?',
          [username],
          (err, row: any) => {
            if (err) {
              resolve({ success: false, error: err.message });
            } else if (!row) {
              resolve({ success: false, error: 'User not found' });
            } else {
              resolve({
                success: true,
                data: this.mapRowToUser(row),
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
   * Find user by email
   * @param email - Email address
   * @returns Promise with user or error
   */
  async findByEmail(email: string): Promise<DatabaseResult<User>> {
    try {
      return new Promise((resolve) => {
        this.db.get(
          'SELECT * FROM users WHERE email = ?',
          [email],
          (err, row: any) => {
            if (err) {
              resolve({ success: false, error: err.message });
            } else if (!row) {
              resolve({ success: false, error: 'User not found' });
            } else {
              resolve({
                success: true,
                data: this.mapRowToUser(row),
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
   * Find users by project ID
   * @param projectId - Project ID
   * @returns Promise with users array or error
   */
  async findByProjectId(projectId: string): Promise<DatabaseResult<User[]>> {
    try {
      return new Promise((resolve) => {
        this.db.all(
          `
          SELECT u.*, pm.role, pm.joined_at
          FROM users u
          JOIN project_memberships pm ON u.id = pm.user_id
          WHERE pm.project_id = ?
          ORDER BY u.display_name
        `,
          [projectId],
          (err, rows: any[]) => {
            if (err) {
              resolve({ success: false, error: err.message });
            } else {
              const users = rows.map((row) => this.mapRowToUser(row));
              resolve({ success: true, data: users });
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
   * Update user
   * @param id - User ID
   * @param data - Update data
   * @returns Promise with updated user or error
   */
  async update(
    id: string,
    data: UpdateUserData
  ): Promise<DatabaseResult<User>> {
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

      if (data.username !== undefined) {
        updates.push('username = ?');
        values.push(data.username);
      }
      if (data.email !== undefined) {
        updates.push('email = ?');
        values.push(data.email);
      }
      if (data.display_name !== undefined) {
        updates.push('display_name = ?');
        values.push(data.display_name);
      }
      if (data.avatar_url !== undefined) {
        updates.push('avatar_url = ?');
        values.push(data.avatar_url);
      }
      if (data.status !== undefined) {
        updates.push('status = ?');
        values.push(data.status);
      }
      if (data.preferences !== undefined) {
        updates.push('preferences = ?');
        values.push(JSON.stringify(data.preferences));
      }

      if (updates.length === 0) {
        return { success: false, error: 'No fields to update' };
      }

      values.push(id);

      return new Promise((resolve) => {
        this.db.run(
          `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
          values,
          function (err) {
            if (err) {
              resolve({ success: false, error: err.message });
            } else if (this.changes === 0) {
              resolve({ success: false, error: 'User not found' });
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
   * Update user last active timestamp
   * @param id - User ID
   * @returns Promise with success status
   */
  async updateLastActive(id: string): Promise<DatabaseResult<boolean>> {
    try {
      return new Promise((resolve) => {
        this.db.run(
          'UPDATE users SET last_active_at = ? WHERE id = ?',
          [new Date().toISOString(), id],
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
   * Create user session (simple authentication)
   * @param userId - User ID
   * @returns Promise with session data or error
   */
  async createSession(userId: string): Promise<DatabaseResult<UserAuth>> {
    try {
      const userResult = await this.findById(userId);
      if (!userResult.success || !userResult.data) {
        return { success: false, error: 'User not found' };
      }

      const sessionId = this.generateSessionId();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      const userAuth: UserAuth = {
        user: userResult.data,
        session_id: sessionId,
        expires_at: expiresAt,
      };

      this.activeSessions.set(sessionId, userAuth);

      // Update user status to online
      await this.update(userId, { status: UserStatus.ONLINE });
      await this.updateLastActive(userId);

      return { success: true, data: userAuth };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Validate user session
   * @param sessionId - Session ID
   * @returns Promise with user auth data or error
   */
  async validateSession(sessionId: string): Promise<DatabaseResult<UserAuth>> {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        return { success: false, error: 'Invalid session' };
      }

      if (new Date() > session.expires_at) {
        this.activeSessions.delete(sessionId);
        return { success: false, error: 'Session expired' };
      }

      // Update last active
      await this.updateLastActive(session.user.id);

      return { success: true, data: session };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * End user session
   * @param sessionId - Session ID
   * @returns Promise with success status
   */
  async endSession(sessionId: string): Promise<DatabaseResult<boolean>> {
    try {
      const session = this.activeSessions.get(sessionId);
      if (session) {
        // Update user status to offline
        await this.update(session.user.id, { status: UserStatus.OFFLINE });
        this.activeSessions.delete(sessionId);
      }

      return { success: true, data: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check if username or email already exists
   * @param username - Username to check
   * @param email - Email to check
   * @returns Promise with validation result
   */
  private async checkExistingUser(
    username: string,
    email: string
  ): Promise<DatabaseResult<boolean>> {
    return new Promise((resolve) => {
      this.db.get(
        'SELECT id FROM users WHERE username = ? OR email = ?',
        [username, email],
        (err, row: any) => {
          if (err) {
            resolve({ success: false, error: err.message });
          } else if (row) {
            resolve({
              success: false,
              error: 'Username or email already exists',
            });
          } else {
            resolve({ success: true, data: true });
          }
        }
      );
    });
  }

  /**
   * Validate username format
   * @param username - Username to validate
   * @returns Boolean indicating if valid
   */
  private isValidUsername(username: string): boolean {
    const usernamePattern = /^[a-zA-Z0-9_]{3,30}$/;
    return usernamePattern.test(username);
  }

  /**
   * Validate email format
   * @param email - Email to validate
   * @returns Boolean indicating if valid
   */
  private isValidEmail(email: string): boolean {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailPattern.test(email);
  }

  /**
   * Validate URL format
   * @param url - URL to validate
   * @returns Boolean indicating if valid
   */
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Map database row to User object
   * @param row - Database row
   * @returns User object
   */
  private mapRowToUser(row: any): User {
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      display_name: row.display_name,
      avatar_url: row.avatar_url,
      preferences: JSON.parse(row.preferences || '{}'),
      status: row.status as UserStatus,
      created_at: new Date(row.created_at),
      last_active_at: new Date(row.last_active_at),
    };
  }

  /**
   * Generate unique ID for new users
   * @returns Unique string ID
   */
  private generateId(): string {
    return `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique session ID
   * @returns Unique session ID
   */
  private generateSessionId(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}
