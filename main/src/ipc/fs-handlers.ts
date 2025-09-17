import { ipcMain, dialog } from 'electron';
import { IPCResult } from '../../../shared/types/ipc-contract';
import type {
  FileSystemBrowseRequest,
  FileSystemBrowseResponse,
  FileMetadataRequest,
  FileMetadataResponse,
  ThumbnailGenerateRequest,
  ThumbnailGenerateResponse,
  IPCChannels
} from '../../../shared/types/ipc-contract';
import { FileService } from '../services/FileService';
import { ThumbnailService } from '../services/ThumbnailService';
import { logger } from '../services/logger';
import * as fs from 'fs/promises';
import * as path from 'path';

export class FileSystemHandlers {
  private fileService: FileService;
  private thumbnailService: ThumbnailService;

  constructor(fileService: FileService, thumbnailService: ThumbnailService) {
    this.fileService = fileService;
    this.thumbnailService = thumbnailService;
    this.registerHandlers();
  }

  private registerHandlers(): void {
    ipcMain.handle('fs:browse', this.handleBrowseFiles.bind(this));
    ipcMain.handle('fs:get-metadata', this.handleGetFileMetadata.bind(this));
    ipcMain.handle('fs:generate-thumbnail', this.handleGenerateThumbnail.bind(this));
  }

