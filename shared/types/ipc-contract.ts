/**
 * IPC Contract for Project Panel Feature
 * Defines type-safe communication between Electron Main and Renderer processes
 */

// ====================
// Panel State Management
// ====================

export interface PanelStateRequest {
  projectId: string;
  userId: string;
}

export interface PanelStateResponse {
  id: string;
  projectId: string;
  userId: string;
  layoutConfig: {
    width: number;
    height: number;
    columns: string[];
  };
  viewMode: 'list' | 'grid' | 'tree';
  sortPreference: 'name' | 'date' | 'type' | 'size';
  filterSettings: {
    fileTypes: string[];
    dateRange?: {
      start: string;
      end: string;
    };
  };
  expandedFolders: string[];
  selectedItems: string[];
  lastUpdated: string;
}

export interface PanelStateUpdate {
  projectId: string;
  userId: string;
  updates: Partial<Omit<PanelStateResponse, 'id' | 'projectId' | 'userId' | 'lastUpdated'>>;
}

// ====================
// Media Asset Operations
// ====================

export interface AssetSearchRequest {
  projectId: string;
  query?: string;
  folderId?: string;
  fileType?: 'video' | 'audio' | 'image' | 'subtitle' | 'all';
  limit?: number;
  offset?: number;
}

export interface MediaAssetData {
  id: string;
  projectId: string;
  filename: string;
  filePath: string;
  cloudUrl?: string;
  fileType: 'video' | 'audio' | 'image' | 'subtitle';
  fileSize: number;
  duration?: number;
  resolution?: string;
  framerate?: number;
  codec?: string;
  thumbnailUrl?: string;
  createdAt: string;
  uploadedBy: string;
  metadata: Record<string, any>;
  folderId?: string;
}

export interface AssetSearchResponse {
  items: MediaAssetData[];
  total: number;
  limit: number;
  offset: number;
}

export interface AssetUploadRequest {
  projectId: string;
  filePath: string;
  filename: string;
  folderId?: string;
  metadata?: Record<string, any>;
}

export interface AssetUploadProgress {
  assetId: string;
  progress: number; // 0-1
  stage: 'reading' | 'processing' | 'uploading' | 'complete' | 'error';
  message?: string;
}

// ====================
// Folder Operations
// ====================

export interface FolderData {
  id: string;
  projectId: string;
  name: string;
  parentId?: string;
  path: string;
  description?: string;
  createdAt: string;
  createdBy: string;
  permissions: Record<string, any>;
  color?: string;
  sortOrder: number;
}

export interface FolderCreateRequest {
  projectId: string;
  name: string;
  parentId?: string;
  description?: string;
  color?: string;
}

export interface FolderUpdateRequest {
  projectId: string;
  folderId: string;
  updates: {
    name?: string;
    description?: string;
    color?: string;
    sortOrder?: number;
  };
}

export interface FolderListRequest {
  projectId: string;
  parentId?: string;
}

export interface FolderListResponse {
  items: FolderData[];
}

// ====================
// File System Operations
// ====================

export interface FileSystemBrowseRequest {
  startPath?: string;
  fileTypes?: string[]; // e.g., ['.mp4', '.mov', '.avi']
  allowMultiple?: boolean;
}

export interface FileSystemBrowseResponse {
  filePaths: string[];
  cancelled: boolean;
}

export interface FileMetadataRequest {
  filePath: string;
}

export interface FileMetadataResponse {
  filename: string;
  fileSize: number;
  fileType: 'video' | 'audio' | 'image' | 'unknown';
  duration?: number;
  resolution?: string;
  framerate?: number;
  codec?: string;
  createdAt: string;
  modifiedAt: string;
}

export interface ThumbnailGenerateRequest {
  filePath: string;
  outputPath: string;
  timestamp?: number; // seconds, for video thumbnails
  width?: number;
  height?: number;
}

export interface ThumbnailGenerateResponse {
  success: boolean;
  thumbnailPath?: string;
  error?: string;
}

// ====================
// Real-time Sync Events
// ====================

export interface SyncStatusUpdate {
  itemId: string;
  itemType: 'folder' | 'media_asset' | 'project';
  syncStatus: 'synced' | 'syncing' | 'conflict' | 'error' | 'offline';
  lastSync?: string;
  syncProgress?: number; // 0-1
  errorMessage?: string;
  conflictType?: 'none' | 'name_conflict' | 'content_conflict' | 'permission_conflict';
  userId?: string;
}

export interface LiveCursorUpdate {
  userId: string;
  projectId: string;
  position: {
    itemId?: string;
    itemType?: 'folder' | 'media_asset';
    action: 'viewing' | 'editing' | 'selecting';
  };
  color: string;
  displayName: string;
}

// ====================
// Search History
// ====================

export interface SearchHistoryRequest {
  projectId: string;
  userId: string;
  limit?: number;
}

export interface SearchHistoryItem {
  id: string;
  searchQuery: string;
  searchFilters: Record<string, any>;
  resultCount: number;
  createdAt: string;
  isSaved: boolean;
  searchName?: string;
}

export interface SearchHistoryResponse {
  items: SearchHistoryItem[];
}

export interface SearchHistorySaveRequest {
  projectId: string;
  userId: string;
  searchQuery: string;
  searchFilters: Record<string, any>;
  resultCount: number;
  isSaved?: boolean;
  searchName?: string;
}

// ====================
// IPC Channel Definitions
// ====================

export type IPCChannels = {
  // Panel State
  'panel:get-state': {
    request: PanelStateRequest;
    response: PanelStateResponse;
  };
  'panel:update-state': {
    request: PanelStateUpdate;
    response: void;
  };

  // Asset Operations
  'assets:search': {
    request: AssetSearchRequest;
    response: AssetSearchResponse;
  };
  'assets:upload': {
    request: AssetUploadRequest;
    response: MediaAssetData;
  };
  'assets:upload-progress': {
    event: AssetUploadProgress;
  };

  // Folder Operations
  'folders:list': {
    request: FolderListRequest;
    response: FolderListResponse;
  };
  'folders:create': {
    request: FolderCreateRequest;
    response: FolderData;
  };
  'folders:update': {
    request: FolderUpdateRequest;
    response: void;
  };
  'folders:delete': {
    request: { projectId: string; folderId: string };
    response: void;
  };

  // File System
  'fs:browse': {
    request: FileSystemBrowseRequest;
    response: FileSystemBrowseResponse;
  };
  'fs:get-metadata': {
    request: FileMetadataRequest;
    response: FileMetadataResponse;
  };
  'fs:generate-thumbnail': {
    request: ThumbnailGenerateRequest;
    response: ThumbnailGenerateResponse;
  };

  // Search History
  'search:get-history': {
    request: SearchHistoryRequest;
    response: SearchHistoryResponse;
  };
  'search:save-history': {
    request: SearchHistorySaveRequest;
    response: void;
  };

  // Real-time Events
  'sync:status-update': {
    event: SyncStatusUpdate;
  };
  'collaboration:cursor-update': {
    event: LiveCursorUpdate;
  };
};

// ====================
// Type Utilities
// ====================

export type IPCRequest<T extends keyof IPCChannels> = IPCChannels[T] extends { request: infer R } ? R : never;
export type IPCResponse<T extends keyof IPCChannels> = IPCChannels[T] extends { response: infer R } ? R : never;
export type IPCEvent<T extends keyof IPCChannels> = IPCChannels[T] extends { event: infer E } ? E : never;

// Error handling
export interface IPCError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export type IPCResult<T> = {
  success: true;
  data: T;
} | {
  success: false;
  error: IPCError;
};