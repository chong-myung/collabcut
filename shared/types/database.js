'use strict';
/**
 * Shared database types for CollabCut
 * Common interfaces and enums used across all models
 */
Object.defineProperty(exports, '__esModule', { value: true });
exports.ValidationError =
  exports.ActivityType =
  exports.CommentStatus =
  exports.TrackType =
  exports.MediaFileType =
  exports.ProjectRole =
  exports.UserStatus =
  exports.ProjectStatus =
    void 0;
/** Project status enumeration */
var ProjectStatus;
(function (ProjectStatus) {
  ProjectStatus['ACTIVE'] = 'active';
  ProjectStatus['ARCHIVED'] = 'archived';
  ProjectStatus['DELETED'] = 'deleted';
})(ProjectStatus || (exports.ProjectStatus = ProjectStatus = {}));
/** User status enumeration */
var UserStatus;
(function (UserStatus) {
  UserStatus['ONLINE'] = 'online';
  UserStatus['OFFLINE'] = 'offline';
  UserStatus['AWAY'] = 'away';
})(UserStatus || (exports.UserStatus = UserStatus = {}));
/** Project membership role enumeration */
var ProjectRole;
(function (ProjectRole) {
  ProjectRole['OWNER'] = 'owner';
  ProjectRole['EDITOR'] = 'editor';
  ProjectRole['VIEWER'] = 'viewer';
  ProjectRole['COMMENTER'] = 'commenter';
})(ProjectRole || (exports.ProjectRole = ProjectRole = {}));
/** Media asset file type enumeration */
var MediaFileType;
(function (MediaFileType) {
  MediaFileType['VIDEO'] = 'video';
  MediaFileType['AUDIO'] = 'audio';
  MediaFileType['IMAGE'] = 'image';
  MediaFileType['SUBTITLE'] = 'subtitle';
})(MediaFileType || (exports.MediaFileType = MediaFileType = {}));
/** Timeline track type enumeration */
var TrackType;
(function (TrackType) {
  TrackType['VIDEO'] = 'video';
  TrackType['AUDIO'] = 'audio';
  TrackType['SUBTITLE'] = 'subtitle';
})(TrackType || (exports.TrackType = TrackType = {}));
/** Comment status enumeration */
var CommentStatus;
(function (CommentStatus) {
  CommentStatus['ACTIVE'] = 'active';
  CommentStatus['RESOLVED'] = 'resolved';
  CommentStatus['DELETED'] = 'deleted';
})(CommentStatus || (exports.CommentStatus = CommentStatus = {}));
/** Live cursor activity type enumeration */
var ActivityType;
(function (ActivityType) {
  ActivityType['EDITING'] = 'editing';
  ActivityType['VIEWING'] = 'viewing';
  ActivityType['SELECTING'] = 'selecting';
})(ActivityType || (exports.ActivityType = ActivityType = {}));
/** Database validation error */
class ValidationError extends Error {
  constructor(field, message) {
    super(`Validation error for ${field}: ${message}`);
    this.name = 'ValidationError';
  }
}
exports.ValidationError = ValidationError;
