/**
 * Project Service (T031)
 * Business logic for project management operations
 * Handles project CRUD, memberships, and collaboration features
 */

import {
  ProjectModel,
  Project,
  CreateProjectData,
  UpdateProjectData,
  ProjectWithRelations,
} from '../models/project';
import { UserModel } from '../models/user';
import { DatabaseService } from './database.service';
import {
  DatabaseResult,
  ProjectRole,
  ProjectStatus,
  PaginationOptions,
} from '../../../shared/types/database';

export interface ProjectMembership {
  id: string;
  project_id: string;
  user_id: string;
  role: ProjectRole;
  joined_at: Date;
}

export interface ProjectMemberWithUser extends ProjectMembership {
  user: {
    id: string;
    username: string;
    display_name: string;
    avatar_url?: string;
  };
}

export interface ProjectSearchOptions extends PaginationOptions {
  status?: ProjectStatus;
  search?: string;
  sortBy?: 'name' | 'created_at' | 'updated_at' | 'last_activity';
}

export interface ProjectActivity {
  id: string;
  project_id: string;
  user_id: string;
  action: string;
  details: any;
  created_at: Date;
}

/**
 * Project Service Class
 * Handles project-related business logic and operations
 */
export class ProjectService {
  private projectModel: ProjectModel;
  private userModel: UserModel;
  private db: DatabaseService;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService;
    this.projectModel = new ProjectModel(databaseService.getDatabase()!);
    this.userModel = new UserModel(databaseService.getDatabase()!);
  }

  /**
   * Create a new project
   * @param data - Project creation data
   * @returns Promise with created project or error
   */
  async createProject(
    data: CreateProjectData
  ): Promise<DatabaseResult<Project>> {
    try {
      // Verify user exists
      const userResult = await this.userModel.findById(data.created_by);
      if (!userResult.success || !userResult.data) {
        return { success: false, error: 'User not found' };
      }

      // Create project using transaction
      const transactionResult = await this.db.transaction(async () => {
        // Create project
        const projectResult = await this.projectModel.create(data);
        if (!projectResult.success || !projectResult.data) {
          throw new Error(projectResult.error || 'Failed to create project');
        }

        // Create project membership for owner
        await this.addProjectMember(
          projectResult.data.id,
          data.created_by,
          ProjectRole.OWNER,
          data.created_by
        );

        // Log project creation activity
        await this.logActivity(
          projectResult.data.id,
          data.created_by,
          'project_created',
          { project_name: projectResult.data.name }
        );

        return projectResult.data;
      });

      return transactionResult;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get project by ID with permission check
   * @param projectId - Project ID
   * @param userId - User ID requesting access
   * @returns Promise with project or error
   */
  async getProject(
    projectId: string,
    userId: string
  ): Promise<DatabaseResult<ProjectWithRelations>> {
    try {
      // Check if user has access to project
      const hasAccess = await this.checkProjectAccess(projectId, userId);
      if (!hasAccess.success || !hasAccess.data) {
        return { success: false, error: 'Access denied' };
      }

      // Get project
      const projectResult = await this.projectModel.findById(projectId);
      if (!projectResult.success || !projectResult.data) {
        return projectResult;
      }

      // Get additional project relations
      const [memberCount, mediaCount, sequenceCount] = await Promise.all([
        this.getProjectMemberCount(projectId),
        this.getProjectMediaCount(projectId),
        this.getProjectSequenceCount(projectId),
      ]);

      const projectWithRelations: ProjectWithRelations = {
        ...projectResult.data,
        member_count: memberCount.data || 0,
        media_count: mediaCount.data || 0,
        sequence_count: sequenceCount.data || 0,
      };

      return { success: true, data: projectWithRelations };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get projects for a user
   * @param userId - User ID
   * @param options - Search and pagination options
   * @returns Promise with projects array or error
   */
  async getUserProjects(
    userId: string,
    options: ProjectSearchOptions = {}
  ): Promise<DatabaseResult<ProjectWithRelations[]>> {
    try {
      const limit = options.limit || 50;
      const offset = options.offset || 0;
      const orderBy = options.orderBy || 'updated_at';
      const orderDirection = options.orderDirection || 'DESC';

      let query = `
        SELECT DISTINCT p.*, 
               u.display_name as creator_name, 
               u.username as creator_username,
               pm.role as user_role,
               pm.joined_at as user_joined_at
        FROM projects p
        JOIN project_memberships pm ON p.id = pm.project_id
        LEFT JOIN users u ON p.created_by = u.id
        WHERE pm.user_id = ?
      `;
      const params: any[] = [userId];

      // Add status filter
      if (options.status) {
        query += ' AND p.status = ?';
        params.push(options.status);
      } else {
        query += ' AND p.status != ?';
        params.push(ProjectStatus.DELETED);
      }

      // Add search filter
      if (options.search) {
        query += ' AND (p.name LIKE ? OR p.description LIKE ?)';
        const searchTerm = `%${options.search}%`;
        params.push(searchTerm, searchTerm);
      }

      query += ` ORDER BY p.${orderBy} ${orderDirection} LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const rows = await this.db.all(query, params);

      const projects: ProjectWithRelations[] = await Promise.all(
        rows.map(async (row: any) => {
          const [memberCount, mediaCount, sequenceCount] = await Promise.all([
            this.getProjectMemberCount(row.id),
            this.getProjectMediaCount(row.id),
            this.getProjectSequenceCount(row.id),
          ]);

          return {
            id: row.id,
            name: row.name,
            description: row.description,
            created_by: row.created_by,
            settings: JSON.parse(row.settings || '{}'),
            status: row.status as ProjectStatus,
            cloud_sync_enabled: Boolean(row.cloud_sync_enabled),
            last_sync_at: row.last_sync_at
              ? new Date(row.last_sync_at)
              : undefined,
            created_at: new Date(row.created_at),
            updated_at: new Date(row.updated_at),
            creator: {
              id: row.created_by,
              display_name: row.creator_name,
              username: row.creator_username,
            },
            member_count: memberCount.data || 0,
            media_count: mediaCount.data || 0,
            sequence_count: sequenceCount.data || 0,
          };
        })
      );

      return { success: true, data: projects };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Update project
   * @param projectId - Project ID
   * @param data - Update data
   * @param userId - User ID making the update
   * @returns Promise with updated project or error
   */
  async updateProject(
    projectId: string,
    data: UpdateProjectData,
    userId: string
  ): Promise<DatabaseResult<Project>> {
    try {
      // Check if user has edit permission
      const hasPermission = await this.checkProjectPermission(
        projectId,
        userId,
        ['owner', 'editor']
      );
      if (!hasPermission.success || !hasPermission.data) {
        return { success: false, error: 'Insufficient permissions' };
      }

      const result = await this.projectModel.update(projectId, data);
      if (result.success) {
        // Log update activity
        await this.logActivity(projectId, userId, 'project_updated', {
          updated_fields: Object.keys(data),
        });
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Delete project (soft delete)
   * @param projectId - Project ID
   * @param userId - User ID making the request
   * @returns Promise with success status
   */
  async deleteProject(
    projectId: string,
    userId: string
  ): Promise<DatabaseResult<boolean>> {
    try {
      // Check if user is owner
      const hasPermission = await this.checkProjectPermission(
        projectId,
        userId,
        ['owner']
      );
      if (!hasPermission.success || !hasPermission.data) {
        return {
          success: false,
          error: 'Only project owners can delete projects',
        };
      }

      const result = await this.projectModel.delete(projectId);
      if (result.success) {
        // Log deletion activity
        await this.logActivity(projectId, userId, 'project_deleted', {});
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Add member to project
   * @param projectId - Project ID
   * @param userId - User ID to add
   * @param role - Project role
   * @param addedBy - User ID adding the member
   * @returns Promise with success status
   */
  async addProjectMember(
    projectId: string,
    userId: string,
    role: ProjectRole,
    addedBy: string
  ): Promise<DatabaseResult<ProjectMembership>> {
    try {
      // Check if user adding has permission
      const hasPermission = await this.checkProjectPermission(
        projectId,
        addedBy,
        ['owner', 'editor']
      );
      if (!hasPermission.success || !hasPermission.data) {
        return { success: false, error: 'Insufficient permissions' };
      }

      // Check if user exists
      const userResult = await this.userModel.findById(userId);
      if (!userResult.success || !userResult.data) {
        return { success: false, error: 'User not found' };
      }

      // Check if already a member
      const existingMember = await this.db.get(
        'SELECT id FROM project_memberships WHERE project_id = ? AND user_id = ?',
        [projectId, userId]
      );

      if (existingMember) {
        return { success: false, error: 'User is already a project member' };
      }

      const membershipId = this.db.generateId('membership');
      const now = new Date();

      await this.db.run(
        `
        INSERT INTO project_memberships (id, project_id, user_id, role, joined_at)
        VALUES (?, ?, ?, ?, ?)
      `,
        [membershipId, projectId, userId, role, now.toISOString()]
      );

      // Log activity
      await this.logActivity(projectId, addedBy, 'member_added', {
        added_user_id: userId,
        role,
      });

      return {
        success: true,
        data: {
          id: membershipId,
          project_id: projectId,
          user_id: userId,
          role,
          joined_at: now,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get project members
   * @param projectId - Project ID
   * @param userId - User ID requesting access
   * @returns Promise with project members array or error
   */
  async getProjectMembers(
    projectId: string,
    userId: string
  ): Promise<DatabaseResult<ProjectMemberWithUser[]>> {
    try {
      // Check if user has access to project
      const hasAccess = await this.checkProjectAccess(projectId, userId);
      if (!hasAccess.success || !hasAccess.data) {
        return { success: false, error: 'Access denied' };
      }

      const members = await this.db.all(
        `
        SELECT pm.*, u.username, u.display_name, u.avatar_url, u.status, u.last_active_at
        FROM project_memberships pm
        JOIN users u ON pm.user_id = u.id
        WHERE pm.project_id = ?
        ORDER BY pm.role, u.display_name
      `,
        [projectId]
      );

      const membersWithUser: ProjectMemberWithUser[] = members.map(
        (row: any) => ({
          id: row.id,
          project_id: row.project_id,
          user_id: row.user_id,
          role: row.role as ProjectRole,
          joined_at: new Date(row.joined_at),
          user: {
            id: row.user_id,
            username: row.username,
            display_name: row.display_name,
            avatar_url: row.avatar_url,
          },
        })
      );

      return { success: true, data: membersWithUser };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check if user has access to project
   * @param projectId - Project ID
   * @param userId - User ID
   * @returns Promise with access result
   */
  async checkProjectAccess(
    projectId: string,
    userId: string
  ): Promise<DatabaseResult<boolean>> {
    try {
      const membership = await this.db.get(
        'SELECT id FROM project_memberships WHERE project_id = ? AND user_id = ?',
        [projectId, userId]
      );

      return { success: true, data: !!membership };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check if user has specific permissions on project
   * @param projectId - Project ID
   * @param userId - User ID
   * @param requiredRoles - Required roles
   * @returns Promise with permission result
   */
  async checkProjectPermission(
    projectId: string,
    userId: string,
    requiredRoles: string[]
  ): Promise<DatabaseResult<boolean>> {
    try {
      const membership = await this.db.get(
        'SELECT role FROM project_memberships WHERE project_id = ? AND user_id = ?',
        [projectId, userId]
      );

      if (!membership) {
        return { success: true, data: false };
      }

      const hasPermission = requiredRoles.includes(membership.role);
      return { success: true, data: hasPermission };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Log project activity
   * @private
   */
  private async logActivity(
    projectId: string,
    userId: string,
    action: string,
    details: any
  ): Promise<void> {
    try {
      const activityId = this.db.generateId('activity');
      await this.db.run(
        `
        INSERT INTO project_activities (id, project_id, user_id, action, details, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
        [
          activityId,
          projectId,
          userId,
          action,
          JSON.stringify(details),
          new Date().toISOString(),
        ]
      );
    } catch (error) {
      console.error('Failed to log activity:', error);
    }
  }

  /**
   * Get project member count
   * @private
   */
  private async getProjectMemberCount(
    projectId: string
  ): Promise<DatabaseResult<number>> {
    try {
      const result = await this.db.get(
        'SELECT COUNT(*) as count FROM project_memberships WHERE project_id = ?',
        [projectId]
      );
      return { success: true, data: result?.count || 0 };
    } catch (error) {
      return { success: false, error: 'Failed to get member count' };
    }
  }

  /**
   * Get project media count
   * @private
   */
  private async getProjectMediaCount(
    projectId: string
  ): Promise<DatabaseResult<number>> {
    try {
      const result = await this.db.get(
        'SELECT COUNT(*) as count FROM media_assets WHERE project_id = ?',
        [projectId]
      );
      return { success: true, data: result?.count || 0 };
    } catch (error) {
      return { success: false, error: 'Failed to get media count' };
    }
  }

  /**
   * Get project sequence count
   * @private
   */
  private async getProjectSequenceCount(
    projectId: string
  ): Promise<DatabaseResult<number>> {
    try {
      const result = await this.db.get(
        'SELECT COUNT(*) as count FROM timeline_sequences WHERE project_id = ?',
        [projectId]
      );
      return { success: true, data: result?.count || 0 };
    } catch (error) {
      return { success: false, error: 'Failed to get sequence count' };
    }
  }
}

export default ProjectService;
