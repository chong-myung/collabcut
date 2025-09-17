export interface MediaAssetUIState {
  id: string;
  media_asset_id: string;
  panel_id: string;
  thumbnail_loaded: boolean;
  preview_generated: boolean;
  is_expanded: boolean;
  drag_state: 'none' | 'dragging' | 'drag_target';
  selection_state: 'none' | 'selected' | 'partial_select';
  loading_state: 'idle' | 'loading' | 'error' | 'complete';
  error_message?: string;
  last_accessed: Date;
}

export interface CreateMediaAssetUIStateRequest {
  media_asset_id: string;
  panel_id: string;
  thumbnail_loaded?: boolean;
  preview_generated?: boolean;
  is_expanded?: boolean;
  drag_state?: MediaAssetUIState['drag_state'];
  selection_state?: MediaAssetUIState['selection_state'];
  loading_state?: MediaAssetUIState['loading_state'];
  error_message?: string;
}

export interface UpdateMediaAssetUIStateRequest {
  thumbnail_loaded?: boolean;
  preview_generated?: boolean;
  is_expanded?: boolean;
  drag_state?: MediaAssetUIState['drag_state'];
  selection_state?: MediaAssetUIState['selection_state'];
  loading_state?: MediaAssetUIState['loading_state'];
  error_message?: string;
  last_accessed?: Date;
}

export interface MediaAssetUIStateFilter {
  media_asset_id?: string;
  panel_id?: string;
  loading_state?: MediaAssetUIState['loading_state'];
  selection_state?: MediaAssetUIState['selection_state'];
  thumbnail_loaded?: boolean;
  preview_generated?: boolean;
  last_accessed_before?: Date;
  last_accessed_after?: Date;
  limit?: number;
  offset?: number;
}

export class MediaAssetUIStateValidator {
  static readonly VALID_DRAG_STATES: MediaAssetUIState['drag_state'][] = ['none', 'dragging', 'drag_target'];
  static readonly VALID_SELECTION_STATES: MediaAssetUIState['selection_state'][] = ['none', 'selected', 'partial_select'];
  static readonly VALID_LOADING_STATES: MediaAssetUIState['loading_state'][] = ['idle', 'loading', 'error', 'complete'];

  static validateDragState(state: string): state is MediaAssetUIState['drag_state'] {
    return this.VALID_DRAG_STATES.includes(state as MediaAssetUIState['drag_state']);
  }

  static validateSelectionState(state: string): state is MediaAssetUIState['selection_state'] {
    return this.VALID_SELECTION_STATES.includes(state as MediaAssetUIState['selection_state']);
  }

  static validateLoadingState(state: string): state is MediaAssetUIState['loading_state'] {
    return this.VALID_LOADING_STATES.includes(state as MediaAssetUIState['loading_state']);
  }

  static validateCreateRequest(request: CreateMediaAssetUIStateRequest): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!request.media_asset_id || typeof request.media_asset_id !== 'string') {
      errors.push('media_asset_id is required and must be a string');
    }

    if (!request.panel_id || typeof request.panel_id !== 'string') {
      errors.push('panel_id is required and must be a string');
    }

    if (request.drag_state && !this.validateDragState(request.drag_state)) {
      errors.push(`drag_state must be one of: ${this.VALID_DRAG_STATES.join(', ')}`);
    }

    if (request.selection_state && !this.validateSelectionState(request.selection_state)) {
      errors.push(`selection_state must be one of: ${this.VALID_SELECTION_STATES.join(', ')}`);
    }

    if (request.loading_state && !this.validateLoadingState(request.loading_state)) {
      errors.push(`loading_state must be one of: ${this.VALID_LOADING_STATES.join(', ')}`);
    }

    if (request.error_message !== undefined && typeof request.error_message !== 'string') {
      errors.push('error_message must be a string when provided');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  static validateUpdateRequest(request: UpdateMediaAssetUIStateRequest): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (request.drag_state && !this.validateDragState(request.drag_state)) {
      errors.push(`drag_state must be one of: ${this.VALID_DRAG_STATES.join(', ')}`);
    }

    if (request.selection_state && !this.validateSelectionState(request.selection_state)) {
      errors.push(`selection_state must be one of: ${this.VALID_SELECTION_STATES.join(', ')}`);
    }

    if (request.loading_state && !this.validateLoadingState(request.loading_state)) {
      errors.push(`loading_state must be one of: ${this.VALID_LOADING_STATES.join(', ')}`);
    }

    if (request.error_message !== undefined && typeof request.error_message !== 'string') {
      errors.push('error_message must be a string when provided');
    }

    if (request.last_accessed !== undefined && !(request.last_accessed instanceof Date)) {
      errors.push('last_accessed must be a Date when provided');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}