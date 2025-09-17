import { ipcMain, BrowserWindow } from 'electron';
import { IPCResult } from '../../../shared/types/ipc-contract';
import type {
  SyncStatusUpdate,
  LiveCursorUpdate,
  IPCChannels
} from '../../../shared/types/ipc-contract';
import { SyncService } from '../services/SyncService';
import { CollaborationService } from '../services/CollaborationService';
import { logger } from '../services/logger';

export class SyncHandlers {
  private syncService: SyncService;
  private collaborationService: CollaborationService;
  private syncStatusInterval: NodeJS.Timeout | null = null;
  private connectedClients: Map<string, { userId: string; projectId: string; webContents: Electron.WebContents }> = new Map();

  constructor(syncService: SyncService, collaborationService: CollaborationService) {
    this.syncService = syncService;
    this.collaborationService = collaborationService;
    this.registerHandlers();
    this.startSyncStatusBroadcast();
  }

  private registerHandlers(): void {
    // Register client connection/disconnection handlers
    ipcMain.handle('sync:connect', this.handleConnect.bind(this));
    ipcMain.handle('sync:disconnect', this.handleDisconnect.bind(this));

    // Register cursor tracking handlers
    ipcMain.handle('collaboration:update-cursor', this.handleUpdateCursor.bind(this));

    // Register manual sync trigger
    ipcMain.handle('sync:trigger-sync', this.handleTriggerSync.bind(this));

    // Register sync status request
    ipcMain.handle('sync:get-status', this.handleGetSyncStatus.bind(this));
  }

