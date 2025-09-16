/**
 * WebSocket Collaboration Server (T038)
 * Real-time collaboration server for CollabCut
 * Handles live cursors, simultaneous editing, and real-time communication
 */

import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { URL } from 'url';
import { EventEmitter } from 'events';
import {
  CollaborationService,
  CollaborationEvent,
  EditOperation,
} from '../services/collaboration.service';
import { databaseService } from '../services/database.service';
import { ActivityType } from '../../../shared/types/database';

export interface WebSocketMessage {
  type:
    | 'cursor_move'
    | 'clip_edit'
    | 'edit_operation'
    | 'comment_add'
    | 'user_join'
    | 'user_leave'
    | 'heartbeat';
  user_id: string;
  project_id: string;
  sequence_id?: string;
  data: any;
  timestamp: string;
}

export interface ConnectedUser {
  ws: WebSocket;
  user_id: string;
  project_id: string;
  sequence_id?: string;
  last_activity: Date;
  is_alive: boolean;
}

export interface RoomState {
  project_id: string;
  users: Map<string, ConnectedUser>;
  active_operations: Map<string, EditOperation>;
}

/**
 * WebSocket Collaboration Server Class
 * Manages real-time collaboration sessions and message routing
 */
export class CollaborationServer extends EventEmitter {
  private wss: WebSocketServer;
  private collaborationService: CollaborationService;
  private rooms: Map<string, RoomState> = new Map();
  private heartbeatInterval: ReturnType<typeof setInterval> | undefined;
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds
  private readonly CONNECTION_TIMEOUT = 60000; // 1 minute

  constructor(port: number = 8080) {
    super();

    // Initialize services
    this.collaborationService = new CollaborationService(databaseService);

    // Create WebSocket server
    this.wss = new WebSocketServer({
      port,
      verifyClient: this.verifyClient.bind(this),
    });

    this.setupEventHandlers();
    this.startHeartbeat();

    console.log(`WebSocket collaboration server started on port ${port}`);
  }

  /**
   * Verify client connection
   * @private
   */
  private verifyClient(info: {
    origin: string;
    secure: boolean;
    req: IncomingMessage;
  }): boolean {
    try {
      const url = new URL(info.req.url!, `http://${info.req.headers.host}`);
      const userId = url.searchParams.get('user_id');
      const projectId = url.searchParams.get('project_id');

      // Basic validation
      if (!userId || !projectId) {
        console.warn(
          'WebSocket connection rejected: missing user_id or project_id'
        );
        return false;
      }

      return true;
    } catch (error) {
      console.error('WebSocket verification error:', error);
      return false;
    }
  }

  /**
   * Setup WebSocket event handlers
   * @private
   */
  private setupEventHandlers(): void {
    this.wss.on('connection', this.handleConnection.bind(this));

    // Listen to collaboration service events
    this.collaborationService.on(
      'collaboration_event',
      this.broadcastCollaborationEvent.bind(this)
    );

    this.on('user_join', this.handleUserJoin.bind(this));
    this.on('user_leave', this.handleUserLeave.bind(this));
  }

