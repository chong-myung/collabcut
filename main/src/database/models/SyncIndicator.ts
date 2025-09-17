export interface SyncIndicator {
  id: string;
  project_id: string;
  item_id: string;
  item_type: 'folder' | 'media_asset' | 'project';
  sync_status: 'synced' | 'syncing' | 'conflict' | 'error' | 'offline';
  last_sync: Date;
  sync_progress: number;
  error_message?: string;
  conflict_type: 'none' | 'name_conflict' | 'content_conflict' | 'permission_conflict';
  user_id: string;
}

export interface CreateSyncIndicatorRequest {
  project_id: string;
  item_id: string;
  item_type: SyncIndicator['item_type'];
  sync_status?: SyncIndicator['sync_status'];
  sync_progress?: number;
  error_message?: string;
  conflict_type?: SyncIndicator['conflict_type'];
  user_id: string;
}

export interface UpdateSyncIndicatorRequest {
  sync_status?: SyncIndicator['sync_status'];
  last_sync?: Date;
  sync_progress?: number;
  error_message?: string;
  conflict_type?: SyncIndicator['conflict_type'];
}

export interface SyncIndicatorFilter {
  project_id?: string;
  item_id?: string;
  item_type?: SyncIndicator['item_type'];
  sync_status?: SyncIndicator['sync_status'];
  conflict_type?: SyncIndicator['conflict_type'];
  user_id?: string;
  last_sync_before?: Date;
  last_sync_after?: Date;
  limit?: number;
  offset?: number;
}

export interface SyncIndicatorBatchUpdate {
  items: Array<{
    item_id: string;
    sync_status: SyncIndicator['sync_status'];
    sync_progress?: number;
    error_message?: string;
    conflict_type?: SyncIndicator['conflict_type'];
  }>;
}

export class SyncIndicatorValidator {
  static readonly VALID_ITEM_TYPES: SyncIndicator['item_type'][] = ['folder', 'media_asset', 'project'];
  static readonly VALID_SYNC_STATUSES: SyncIndicator['sync_status'][] = ['synced', 'syncing', 'conflict', 'error', 'offline'];
  static readonly VALID_CONFLICT_TYPES: SyncIndicator['conflict_type'][] = ['none', 'name_conflict', 'content_conflict', 'permission_conflict'];

  static validateItemType(type: string): type is SyncIndicator['item_type'] {
    return this.VALID_ITEM_TYPES.includes(type as SyncIndicator['item_type']);
  }

  static validateSyncStatus(status: string): status is SyncIndicator['sync_status'] {
    return this.VALID_SYNC_STATUSES.includes(status as SyncIndicator['sync_status']);
  }

  static validateConflictType(type: string): type is SyncIndicator['conflict_type'] {
    return this.VALID_CONFLICT_TYPES.includes(type as SyncIndicator['conflict_type']);
  }

  static validateSyncProgress(progress: number): boolean {
    return typeof progress === 'number' && progress >= 0.0 && progress <= 1.0;
  }

  static validateCreateRequest(request: CreateSyncIndicatorRequest): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!request.project_id || typeof request.project_id !== 'string') {
      errors.push('project_id is required and must be a string');
    }

    if (!request.item_id || typeof request.item_id !== 'string') {
      errors.push('item_id is required and must be a string');
    }

    if (!request.user_id || typeof request.user_id !== 'string') {
      errors.push('user_id is required and must be a string');
    }

    if (!this.validateItemType(request.item_type)) {
      errors.push(`item_type must be one of: ${this.VALID_ITEM_TYPES.join(', ')}`);
    }

    if (request.sync_status && !this.validateSyncStatus(request.sync_status)) {
      errors.push(`sync_status must be one of: ${this.VALID_SYNC_STATUSES.join(', ')}`);
    }

    if (request.conflict_type && !this.validateConflictType(request.conflict_type)) {
      errors.push(`conflict_type must be one of: ${this.VALID_CONFLICT_TYPES.join(', ')}`);
    }

    if (request.sync_progress !== undefined && !this.validateSyncProgress(request.sync_progress)) {
      errors.push('sync_progress must be between 0.0 and 1.0');
    }

    if (request.error_message !== undefined && typeof request.error_message !== 'string') {
      errors.push('error_message must be a string when provided');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  static validateUpdateRequest(request: UpdateSyncIndicatorRequest): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (request.sync_status && !this.validateSyncStatus(request.sync_status)) {
      errors.push(`sync_status must be one of: ${this.VALID_SYNC_STATUSES.join(', ')}`);
    }

    if (request.conflict_type && !this.validateConflictType(request.conflict_type)) {
      errors.push(`conflict_type must be one of: ${this.VALID_CONFLICT_TYPES.join(', ')}`);
    }

    if (request.sync_progress !== undefined && !this.validateSyncProgress(request.sync_progress)) {
      errors.push('sync_progress must be between 0.0 and 1.0');
    }

    if (request.error_message !== undefined && typeof request.error_message !== 'string') {
      errors.push('error_message must be a string when provided');
    }

    if (request.last_sync !== undefined && !(request.last_sync instanceof Date)) {
      errors.push('last_sync must be a Date when provided');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  static validateBatchUpdate(request: SyncIndicatorBatchUpdate): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!Array.isArray(request.items)) {
      errors.push('items must be an array');
      return { valid: false, errors };
    }

    if (request.items.length === 0) {
      errors.push('items array cannot be empty');
      return { valid: false, errors };
    }

    request.items.forEach((item, index) => {
      if (!item.item_id || typeof item.item_id !== 'string') {
        errors.push(`items[${index}].item_id is required and must be a string`);
      }

      if (!this.validateSyncStatus(item.sync_status)) {
        errors.push(`items[${index}].sync_status must be one of: ${this.VALID_SYNC_STATUSES.join(', ')}`);
      }

      if (item.sync_progress !== undefined && !this.validateSyncProgress(item.sync_progress)) {
        errors.push(`items[${index}].sync_progress must be between 0.0 and 1.0`);
      }

      if (item.conflict_type && !this.validateConflictType(item.conflict_type)) {
        errors.push(`items[${index}].conflict_type must be one of: ${this.VALID_CONFLICT_TYPES.join(', ')}`);
      }

      if (item.error_message !== undefined && typeof item.error_message !== 'string') {
        errors.push(`items[${index}].error_message must be a string when provided`);
      }
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }
}