/**
 * MediaAsset Model (T025)
 * Video, audio, or image files stored in the cloud-synced asset library.
 * Handles file management, metadata extraction, and thumbnail generation.
 */

import { Database } from 'sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import {
  BaseModel,
  MediaFileType,
  ValidationError,
  DatabaseResult,
  PaginationOptions,
  ModelValidator,
} from '../../../shared/types/database';

/** Media asset entity interface */
export interface MediaAsset extends BaseModel {
  project_id: string;
  filename: string;
  file_path: string;
  cloud_url?: string;
  file_type: MediaFileType;
  file_size: number;
  duration?: number;
  resolution?: string;
  framerate?: number;
  codec?: string;
  thumbnail_url?: string;
  uploaded_by: string;
  metadata: MediaMetadata;
  folder_path: string;
}

/** Media asset metadata interface */
export interface MediaMetadata {
  width?: number;
  height?: number;
  bitrate?: number;
  channels?: number;
  sample_rate?: number;
  [key: string]: any;
}

/** Media asset creation data */
export interface CreateMediaAssetData {
  project_id: string;
  filename: string;
  file_path: string;
  file_type: MediaFileType;
  file_size: number;
  uploaded_by: string;
  duration?: number;
  resolution?: string;
  framerate?: number;
  codec?: string;
  metadata?: Partial<MediaMetadata>;
  folder_path?: string;
}

/** Media asset update data */
export interface UpdateMediaAssetData {
  filename?: string;
  cloud_url?: string;
  thumbnail_url?: string;
  metadata?: Partial<MediaMetadata>;
  folder_path?: string;
}

/** Media asset with usage statistics */
export interface MediaAssetWithUsage extends MediaAsset {
  clip_count?: number;
  last_used_at?: Date;
  total_duration_used?: number;
}

/** File validation result */
export interface FileValidationResult {
  isValid: boolean;
  fileType: MediaFileType;
  errors: string[];
}

/**
 * MediaAsset Model Class
 * Handles CRUD operations, file validation, and metadata for media assets
 */
export class MediaAssetModel implements ModelValidator<MediaAsset> {
  private db: Database;

  // Supported file extensions by type
  private readonly SUPPORTED_EXTENSIONS = {
    [MediaFileType.VIDEO]: ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'],
    [MediaFileType.AUDIO]: ['.mp3', '.wav', '.aac', '.flac', '.ogg', '.m4a'],
    [MediaFileType.IMAGE]: [
      '.jpg',
      '.jpeg',
      '.png',
      '.gif',
      '.bmp',
      '.svg',
      '.webp',
    ],
    [MediaFileType.SUBTITLE]: ['.srt', '.vtt', '.ass', '.ssa'],
  };

  constructor(database: Database) {
    this.db = database;
  }

  /**
   * Validate media asset data
   * @param data - Media asset data to validate
   * @returns Array of validation errors
   */
  validate(data: Partial<CreateMediaAssetData>): ValidationError[] {
    const errors: ValidationError[] = [];

    // Project ID validation
    if (!data.project_id) {
      errors.push(new ValidationError('project_id', 'Project ID is required'));
    }

    // Filename validation
    if (!data.filename) {
      errors.push(new ValidationError('filename', 'Filename is required'));
    } else if (data.filename.trim().length === 0) {
      errors.push(new ValidationError('filename', 'Filename cannot be empty'));
    }

    // File path validation
    if (!data.file_path) {
      errors.push(new ValidationError('file_path', 'File path is required'));
    }

    // File type validation
    if (!data.file_type) {
      errors.push(new ValidationError('file_type', 'File type is required'));
    } else if (!Object.values(MediaFileType).includes(data.file_type)) {
      errors.push(new ValidationError('file_type', 'Invalid file type'));
    }

    // File size validation
    if (data.file_size === undefined || data.file_size === null) {
      errors.push(new ValidationError('file_size', 'File size is required'));
    } else if (data.file_size <= 0) {
      errors.push(
        new ValidationError('file_size', 'File size must be positive')
      );
    }

    // Uploaded by validation
    if (!data.uploaded_by) {
      errors.push(
        new ValidationError('uploaded_by', 'Uploader user ID is required')
      );
    }

    // Duration validation (for video/audio files)
    if (data.duration !== undefined && data.duration <= 0) {
      errors.push(new ValidationError('duration', 'Duration must be positive'));
    }

    // Resolution validation (for video files)
    if (data.resolution && !this.isValidResolution(data.resolution)) {
      errors.push(
        new ValidationError('resolution', 'Invalid resolution format')
      );
    }

    // Framerate validation
    if (data.framerate !== undefined && data.framerate <= 0) {
      errors.push(
        new ValidationError('framerate', 'Framerate must be positive')
      );
    }

    return errors;
  }

