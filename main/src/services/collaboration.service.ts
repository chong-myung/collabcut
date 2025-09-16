/**
 * Collaboration Service (T034)
 * Real-time collaboration with conflict resolution
 * Handles live cursors, simultaneous editing, and operational transformation
 */

import {
  LiveCursorModel,
  CreateLiveCursorData,
  LiveCursorWithUser,
  ActiveCursors,
} from '../models/live-cursor';
import {
  CommentModel,
  CreateCommentData,
  CommentWithAuthor,
  CommentThread,
} from '../models/comment';
import { DatabaseService } from './database.service';
import {
  DatabaseResult,
  ActivityType,
  CommentStatus,
} from '../../../shared/types/database';
import { EventEmitter } from 'events';

export interface CollaborationEvent {
  type:
    | 'cursor_move'
    | 'clip_edit'
    | 'comment_add'
    | 'user_join'
    | 'user_leave';
  user_id: string;
  project_id: string;
  sequence_id?: string;
  data: any;
  timestamp: Date;
}

export interface EditOperation {
  id: string;
  type: 'insert' | 'delete' | 'update' | 'move';
  target_type: 'clip' | 'track' | 'sequence';
  target_id: string;
  position?: number;
  data: any;
  user_id: string;
  timestamp: Date;
  applied: boolean;
}

export interface ConflictResolution {
  operation_id: string;
  conflict_type: 'concurrent_edit' | 'position_conflict' | 'resource_conflict';
  resolution: 'user_wins' | 'last_wins' | 'merge' | 'reject';
  resolved_data?: any;
}

export interface UserPresence {
  user_id: string;
  project_id: string;
  sequence_id?: string;
  status: 'active' | 'idle' | 'away';
  last_activity: Date;
  current_action?: string;
}

/**
 * Collaboration Service Class
 * Manages real-time collaboration, conflict resolution, and user presence
 */
export class CollaborationService extends EventEmitter {
  private liveCursorModel: LiveCursorModel;
  private commentModel: CommentModel;
  private db: DatabaseService;
  private pendingOperations: Map<string, EditOperation> = new Map();
  private userPresence: Map<string, UserPresence> = new Map();
  private conflictResolutionHandlers: Map<string, Function> = new Map();

  constructor(databaseService: DatabaseService) {
    super();
    this.db = databaseService;
    this.liveCursorModel = new LiveCursorModel(databaseService.getDatabase()!);
    this.commentModel = new CommentModel(databaseService.getDatabase()!);

    this.setupConflictResolutionHandlers();
    this.startPresenceCleanup();
  }