  private async handleConnect(
    event: Electron.IpcMainInvokeEvent,
    request: { projectId: string; userId: string }
  ): Promise<IPCResult<void>> {
    try {
      logger.info('Client connecting to sync', {
        projectId: request.projectId,
        userId: request.userId
      });

      const clientId = `${request.projectId}-${request.userId}-${Date.now()}`;

      // Store client connection
      this.connectedClients.set(clientId, {
        userId: request.userId,
        projectId: request.projectId,
        webContents: event.sender
      });

      // Initialize sync for this client
      await this.syncService.initializeSync(request.projectId, request.userId);

      // Notify collaboration service of new user
      await this.collaborationService.userJoined(request.projectId, request.userId);

      // Send initial sync status to the client
      const syncStatus = await this.syncService.getSyncStatus(request.projectId);
      event.sender.send('sync:status-update', syncStatus);

      // Broadcast user joined event to other clients
      this.broadcastToProject(request.projectId, 'collaboration:user-joined', {
        userId: request.userId,
        projectId: request.projectId,
        timestamp: new Date().toISOString()
      }, event.sender);

      logger.info('Client connected to sync successfully', {
        clientId,
        projectId: request.projectId,
        userId: request.userId
      });

      return {
        success: true,
        data: undefined
      };
    } catch (error) {
      logger.error('Failed to connect client to sync', {
        error: error instanceof Error ? error.message : 'Unknown error',
        projectId: request.projectId,
        userId: request.userId
      });

      return {
        success: false,
        error: {
          code: 'SYNC_CONNECT_FAILED',
          message: 'Failed to connect to sync service',
          details: {
            projectId: request.projectId,
            userId: request.userId,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }
      };
    }
  }

  private async handleDisconnect(
    event: Electron.IpcMainInvokeEvent,
    request: { projectId: string; userId: string }
  ): Promise<IPCResult<void>> {
    try {
      logger.info('Client disconnecting from sync', {
        projectId: request.projectId,
        userId: request.userId
      });

      // Remove client connection
      const clientToRemove = Array.from(this.connectedClients.entries()).find(
        ([_, client]) =>
          client.projectId === request.projectId &&
          client.userId === request.userId &&
          client.webContents === event.sender
      );

      if (clientToRemove) {
        this.connectedClients.delete(clientToRemove[0]);
      }

      // Notify collaboration service of user leaving
      await this.collaborationService.userLeft(request.projectId, request.userId);

      // Broadcast user left event to other clients
      this.broadcastToProject(request.projectId, 'collaboration:user-left', {
        userId: request.userId,
        projectId: request.projectId,
        timestamp: new Date().toISOString()
      }, event.sender);

      logger.info('Client disconnected from sync successfully', {
        projectId: request.projectId,
        userId: request.userId
      });

      return {
        success: true,
        data: undefined
      };
    } catch (error) {
      logger.error('Failed to disconnect client from sync', {
        error: error instanceof Error ? error.message : 'Unknown error',
        projectId: request.projectId,
        userId: request.userId
      });

      return {
        success: false,
        error: {
          code: 'SYNC_DISCONNECT_FAILED',
          message: 'Failed to disconnect from sync service',
          details: {
            projectId: request.projectId,
            userId: request.userId,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }
      };
    }
  }

  private async handleUpdateCursor(
    event: Electron.IpcMainInvokeEvent,
    request: LiveCursorUpdate
  ): Promise<IPCResult<void>> {
    try {
      // Validate cursor update
      if (!request.userId || !request.projectId) {
        return {
          success: false,
          error: {
            code: 'INVALID_CURSOR_UPDATE',
            message: 'Missing required fields for cursor update',
            details: { userId: request.userId, projectId: request.projectId }
          }
        };
      }

      // Update collaboration service with cursor position
      await this.collaborationService.updateCursor(request);

      // Broadcast cursor update to other clients in the same project
      this.broadcastToProject(request.projectId, 'collaboration:cursor-update', request, event.sender);

      return {
        success: true,
        data: undefined
      };
    } catch (error) {
      logger.error('Failed to update cursor', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: request.userId,
        projectId: request.projectId
      });

      return {
        success: false,
        error: {
          code: 'CURSOR_UPDATE_FAILED',
          message: 'Failed to update cursor position',
          details: {
            userId: request.userId,
            projectId: request.projectId,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }
      };
    }
  }

  private async handleTriggerSync(
    event: Electron.IpcMainInvokeEvent,
    request: { projectId: string }
  ): Promise<IPCResult<void>> {
    try {
      logger.info('Manual sync triggered', { projectId: request.projectId });

      await this.syncService.triggerSync(request.projectId);

      return {
        success: true,
        data: undefined
      };
    } catch (error) {
      logger.error('Failed to trigger sync', {
        error: error instanceof Error ? error.message : 'Unknown error',
        projectId: request.projectId
      });

      return {
        success: false,
        error: {
          code: 'SYNC_TRIGGER_FAILED',
          message: 'Failed to trigger sync',
          details: {
            projectId: request.projectId,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }
      };
    }
  }

  private async handleGetSyncStatus(
    event: Electron.IpcMainInvokeEvent,
    request: { projectId: string }
  ): Promise<IPCResult<SyncStatusUpdate[]>> {
    try {
      const syncStatus = await this.syncService.getSyncStatus(request.projectId);

      return {
        success: true,
        data: syncStatus
      };
    } catch (error) {
      logger.error('Failed to get sync status', {
        error: error instanceof Error ? error.message : 'Unknown error',
        projectId: request.projectId
      });

      return {
        success: false,
        error: {
          code: 'SYNC_STATUS_GET_FAILED',
          message: 'Failed to get sync status',
          details: {
            projectId: request.projectId,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }
      };
    }
  }

  private broadcastToProject(
    projectId: string,
    channel: string,
    data: any,
    excludeWebContents?: Electron.WebContents
  ): void {
    const projectClients = Array.from(this.connectedClients.values()).filter(
      client =>
        client.projectId === projectId &&
        client.webContents !== excludeWebContents &&
        !client.webContents.isDestroyed()
    );

    projectClients.forEach(client => {
      try {
        client.webContents.send(channel, data);
      } catch (error) {
        logger.error('Failed to send message to client', {
          error: error instanceof Error ? error.message : 'Unknown error',
          projectId,
          userId: client.userId,
          channel
        });
      }
    });
  }

  private startSyncStatusBroadcast(): void {
    // Broadcast sync status every 2 seconds for active projects
    this.syncStatusInterval = setInterval(async () => {
      const activeProjects = new Set(
        Array.from(this.connectedClients.values()).map(client => client.projectId)
      );

      for (const projectId of activeProjects) {
        try {
          const syncStatus = await this.syncService.getSyncStatus(projectId);
          if (syncStatus.length > 0) {
            this.broadcastToProject(projectId, 'sync:status-update', syncStatus);
          }
        } catch (error) {
          logger.error('Failed to broadcast sync status', {
            error: error instanceof Error ? error.message : 'Unknown error',
            projectId
          });
        }
      }
    }, 2000); // 2 seconds as specified in requirements
  }

  private stopSyncStatusBroadcast(): void {
    if (this.syncStatusInterval) {
      clearInterval(this.syncStatusInterval);
      this.syncStatusInterval = null;
    }
  }

  public unregisterHandlers(): void {
    this.stopSyncStatusBroadcast();

    ipcMain.removeHandler('sync:connect');
    ipcMain.removeHandler('sync:disconnect');
    ipcMain.removeHandler('collaboration:update-cursor');
    ipcMain.removeHandler('sync:trigger-sync');
    ipcMain.removeHandler('sync:get-status');

    // Clean up all client connections
    this.connectedClients.clear();
  }
}