  /**
   * Handle new WebSocket connection
   * @private
   */
  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    try {
      const url = new URL(req.url!, `http://${req.headers.host}`);
      const userId = url.searchParams.get('user_id')!;
      const projectId = url.searchParams.get('project_id')!;
      const sequenceId = url.searchParams.get('sequence_id') || undefined;

      console.log(`User ${userId} connected to project ${projectId}`);

      // Create user connection
      const user: ConnectedUser = {
        ws,
        user_id: userId,
        project_id: projectId,
        sequence_id: sequenceId,
        last_activity: new Date(),
        is_alive: true,
      };

      // Add user to room
      this.addUserToRoom(projectId, user);

      // Setup message handlers for this connection
      ws.on('message', (data) => this.handleMessage(user, data));
      ws.on('close', () => this.handleDisconnection(user));
      ws.on('error', (error) => this.handleConnectionError(user, error));
      ws.on('pong', () => this.handlePong(user));

      // Send welcome message
      this.sendToUser(user, {
        type: 'user_join',
        user_id: userId,
        project_id: projectId,
        sequence_id: sequenceId,
        data: { message: 'Connected successfully' },
        timestamp: new Date().toISOString(),
      });

      // Notify other users
      this.emit('user_join', user);
    } catch (error) {
      console.error('Connection handling error:', error);
      ws.close();
    }
  }

  /**
   * Handle incoming WebSocket messages
   * @private
   */
  private async handleMessage(user: ConnectedUser, data: any): Promise<void> {
    try {
      const message: WebSocketMessage = JSON.parse(data.toString());

      // Update user activity
      user.last_activity = new Date();

      // Validate message
      if (!this.validateMessage(message)) {
        this.sendError(user, 'Invalid message format');
        return;
      }

      // Process message based on type
      switch (message.type) {
        case 'cursor_move':
          await this.handleCursorMove(user, message);
          break;

        case 'edit_operation':
          await this.handleEditOperation(user, message);
          break;

        case 'comment_add':
          await this.handleCommentAdd(user, message);
          break;

        case 'heartbeat':
          this.handleHeartbeat(user, message);
          break;

        default:
          this.sendError(user, `Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('Message handling error:', error);
      this.sendError(user, 'Message processing failed');
    }
  }

  /**
   * Handle cursor movement
   * @private
   */
  private async handleCursorMove(
    user: ConnectedUser,
    message: WebSocketMessage
  ): Promise<void> {
    try {
      const { position, activity_type } = message.data;

      if (position === undefined || !message.sequence_id) {
        this.sendError(
          user,
          'Position and sequence_id are required for cursor move'
        );
        return;
      }

      // Update cursor in collaboration service
      const result = await this.collaborationService.updateCursorPosition(
        user.user_id,
        user.project_id,
        message.sequence_id,
        position,
        activity_type || ActivityType.VIEWING
      );

      if (result.success) {
        // Broadcast cursor update to other users in the same sequence
        this.broadcastToSequence(message.sequence_id, message, user.user_id);
      } else {
        this.sendError(
          user,
          result.error || 'Failed to update cursor position'
        );
      }
    } catch (error) {
      console.error('Cursor move error:', error);
      this.sendError(user, 'Failed to process cursor move');
    }
  }

  /**
   * Handle edit operations
   * @private
   */
  private async handleEditOperation(
    user: ConnectedUser,
    message: WebSocketMessage
  ): Promise<void> {
    try {
      const operation = message.data as Omit<
        EditOperation,
        'id' | 'timestamp' | 'applied'
      >;

      // Validate operation
      if (!operation.type || !operation.target_type || !operation.target_id) {
        this.sendError(user, 'Invalid edit operation format');
        return;
      }

      // Submit operation to collaboration service
      const result = await this.collaborationService.submitEditOperation({
        ...operation,
        user_id: user.user_id,
      });

      if (result.success) {
        // Broadcast operation to other users in the project
        this.broadcastToProject(
          user.project_id,
          {
            ...message,
            data: result.data,
          },
          user.user_id
        );

        // Send confirmation to the user
        this.sendToUser(user, {
          type: 'edit_operation',
          user_id: user.user_id,
          project_id: user.project_id,
          data: { status: 'applied', operation: result.data },
          timestamp: new Date().toISOString(),
        });
      } else {
        this.sendError(user, result.error || 'Failed to apply edit operation');
      }
    } catch (error) {
      console.error('Edit operation error:', error);
      this.sendError(user, 'Failed to process edit operation');
    }
  }

  /**
   * Handle comment addition
   * @private
   */
  private async handleCommentAdd(
    user: ConnectedUser,
    message: WebSocketMessage
  ): Promise<void> {
    try {
      const commentData = message.data;

      // Add comment through collaboration service
      const result = await this.collaborationService.addComment({
        ...commentData,
        author_id: user.user_id,
        project_id: user.project_id,
      });

      if (result.success) {
        // Broadcast comment to other users in the project
        this.broadcastToProject(
          user.project_id,
          {
            ...message,
            data: result.data,
          },
          user.user_id
        );
      } else {
        this.sendError(user, result.error || 'Failed to add comment');
      }
    } catch (error) {
      console.error('Comment add error:', error);
      this.sendError(user, 'Failed to process comment');
    }
  }

  /**
   * Handle heartbeat messages
   * @private
   */
  private handleHeartbeat(
    user: ConnectedUser,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    message: WebSocketMessage
  ): void {
    user.last_activity = new Date();
    user.is_alive = true;

    // Send heartbeat response
    this.sendToUser(user, {
      type: 'heartbeat',
      user_id: user.user_id,
      project_id: user.project_id,
      data: { timestamp: new Date().toISOString() },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Handle user disconnection
   * @private
   */
  private handleDisconnection(user: ConnectedUser): void {
    console.log(
      `User ${user.user_id} disconnected from project ${user.project_id}`
    );

    // Remove user from room
    this.removeUserFromRoom(user.project_id, user.user_id);

    // Deactivate cursors
    this.collaborationService.deactivateCursors(user.user_id, user.sequence_id);

    // Notify other users
    this.emit('user_leave', user);
  }

  /**
   * Handle connection errors
   * @private
   */
  private handleConnectionError(user: ConnectedUser, error: Error): void {
    console.error(`WebSocket error for user ${user.user_id}:`, error);
  }

  /**
   * Handle pong responses
   * @private
   */
  private handlePong(user: ConnectedUser): void {
    user.is_alive = true;
    user.last_activity = new Date();
  }

  /**
   * Add user to project room
   * @private
   */
  private addUserToRoom(projectId: string, user: ConnectedUser): void {
    if (!this.rooms.has(projectId)) {
      this.rooms.set(projectId, {
        project_id: projectId,
        users: new Map(),
        active_operations: new Map(),
      });
    }

    const room = this.rooms.get(projectId)!;
    room.users.set(user.user_id, user);
  }

  /**
   * Remove user from project room
   * @private
   */
  private removeUserFromRoom(projectId: string, userId: string): void {
    const room = this.rooms.get(projectId);
    if (room) {
      room.users.delete(userId);

      // Clean up empty rooms
      if (room.users.size === 0) {
        this.rooms.delete(projectId);
      }
    }
  }

  /**
   * Broadcast message to all users in project
   * @private
   */
  private broadcastToProject(
    projectId: string,
    message: WebSocketMessage,
    excludeUserId?: string
  ): void {
    const room = this.rooms.get(projectId);
    if (!room) return;

    for (const [userId, user] of room.users) {
      if (excludeUserId && userId === excludeUserId) continue;
      this.sendToUser(user, message);
    }
  }

  /**
   * Broadcast message to all users in sequence
   * @private
   */
  private broadcastToSequence(
    sequenceId: string,
    message: WebSocketMessage,
    excludeUserId?: string
  ): void {
    for (const room of this.rooms.values()) {
      for (const [userId, user] of room.users) {
        if (
          user.sequence_id === sequenceId &&
          (!excludeUserId || userId !== excludeUserId)
        ) {
          this.sendToUser(user, message);
        }
      }
    }
  }

  /**
   * Send message to specific user
   * @private
   */
  private sendToUser(user: ConnectedUser, message: WebSocketMessage): void {
    try {
      if (user.ws.readyState === WebSocket.OPEN) {
        user.ws.send(JSON.stringify(message));
      }
    } catch (error) {
      console.error('Failed to send message to user:', error);
    }
  }

  /**
   * Send error message to user
   * @private
   */
  private sendError(user: ConnectedUser, error: string): void {
    this.sendToUser(user, {
      type: 'error' as any,
      user_id: user.user_id,
      project_id: user.project_id,
      data: { error },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Validate incoming message format
   * @private
   */
  private validateMessage(message: WebSocketMessage): boolean {
    return !!(
      message.type &&
      message.user_id &&
      message.project_id &&
      message.timestamp &&
      message.data
    );
  }

  /**
   * Broadcast collaboration events from service
   * @private
   */
  private broadcastCollaborationEvent(event: CollaborationEvent): void {
    const message: WebSocketMessage = {
      type: event.type,
      user_id: event.user_id,
      project_id: event.project_id,
      sequence_id: event.sequence_id,
      data: event.data,
      timestamp: event.timestamp.toISOString(),
    };

    if (event.sequence_id) {
      this.broadcastToSequence(event.sequence_id, message, event.user_id);
    } else {
      this.broadcastToProject(event.project_id, message, event.user_id);
    }
  }

  /**
   * Handle user join event
   * @private
   */
  private handleUserJoin(user: ConnectedUser): void {
    // Broadcast user join to other users in the project
    this.broadcastToProject(
      user.project_id,
      {
        type: 'user_join',
        user_id: user.user_id,
        project_id: user.project_id,
        sequence_id: user.sequence_id,
        data: {
          user_id: user.user_id,
          sequence_id: user.sequence_id,
        },
        timestamp: new Date().toISOString(),
      },
      user.user_id
    );
  }

  /**
   * Handle user leave event
   * @private
   */
  private handleUserLeave(user: ConnectedUser): void {
    // Broadcast user leave to other users in the project
    this.broadcastToProject(
      user.project_id,
      {
        type: 'user_leave',
        user_id: user.user_id,
        project_id: user.project_id,
        sequence_id: user.sequence_id,
        data: {
          user_id: user.user_id,
          sequence_id: user.sequence_id,
        },
        timestamp: new Date().toISOString(),
      },
      user.user_id
    );
  }

  /**
   * Start heartbeat mechanism
   * @private
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.performHeartbeat();
    }, this.HEARTBEAT_INTERVAL);
  }

  /**
   * Perform heartbeat check
   * @private
   */
  private performHeartbeat(): void {
    const now = new Date();

    for (const room of this.rooms.values()) {
      for (const [userId, user] of room.users) {
        const timeSinceLastActivity =
          now.getTime() - user.last_activity.getTime();

        if (timeSinceLastActivity > this.CONNECTION_TIMEOUT) {
          // Remove inactive users
          console.log(
            `Removing inactive user ${userId} from project ${room.project_id}`
          );
          user.ws.terminate();
          this.handleDisconnection(user);
        } else if (user.ws.readyState === WebSocket.OPEN) {
          // Send ping to active users
          user.is_alive = false;
          user.ws.ping();
        }
      }
    }
  }

  /**
   * Get collaboration statistics
   */
  getStats() {
    const stats = {
      total_rooms: this.rooms.size,
      total_users: 0,
      rooms: [] as any[],
    };

    for (const [projectId, room] of this.rooms) {
      stats.total_users += room.users.size;
      stats.rooms.push({
        project_id: projectId,
        user_count: room.users.size,
        active_operations: room.active_operations.size,
        users: Array.from(room.users.keys()),
      });
    }

    return stats;
  }

  /**
   * Shutdown the server
   */
  shutdown(): void {
    console.log('Shutting down WebSocket collaboration server...');

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Close all connections
    for (const room of this.rooms.values()) {
      for (const user of room.users.values()) {
        user.ws.close();
      }
    }

    this.wss.close();
    console.log('WebSocket collaboration server shut down');
  }
}

export default CollaborationServer;
