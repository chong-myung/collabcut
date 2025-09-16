/**
 * Project API Routes (T035)
 * HTTP endpoints for project management operations
 * Handles Create, Read, Update, Delete operations for projects
 */

import { Router, Request, Response } from 'express';
import { ProjectService } from '../services/project.service';
import { databaseService } from '../services/database.service';
import { CreateProjectData, UpdateProjectData } from '../models/project';
import { ProjectSearchOptions } from '../services/project.service';
import { ProjectRole } from '../../../shared/types/database';

// Initialize services
const projectService = new ProjectService(databaseService);

const router = Router();

/**
 * Middleware to validate user authentication
 */
const authenticateUser = (req: Request, res: Response, next: Function) => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
    });
  }
  req.user = { id: userId };
  next();
};

/**
 * Middleware to validate project access
 */
const validateProjectAccess = async (
  req: Request,
  res: Response,
  next: Function
) => {
  try {
    const projectId = req.params.id;
    const userId = req.user.id;

    const accessResult = await projectService.checkProjectAccess(
      projectId,
      userId
    );
    if (!accessResult.success || !accessResult.data) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to validate access',
    });
  }
};

/**
 * POST /api/v1/projects
 * Create a new project
 */
router.post('/', authenticateUser, async (req: Request, res: Response) => {
  try {
    const { name, description, settings, cloud_sync_enabled } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Project name is required',
      });
    }

    const projectData: CreateProjectData = {
      name,
      description,
      created_by: req.user.id,
      settings,
      cloud_sync_enabled,
    };

    const result = await projectService.createProject(projectData);

    if (result.success) {
      res.status(201).json({
        success: true,
        data: result.data,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/v1/projects
 * Get user's projects with optional filtering
 */
router.get('/', authenticateUser, async (req: Request, res: Response) => {
  try {
    const options: ProjectSearchOptions = {
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset
        ? parseInt(req.query.offset as string)
        : undefined,
      search: req.query.search as string,
      status: req.query.status as any,
      sortBy: req.query.sortBy as any,
      orderDirection: req.query.orderDirection as 'ASC' | 'DESC',
    };

    const result = await projectService.getUserProjects(req.user.id, options);

    if (result.success) {
      res.json({
        success: true,
        data: result.data,
        pagination: {
          limit: options.limit || 50,
          offset: options.offset || 0,
          total: result.data?.length || 0,
        },
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/v1/projects/:id
 * Get project by ID
 */
router.get(
  '/:id',
  authenticateUser,
  validateProjectAccess,
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.id;
      const result = await projectService.getProject(projectId, req.user.id);

      if (result.success) {
        res.json({
          success: true,
          data: result.data,
        });
      } else {
        res.status(404).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error('Get project error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * PUT /api/v1/projects/:id
 * Update project
 */
router.put(
  '/:id',
  authenticateUser,
  validateProjectAccess,
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.id;
      const { name, description, settings, status, cloud_sync_enabled } =
        req.body;

      const updateData: UpdateProjectData = {
        name,
        description,
        settings,
        status,
        cloud_sync_enabled,
      };

      const result = await projectService.updateProject(
        projectId,
        updateData,
        req.user.id
      );

      if (result.success) {
        // Get updated project data
        const updatedProject = await projectService.getProject(
          projectId,
          req.user.id
        );
        res.json({
          success: true,
          data: updatedProject.data,
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error('Update project error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * DELETE /api/v1/projects/:id
 * Delete project (soft delete)
 */
router.delete('/:id', authenticateUser, async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id;
    const result = await projectService.deleteProject(projectId, req.user.id);

    if (result.success) {
      res.json({
        success: true,
        message: 'Project deleted successfully',
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/v1/projects/:id/members
 * Get project members
 */
router.get(
  '/:id/members',
  authenticateUser,
  validateProjectAccess,
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.id;
      const result = await projectService.getProjectMembers(
        projectId,
        req.user.id
      );

      if (result.success) {
        res.json({
          success: true,
          data: result.data,
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error('Get project members error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * POST /api/v1/projects/:id/members
 * Add member to project
 */
router.post(
  '/:id/members',
  authenticateUser,
  validateProjectAccess,
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.id;
      const { user_id, role } = req.body;

      // Validate required fields
      if (!user_id || !role) {
        return res.status(400).json({
          success: false,
          error: 'User ID and role are required',
        });
      }

      // Validate role
      if (!Object.values(ProjectRole).includes(role)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid project role',
        });
      }

      const result = await projectService.addProjectMember(
        projectId,
        user_id,
        role,
        req.user.id
      );

      if (result.success) {
        res.status(201).json({
          success: true,
          data: result.data,
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error('Add project member error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * DELETE /api/v1/projects/:id/members/:userId
 * Remove member from project
 */
router.delete(
  '/:id/members/:userId',
  authenticateUser,
  validateProjectAccess,
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.id;
      const userIdToRemove = req.params.userId;

      // Check if user has permission to remove members
      const hasPermission = await projectService.checkProjectPermission(
        projectId,
        req.user.id,
        ['owner', 'editor']
      );
      if (!hasPermission.success || !hasPermission.data) {
        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
        });
      }

      // Remove member
      const result = await databaseService.run(
        'DELETE FROM project_memberships WHERE project_id = ? AND user_id = ?',
        [projectId, userIdToRemove]
      );

      res.json({
        success: true,
        message: 'Member removed successfully',
      });
    } catch (error) {
      console.error('Remove project member error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * PUT /api/v1/projects/:id/members/:userId
 * Update member role
 */
router.put(
  '/:id/members/:userId',
  authenticateUser,
  validateProjectAccess,
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.id;
      const userIdToUpdate = req.params.userId;
      const { role } = req.body;

      // Validate role
      if (!role || !Object.values(ProjectRole).includes(role)) {
        return res.status(400).json({
          success: false,
          error: 'Valid role is required',
        });
      }

      // Check if user has permission to update roles
      const hasPermission = await projectService.checkProjectPermission(
        projectId,
        req.user.id,
        ['owner']
      );
      if (!hasPermission.success || !hasPermission.data) {
        return res.status(403).json({
          success: false,
          error: 'Only project owners can update member roles',
        });
      }

      // Update member role
      await databaseService.run(
        'UPDATE project_memberships SET role = ? WHERE project_id = ? AND user_id = ?',
        [role, projectId, userIdToUpdate]
      );

      res.json({
        success: true,
        message: 'Member role updated successfully',
      });
    } catch (error) {
      console.error('Update member role error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * GET /api/v1/projects/:id/stats
 * Get project statistics
 */
router.get(
  '/:id/stats',
  authenticateUser,
  validateProjectAccess,
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.id;

      // Get various project statistics
      const [memberCount, mediaCount, sequenceCount, commentCount] =
        await Promise.all([
          databaseService.get(
            'SELECT COUNT(*) as count FROM project_memberships WHERE project_id = ?',
            [projectId]
          ),
          databaseService.get(
            'SELECT COUNT(*) as count FROM media_assets WHERE project_id = ?',
            [projectId]
          ),
          databaseService.get(
            'SELECT COUNT(*) as count FROM timeline_sequences WHERE project_id = ?',
            [projectId]
          ),
          databaseService.get(
            'SELECT COUNT(*) as count FROM comments WHERE project_id = ? AND status != "deleted"',
            [projectId]
          ),
        ]);

      const stats = {
        member_count: memberCount?.count || 0,
        media_count: mediaCount?.count || 0,
        sequence_count: sequenceCount?.count || 0,
        comment_count: commentCount?.count || 0,
      };

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error('Get project stats error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

// Extend Express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user: {
        id: string;
      };
    }
  }
}

export default router;
