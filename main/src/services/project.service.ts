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
import { CloudApiService, CloudProject } from './cloud-api.service';
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
  includeCloud?: boolean; // 클라우드 프로젝트 포함 여부
}

export interface ProjectActivity {
  id: string;
  project_id: string;
  user_id: string;
  action: string;
  details: Record<string, unknown>;
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
  private cloudApiService: CloudApiService | null = null;

  constructor(
    databaseService: DatabaseService,
    cloudApiService?: CloudApiService
  ) {
    this.db = databaseService;
    this.projectModel = new ProjectModel(databaseService.getDatabase()!);
    this.userModel = new UserModel(databaseService.getDatabase()!);
    this.cloudApiService = cloudApiService || null;
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
   * Get projects for a user (local and cloud)
   * @param userId - User ID
   * @param options - Search and pagination options
   * @returns Promise with projects array or error
   */
  async getUserProjects(
    userId: string,
    options: ProjectSearchOptions = {}
  ): Promise<DatabaseResult<ProjectWithRelations[]>> {
    try {
      const includeCloud = options.includeCloud !== false; // 기본적으로 클라우드 포함

      // 로컬 프로젝트 조회
      const localProjects = await this.getLocalUserProjects(userId, options);

      // 클라우드 프로젝트 조회 (옵션이 활성화되어 있고 클라우드 서비스가 있는 경우)
      let cloudProjects: CloudProject[] = [];
      if (includeCloud && this.cloudApiService) {
        const cloudResult = await this.cloudApiService.getUserProjects(userId, {
          limit: options.limit,
          offset: options.offset,
          orderBy: options.orderBy,
          orderDirection: options.orderDirection,
          status: options.status,
          search: options.search,
        });

        if (cloudResult.success && cloudResult.data) {
          cloudProjects = cloudResult.data;
        }
      }

      // 로컬과 클라우드 프로젝트 병합 및 중복 제거
      const allProjects = this.mergeProjects(
        localProjects.data || [],
        cloudProjects
      );

      // 정렬 및 페이지네이션 적용
      const sortedProjects = this.sortAndPaginateProjects(allProjects, options);

      return { success: true, data: sortedProjects };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get local projects for a user
   * @private
   */
  private async getLocalUserProjects(
    userId: string,
    options: ProjectSearchOptions
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
      const params: unknown[] = [userId];

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
        rows.map(async (row: Record<string, unknown>) => {
          const [memberCount, mediaCount, sequenceCount] = await Promise.all([
            this.getProjectMemberCount(row.id as string),
            this.getProjectMediaCount(row.id as string),
            this.getProjectSequenceCount(row.id as string),
          ]);

          return {
            id: row.id as string,
            name: row.name as string,
            description: row.description as string,
            created_by: row.created_by as string,
            settings: JSON.parse((row.settings as string) || '{}'),
            status: row.status as ProjectStatus,
            cloud_sync_enabled: Boolean(row.cloud_sync_enabled),
            last_sync_at: row.last_sync_at
              ? new Date(row.last_sync_at as string)
              : undefined,
            created_at: new Date(row.created_at as string),
            updated_at: new Date(row.updated_at as string),
            creator: {
              id: row.created_by as string,
              display_name: row.creator_name as string,
              username: row.creator_username as string,
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
   * Merge local and cloud projects, removing duplicates
   * @private
   */
  private mergeProjects(
    localProjects: ProjectWithRelations[],
    cloudProjects: CloudProject[]
  ): ProjectWithRelations[] {
    const projectMap = new Map<string, ProjectWithRelations>();

    // 로컬 프로젝트 추가
    localProjects.forEach((project) => {
      projectMap.set(project.id, project);
    });

    // 클라우드 프로젝트 추가 (중복되지 않는 경우만)
    cloudProjects.forEach((cloudProject) => {
      if (!projectMap.has(cloudProject.id)) {
        // 클라우드 프로젝트를 ProjectWithRelations 형식으로 변환
        const convertedProject: ProjectWithRelations = {
          id: cloudProject.id,
          name: cloudProject.name,
          description: cloudProject.description,
          created_by: cloudProject.created_by,
          settings: cloudProject.settings,
          status: cloudProject.status,
          cloud_sync_enabled: cloudProject.cloud_sync_enabled,
          last_sync_at: cloudProject.last_sync_at,
          created_at: cloudProject.created_at,
          updated_at: cloudProject.updated_at,
          creator: cloudProject.creator,
          member_count: cloudProject.member_count,
          media_count: cloudProject.media_count,
          sequence_count: cloudProject.sequence_count,
        };
        projectMap.set(cloudProject.id, convertedProject);
      }
    });

    return Array.from(projectMap.values());
  }

  /**
   * Sort and paginate projects
   * @private
   */
  private sortAndPaginateProjects(
    projects: ProjectWithRelations[],
    options: ProjectSearchOptions
  ): ProjectWithRelations[] {
    const orderBy = options.orderBy || 'updated_at';
    const orderDirection = options.orderDirection || 'DESC';
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    // 정렬
    projects.sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      switch (orderBy) {
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case 'created_at':
          aValue = a.created_at.getTime();
          bValue = b.created_at.getTime();
          break;
        case 'updated_at':
        default:
          aValue = a.updated_at.getTime();
          bValue = b.updated_at.getTime();
          break;
      }

      if (orderDirection === 'ASC') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    // 페이지네이션
    return projects.slice(offset, offset + limit);
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
        (row: Record<string, unknown>) => ({
          id: row.id as string,
          project_id: row.project_id as string,
          user_id: row.user_id as string,
          role: row.role as ProjectRole,
          joined_at: new Date(row.joined_at as string),
          user: {
            id: row.user_id as string,
            username: row.username as string,
            display_name: row.display_name as string,
            avatar_url: row.avatar_url as string,
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
    details: Record<string, unknown>
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
