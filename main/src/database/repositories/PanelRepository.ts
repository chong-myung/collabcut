import { Database } from 'sqlite3';
import {
  ProjectPanel,
  CreateProjectPanelRequest,
  UpdateProjectPanelRequest,
  ProjectPanelValidator
} from '../models/ProjectPanel';
import {
  PanelSearchHistory,
  CreateSearchHistoryRequest,
  UpdateSearchHistoryRequest,
  SearchHistoryFilter,
  PanelSearchHistoryValidator
} from '../models/PanelSearchHistory';
import {
  MediaAssetUIState,
  CreateMediaAssetUIStateRequest,
  UpdateMediaAssetUIStateRequest,
  MediaAssetUIStateFilter,
  MediaAssetUIStateValidator
} from '../models/MediaAssetUIState';
import {
  FolderUIState,
  CreateFolderUIStateRequest,
  UpdateFolderUIStateRequest,
  FolderUIStateFilter,
  FolderUIStateValidator
} from '../models/FolderUIState';
import {
  SyncIndicator,
  CreateSyncIndicatorRequest,
  UpdateSyncIndicatorRequest,
  SyncIndicatorFilter,
  SyncIndicatorBatchUpdate,
  SyncIndicatorValidator
} from '../models/SyncIndicator';

export class PanelRepository {
  constructor(private db: Database) {}

