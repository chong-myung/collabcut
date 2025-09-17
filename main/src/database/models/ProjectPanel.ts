export interface ProjectPanel {
  id: string;
  project_id: string;
  user_id: string;
  layout_config: {
    width?: number;
    height?: number;
    columns?: number;
    [key: string]: any;
  };
  view_mode: 'list' | 'grid' | 'tree';
  sort_preference: 'name' | 'date' | 'type' | 'size';
  filter_settings: {
    file_types?: string[];
    tags?: string[];
    [key: string]: any;
  };
  expanded_folders: string[];
  selected_items: string[];
  last_updated: Date;
}

export interface CreateProjectPanelRequest {
  project_id: string;
  user_id: string;
  layout_config?: ProjectPanel['layout_config'];
  view_mode?: ProjectPanel['view_mode'];
  sort_preference?: ProjectPanel['sort_preference'];
  filter_settings?: ProjectPanel['filter_settings'];
  expanded_folders?: string[];
  selected_items?: string[];
}

export interface UpdateProjectPanelRequest {
  layout_config?: ProjectPanel['layout_config'];
  view_mode?: ProjectPanel['view_mode'];
  sort_preference?: ProjectPanel['sort_preference'];
  filter_settings?: ProjectPanel['filter_settings'];
  expanded_folders?: string[];
  selected_items?: string[];
}

export class ProjectPanelValidator {
  static validateViewMode(mode: string): mode is ProjectPanel['view_mode'] {
    return ['list', 'grid', 'tree'].includes(mode);
  }

  static validateSortPreference(pref: string): pref is ProjectPanel['sort_preference'] {
    return ['name', 'date', 'type', 'size'].includes(pref);
  }

  static validateLayoutConfig(config: any): boolean {
    if (!config || typeof config !== 'object') return false;

    if (config.width !== undefined && (typeof config.width !== 'number' || config.width < 0)) {
      return false;
    }

    if (config.height !== undefined && (typeof config.height !== 'number' || config.height < 0)) {
      return false;
    }

    if (config.columns !== undefined && (typeof config.columns !== 'number' || config.columns < 1)) {
      return false;
    }

    return true;
  }

  static validateCreateRequest(request: CreateProjectPanelRequest): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!request.project_id || typeof request.project_id !== 'string') {
      errors.push('project_id is required and must be a string');
    }

    if (!request.user_id || typeof request.user_id !== 'string') {
      errors.push('user_id is required and must be a string');
    }

    if (request.view_mode && !this.validateViewMode(request.view_mode)) {
      errors.push('view_mode must be one of: list, grid, tree');
    }

    if (request.sort_preference && !this.validateSortPreference(request.sort_preference)) {
      errors.push('sort_preference must be one of: name, date, type, size');
    }

    if (request.layout_config && !this.validateLayoutConfig(request.layout_config)) {
      errors.push('layout_config must contain valid UI dimensions');
    }

    if (request.expanded_folders && !Array.isArray(request.expanded_folders)) {
      errors.push('expanded_folders must be an array');
    }

    if (request.selected_items && !Array.isArray(request.selected_items)) {
      errors.push('selected_items must be an array');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}