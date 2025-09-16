/**
 * Shared database types for CollabCut
 * Common interfaces and enums used across all models
 */

/** Base model interface with common fields */
export interface BaseModel {
  id: string;
  created_at: Date;
}

/** Model with update tracking */
export interface UpdatableModel extends BaseModel {
  updated_at: Date;
}

/** Project status enumeration */
export enum ProjectStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
  DELETED = 'deleted',
}

/** User status enumeration */
export enum UserStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  AWAY = 'away',
}

/** Project membership role enumeration */
export enum ProjectRole {
  OWNER = 'owner',
  EDITOR = 'editor',
  VIEWER = 'viewer',
  COMMENTER = 'commenter',
}

/** Media asset file type enumeration */
export enum MediaFileType {
  VIDEO = 'video',
  AUDIO = 'audio',
  IMAGE = 'image',
  SUBTITLE = 'subtitle',
}

/** Timeline track type enumeration */
export enum TrackType {
  VIDEO = 'video',
  AUDIO = 'audio',
  SUBTITLE = 'subtitle',
}

/** Comment status enumeration */
export enum CommentStatus {
  ACTIVE = 'active',
  RESOLVED = 'resolved',
  DELETED = 'deleted',
}

/** Live cursor activity type enumeration */
export enum ActivityType {
  EDITING = 'editing',
  VIEWING = 'viewing',
  SELECTING = 'selecting',
}

/** Database validation error */
export class ValidationError extends Error {
  constructor(field: string, message: string) {
    super(`Validation error for ${field}: ${message}`);
    this.name = 'ValidationError';
  }
}

/** Database operation result */
export interface DatabaseResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/** Pagination options */
export interface PaginationOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
}

/** Common model validation interface */
export interface ModelValidator<T> {
  validate(data: Partial<T>): ValidationError[];
  validateUpdate(data: Partial<T>): ValidationError[];
}