  // ProjectPanel operations
  async createProjectPanel(request: CreateProjectPanelRequest): Promise<ProjectPanel> {
    const validation = ProjectPanelValidator.validateCreateRequest(request);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    const id = this.generateId();
    const now = new Date();

    const panel: ProjectPanel = {
      id,
      project_id: request.project_id,
      user_id: request.user_id,
      layout_config: request.layout_config || {},
      view_mode: request.view_mode || 'grid',
      sort_preference: request.sort_preference || 'name',
      filter_settings: request.filter_settings || {},
      expanded_folders: request.expanded_folders || [],
      selected_items: request.selected_items || [],
      last_updated: now
    };

    const sql = `
      INSERT INTO project_panels (
        id, project_id, user_id, layout_config, view_mode,
        sort_preference, filter_settings, expanded_folders,
        selected_items, last_updated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    return new Promise((resolve, reject) => {
      this.db.run(sql, [
        panel.id,
        panel.project_id,
        panel.user_id,
        JSON.stringify(panel.layout_config),
        panel.view_mode,
        panel.sort_preference,
        JSON.stringify(panel.filter_settings),
        JSON.stringify(panel.expanded_folders),
        JSON.stringify(panel.selected_items),
        panel.last_updated.toISOString()
      ], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(panel);
        }
      });
    });
  }

  async getProjectPanel(projectId: string, userId: string): Promise<ProjectPanel | null> {
    const sql = `
      SELECT * FROM project_panels
      WHERE project_id = ? AND user_id = ?
    `;

    return new Promise((resolve, reject) => {
      this.db.get(sql, [projectId, userId], (err, row: any) => {
        if (err) {
          reject(err);
        } else if (row) {
          resolve(this.mapRowToProjectPanel(row));
        } else {
          resolve(null);
        }
      });
    });
  }

  async updateProjectPanel(id: string, request: UpdateProjectPanelRequest): Promise<ProjectPanel> {
    const updateFields: string[] = [];
    const values: any[] = [];

    if (request.layout_config !== undefined) {
      updateFields.push('layout_config = ?');
      values.push(JSON.stringify(request.layout_config));
    }
    if (request.view_mode !== undefined) {
      updateFields.push('view_mode = ?');
      values.push(request.view_mode);
    }
    if (request.sort_preference !== undefined) {
      updateFields.push('sort_preference = ?');
      values.push(request.sort_preference);
    }
    if (request.filter_settings !== undefined) {
      updateFields.push('filter_settings = ?');
      values.push(JSON.stringify(request.filter_settings));
    }
    if (request.expanded_folders !== undefined) {
      updateFields.push('expanded_folders = ?');
      values.push(JSON.stringify(request.expanded_folders));
    }
    if (request.selected_items !== undefined) {
      updateFields.push('selected_items = ?');
      values.push(JSON.stringify(request.selected_items));
    }

    updateFields.push('last_updated = ?');
    values.push(new Date().toISOString());
    values.push(id);

    const sql = `
      UPDATE project_panels
      SET ${updateFields.join(', ')}
      WHERE id = ?
    `;

    return new Promise((resolve, reject) => {
      this.db.run(sql, values, (err) => {
        if (err) {
          reject(err);
        } else {
          this.getProjectPanelById(id).then(resolve).catch(reject);
        }
      });
    });
  }

  async getProjectPanelById(id: string): Promise<ProjectPanel> {
    const sql = 'SELECT * FROM project_panels WHERE id = ?';

    return new Promise((resolve, reject) => {
      this.db.get(sql, [id], (err, row: any) => {
        if (err) {
          reject(err);
        } else if (row) {
          resolve(this.mapRowToProjectPanel(row));
        } else {
          reject(new Error('Project panel not found'));
        }
      });
    });
  }

  // Search History operations
  async createSearchHistory(request: CreateSearchHistoryRequest): Promise<PanelSearchHistory> {
    const validation = PanelSearchHistoryValidator.validateCreateRequest(request);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    const id = this.generateId();
    const now = new Date();

    const history: PanelSearchHistory = {
      id,
      panel_id: request.panel_id,
      search_query: request.search_query,
      search_filters: request.search_filters || {},
      result_count: request.result_count,
      created_at: now,
      is_saved: request.is_saved || false,
      search_name: request.search_name
    };

    const sql = `
      INSERT INTO panel_search_history (
        id, panel_id, search_query, search_filters,
        result_count, created_at, is_saved, search_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    return new Promise((resolve, reject) => {
      this.db.run(sql, [
        history.id,
        history.panel_id,
        history.search_query,
        JSON.stringify(history.search_filters),
        history.result_count,
        history.created_at.toISOString(),
        history.is_saved ? 1 : 0,
        history.search_name
      ], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(history);
        }
      });
    });
  }

  async getSearchHistory(filter: SearchHistoryFilter): Promise<PanelSearchHistory[]> {
    let sql = 'SELECT * FROM panel_search_history WHERE 1=1';
    const values: any[] = [];

    if (filter.panel_id) {
      sql += ' AND panel_id = ?';
      values.push(filter.panel_id);
    }
    if (filter.is_saved !== undefined) {
      sql += ' AND is_saved = ?';
      values.push(filter.is_saved ? 1 : 0);
    }
    if (filter.date_from) {
      sql += ' AND created_at >= ?';
      values.push(filter.date_from.toISOString());
    }
    if (filter.date_to) {
      sql += ' AND created_at <= ?';
      values.push(filter.date_to.toISOString());
    }

    sql += ' ORDER BY created_at DESC';

    if (filter.limit) {
      sql += ' LIMIT ?';
      values.push(filter.limit);
    }
    if (filter.offset) {
      sql += ' OFFSET ?';
      values.push(filter.offset);
    }

    return new Promise((resolve, reject) => {
      this.db.all(sql, values, (err, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows.map(row => this.mapRowToSearchHistory(row)));
        }
      });
    });
  }

  // Helper methods
  private generateId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  private mapRowToProjectPanel(row: any): ProjectPanel {
    return {
      id: row.id,
      project_id: row.project_id,
      user_id: row.user_id,
      layout_config: JSON.parse(row.layout_config),
      view_mode: row.view_mode,
      sort_preference: row.sort_preference,
      filter_settings: JSON.parse(row.filter_settings),
      expanded_folders: JSON.parse(row.expanded_folders),
      selected_items: JSON.parse(row.selected_items),
      last_updated: new Date(row.last_updated)
    };
  }

  private mapRowToSearchHistory(row: any): PanelSearchHistory {
    return {
      id: row.id,
      panel_id: row.panel_id,
      search_query: row.search_query,
      search_filters: JSON.parse(row.search_filters),
      result_count: row.result_count,
      created_at: new Date(row.created_at),
      is_saved: Boolean(row.is_saved),
      search_name: row.search_name
    };
  }

  // Media Asset UI State operations
  async createMediaAssetUIState(request: CreateMediaAssetUIStateRequest): Promise<MediaAssetUIState> {
    const validation = MediaAssetUIStateValidator.validateCreateRequest(request);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    const id = this.generateId();
    const now = new Date();

    const state: MediaAssetUIState = {
      id,
      media_asset_id: request.media_asset_id,
      panel_id: request.panel_id,
      thumbnail_loaded: request.thumbnail_loaded || false,
      preview_generated: request.preview_generated || false,
      is_expanded: request.is_expanded || false,
      drag_state: request.drag_state || 'none',
      selection_state: request.selection_state || 'none',
      loading_state: request.loading_state || 'idle',
      error_message: request.error_message,
      last_accessed: now
    };

    const sql = `
      INSERT INTO media_asset_ui_states (
        id, media_asset_id, panel_id, thumbnail_loaded, preview_generated,
        is_expanded, drag_state, selection_state, loading_state,
        error_message, last_accessed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    return new Promise((resolve, reject) => {
      this.db.run(sql, [
        state.id,
        state.media_asset_id,
        state.panel_id,
        state.thumbnail_loaded ? 1 : 0,
        state.preview_generated ? 1 : 0,
        state.is_expanded ? 1 : 0,
        state.drag_state,
        state.selection_state,
        state.loading_state,
        state.error_message,
        state.last_accessed.toISOString()
      ], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(state);
        }
      });
    });
  }

  // Cleanup operations
  async cleanupStaleUIStates(olderThanDays: number = 30): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const sql = `
      DELETE FROM panel_search_history
      WHERE created_at < ? AND is_saved = 0
    `;

    return new Promise((resolve, reject) => {
      this.db.run(sql, [cutoffDate.toISOString()], (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}