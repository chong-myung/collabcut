import { ipcMain } from 'electron';
import { IPCResult } from '../../../shared/types/ipc-contract';
import type {
  SearchHistoryRequest,
  SearchHistoryResponse,
  SearchHistorySaveRequest,
  SearchHistoryItem,
  IPCChannels
} from '../../../shared/types/ipc-contract';
import { SearchHistoryRepository } from '../database/repositories/SearchHistoryRepository';
import { logger } from '../services/logger';

export class SearchHandlers {
  private searchHistoryRepository: SearchHistoryRepository;

  constructor(searchHistoryRepository: SearchHistoryRepository) {
    this.searchHistoryRepository = searchHistoryRepository;
    this.registerHandlers();
  }

  private registerHandlers(): void {
    ipcMain.handle('search:get-history', this.handleGetSearchHistory.bind(this));
    ipcMain.handle('search:save-history', this.handleSaveSearchHistory.bind(this));
  }

  private async handleGetSearchHistory(
    event: Electron.IpcMainInvokeEvent,
    request: SearchHistoryRequest
  ): Promise<IPCResult<SearchHistoryResponse>> {
    try {
      logger.info('Getting search history', {
        projectId: request.projectId,
        userId: request.userId,
        limit: request.limit
      });

      const searchHistory = await this.searchHistoryRepository.getSearchHistory(
        request.projectId,
        request.userId,
        request.limit || 50
      );

      return {
        success: true,
        data: {
          items: searchHistory
        }
      };
    } catch (error) {
      logger.error('Failed to get search history', {
        error: error instanceof Error ? error.message : 'Unknown error',
        projectId: request.projectId,
        userId: request.userId
      });

      return {
        success: false,
        error: {
          code: 'SEARCH_HISTORY_GET_FAILED',
          message: 'Failed to get search history',
          details: {
            projectId: request.projectId,
            userId: request.userId
          }
        }
      };
    }
  }

  private async handleSaveSearchHistory(
    event: Electron.IpcMainInvokeEvent,
    request: SearchHistorySaveRequest
  ): Promise<IPCResult<void>> {
    try {
      logger.info('Saving search history', {
        projectId: request.projectId,
        userId: request.userId,
        searchQuery: request.searchQuery,
        isSaved: request.isSaved
      });

      // Validate search query
      if (!request.searchQuery || request.searchQuery.trim().length === 0) {
        return {
          success: false,
          error: {
            code: 'INVALID_SEARCH_QUERY',
            message: 'Search query cannot be empty',
            details: { searchQuery: request.searchQuery }
          }
        };
      }

      // Check if this exact search already exists for this user/project
      const existingHistory = await this.searchHistoryRepository.getSearchHistory(
        request.projectId,
        request.userId,
        100 // Get more items to check for duplicates
      );

      const duplicateSearch = existingHistory.find(
        item =>
          item.searchQuery === request.searchQuery.trim() &&
          JSON.stringify(item.searchFilters) === JSON.stringify(request.searchFilters)
      );

      if (duplicateSearch) {
        // Update existing search instead of creating duplicate
        await this.searchHistoryRepository.updateSearchHistory(duplicateSearch.id, {
          resultCount: request.resultCount,
          isSaved: request.isSaved || duplicateSearch.isSaved,
          searchName: request.searchName || duplicateSearch.searchName,
          createdAt: new Date().toISOString() // Update timestamp to move to top
        });

        logger.info('Updated existing search history entry', {
          searchId: duplicateSearch.id,
          projectId: request.projectId,
          userId: request.userId
        });
      } else {
        // Create new search history entry
        const searchId = `search_${Date.now()}_${Math.random().toString(36).substring(2)}`;

        const searchHistoryItem: SearchHistoryItem = {
          id: searchId,
          searchQuery: request.searchQuery.trim(),
          searchFilters: request.searchFilters,
          resultCount: request.resultCount,
          createdAt: new Date().toISOString(),
          isSaved: request.isSaved || false,
          searchName: request.searchName
        };

        await this.searchHistoryRepository.saveSearchHistory(
          request.projectId,
          request.userId,
          searchHistoryItem
        );

        logger.info('Saved new search history entry', {
          searchId,
          projectId: request.projectId,
          userId: request.userId
        });
      }

      // Clean up old search history (keep only last 100 non-saved searches)
      await this.cleanupOldSearchHistory(request.projectId, request.userId);

      // Emit update event for UI
      event.sender.send('search:history-updated', {
        projectId: request.projectId,
        userId: request.userId
      });

      return {
        success: true,
        data: undefined
      };
    } catch (error) {
      logger.error('Failed to save search history', {
        error: error instanceof Error ? error.message : 'Unknown error',
        projectId: request.projectId,
        userId: request.userId,
        searchQuery: request.searchQuery
      });

      return {
        success: false,
        error: {
          code: 'SEARCH_HISTORY_SAVE_FAILED',
          message: 'Failed to save search history',
          details: {
            projectId: request.projectId,
            userId: request.userId,
            searchQuery: request.searchQuery,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }
      };
    }
  }

  private async cleanupOldSearchHistory(projectId: string, userId: string): Promise<void> {
    try {
      const allHistory = await this.searchHistoryRepository.getSearchHistory(
        projectId,
        userId,
        1000 // Get all history items
      );

      // Separate saved and non-saved searches
      const savedSearches = allHistory.filter(item => item.isSaved);
      const regularSearches = allHistory.filter(item => !item.isSaved);

      // Keep only the most recent 100 non-saved searches
      const MAX_REGULAR_SEARCHES = 100;
      if (regularSearches.length > MAX_REGULAR_SEARCHES) {
        const searchesToDelete = regularSearches
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(MAX_REGULAR_SEARCHES);

        for (const search of searchesToDelete) {
          await this.searchHistoryRepository.deleteSearchHistory(search.id);
        }

        logger.info('Cleaned up old search history', {
          projectId,
          userId,
          deletedCount: searchesToDelete.length
        });
      }
    } catch (error) {
      logger.error('Failed to cleanup old search history', {
        error: error instanceof Error ? error.message : 'Unknown error',
        projectId,
        userId
      });
    }
  }

  public unregisterHandlers(): void {
    ipcMain.removeHandler('search:get-history');
    ipcMain.removeHandler('search:save-history');
  }
}