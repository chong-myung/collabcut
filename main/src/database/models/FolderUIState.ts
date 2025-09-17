export interface FolderUIState {
  id: string;
  folder_id: string;
  panel_id: string;
  is_expanded: boolean;
  child_count: number;
  loading_children: boolean;
  drag_over: boolean;
  rename_mode: boolean;
  temp_name?: string;
}

export interface CreateFolderUIStateRequest {
  folder_id: string;
  panel_id: string;
  is_expanded?: boolean;
  child_count?: number;
  loading_children?: boolean;
  drag_over?: boolean;
  rename_mode?: boolean;
  temp_name?: string;
}

export interface UpdateFolderUIStateRequest {
  is_expanded?: boolean;
  child_count?: number;
  loading_children?: boolean;
  drag_over?: boolean;
  rename_mode?: boolean;
  temp_name?: string;
}

export interface FolderUIStateFilter {
  folder_id?: string;
  panel_id?: string;
  is_expanded?: boolean;
  loading_children?: boolean;
  rename_mode?: boolean;
  drag_over?: boolean;
  limit?: number;
  offset?: number;
}

export class FolderUIStateValidator {
  static validateCreateRequest(request: CreateFolderUIStateRequest): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!request.folder_id || typeof request.folder_id !== 'string') {
      errors.push('folder_id is required and must be a string');
    }

    if (!request.panel_id || typeof request.panel_id !== 'string') {
      errors.push('panel_id is required and must be a string');
    }

    if (request.child_count !== undefined) {
      if (!Number.isInteger(request.child_count) || request.child_count < 0) {
        errors.push('child_count must be a non-negative integer');
      }
    }

    if (request.rename_mode && request.temp_name === undefined) {
      errors.push('temp_name is required when rename_mode is true');
    }

    if (!request.rename_mode && request.temp_name !== undefined) {
      errors.push('temp_name should only be provided when rename_mode is true');
    }

    if (request.temp_name !== undefined && typeof request.temp_name !== 'string') {
      errors.push('temp_name must be a string when provided');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  static validateUpdateRequest(request: UpdateFolderUIStateRequest): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (request.child_count !== undefined) {
      if (!Number.isInteger(request.child_count) || request.child_count < 0) {
        errors.push('child_count must be a non-negative integer');
      }
    }

    if (request.rename_mode === true && request.temp_name === undefined) {
      errors.push('temp_name is required when rename_mode is true');
    }

    if (request.rename_mode === false && request.temp_name !== undefined) {
      errors.push('temp_name should be cleared when rename_mode is false');
    }

    if (request.temp_name !== undefined && typeof request.temp_name !== 'string') {
      errors.push('temp_name must be a string when provided');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  static validateChildCount(count: number): boolean {
    return Number.isInteger(count) && count >= 0;
  }

  static validateRenameModeState(renameMode: boolean, tempName?: string): { valid: boolean; error?: string } {
    if (renameMode && !tempName) {
      return { valid: false, error: 'temp_name is required when rename_mode is true' };
    }

    if (!renameMode && tempName !== undefined) {
      return { valid: false, error: 'temp_name should only be provided when rename_mode is true' };
    }

    return { valid: true };
  }
}