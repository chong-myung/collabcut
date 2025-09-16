/**
 * Media Service (T032)
 * Media asset management with FFmpeg integration
 * Handles file uploads, processing, thumbnails, and metadata extraction
 */

import {
  MediaAssetModel,
  MediaAsset,
  CreateMediaAssetData,
  UpdateMediaAssetData,
  MediaMetadata,
  FileValidationResult,
} from '../models/media-asset';
import { DatabaseService, databaseService } from './database.service';
import {
  DatabaseResult,
  MediaFileType,
  PaginationOptions,
} from '../../../shared/types/database';
import * as path from 'path';
import * as fs from 'fs';
import { app, dialog } from 'electron';
import { spawn } from 'child_process';

export interface MediaProcessingOptions {
  generateThumbnail?: boolean;
  extractMetadata?: boolean;
  convertFormat?: string;
  quality?: 'low' | 'medium' | 'high';
  maxResolution?: string;
}

export interface ThumbnailOptions {
  timeOffset?: number;
  width?: number;
  height?: number;
  format?: 'jpg' | 'png' | 'webp';
}

export interface MediaUploadResult {
  asset: MediaAsset;
  thumbnailPath?: string;
  processingStatus: 'completed' | 'pending' | 'failed';
  errors?: string[];
}

export interface FFmpegInfo {
  duration?: number;
  resolution?: string;
  framerate?: number;
  codec?: string;
  bitrate?: number;
  audio_codec?: string;
  audio_bitrate?: number;
  audio_channels?: number;
  audio_sample_rate?: number;
}

/**
 * Media Service Class
 * Handles media asset management, processing, and FFmpeg operations
 */
