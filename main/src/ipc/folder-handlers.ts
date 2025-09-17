import { ipcMain } from 'electron';
import { IPCResult } from '../../../shared/types/ipc-contract';
import type {
  FolderCreateRequest,
  FolderUpdateRequest,
  FolderListRequest,
  FolderListResponse,
  FolderData,
  IPCChannels
} from '../../../shared/types/ipc-contract';
import { FolderRepository } from '../database/repositories/FolderRepository';
import { logger } from '../services/logger';

export class FolderHandlers {
  private folderRepository: FolderRepository;

  constructor(folderRepository: FolderRepository) {
    this.folderRepository = folderRepository;
    this.registerHandlers();
  }

  private registerHandlers(): void {
    ipcMain.handle('folders:list', this.handleListFolders.bind(this));
    ipcMain.handle('folders:create', this.handleCreateFolder.bind(this));
    ipcMain.handle('folders:update', this.handleUpdateFolder.bind(this));
    ipcMain.handle('folders:delete', this.handleDeleteFolder.bind(this));
  }

  private async handleListFolders(
    event: Electron.IpcMainInvokeEvent,
    request: FolderListRequest
  ): Promise<IPCResult<FolderListResponse>> {
    try {
      logger.info('Listing folders', {
        projectId: request.projectId,
        parentId: request.parentId
      });

      const folders = await this.folderRepository.getFolders(
        request.projectId,
        request.parentId
      );

      return {
        success: true,
        data: {
          items: folders
        }
      };
    } catch (error) {
      logger.error('Failed to list folders', {
        error: error instanceof Error ? error.message : 'Unknown error',
        projectId: request.projectId,
        parentId: request.parentId
      });

      return {
        success: false,
        error: {
          code: 'FOLDER_LIST_FAILED',
          message: 'Failed to list folders',
          details: { projectId: request.projectId, parentId: request.parentId }
        }
      };
    }
  }

