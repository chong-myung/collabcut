import { ipcMain, BrowserWindow } from 'electron';
import { IPCResult } from '../../../shared/types/ipc-contract';
import type {
  AssetSearchRequest,
  AssetSearchResponse,
  AssetUploadRequest,
  AssetUploadProgress,
  MediaAssetData,
  IPCChannels
} from '../../../shared/types/ipc-contract';
import { AssetRepository } from '../database/repositories/AssetRepository';
import { FileService } from '../services/FileService';
import { ThumbnailService } from '../services/ThumbnailService';
import { logger } from '../services/logger';
import * as path from 'path';
import * as fs from 'fs/promises';

export class AssetHandlers {
  private assetRepository: AssetRepository;
  private fileService: FileService;
  private thumbnailService: ThumbnailService;

  constructor(
    assetRepository: AssetRepository,
    fileService: FileService,
    thumbnailService: ThumbnailService
  ) {
    this.assetRepository = assetRepository;
    this.fileService = fileService;
    this.thumbnailService = thumbnailService;
    this.registerHandlers();
  }

  private registerHandlers(): void {
    ipcMain.handle('assets:search', this.handleSearchAssets.bind(this));
    ipcMain.handle('assets:upload', this.handleUploadAsset.bind(this));
  }

  private async handleSearchAssets(
    event: Electron.IpcMainInvokeEvent,
    request: AssetSearchRequest
  ): Promise<IPCResult<AssetSearchResponse>> {
    try {
      logger.info('Searching assets', {
        projectId: request.projectId,
        query: request.query,
        fileType: request.fileType,
        limit: request.limit
      });

      const assets = await this.assetRepository.searchAssets({
        projectId: request.projectId,
        query: request.query,
        folderId: request.folderId,
        fileType: request.fileType,
        limit: request.limit || 50,
        offset: request.offset || 0
      });

      const total = await this.assetRepository.countAssets({
        projectId: request.projectId,
        query: request.query,
        folderId: request.folderId,
        fileType: request.fileType
      });

      return {
        success: true,
        data: {
          items: assets,
          total,
          limit: request.limit || 50,
          offset: request.offset || 0
        }
      };
    } catch (error) {
      logger.error('Failed to search assets', {
        error: error instanceof Error ? error.message : 'Unknown error',
        projectId: request.projectId,
        query: request.query
      });

      return {
        success: false,
        error: {
          code: 'ASSET_SEARCH_FAILED',
          message: 'Failed to search assets',
          details: { projectId: request.projectId, query: request.query }
        }
      };
    }
  }

  private async handleUploadAsset(
    event: Electron.IpcMainInvokeEvent,
    request: AssetUploadRequest
  ): Promise<IPCResult<MediaAssetData>> {
    try {
      logger.info('Starting asset upload', {
        projectId: request.projectId,
        filename: request.filename,
        filePath: request.filePath
      });

      const assetId = `asset_${Date.now()}_${Math.random().toString(36).substring(2)}`;

      // Send initial progress
      this.sendUploadProgress(event.sender, {
        assetId,
        progress: 0,
        stage: 'reading',
        message: 'Reading file...'
      });

      // Validate file exists
      const fileStats = await fs.stat(request.filePath);
      const fileType = this.fileService.getFileType(request.filename);

      this.sendUploadProgress(event.sender, {
        assetId,
        progress: 0.2,
        stage: 'processing',
        message: 'Processing file metadata...'
      });

      // Get file metadata
      const metadata = await this.fileService.getFileMetadata(request.filePath);

      this.sendUploadProgress(event.sender, {
        assetId,
        progress: 0.4,
        stage: 'processing',
        message: 'Generating thumbnail...'
      });

      // Generate thumbnail if it's a video/image
      let thumbnailUrl: string | undefined;
      if (fileType === 'video' || fileType === 'image') {
        thumbnailUrl = await this.thumbnailService.generateThumbnail({
          filePath: request.filePath,
          outputPath: path.join(process.cwd(), 'thumbnails', `${assetId}.jpg`),
          width: 200,
          height: 150
        });
      }

      this.sendUploadProgress(event.sender, {
        assetId,
        progress: 0.6,
        stage: 'uploading',
        message: 'Saving to database...'
      });

      // Create asset data
      const assetData: MediaAssetData = {
        id: assetId,
        projectId: request.projectId,
        filename: request.filename,
        filePath: request.filePath,
        fileType,
        fileSize: fileStats.size,
        duration: metadata.duration,
        resolution: metadata.resolution,
        framerate: metadata.framerate,
        codec: metadata.codec,
        thumbnailUrl,
        createdAt: new Date().toISOString(),
        uploadedBy: 'current-user', // TODO: Get from auth context
        metadata: {
          ...metadata,
          ...request.metadata
        },
        folderId: request.folderId
      };

      // Save to database
      await this.assetRepository.createAsset(assetData);

      this.sendUploadProgress(event.sender, {
        assetId,
        progress: 1,
        stage: 'complete',
        message: 'Upload complete'
      });

      logger.info('Asset upload completed', {
        assetId,
        projectId: request.projectId,
        filename: request.filename
      });

      return {
        success: true,
        data: assetData
      };
    } catch (error) {
      logger.error('Failed to upload asset', {
        error: error instanceof Error ? error.message : 'Unknown error',
        projectId: request.projectId,
        filename: request.filename
      });

      // Send error progress
      this.sendUploadProgress(event.sender, {
        assetId: 'unknown',
        progress: 0,
        stage: 'error',
        message: error instanceof Error ? error.message : 'Upload failed'
      });

      return {
        success: false,
        error: {
          code: 'ASSET_UPLOAD_FAILED',
          message: 'Failed to upload asset',
          details: {
            projectId: request.projectId,
            filename: request.filename,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }
      };
    }
  }

  private sendUploadProgress(sender: Electron.WebContents, progress: AssetUploadProgress): void {
    sender.send('assets:upload-progress', progress);
  }

  public unregisterHandlers(): void {
    ipcMain.removeHandler('assets:search');
    ipcMain.removeHandler('assets:upload');
  }
}