  /**
   * Validate media asset update data
   * @param data - Media asset update data to validate
   * @returns Array of validation errors
   */
  validateUpdate(data: Partial<UpdateMediaAssetData>): ValidationError[] {
    const errors: ValidationError[] = [];

    // Filename validation (if provided)
    if (data.filename !== undefined && data.filename.trim().length === 0) {
      errors.push(new ValidationError('filename', 'Filename cannot be empty'));
    }

    return errors;
  }

  /**
   * Validate file before upload
   * @param filePath - Path to the file
   * @param filename - Original filename
   * @returns File validation result
   */
  async validateFile(
    filePath: string,
    filename: string
  ): Promise<FileValidationResult> {
    const result: FileValidationResult = {
      isValid: false,
      fileType: MediaFileType.VIDEO,
      errors: [],
    };

    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        result.errors.push('File does not exist');
        return result;
      }

      // Get file stats
      const stats = fs.statSync(filePath);
      if (!stats.isFile()) {
        result.errors.push('Path is not a file');
        return result;
      }

      // Check file size (limit to 5GB)
      const maxSize = 5 * 1024 * 1024 * 1024; // 5GB
      if (stats.size > maxSize) {
        result.errors.push('File size exceeds 5GB limit');
        return result;
      }

      // Determine file type by extension
      const extension = path.extname(filename).toLowerCase();
      let fileType: MediaFileType | null = null;

      for (const [type, extensions] of Object.entries(
        this.SUPPORTED_EXTENSIONS
      )) {
        if (extensions.includes(extension)) {
          fileType = type as MediaFileType;
          break;
        }
      }

      if (!fileType) {
        result.errors.push(`Unsupported file type: ${extension}`);
        return result;
      }

      result.fileType = fileType;
      result.isValid = true;