  private async handleBrowseFiles(
    event: Electron.IpcMainInvokeEvent,
    request: FileSystemBrowseRequest
  ): Promise<IPCResult<FileSystemBrowseResponse>> {
    try {
      logger.info('Opening file browser', {
        startPath: request.startPath,
        fileTypes: request.fileTypes,
        allowMultiple: request.allowMultiple
      });

      // Build file filters
      const filters: Electron.FileFilter[] = [];

      if (request.fileTypes && request.fileTypes.length > 0) {
        // Group extensions by type
        const videoExts = request.fileTypes.filter(ext =>
          ['.mp4', '.mov', '.avi', '.mkv', '.wmv', '.flv', '.webm', '.m4v'].includes(ext.toLowerCase())
        );
        const audioExts = request.fileTypes.filter(ext =>
          ['.mp3', '.wav', '.aac', '.flac', '.ogg', '.m4a', '.wma'].includes(ext.toLowerCase())
        );
        const imageExts = request.fileTypes.filter(ext =>
          ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.svg'].includes(ext.toLowerCase())
        );
        const subtitleExts = request.fileTypes.filter(ext =>
          ['.srt', '.vtt', '.ass', '.ssa', '.sub', '.sbv'].includes(ext.toLowerCase())
        );

        if (videoExts.length > 0) {
          filters.push({
            name: 'Video Files',
            extensions: videoExts.map(ext => ext.replace('.', ''))
          });
        }

        if (audioExts.length > 0) {
          filters.push({
            name: 'Audio Files',
            extensions: audioExts.map(ext => ext.replace('.', ''))
          });
        }

        if (imageExts.length > 0) {
          filters.push({
            name: 'Image Files',
            extensions: imageExts.map(ext => ext.replace('.', ''))
          });
        }

        if (subtitleExts.length > 0) {
          filters.push({
            name: 'Subtitle Files',
            extensions: subtitleExts.map(ext => ext.replace('.', ''))
          });
        }

        // Add custom filter with all specified extensions
        filters.push({
          name: 'Custom Files',
          extensions: request.fileTypes.map(ext => ext.replace('.', ''))
        });
      }

      // Add "All Files" option
      filters.push({
        name: 'All Files',
        extensions: ['*']
      });

      const dialogOptions: Electron.OpenDialogOptions = {
        properties: request.allowMultiple
          ? ['openFile', 'multiSelections']
          : ['openFile'],
        filters,
        defaultPath: request.startPath
      };

      const result = await dialog.showOpenDialog(dialogOptions);

      if (result.canceled) {
        return {
          success: true,
          data: {
            filePaths: [],
            cancelled: true
          }
        };
      }

      logger.info('Files selected', {
        fileCount: result.filePaths.length,
        files: result.filePaths
      });

      return {
        success: true,
        data: {
          filePaths: result.filePaths,
          cancelled: false
        }
      };
    } catch (error) {
      logger.error('Failed to browse files', {
        error: error instanceof Error ? error.message : 'Unknown error',
        startPath: request.startPath
      });

      return {
        success: false,
        error: {
          code: 'FILE_BROWSE_FAILED',
          message: 'Failed to browse files',
          details: {
            startPath: request.startPath,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }
      };
    }
  }

  private async handleGetFileMetadata(
    event: Electron.IpcMainInvokeEvent,
    request: FileMetadataRequest
  ): Promise<IPCResult<FileMetadataResponse>> {
    try {
      logger.info('Getting file metadata', { filePath: request.filePath });

      // Check if file exists
      const fileStats = await fs.stat(request.filePath);
      if (!fileStats.isFile()) {
        return {
          success: false,
          error: {
            code: 'NOT_A_FILE',
            message: 'Path does not point to a file',
            details: { filePath: request.filePath }
          }
        };
      }

      const filename = path.basename(request.filePath);
      const fileType = this.fileService.getFileType(filename);

      // Get detailed metadata using file service
      const detailedMetadata = await this.fileService.getFileMetadata(request.filePath);

      const metadata: FileMetadataResponse = {
        filename,
        fileSize: fileStats.size,
        fileType,
        duration: detailedMetadata.duration,
        resolution: detailedMetadata.resolution,
        framerate: detailedMetadata.framerate,
        codec: detailedMetadata.codec,
        createdAt: fileStats.birthtime.toISOString(),
        modifiedAt: fileStats.mtime.toISOString()
      };

      logger.info('File metadata retrieved', {
        filePath: request.filePath,
        fileType,
        fileSize: fileStats.size
      });

      return {
        success: true,
        data: metadata
      };
    } catch (error) {
      logger.error('Failed to get file metadata', {
        error: error instanceof Error ? error.message : 'Unknown error',
        filePath: request.filePath
      });

      return {
        success: false,
        error: {
          code: 'FILE_METADATA_FAILED',
          message: 'Failed to get file metadata',
          details: {
            filePath: request.filePath,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }
      };
    }
  }

  private async handleGenerateThumbnail(
    event: Electron.IpcMainInvokeEvent,
    request: ThumbnailGenerateRequest
  ): Promise<IPCResult<ThumbnailGenerateResponse>> {
    try {
      logger.info('Generating thumbnail', {
        filePath: request.filePath,
        outputPath: request.outputPath,
        timestamp: request.timestamp
      });

      // Ensure output directory exists
      const outputDir = path.dirname(request.outputPath);
      await fs.mkdir(outputDir, { recursive: true });

      // Generate thumbnail
      const thumbnailPath = await this.thumbnailService.generateThumbnail({
        filePath: request.filePath,
        outputPath: request.outputPath,
        timestamp: request.timestamp,
        width: request.width || 200,
        height: request.height || 150
      });

      if (!thumbnailPath) {
        return {
          success: false,
          error: {
            code: 'THUMBNAIL_GENERATION_FAILED',
            message: 'Failed to generate thumbnail',
            details: { filePath: request.filePath }
          }
        };
      }

      logger.info('Thumbnail generated successfully', {
        filePath: request.filePath,
        thumbnailPath
      });

      return {
        success: true,
        data: {
          success: true,
          thumbnailPath
        }
      };
    } catch (error) {
      logger.error('Failed to generate thumbnail', {
        error: error instanceof Error ? error.message : 'Unknown error',
        filePath: request.filePath,
        outputPath: request.outputPath
      });

      return {
        success: false,
        error: {
          code: 'THUMBNAIL_GENERATION_ERROR',
          message: 'Error generating thumbnail',
          details: {
            filePath: request.filePath,
            outputPath: request.outputPath,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }
      };
    }
  }

  public unregisterHandlers(): void {
    ipcMain.removeHandler('fs:browse');
    ipcMain.removeHandler('fs:get-metadata');
    ipcMain.removeHandler('fs:generate-thumbnail');
  }
}