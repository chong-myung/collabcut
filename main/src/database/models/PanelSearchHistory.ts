export interface PanelSearchHistory {
  id: string;
  panel_id: string;
  search_query: string;
  search_filters: {
    file_types?: string[];
    date_range?: {
      start?: Date;
      end?: Date;
    };
    size_range?: {
      min?: number;
      max?: number;
    };
    tags?: string[];
    [key: string]: any;
  };
  result_count: number;
  created_at: Date;
  is_saved: boolean;
  search_name?: string;
}

export interface CreateSearchHistoryRequest {
  panel_id: string;
  search_query: string;
  search_filters?: PanelSearchHistory['search_filters'];
  result_count: number;
  is_saved?: boolean;
  search_name?: string;
}

export interface UpdateSearchHistoryRequest {
  is_saved?: boolean;
  search_name?: string;
}

export interface SearchHistoryFilter {
  panel_id?: string;
  is_saved?: boolean;
  date_from?: Date;
  date_to?: Date;
  limit?: number;
  offset?: number;
}

export class PanelSearchHistoryValidator {
  static validateCreateRequest(request: CreateSearchHistoryRequest): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!request.panel_id || typeof request.panel_id !== 'string') {
      errors.push('panel_id is required and must be a string');
    }

    if (!request.search_query || typeof request.search_query !== 'string' || request.search_query.trim() === '') {
      errors.push('search_query must not be empty');
    }

    if (request.result_count < 0 || !Number.isInteger(request.result_count)) {
      errors.push('result_count must be a non-negative integer');
    }

    if (request.is_saved && request.search_name && typeof request.search_name !== 'string') {
      errors.push('search_name must be a string when provided');
    }

    if (request.search_filters && typeof request.search_filters !== 'object') {
      errors.push('search_filters must be an object when provided');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  static validateUpdateRequest(request: UpdateSearchHistoryRequest): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (request.search_name !== undefined && typeof request.search_name !== 'string') {
      errors.push('search_name must be a string when provided');
    }

    if (request.is_saved !== undefined && typeof request.is_saved !== 'boolean') {
      errors.push('is_saved must be a boolean when provided');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  static validateSearchQuery(query: string): boolean {
    return typeof query === 'string' && query.trim().length > 0;
  }

  static validateResultCount(count: number): boolean {
    return Number.isInteger(count) && count >= 0;
  }
}