  private async handleCreateFolder(
    event: Electron.IpcMainInvokeEvent,
    request: FolderCreateRequest
  ): Promise<IPCResult<FolderData>> {
    try {
      logger.info('Creating folder', {
        projectId: request.projectId,
        name: request.name,
        parentId: request.parentId
      });

      // Validate folder name
      if (!request.name || request.name.trim().length === 0) {
        return {
          success: false,
          error: {
            code: 'INVALID_FOLDER_NAME',
            message: 'Folder name cannot be empty',
            details: { name: request.name }
          }
        };
      }

      // Check if folder with same name exists in parent
      const existingFolders = await this.folderRepository.getFolders(
        request.projectId,
        request.parentId
      );

      const nameExists = existingFolders.some(
        folder => folder.name.toLowerCase() === request.name.trim().toLowerCase()
      );

      if (nameExists) {
        return {
          success: false,
          error: {
            code: 'FOLDER_NAME_EXISTS',
            message: 'A folder with this name already exists',
            details: { name: request.name, parentId: request.parentId }
          }
        };
      }

      // Generate path
      let folderPath = request.name.trim();
      if (request.parentId) {
        const parentFolder = await this.folderRepository.getFolderById(request.parentId);
        if (parentFolder) {
          folderPath = `${parentFolder.path}/${request.name.trim()}`;
        }
      }

      // Get next sort order
      const maxSortOrder = Math.max(...existingFolders.map(f => f.sortOrder), 0);

      const folderId = `folder_${Date.now()}_${Math.random().toString(36).substring(2)}`;

      const folderData: FolderData = {
        id: folderId,
        projectId: request.projectId,
        name: request.name.trim(),
        parentId: request.parentId,
        path: folderPath,
        description: request.description,
        createdAt: new Date().toISOString(),
        createdBy: 'current-user', // TODO: Get from auth context
        permissions: {}, // TODO: Implement permissions
        color: request.color,
        sortOrder: maxSortOrder + 1
      };

      await this.folderRepository.createFolder(folderData);

      // Emit creation event
      event.sender.send('folder:created', {
        projectId: request.projectId,
        folder: folderData
      });

      logger.info('Folder created successfully', {
        folderId,
        projectId: request.projectId,
        name: request.name
      });

      return {
        success: true,
        data: folderData
      };
    } catch (error) {
      logger.error('Failed to create folder', {
        error: error instanceof Error ? error.message : 'Unknown error',
        projectId: request.projectId,
        name: request.name
      });

      return {
        success: false,
        error: {
          code: 'FOLDER_CREATE_FAILED',
          message: 'Failed to create folder',
          details: {
            projectId: request.projectId,
            name: request.name,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }
      };
    }
  }

  private async handleUpdateFolder(
    event: Electron.IpcMainInvokeEvent,
    request: FolderUpdateRequest
  ): Promise<IPCResult<void>> {
    try {
      logger.info('Updating folder', {
        projectId: request.projectId,
        folderId: request.folderId,
        updateKeys: Object.keys(request.updates)
      });

      // Validate folder exists
      const existingFolder = await this.folderRepository.getFolderById(request.folderId);
      if (!existingFolder) {
        return {
          success: false,
          error: {
            code: 'FOLDER_NOT_FOUND',
            message: 'Folder not found',
            details: { folderId: request.folderId }
          }
        };
      }

      // If name is being updated, check for conflicts
      if (request.updates.name) {
        const siblingFolders = await this.folderRepository.getFolders(
          request.projectId,
          existingFolder.parentId
        );

        const nameExists = siblingFolders.some(
          folder =>
            folder.id !== request.folderId &&
            folder.name.toLowerCase() === request.updates.name!.trim().toLowerCase()
        );

        if (nameExists) {
          return {
            success: false,
            error: {
              code: 'FOLDER_NAME_EXISTS',
              message: 'A folder with this name already exists',
              details: { name: request.updates.name, parentId: existingFolder.parentId }
            }
          };
        }
      }

      await this.folderRepository.updateFolder(request.folderId, request.updates);

      // Emit update event
      event.sender.send('folder:updated', {
        projectId: request.projectId,
        folderId: request.folderId,
        updates: request.updates
      });

      logger.info('Folder updated successfully', {
        folderId: request.folderId,
        projectId: request.projectId
      });

      return {
        success: true,
        data: undefined
      };
    } catch (error) {
      logger.error('Failed to update folder', {
        error: error instanceof Error ? error.message : 'Unknown error',
        projectId: request.projectId,
        folderId: request.folderId
      });

      return {
        success: false,
        error: {
          code: 'FOLDER_UPDATE_FAILED',
          message: 'Failed to update folder',
          details: {
            projectId: request.projectId,
            folderId: request.folderId,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }
      };
    }
  }

  private async handleDeleteFolder(
    event: Electron.IpcMainInvokeEvent,
    request: { projectId: string; folderId: string }
  ): Promise<IPCResult<void>> {
    try {
      logger.info('Deleting folder', {
        projectId: request.projectId,
        folderId: request.folderId
      });

      // Validate folder exists
      const existingFolder = await this.folderRepository.getFolderById(request.folderId);
      if (!existingFolder) {
        return {
          success: false,
          error: {
            code: 'FOLDER_NOT_FOUND',
            message: 'Folder not found',
            details: { folderId: request.folderId }
          }
        };
      }

      // Check if folder has children
      const childFolders = await this.folderRepository.getFolders(
        request.projectId,
        request.folderId
      );

      if (childFolders.length > 0) {
        return {
          success: false,
          error: {
            code: 'FOLDER_NOT_EMPTY',
            message: 'Cannot delete folder that contains subfolders',
            details: { folderId: request.folderId, childCount: childFolders.length }
          }
        };
      }

      // TODO: Check if folder contains assets
      // const assets = await this.assetRepository.getAssetsByFolder(request.folderId);

      await this.folderRepository.deleteFolder(request.folderId);

      // Emit deletion event
      event.sender.send('folder:deleted', {
        projectId: request.projectId,
        folderId: request.folderId
      });

      logger.info('Folder deleted successfully', {
        folderId: request.folderId,
        projectId: request.projectId
      });

      return {
        success: true,
        data: undefined
      };
    } catch (error) {
      logger.error('Failed to delete folder', {
        error: error instanceof Error ? error.message : 'Unknown error',
        projectId: request.projectId,
        folderId: request.folderId
      });

      return {
        success: false,
        error: {
          code: 'FOLDER_DELETE_FAILED',
          message: 'Failed to delete folder',
          details: {
            projectId: request.projectId,
            folderId: request.folderId,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }
      };
    }
  }

  public unregisterHandlers(): void {
    ipcMain.removeHandler('folders:list');
    ipcMain.removeHandler('folders:create');
    ipcMain.removeHandler('folders:update');
    ipcMain.removeHandler('folders:delete');
  }
}