export class MediaService {
  private mediaModel: MediaAssetModel;
  private db: DatabaseService;
  private ffmpegPath: string | null = null;
  private ffprobePath: string | null = null;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService;
    this.mediaModel = new MediaAssetModel(databaseService.getDatabase()!);
    this.initializeFFmpeg();
  }

  /**
   * Initialize FFmpeg paths
   * @private
   */
  private async initializeFFmpeg(): Promise<void> {
    try {
      // Try to find FFmpeg in system PATH
      this.ffmpegPath = await this.findExecutable('ffmpeg');
      this.ffprobePath = await this.findExecutable('ffprobe');

      if (!this.ffmpegPath || !this.ffprobePath) {
        console.warn(
          'FFmpeg not found in system PATH. Video processing will be limited.'
        );
      } else {
        console.log('FFmpeg initialized successfully');
      }
    } catch (error) {
      console.error('Failed to initialize FFmpeg:', error);
    }
  }

  /**
   * Find executable in system PATH
   * @private
   */
  private findExecutable(name: string): Promise<string | null> {
    return new Promise((resolve) => {
      const isWindows = process.platform === 'win32';
      const executable = isWindows ? `${name}.exe` : name;

      const child = spawn(isWindows ? 'where' : 'which', [executable]);
      let output = '';

      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0 && output.trim()) {
          resolve(output.trim().split('\n')[0]);
        } else {
          resolve(null);
        }
      });

      child.on('error', () => {
        resolve(null);
      });
    });
  }

  /**
   * Upload and process media file
   * @param filePath - Path to the uploaded file
   * @param projectId - Project ID
   * @param uploadedBy - User ID
   * @param options - Processing options
   * @returns Promise with upload result
   */
  async uploadMedia(
    filePath: string,
    projectId: string,
    uploadedBy: string,
    options: MediaProcessingOptions = {}
  ): Promise<DatabaseResult<MediaUploadResult>> {
    try {
      const filename = path.basename(filePath);

      // Validate file
      const validationResult = await this.mediaModel.validateFile(
        filePath,
        filename
      );
      if (!validationResult.isValid) {
        return {
          success: false,
          error: `File validation failed: ${validationResult.errors.join(', ')}`,
        };
      }

      // Get file stats
      const stats = fs.statSync(filePath);

      // Move file to media storage
      const mediaDir = this.getMediaDirectory(projectId);
      if (!fs.existsSync(mediaDir)) {
        fs.mkdirSync(mediaDir, { recursive: true });
      }

      const storedPath = path.join(
        mediaDir,
        this.generateUniqueFilename(filename)
      );
      fs.copyFileSync(filePath, storedPath);

      let metadata: MediaMetadata = {};
      let thumbnailPath: string | undefined;

      // Extract metadata if requested or for video/audio files
      if (
        options.extractMetadata !== false &&
        (validationResult.fileType === MediaFileType.VIDEO ||
          validationResult.fileType === MediaFileType.AUDIO)
      ) {
        const metadataResult = await this.extractMetadata(storedPath);
        if (metadataResult.success && metadataResult.data) {
          metadata = metadataResult.data;
        }
      }

      // Generate thumbnail for video files
      if (
        options.generateThumbnail !== false &&
        validationResult.fileType === MediaFileType.VIDEO
      ) {
        const thumbnailResult = await this.generateThumbnail(storedPath, {
          timeOffset: 1,
          width: 320,
          height: 180,
          format: 'jpg',
        });

        if (thumbnailResult.success && thumbnailResult.data) {
          thumbnailPath = thumbnailResult.data;
        }
      }

      // Create media asset record
      const createData: CreateMediaAssetData = {
        project_id: projectId,
        filename,
        file_path: storedPath,
        file_type: validationResult.fileType,
        file_size: stats.size,
        uploaded_by: uploadedBy,
        duration: metadata.duration,
        resolution: metadata.resolution,
        framerate: metadata.framerate,
        codec: metadata.codec,
        metadata,
        folder_path: '',
      };

      const assetResult = await this.mediaModel.create(createData);
      if (!assetResult.success || !assetResult.data) {
        // Clean up files on failure
        this.cleanupFile(storedPath);
        if (thumbnailPath) this.cleanupFile(thumbnailPath);

        return {
          success: false,
          error: assetResult.error || 'Failed to create media asset',
        };
      }

      // Update asset with thumbnail URL if generated
      if (thumbnailPath) {
        await this.mediaModel.update(assetResult.data.id, {
          thumbnail_url: thumbnailPath,
        });
        assetResult.data.thumbnail_url = thumbnailPath;
      }

      return {
        success: true,
        data: {
          asset: assetResult.data,
          thumbnailPath,
          processingStatus: 'completed',
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed',
      };
    }
  }

  /**
   * Get media assets for project
   * @param projectId - Project ID
   * @param options - Pagination and filtering options
   * @returns Promise with media assets array
   */
  async getProjectMedia(
    projectId: string,
    options: PaginationOptions & {
      fileType?: MediaFileType;
      folderPath?: string;
    } = {}
  ): Promise<DatabaseResult<MediaAsset[]>> {
    return this.mediaModel.findByProjectId(projectId, options);
  }

  /**
   * Get media asset by ID
   * @param assetId - Media asset ID
   * @returns Promise with media asset
   */
  async getMediaAsset(assetId: string): Promise<DatabaseResult<MediaAsset>> {
    return this.mediaModel.findById(assetId);
  }

  /**
   * Update media asset
   * @param assetId - Media asset ID
   * @param data - Update data
   * @returns Promise with updated asset
   */
  async updateMediaAsset(
    assetId: string,
    data: UpdateMediaAssetData
  ): Promise<DatabaseResult<MediaAsset>> {
    return this.mediaModel.update(assetId, data);
  }

  /**
   * Delete media asset
   * @param assetId - Media asset ID
   * @returns Promise with success status
   */
  async deleteMediaAsset(assetId: string): Promise<DatabaseResult<boolean>> {
    try {
      // Get asset info first
      const assetResult = await this.mediaModel.findById(assetId);
      if (!assetResult.success || !assetResult.data) {
        return { success: false, error: 'Media asset not found' };
      }

      const asset = assetResult.data;

      // Delete from database
      const deleteResult = await this.mediaModel.delete(assetId);
      if (!deleteResult.success) {
        return deleteResult;
      }

      // Clean up files
      this.cleanupFile(asset.file_path);
      if (asset.thumbnail_url) {
        this.cleanupFile(asset.thumbnail_url);
      }

      return { success: true, data: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Delete failed',
      };
    }
  }

  /**
   * Generate thumbnail for video file
   * @param videoPath - Path to video file
   * @param options - Thumbnail options
   * @returns Promise with thumbnail path
   */
  async generateThumbnail(
    videoPath: string,
    options: ThumbnailOptions = {}
  ): Promise<DatabaseResult<string>> {
    if (!this.ffmpegPath) {
      return { success: false, error: 'FFmpeg not available' };
    }

    try {
      const {
        timeOffset = 1,
        width = 320,
        height = 180,
        format = 'jpg',
      } = options;

      const thumbnailDir = path.join(path.dirname(videoPath), 'thumbnails');
      if (!fs.existsSync(thumbnailDir)) {
        fs.mkdirSync(thumbnailDir, { recursive: true });
      }

      const thumbnailPath = path.join(
        thumbnailDir,
        `${path.parse(videoPath).name}_thumb.${format}`
      );

      const args = [
        '-i',
        videoPath,
        '-ss',
        timeOffset.toString(),
        '-vframes',
        '1',
        '-vf',
        `scale=${width}:${height}`,
        '-y', // Overwrite output file
        thumbnailPath,
      ];

      await this.runFFmpeg(args);

      if (fs.existsSync(thumbnailPath)) {
        return { success: true, data: thumbnailPath };
      } else {
        return { success: false, error: 'Thumbnail generation failed' };
      }
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Thumbnail generation failed',
      };
    }
  }

  /**
   * Extract metadata from media file
   * @param filePath - Path to media file
   * @returns Promise with metadata
   */
  async extractMetadata(filePath: string): Promise<DatabaseResult<FFmpegInfo>> {
    if (!this.ffprobePath) {
      return { success: false, error: 'FFprobe not available' };
    }

    try {
      const args = [
        '-v',
        'quiet',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        filePath,
      ];

      const output = await this.runFFprobe(args);
      const info = JSON.parse(output);

      const metadata: FFmpegInfo = {};

      // Extract format information
      if (info.format) {
        metadata.duration = parseFloat(info.format.duration);
        metadata.bitrate = parseInt(info.format.bit_rate);
      }

      // Extract video stream information
      const videoStream = info.streams?.find(
        (s: any) => s.codec_type === 'video'
      );
      if (videoStream) {
        metadata.resolution = `${videoStream.width}x${videoStream.height}`;
        metadata.framerate = this.parseFramerate(videoStream.r_frame_rate);
        metadata.codec = videoStream.codec_name;
      }

      // Extract audio stream information
      const audioStream = info.streams?.find(
        (s: any) => s.codec_type === 'audio'
      );
      if (audioStream) {
        metadata.audio_codec = audioStream.codec_name;
        metadata.audio_bitrate = parseInt(audioStream.bit_rate);
        metadata.audio_channels = audioStream.channels;
        metadata.audio_sample_rate = parseInt(audioStream.sample_rate);
      }

      return { success: true, data: metadata };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Metadata extraction failed',
      };
    }
  }

  /**
   * Process video with custom FFmpeg options
   * @param inputPath - Input file path
   * @param outputPath - Output file path
   * @param options - Processing options
   * @returns Promise with processed file path
   */
  async processVideo(
    inputPath: string,
    outputPath: string,
    options: any = {}
  ): Promise<DatabaseResult<string>> {
    if (!this.ffmpegPath) {
      return { success: false, error: 'FFmpeg not available' };
    }

    try {
      const args = ['-i', inputPath];

      // Add custom options
      if (options.codec) args.push('-c:v', options.codec);
      if (options.format) args.push('-f', options.format);
      if (options.resolution) args.push('-s', options.resolution);
      if (options.framerate) args.push('-r', options.framerate.toString());
      if (options.startTime)
        args.splice(-1, 0, '-ss', options.startTime.toString());
      if (options.duration) args.push('-t', options.duration.toString());

      args.push('-y', outputPath); // Overwrite output file

      await this.runFFmpeg(args);

      if (fs.existsSync(outputPath)) {
        return { success: true, data: outputPath };
      } else {
        return { success: false, error: 'Video processing failed' };
      }
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Video processing failed',
      };
    }
  }

  /**
   * Open file dialog to select media files
   * @param allowedTypes - Allowed file types
   * @returns Promise with selected file paths
   */
  async openFileDialog(
    allowedTypes?: MediaFileType[]
  ): Promise<DatabaseResult<string[]>> {
    try {
      const filters: any[] = [];

      if (!allowedTypes || allowedTypes.length === 0) {
        filters.push(
          {
            name: 'Video Files',
            extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'],
          },
          {
            name: 'Audio Files',
            extensions: ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'],
          },
          {
            name: 'Image Files',
            extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'],
          },
          { name: 'All Files', extensions: ['*'] }
        );
      } else {
        if (allowedTypes.includes(MediaFileType.VIDEO)) {
          filters.push({
            name: 'Video Files',
            extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'],
          });
        }
        if (allowedTypes.includes(MediaFileType.AUDIO)) {
          filters.push({
            name: 'Audio Files',
            extensions: ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'],
          });
        }
        if (allowedTypes.includes(MediaFileType.IMAGE)) {
          filters.push({
            name: 'Image Files',
            extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'],
          });
        }
      }

      const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters,
      });

      if (result.canceled || !result.filePaths.length) {
        return { success: false, error: 'No files selected' };
      }

      return { success: true, data: result.filePaths };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'File dialog failed',
      };
    }
  }

  /**
   * Get media directory for project
   * @private
   */
  private getMediaDirectory(projectId: string): string {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'media', projectId);
  }

  /**
   * Generate unique filename to avoid conflicts
   * @private
   */
  private generateUniqueFilename(originalFilename: string): string {
    const ext = path.extname(originalFilename);
    const name = path.basename(originalFilename, ext);
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 5);
    return `${name}_${timestamp}_${random}${ext}`;
  }

  /**
   * Run FFmpeg command
   * @private
   */
  private runFFmpeg(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.ffmpegPath!, args);

      let stderr = '';
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg failed with code ${code}: ${stderr}`));
        }
      });

      child.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Run FFprobe command
   * @private
   */
  private runFFprobe(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.ffprobePath!, args);

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`FFprobe failed with code ${code}: ${stderr}`));
        }
      });

      child.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Parse framerate string to number
   * @private
   */
  private parseFramerate(framerateStr: string): number {
    if (!framerateStr) return 0;

    if (framerateStr.includes('/')) {
      const [num, den] = framerateStr.split('/').map(Number);
      return num / den;
    }

    return parseFloat(framerateStr);
  }

  /**
   * Clean up file safely
   * @private
   */
  private cleanupFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.error('Failed to cleanup file:', filePath, error);
    }
  }
}

export default MediaService;
