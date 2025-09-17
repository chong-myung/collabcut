/**
 * Media API Routes (T036)
 * HTTP endpoints for media asset management
 * Handles Upload, List, Delete, Thumbnail operations
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { MediaService } from '../services/media.service';
import { ProjectService } from '../services/project.service';
import { databaseService } from '../services/database.service';
import { MediaFileType } from '../../../shared/types/database';

// Initialize services
const mediaService = new MediaService();
const projectService = new ProjectService(databaseService);

const router = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path.join(process.cwd(), 'temp', 'uploads');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 * 1024, // 5GB limit
    files: 10, // Max 10 files per upload
  },
  fileFilter: (req, file, cb) => {
    // Allow common media file types
    const allowedMimes = [
      'video/mp4',
      'video/mov',
      'video/avi',
      'video/mkv',
      'video/webm',
      'audio/mp3',
      'audio/wav',
      'audio/aac',
      'audio/flac',
      'audio/ogg',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/bmp',
      'image/webp',
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

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
    const projectId = req.params.projectId;
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
 * POST /api/v1/projects/:projectId/media
 * Upload media files to project
 */
router.post(
  '/:projectId/media',
  authenticateUser,
  validateProjectAccess,
  upload.array('files'),
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId;
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No files provided',
        });
      }

      const uploadResults = [];
      const errors = [];

      // Process each uploaded file
      for (const file of files) {
        try {
          const result = await mediaService.uploadMedia(
            file.path,
            projectId,
            req.user.id,
            {
              generateThumbnail: true,
              extractMetadata: true,
            }
          );

          if (result.success) {
            uploadResults.push(result.data);
          } else {
            errors.push({
              filename: file.originalname,
              error: result.error,
            });
          }

          // Clean up temp file
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (error) {
          errors.push({
            filename: file.originalname,
            error: error instanceof Error ? error.message : 'Upload failed',
          });
        }
      }

      res.status(uploadResults.length > 0 ? 201 : 400).json({
        success: uploadResults.length > 0,
        data: {
          uploaded: uploadResults,
          errors: errors,
          total_files: files.length,
          successful_uploads: uploadResults.length,
          failed_uploads: errors.length,
        },
      });
    } catch (error) {
      console.error('Media upload error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * GET /api/v1/projects/:projectId/media
 * Get media assets for project
 */
router.get(
  '/:projectId/media',
  authenticateUser,
  validateProjectAccess,
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId;
      const options = {
        limit: req.query.limit
          ? parseInt(req.query.limit as string)
          : undefined,
        offset: req.query.offset
          ? parseInt(req.query.offset as string)
          : undefined,
        fileType: req.query.fileType as MediaFileType,
        folderPath: req.query.folderPath as string,
        orderBy: req.query.orderBy as string,
        orderDirection: req.query.orderDirection as 'ASC' | 'DESC',
      };

      const result = await mediaService.getProjectMedia(projectId, options);

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
      console.error('Get media assets error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * GET /api/v1/projects/:projectId/media/:assetId
 * Get specific media asset
 */
router.get(
  '/:projectId/media/:assetId',
  authenticateUser,
  validateProjectAccess,
  async (req: Request, res: Response) => {
    try {
      const assetId = req.params.assetId;
      const result = await mediaService.getMediaAsset(assetId);

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
      console.error('Get media asset error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * PUT /api/v1/projects/:projectId/media/:assetId
 * Update media asset metadata
 */
router.put(
  '/:projectId/media/:assetId',
  authenticateUser,
  validateProjectAccess,
  async (req: Request, res: Response) => {
    try {
      const assetId = req.params.assetId;
      const { filename, metadata, folder_path } = req.body;

      const updateData = {
        filename,
        metadata,
        folder_path,
      };

      const result = await mediaService.updateMediaAsset(assetId, updateData);

      if (result.success) {
        // Get updated asset data
        const updatedAsset = await mediaService.getMediaAsset(assetId);
        res.json({
          success: true,
          data: updatedAsset.data,
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error('Update media asset error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * DELETE /api/v1/projects/:projectId/media/:assetId
 * Delete media asset
 */
router.delete(
  '/:projectId/media/:assetId',
  authenticateUser,
  validateProjectAccess,
  async (req: Request, res: Response) => {
    try {
      const assetId = req.params.assetId;

      // Check if user has permission to delete
      const hasPermission = await projectService.checkProjectPermission(
        req.params.projectId,
        req.user.id,
        ['owner', 'editor']
      );

      if (!hasPermission.success || !hasPermission.data) {
        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
        });
      }

      const result = await mediaService.deleteMediaAsset(assetId);

      if (result.success) {
        res.json({
          success: true,
          message: 'Media asset deleted successfully',
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error('Delete media asset error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * POST /api/v1/projects/:projectId/media/:assetId/thumbnail
 * Generate thumbnail for video asset
 */
router.post(
  '/:projectId/media/:assetId/thumbnail',
  authenticateUser,
  validateProjectAccess,
  async (req: Request, res: Response) => {
    try {
      const assetId = req.params.assetId;
      const { timeOffset, width, height, format } = req.body;

      // Get asset info
      const assetResult = await mediaService.getMediaAsset(assetId);
      if (!assetResult.success || !assetResult.data) {
        return res.status(404).json({
          success: false,
          error: 'Media asset not found',
        });
      }

      const asset = assetResult.data;

      // Only generate thumbnails for video files
      if (asset.file_type !== MediaFileType.VIDEO) {
        return res.status(400).json({
          success: false,
          error: 'Thumbnails can only be generated for video files',
        });
      }

      const thumbnailOptions = {
        timeOffset: timeOffset || 1,
        width: width || 320,
        height: height || 180,
        format: format || 'jpg',
      };

      const result = await mediaService.generateThumbnail(
        asset.file_path,
        thumbnailOptions
      );

      if (result.success) {
        // Update asset with new thumbnail URL
        await mediaService.updateMediaAsset(assetId, {
          thumbnail_url: result.data,
        });

        res.json({
          success: true,
          data: {
            thumbnail_url: result.data,
          },
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error('Generate thumbnail error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * GET /api/v1/projects/:projectId/media/folders
 * Get folder structure for project media
 */
router.get(
  '/:projectId/media/folders',
  authenticateUser,
  validateProjectAccess,
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId;

      // Get folder structure from database
      const folders = await databaseService.all(
        'SELECT DISTINCT folder_path FROM media_assets WHERE project_id = ? AND folder_path != "" ORDER BY folder_path',
        [projectId]
      );

      const folderPaths = folders.map((row: any) => row.folder_path);

      res.json({
        success: true,
        data: folderPaths,
      });
    } catch (error) {
      console.error('Get media folders error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * POST /api/v1/projects/:projectId/media/process
 * Process media file with custom options
 */
router.post(
  '/:projectId/media/:assetId/process',
  authenticateUser,
  validateProjectAccess,
  async (req: Request, res: Response) => {
    try {
      const assetId = req.params.assetId;
      const { operation, options } = req.body;

      // Get asset info
      const assetResult = await mediaService.getMediaAsset(assetId);
      if (!assetResult.success || !assetResult.data) {
        return res.status(404).json({
          success: false,
          error: 'Media asset not found',
        });
      }

      const asset = assetResult.data;
      const outputPath = path.join(
        path.dirname(asset.file_path),
        `processed_${Date.now()}_${path.basename(asset.file_path)}`
      );

      let result;

      switch (operation) {
        case 'extract_metadata':
          result = await mediaService.extractMetadata(asset.file_path);
          break;

        case 'process_video':
          result = await mediaService.processVideo(
            asset.file_path,
            outputPath,
            options
          );
          break;

        default:
          return res.status(400).json({
            success: false,
            error: 'Unknown processing operation',
          });
      }

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
      console.error('Process media error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * GET /api/v1/projects/:projectId/media/search
 * Search media assets by filename
 */
router.get(
  '/:projectId/media/search',
  authenticateUser,
  validateProjectAccess,
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId;
      const searchTerm = req.query.q as string;

      if (!searchTerm) {
        return res.status(400).json({
          success: false,
          error: 'Search term is required',
        });
      }

      const options = {
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
      };

      // Use database search functionality
      const assets = await databaseService.all(
        `
      SELECT * FROM media_assets
      WHERE project_id = ? AND filename LIKE ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `,
        [projectId, `%${searchTerm}%`, options.limit, options.offset]
      );

      const mappedAssets = assets.map((row: any) => ({
        id: row.id,
        project_id: row.project_id,
        filename: row.filename,
        file_path: row.file_path,
        cloud_url: row.cloud_url,
        file_type: row.file_type,
        file_size: row.file_size,
        duration: row.duration,
        resolution: row.resolution,
        framerate: row.framerate,
        codec: row.codec,
        thumbnail_url: row.thumbnail_url,
        uploaded_by: row.uploaded_by,
        metadata: JSON.parse(row.metadata || '{}'),
        folder_path: row.folder_path || '',
        created_at: new Date(row.created_at),
      }));

      res.json({
        success: true,
        data: mappedAssets,
        pagination: {
          limit: options.limit,
          offset: options.offset,
          total: mappedAssets.length,
        },
      });
    } catch (error) {
      console.error('Search media assets error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

// Extend Express Request interface
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