      return result;
    } catch (error) {
      result.errors.push(
        error instanceof Error ? error.message : 'Unknown validation error'
      );
      return result;
    }
  }

  /**
   * Create a new media asset
   * @param data - Media asset creation data
   * @returns Promise with created media asset or error
   */
  async create(
    data: CreateMediaAssetData
  ): Promise<DatabaseResult<MediaAsset>> {
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
      const metadata = JSON.stringify(data.metadata || {});
      const folderPath = data.folder_path || '';

      return new Promise((resolve) => {
        const stmt = this.db.prepare(`
          INSERT INTO media_assets (
            id, project_id, filename, file_path, file_type, file_size,
            duration, resolution, framerate, codec, uploaded_by,
            metadata, folder_path, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          [
            id,
            data.project_id,
            data.filename,
            data.file_path,
            data.file_type,
            data.file_size,
            data.duration || null,
            data.resolution || null,
            data.framerate || null,
            data.codec || null,
            data.uploaded_by,
            metadata,
            folderPath,
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
                  filename: data.filename,
                  file_path: data.file_path,
                  file_type: data.file_type,
                  file_size: data.file_size,
                  duration: data.duration,
                  resolution: data.resolution,
                  framerate: data.framerate,
                  codec: data.codec,
                  uploaded_by: data.uploaded_by,
                  metadata: data.metadata || {},
                  folder_path: folderPath,
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
   * Find media asset by ID
   * @param id - Media asset ID
   * @returns Promise with media asset or error
   */
  async findById(id: string): Promise<DatabaseResult<MediaAsset>> {
    try {
      return new Promise((resolve) => {
        this.db.get(
          'SELECT * FROM media_assets WHERE id = ?',
          [id],
          (err, row: any) => {
            if (err) {
              resolve({ success: false, error: err.message });
            } else if (!row) {
              resolve({ success: false, error: 'Media asset not found' });
            } else {
              resolve({
                success: true,
                data: this.mapRowToMediaAsset(row),
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
   * Find media assets by project ID
   * @param projectId - Project ID
   * @param options - Pagination and filtering options
   * @returns Promise with media assets array or error
   */
  async findByProjectId(
    projectId: string,
    options: PaginationOptions & {
      fileType?: MediaFileType;
      folderId?: string;
    } = {}
  ): Promise<DatabaseResult<MediaAsset[]>> {
    try {
      const limit = options.limit || 50;
      const offset = options.offset || 0;
      const orderBy = options.orderBy || 'created_at';
      const orderDirection = options.orderDirection || 'DESC';

      let mediaQuery =
        'SELECT * FROM media_assets WHERE project_id = ? AND folder_id IS NULL';
      let folderQuery =
        'SELECT * FROM folders WHERE project_id = ? AND parent_id IS NULL';
      const mediaParams: any[] = [projectId];
      const folderParams: any[] = [projectId];

      // Add file type filter
      if (options.fileType) {
        mediaQuery += ' AND file_type = ?';
        mediaParams.push(options.fileType);
      }

      // Add folder path filter
      if (options.folderId !== undefined) {
        mediaQuery += ' AND folder_id = ?';
        mediaParams.push(options.folderId);
      }
      console.log(this.db);
      // Execute both queries in parallel
      return new Promise((resolve) => {
        let mediaResults: any[] = [];
        let folderResults: any[] = [];
        let completedQueries = 0;
        let hasError = false;

        const checkCompletion = () => {
          if (hasError) return;

          completedQueries++;
          if (completedQueries === 2) {
            // Combine and sort results
            const allAssets = [
              ...mediaResults.map((row) => this.mapRowToMediaAsset(row)),
              ...folderResults.map((row) => this.mapRowToFolder(row)),
            ];

            // Sort combined results
            allAssets.sort((a, b) => {
              const aValue = a[orderBy as keyof MediaAsset];
              const bValue = b[orderBy as keyof MediaAsset];

              // Handle undefined values
              if (aValue === undefined && bValue === undefined) return 0;
              if (aValue === undefined)
                return orderDirection === 'ASC' ? 1 : -1;
              if (bValue === undefined)
                return orderDirection === 'ASC' ? -1 : 1;

              if (orderDirection === 'ASC') {
                return aValue > bValue ? 1 : -1;
              } else {
                return aValue < bValue ? 1 : -1;
              }
            });

            // Apply pagination
            const paginatedAssets = allAssets.slice(offset, offset + limit);

            resolve({ success: true, data: paginatedAssets });
          }
        };
        console.log(this.db);
        // Execute media query
        this.db.all(mediaQuery, mediaParams, (err, rows: any[]) => {
          if (err) {
            hasError = true;
            resolve({ success: false, error: err.message });
            return;
          }
          mediaResults = rows;
          checkCompletion();
        });

        // Execute folder query
        this.db.all(folderQuery, folderParams, (err, rows: any[]) => {
          if (err) {
            hasError = true;
            resolve({ success: false, error: err.message });
            return;
          }
          folderResults = rows;
          checkCompletion();
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
   * Find media assets by file type
   * @param projectId - Project ID
   * @param fileType - Media file type
   * @returns Promise with media assets array or error
   */
  async findByFileType(
    projectId: string,
    fileType: MediaFileType
  ): Promise<DatabaseResult<MediaAsset[]>> {
    return this.findByProjectId(projectId, { fileType });
  }

  /**
   * Search media assets by filename
   * @param projectId - Project ID
   * @param searchTerm - Search term for filename
   * @param options - Pagination options
   * @returns Promise with media assets array or error
   */
  async searchByFilename(
    projectId: string,
    searchTerm: string,
    options: PaginationOptions = {}
  ): Promise<DatabaseResult<MediaAsset[]>> {
    try {
      const limit = options.limit || 50;
      const offset = options.offset || 0;

      return new Promise((resolve) => {
        this.db.all(
          `
          SELECT * FROM media_assets
          WHERE project_id = ? AND filename LIKE ?
          ORDER BY created_at DESC
          LIMIT ? OFFSET ?
        `,
          [projectId, `%${searchTerm}%`, limit, offset],
          (err, rows: any[]) => {
            if (err) {
              resolve({ success: false, error: err.message });
            } else {
              const assets = rows.map((row) => this.mapRowToMediaAsset(row));
              resolve({ success: true, data: assets });
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
   * Update media asset
   * @param id - Media asset ID
   * @param data - Update data
   * @returns Promise with updated media asset or error
   */
  async update(
    id: string,
    data: UpdateMediaAssetData
  ): Promise<DatabaseResult<MediaAsset>> {
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

      if (data.filename !== undefined) {
        updates.push('filename = ?');
        values.push(data.filename);
      }
      if (data.cloud_url !== undefined) {
        updates.push('cloud_url = ?');
        values.push(data.cloud_url);
      }
      if (data.thumbnail_url !== undefined) {
        updates.push('thumbnail_url = ?');
        values.push(data.thumbnail_url);
      }
      if (data.metadata !== undefined) {
        updates.push('metadata = ?');
        values.push(JSON.stringify(data.metadata));
      }
      if (data.folder_path !== undefined) {
        updates.push('folder_path = ?');
        values.push(data.folder_path);
      }

      if (updates.length === 0) {
        return { success: false, error: 'No fields to update' };
      }

      values.push(id);

      return new Promise((resolve) => {
        this.db.run(
          `UPDATE media_assets SET ${updates.join(', ')} WHERE id = ?`,
          values,
          function (err) {
            if (err) {
              resolve({ success: false, error: err.message });
            } else if (this.changes === 0) {
              resolve({ success: false, error: 'Media asset not found' });
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
   * Delete media asset
   * @param id - Media asset ID
   * @returns Promise with success status
   */
  async delete(id: string): Promise<DatabaseResult<boolean>> {
    try {
      // Check if asset is used in clips
      const usageResult = await this.checkAssetUsage(id);
      if (!usageResult.success) {
        return {
          success: false,
          error: usageResult.error,
        };
      }

      if (usageResult.data && usageResult.data > 0) {
        return {
          success: false,
          error: 'Cannot delete media asset that is used in clips',
        };
      }

      return new Promise((resolve) => {
        this.db.run(
          'DELETE FROM media_assets WHERE id = ?',
          [id],
          function (err) {
            if (err) {
              resolve({ success: false, error: err.message });
            } else if (this.changes === 0) {
              resolve({ success: false, error: 'Media asset not found' });
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
   * Check if media asset is used in clips
   * @param id - Media asset ID
   * @returns Promise with usage count or error
   */
  async checkAssetUsage(id: string): Promise<DatabaseResult<number>> {
    try {
      return new Promise((resolve) => {
        this.db.get(
          'SELECT COUNT(*) as count FROM clips WHERE media_asset_id = ?',
          [id],
          (err, row: any) => {
            if (err) {
              resolve({ success: false, error: err.message });
            } else {
              resolve({ success: true, data: row.count });
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
   * Get folder structure for project
   * @param projectId - Project ID
   * @returns Promise with folder paths array
   */
  async getFolderStructure(
    projectId: string
  ): Promise<DatabaseResult<string[]>> {
    try {
      return new Promise((resolve) => {
        this.db.all(
          'SELECT DISTINCT folder_path FROM media_assets WHERE project_id = ? ORDER BY folder_path',
          [projectId],
          (err, rows: any[]) => {
            if (err) {
              resolve({ success: false, error: err.message });
            } else {
              const folders = rows
                .map((row) => row.folder_path)
                .filter((path) => path);
              resolve({ success: true, data: folders });
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
   * Map database row to MediaAsset object
   * @param row - Database row
   * @returns MediaAsset object
   */
  private mapRowToMediaAsset(row: any): MediaAsset {
    return {
      id: row.id,
      project_id: row.project_id,
      filename: row.filename,
      file_path: row.file_path,
      cloud_url: row.cloud_url,
      file_type: row.file_type as MediaFileType,
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
    };
  }

  /**
   * Map folder row to MediaAsset object
   * @param row - Database row from folders table
   * @returns MediaAsset object representing a folder
   */
  private mapRowToFolder(row: any): MediaAsset {
    return {
      id: row.id,
      project_id: row.project_id,
      filename: row.name, // Use folder name as filename
      file_path: row.path,
      cloud_url: undefined,
      file_type: 'folder' as any, // Cast to any since folder is not in MediaFileType enum
      file_size: 0, // Folders have no file size
      duration: undefined,
      resolution: undefined,
      framerate: undefined,
      codec: undefined,
      thumbnail_url: undefined,
      uploaded_by: row.created_by,
      metadata: {
        description: row.description,
        color: row.color,
        sort_order: row.sort_order,
        permissions: JSON.parse(row.permissions || '{}'),
      },
      folder_path: row.path,
      created_at: new Date(row.created_at),
    };
  }

  /**
   * Generate unique ID for new media assets
   * @returns Unique string ID
   */
  private generateId(): string {
    return `asset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
