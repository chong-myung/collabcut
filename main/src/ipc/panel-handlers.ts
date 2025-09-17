import { ipcMain } from 'electron';
import { IPCResult } from '../../../shared/types/ipc-contract';
import type {
  PanelStateRequest,
  PanelStateResponse,
  PanelStateUpdate,
  IPCChannels
} from '../../../shared/types/ipc-contract';
import { PanelRepository } from '../database/repositories/PanelRepository';
import { logger } from '../services/logger';

export class PanelHandlers {
  private panelRepository: PanelRepository;

  constructor(panelRepository: PanelRepository) {
    this.panelRepository = panelRepository;
    this.registerHandlers();
  }

  private registerHandlers(): void {
    ipcMain.handle('panel:get-state', this.handleGetPanelState.bind(this));
    ipcMain.handle('panel:update-state', this.handleUpdatePanelState.bind(this));
  }

  private async handleGetPanelState(
    event: Electron.IpcMainInvokeEvent,
    request: PanelStateRequest
  ): Promise<IPCResult<PanelStateResponse>> {
    try {
      logger.info('Getting panel state', { projectId: request.projectId, userId: request.userId });

      const panelState = await this.panelRepository.getPanelState(
        request.projectId,
        request.userId
      );

      if (!panelState) {
        // Return default panel state if none exists
        const defaultState: PanelStateResponse = {
          id: `${request.projectId}-${request.userId}`,
          projectId: request.projectId,
          userId: request.userId,
          layoutConfig: {
            width: 1200,
            height: 800,
            columns: ['name', 'type', 'size', 'date']
          },
          viewMode: 'grid',
          sortPreference: 'name',
          filterSettings: {
            fileTypes: ['video', 'audio', 'image', 'subtitle']
          },
          expandedFolders: [],
          selectedItems: [],
          lastUpdated: new Date().toISOString()
        };

        // Save default state
        await this.panelRepository.savePanelState(defaultState);

        return {
          success: true,
          data: defaultState
        };
      }

      return {
        success: true,
        data: panelState
      };
    } catch (error) {
      logger.error('Failed to get panel state', {
        error: error instanceof Error ? error.message : 'Unknown error',
        projectId: request.projectId,
        userId: request.userId
      });

      return {
        success: false,
        error: {
          code: 'PANEL_STATE_GET_FAILED',
          message: 'Failed to retrieve panel state',
          details: { projectId: request.projectId, userId: request.userId }
        }
      };
    }
  }

  private async handleUpdatePanelState(
    event: Electron.IpcMainInvokeEvent,
    request: PanelStateUpdate
  ): Promise<IPCResult<void>> {
    try {
      logger.info('Updating panel state', {
        projectId: request.projectId,
        userId: request.userId,
        updateKeys: Object.keys(request.updates)
      });

      await this.panelRepository.updatePanelState(
        request.projectId,
        request.userId,
        request.updates
      );

      // Emit update event to other windows/processes if needed
      event.sender.send('panel:state-updated', {
        projectId: request.projectId,
        userId: request.userId,
        updates: request.updates
      });

      return {
        success: true,
        data: undefined
      };
    } catch (error) {
      logger.error('Failed to update panel state', {
        error: error instanceof Error ? error.message : 'Unknown error',
        projectId: request.projectId,
        userId: request.userId
      });

      return {
        success: false,
        error: {
          code: 'PANEL_STATE_UPDATE_FAILED',
          message: 'Failed to update panel state',
          details: { projectId: request.projectId, userId: request.userId }
        }
      };
    }
  }

  public unregisterHandlers(): void {
    ipcMain.removeHandler('panel:get-state');
    ipcMain.removeHandler('panel:update-state');
  }
}