  /**
   * Update user cursor position
   * @param userId - User ID
   * @param projectId - Project ID
   * @param sequenceId - Sequence ID
   * @param position - Timeline position
   * @param activityType - Type of activity
   * @returns Promise with success status
   */
  async updateCursorPosition(
    userId: string,
    projectId: string,
    sequenceId: string,
    position: number,
    activityType: ActivityType = ActivityType.VIEWING
  ): Promise<DatabaseResult<boolean>> {
    try {
      // Get or assign cursor color
      const color = await this.liveCursorModel.getAvailableColor(
        projectId,
        userId
      );

      // Update or create cursor
      const cursorData: CreateLiveCursorData = {
        user_id: userId,
        project_id: projectId,
        sequence_id: sequenceId,
        position,
        color,
        activity_type: activityType,
      };

      const result = await this.liveCursorModel.upsert(cursorData);
      if (result.success) {
        // Update user presence
        this.updateUserPresence(userId, projectId, sequenceId, 'active');

        // Emit cursor move event
        this.emitCollaborationEvent({
          type: 'cursor_move',
          user_id: userId,
          project_id: projectId,
          sequence_id: sequenceId,
          data: { position, activity_type: activityType, color },
          timestamp: new Date(),
        });
      }

      return { success: result.success, data: result.success };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get active cursors for a sequence
   * @param sequenceId - Sequence ID
   * @param excludeUserId - User ID to exclude
   * @returns Promise with active cursors
   */
  async getActiveCursors(
    sequenceId: string,
    excludeUserId?: string
  ): Promise<DatabaseResult<LiveCursorWithUser[]>> {
    return this.liveCursorModel.findActiveBySequenceId(
      sequenceId,
      excludeUserId
    );
  }

  /**
   * Get active cursors for a project
   * @param projectId - Project ID
   * @param excludeUserId - User ID to exclude
   * @returns Promise with active cursors by sequence
   */
  async getProjectCursors(
    projectId: string,
    excludeUserId?: string
  ): Promise<DatabaseResult<ActiveCursors[]>> {
    return this.liveCursorModel.findActiveByProjectId(projectId, excludeUserId);
  }

  /**
   * Deactivate user cursors
   * @param userId - User ID
   * @param sequenceId - Optional sequence ID
   * @returns Promise with success status
   */
  async deactivateCursors(
    userId: string,
    sequenceId?: string
  ): Promise<DatabaseResult<boolean>> {
    try {
      const result = await this.liveCursorModel.deactivate(userId, sequenceId);

      if (result.success) {
        // Update user presence
        this.updateUserPresence(userId, '', sequenceId, 'away');

        // Emit user leave event
        this.emitCollaborationEvent({
          type: 'user_leave',
          user_id: userId,
          project_id: '',
          sequence_id: sequenceId,
          data: {},
          timestamp: new Date(),
        });
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Submit edit operation for conflict resolution
   * @param operation - Edit operation
   * @returns Promise with operation result
   */
  async submitEditOperation(
    operation: Omit<EditOperation, 'id' | 'timestamp' | 'applied'>
  ): Promise<DatabaseResult<EditOperation>> {
    try {
      const fullOperation: EditOperation = {
        ...operation,
        id: this.db.generateId('op'),
        timestamp: new Date(),
        applied: false,
      };

      // Check for conflicts
      const conflicts = await this.detectConflicts(fullOperation);

      if (conflicts.length > 0) {
        // Handle conflicts
        const resolution = await this.resolveConflicts(
          fullOperation,
          conflicts
        );
        if (!resolution.success) {
          return { success: false, error: resolution.error };
        }

        if (resolution.data) {
          // Apply resolved operation
          fullOperation.data =
            resolution.data.resolved_data || fullOperation.data;
        }
      }

      // Store operation
      this.pendingOperations.set(fullOperation.id, fullOperation);

      // Apply operation
      const applyResult = await this.applyOperation(fullOperation);
      if (applyResult.success) {
        fullOperation.applied = true;

        // Emit edit event
        this.emitCollaborationEvent({
          type: 'clip_edit',
          user_id: operation.user_id,
          project_id: '',
          data: fullOperation,
          timestamp: fullOperation.timestamp,
        });
      }

      return { success: true, data: fullOperation };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Add comment to timeline or clip
   * @param data - Comment creation data
   * @returns Promise with created comment
   */
  async addComment(
    data: CreateCommentData
  ): Promise<DatabaseResult<CommentWithAuthor>> {
    try {
      const result = await this.commentModel.create(data);
      if (!result.success || !result.data) {
        return result;
      }

      // Get comment with author info
      const commentWithAuthor = await this.db.get(
        `
        SELECT c.*, u.username, u.display_name, u.avatar_url
        FROM comments c
        JOIN users u ON c.author_id = u.id
        WHERE c.id = ?
      `,
        [result.data.id]
      );

      if (commentWithAuthor) {
        const comment: CommentWithAuthor = {
          id: commentWithAuthor.id,
          project_id: commentWithAuthor.project_id,
          clip_id: commentWithAuthor.clip_id,
          sequence_id: commentWithAuthor.sequence_id,
          author_id: commentWithAuthor.author_id,
          content: commentWithAuthor.content,
          timestamp: commentWithAuthor.timestamp,
          status: commentWithAuthor.status as CommentStatus,
          reply_to: commentWithAuthor.reply_to,
          created_at: new Date(commentWithAuthor.created_at),
          updated_at: new Date(commentWithAuthor.updated_at),
          author: {
            id: commentWithAuthor.author_id,
            username: commentWithAuthor.username,
            display_name: commentWithAuthor.display_name,
            avatar_url: commentWithAuthor.avatar_url,
          },
        };

        // Emit comment event
        this.emitCollaborationEvent({
          type: 'comment_add',
          user_id: data.author_id,
          project_id: data.project_id,
          sequence_id: data.sequence_id,
          data: comment,
          timestamp: new Date(),
        });

        return { success: true, data: comment };
      }

      return {
        success: false,
        error: 'Failed to retrieve comment with author',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get comments for project/clip/sequence
   * @param projectId - Project ID
   * @param clipId - Optional clip ID
   * @param sequenceId - Optional sequence ID
   * @returns Promise with comments array
   */
  async getComments(
    projectId: string,
    clipId?: string,
    sequenceId?: string
  ): Promise<DatabaseResult<CommentWithAuthor[]>> {
    if (clipId) {
      return this.commentModel.findByClipId(clipId);
    } else if (sequenceId) {
      return this.commentModel.findBySequenceId(sequenceId);
    } else {
      return this.commentModel.findByProjectId(projectId, {
        includeReplies: true,
      });
    }
  }

  /**
   * Get comment thread
   * @param parentId - Parent comment ID
   * @returns Promise with comment thread
   */
  async getCommentThread(
    parentId: string
  ): Promise<DatabaseResult<CommentThread>> {
    return this.commentModel.findThread(parentId);
  }

  /**
   * Update user presence
   * @private
   */
  private updateUserPresence(
    userId: string,
    projectId: string,
    sequenceId?: string,
    status: 'active' | 'idle' | 'away' = 'active'
  ): void {
    this.userPresence.set(userId, {
      user_id: userId,
      project_id: projectId,
      sequence_id: sequenceId,
      status,
      last_activity: new Date(),
    });
  }

  /**
   * Get user presence information
   * @param projectId - Project ID
   * @returns Array of user presence info
   */
  getUserPresence(projectId: string): UserPresence[] {
    return Array.from(this.userPresence.values()).filter(
      (presence) => presence.project_id === projectId
    );
  }

  /**
   * Detect conflicts with pending operations
   * @private
   */
  private async detectConflicts(
    operation: EditOperation
  ): Promise<EditOperation[]> {
    const conflicts: EditOperation[] = [];

    for (const [id, pendingOp] of this.pendingOperations) {
      if (pendingOp.applied || pendingOp.user_id === operation.user_id) {
        continue;
      }

      // Check for same target conflicts
      if (
        pendingOp.target_type === operation.target_type &&
        pendingOp.target_id === operation.target_id
      ) {
        conflicts.push(pendingOp);
      }

      // Check for position conflicts (clips on same track at same time)
      if (
        operation.target_type === 'clip' &&
        pendingOp.target_type === 'clip' &&
        operation.position !== undefined &&
        pendingOp.position !== undefined
      ) {
        // Get track IDs for position conflict detection
        const opTrack = await this.getClipTrack(operation.target_id);
        const pendingTrack = await this.getClipTrack(pendingOp.target_id);

        if (
          opTrack === pendingTrack &&
          Math.abs(operation.position - pendingOp.position) < 1000
        ) {
          // Within 1 second
          conflicts.push(pendingOp);
        }
      }
    }

    return conflicts;
  }

  /**
   * Resolve conflicts between operations
   * @private
   */
  private async resolveConflicts(
    operation: EditOperation,
    conflicts: EditOperation[]
  ): Promise<DatabaseResult<ConflictResolution>> {
    try {
      // Simple conflict resolution strategy: last write wins
      const resolution: ConflictResolution = {
        operation_id: operation.id,
        conflict_type: 'concurrent_edit',
        resolution: 'last_wins',
        resolved_data: operation.data,
      };

      // Mark conflicting operations as rejected
      for (const conflict of conflicts) {
        this.pendingOperations.delete(conflict.id);
      }

      return { success: true, data: resolution };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Conflict resolution failed',
      };
    }
  }

  /**
   * Apply edit operation
   * @private
   */
  private async applyOperation(
    operation: EditOperation
  ): Promise<DatabaseResult<boolean>> {
    try {
      // Apply operation based on type
      switch (operation.target_type) {
        case 'clip':
          return await this.applyClipOperation(operation);
        case 'track':
          return await this.applyTrackOperation(operation);
        case 'sequence':
          return await this.applySequenceOperation(operation);
        default:
          return { success: false, error: 'Unknown operation target type' };
      }
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Operation application failed',
      };
    }
  }

  /**
   * Apply clip-specific operation
   * @private
   */
  private async applyClipOperation(
    operation: EditOperation
  ): Promise<DatabaseResult<boolean>> {
    switch (operation.type) {
      case 'update':
        await this.db.run(
          'UPDATE clips SET start_time = ?, end_time = ? WHERE id = ?',
          [
            operation.data.start_time,
            operation.data.end_time,
            operation.target_id,
          ]
        );
        return { success: true, data: true };

      case 'move':
        await this.db.run(
          'UPDATE clips SET track_id = ?, start_time = ?, end_time = ? WHERE id = ?',
          [
            operation.data.track_id,
            operation.data.start_time,
            operation.data.end_time,
            operation.target_id,
          ]
        );
        return { success: true, data: true };

      case 'delete':
        await this.db.run('DELETE FROM clips WHERE id = ?', [
          operation.target_id,
        ]);
        return { success: true, data: true };

      default:
        return { success: false, error: 'Unknown clip operation type' };
    }
  }

  /**
   * Apply track-specific operation
   * @private
   */
  private async applyTrackOperation(
    operation: EditOperation
  ): Promise<DatabaseResult<boolean>> {
    switch (operation.type) {
      case 'update':
        const setClause = Object.keys(operation.data)
          .map((key) => `${key} = ?`)
          .join(', ');
        const values = Object.values(operation.data);
        values.push(operation.target_id);

        await this.db.run(
          `UPDATE tracks SET ${setClause} WHERE id = ?`,
          values
        );
        return { success: true, data: true };

      default:
        return { success: false, error: 'Unknown track operation type' };
    }
  }

  /**
   * Apply sequence-specific operation
   * @private
   */
  private async applySequenceOperation(
    operation: EditOperation
  ): Promise<DatabaseResult<boolean>> {
    switch (operation.type) {
      case 'update':
        const setClause = Object.keys(operation.data)
          .map((key) => `${key} = ?`)
          .join(', ');
        const values = Object.values(operation.data);
        values.push(operation.target_id);

        await this.db.run(
          `UPDATE timeline_sequences SET ${setClause} WHERE id = ?`,
          values
        );
        return { success: true, data: true };

      default:
        return { success: false, error: 'Unknown sequence operation type' };
    }
  }

  /**
   * Get track ID for a clip
   * @private
   */
  private async getClipTrack(clipId: string): Promise<string | null> {
    const result = await this.db.get(
      'SELECT track_id FROM clips WHERE id = ?',
      [clipId]
    );
    return result?.track_id || null;
  }

  /**
   * Setup conflict resolution handlers
   * @private
   */
  private setupConflictResolutionHandlers(): void {
    this.conflictResolutionHandlers.set(
      'concurrent_edit',
      this.handleConcurrentEdit.bind(this)
    );
    this.conflictResolutionHandlers.set(
      'position_conflict',
      this.handlePositionConflict.bind(this)
    );
    this.conflictResolutionHandlers.set(
      'resource_conflict',
      this.handleResourceConflict.bind(this)
    );
  }

  /**
   * Handle concurrent edit conflicts
   * @private
   */
  private handleConcurrentEdit(
    operation: EditOperation,
    conflict: EditOperation
  ): ConflictResolution {
    // Last writer wins strategy
    return {
      operation_id: operation.id,
      conflict_type: 'concurrent_edit',
      resolution: 'last_wins',
      resolved_data: operation.data,
    };
  }

  /**
   * Handle position conflicts
   * @private
   */
  private handlePositionConflict(
    operation: EditOperation,
    conflict: EditOperation
  ): ConflictResolution {
    // Adjust position to avoid overlap
    const adjustedPosition = (operation.position || 0) + 1000; // Move 1 second later

    return {
      operation_id: operation.id,
      conflict_type: 'position_conflict',
      resolution: 'merge',
      resolved_data: {
        ...operation.data,
        start_time: adjustedPosition,
        end_time:
          adjustedPosition +
          (operation.data.end_time - operation.data.start_time),
      },
    };
  }

  /**
   * Handle resource conflicts
   * @private
   */
  private handleResourceConflict(
    operation: EditOperation,
    conflict: EditOperation
  ): ConflictResolution {
    // Reject conflicting operation
    return {
      operation_id: operation.id,
      conflict_type: 'resource_conflict',
      resolution: 'reject',
    };
  }

  /**
   * Emit collaboration event
   * @private
   */
  private emitCollaborationEvent(event: CollaborationEvent): void {
    this.emit('collaboration_event', event);
  }

  /**
   * Start presence cleanup interval
   * @private
   */
  private startPresenceCleanup(): void {
    setInterval(() => {
      const now = new Date();
      const timeout = 5 * 60 * 1000; // 5 minutes

      for (const [userId, presence] of this.userPresence) {
        if (now.getTime() - presence.last_activity.getTime() > timeout) {
          this.userPresence.delete(userId);
        }
      }
    }, 60000); // Check every minute
  }

  /**
   * Clean up pending operations
   */
  cleanupPendingOperations(): void {
    const now = new Date();
    const timeout = 10 * 60 * 1000; // 10 minutes

    for (const [id, operation] of this.pendingOperations) {
      if (now.getTime() - operation.timestamp.getTime() > timeout) {
        this.pendingOperations.delete(id);
      }
    }
  }
}

export default CollaborationService;
