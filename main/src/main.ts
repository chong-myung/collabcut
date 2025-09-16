import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import isDev from 'electron-is-dev';
import * as WebSocket from 'ws';

// Services
import databaseService from './services/database.service';
import ffmpegService from './services/ffmpeg.service';
import { ProjectService } from './services/project.service';
import { MediaService } from './services/media.service';
import { TimelineService } from './services/timeline.service';
import { CollaborationService } from './services/collaboration.service';
import { UserModel, UserAuth } from './models/user';
import videoProcessingManager, { VideoProcessingJob } from './workers/video-processor';
import { ActivityType } from '../../shared/types/database';

// Initialize services
const projectService = new ProjectService(databaseService);
const mediaService = new MediaService(databaseService);
const timelineService = new TimelineService(databaseService);
const collaborationService = new CollaborationService(databaseService);

interface IpcResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

interface WebSocketMessage {
  type: string;
  payload: any;
}

class CollabCutApp {
  public mainWindow: BrowserWindow | null = null;
  private wsServer: WebSocket.Server | null = null;
  private isDev: boolean;
  private userModel: UserModel | null = null;
  private currentUser: UserAuth | null = null;

  constructor() {
    this.isDev = isDev;
    // UserModel will be initialized after database is ready
  }

  async initialize(): Promise<void> {
    await this.setupApp();
    await this.initializeServices();
    this.setupEventHandlers();
    this.createMainWindow();
  }

  /**
   * Get current user ID
   * @returns Current user ID or null if not authenticated
   */
  private getCurrentUserId(): string | null {
    return this.currentUser?.user.id || null;
  }

  /**
   * Set current user session
   * @param userAuth User authentication data
   */
  private setCurrentUser(userAuth: UserAuth): void {
    this.currentUser = userAuth;
  }

  /**
   * Clear current user session
   */
  private clearCurrentUser(): void {
    this.currentUser = null;
  }

  private async setupApp(): Promise<void> {
    // Enable live reload for development
    if (this.isDev) {
      require('electron-reload')(__dirname, {
        electron: path.join(
          __dirname,
          '..',
          '..',
          '..',
          'node_modules',
          '.bin',
          'electron'
        ),
        hardResetMethod: 'exit',
      });
    }

    // Security: Prevent new window creation
    app.on('web-contents-created', (event, contents) => {
      contents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
      });
    });

    await app.whenReady();
  }

  private async initializeServices(): Promise<void> {
    try {
      console.log('Initializing services...');

      // Initialize database
      await databaseService.initialize();
      console.log('Database service initialized');

      // Initialize UserModel after database is ready
      const database = databaseService.getDatabase();
      if (!database) {
        throw new Error('Database not available after initialization');
      }
      this.userModel = new UserModel(database);
      console.log('User model initialized');

      // Initialize FFmpeg
      await ffmpegService.initialize();
      console.log('FFmpeg service initialized');

      // Start WebSocket server for collaboration
      this.startWebSocketServer();
      console.log('WebSocket server started');
    } catch (error) {
      console.error('Failed to initialize services:', error);
      dialog.showErrorBox(
        'Initialization Error',
        'Failed to initialize application services. Please restart the application.'
      );
    }
  }

  private createMainWindow(): void {
    this.mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 1200,
      minHeight: 700,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
      },
      titleBarStyle: 'default',
      show: false,
    });

    // Load the React application
    const startUrl = this.isDev
      ? 'http://localhost:3000'
      : `file://${path.join(__dirname, '../../renderer/build/index.html')}`;

    this.mainWindow.loadURL(startUrl);

    // Show window when ready to prevent visual flash
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow?.show();

      if (this.isDev) {
        this.mainWindow?.webContents.openDevTools();
      }
    });

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });
  }

  private setupEventHandlers(): void {
    // Application event handlers
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createMainWindow();
      }
    });

    app.on('before-quit', async () => {
      await this.cleanup();
    });

    // IPC handlers for communication with renderer process
    this.setupIPCHandlers();
  }

  private setupIPCHandlers(): void {
    // User authentication
    ipcMain.handle(
      'user:login',
      async (event, userId: string): Promise<IpcResponse> => {
        try {
          if (!this.userModel) {
            return { success: false, error: 'User service not initialized' };
          }
          const sessionResult = await this.userModel.createSession(userId);
          console.log('sessionResult', sessionResult);
          if (sessionResult.success && sessionResult.data) {
            this.setCurrentUser(sessionResult.data);
            return { success: true, data: sessionResult.data };
          } else {
            return {
              success: false,
              error: sessionResult.error || 'Login failed',
            };
          }
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      }
    );

    ipcMain.handle('user:logout', async (): Promise<IpcResponse> => {
      try {
        this.clearCurrentUser();
        return { success: true, data: null };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('user:getCurrentUser', async (): Promise<IpcResponse> => {
      try {
        if (this.currentUser) {
          return { success: true, data: this.currentUser };
        } else {
          return { success: false, error: 'No user logged in' };
        }
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // Project management
    ipcMain.handle(
      'project:create',
      async (event, projectData): Promise<IpcResponse> => {
        try {
          const userId = this.getCurrentUserId();
          if (!userId) {
            return { success: false, error: 'User not authenticated' };
          }
          // Add current user ID to project data
          const projectDataWithUser = {
            ...projectData,
            created_by: userId,
          };
          const project =
            await projectService.createProject(projectDataWithUser);
          return { success: true, data: project };
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      }
    );

    ipcMain.handle(
      'project:get',
      async (event, projectId: string): Promise<IpcResponse> => {
        try {
          const userId = this.getCurrentUserId();
          if (!userId) {
            return { success: false, error: 'User not authenticated' };
          }
          const project = await projectService.getProject(projectId, userId);
          if(!project.success) {
            return { success: false, error: project.error };
          }
          return { success: true, data: project.data };
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      }
    );

    ipcMain.handle('project:list', async (): Promise<IpcResponse> => {
      try {
        const userId = this.getCurrentUserId();
        if (!userId) {
          return { success: false, error: 'User not authenticated' };
        }

        const projects = await projectService.getUserProjects(userId);
        if(!projects.success) {
          return { success: false, error: projects.error };
        }
        return { success: true, data: projects.data };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // Media management
    ipcMain.handle(
      'media:upload',
      async (
        event,
        filePath: string,
        projectId: string
      ): Promise<IpcResponse> => {
        try {
          const userId = this.getCurrentUserId();
          if (!userId) {
            return { success: false, error: 'User not authenticated' };
          }

          const uploadResult = await mediaService.uploadMedia(
            filePath,
            projectId,
            userId
          );

          return uploadResult;
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      }
    );

    ipcMain.handle(
      'media:list',
      async (event, projectId: string): Promise<IpcResponse> => {
        try {
          const userId = this.getCurrentUserId();
          if (!userId) {
            return { success: false, error: 'User not authenticated' };
          }

          const assetsResult = await mediaService.getProjectMedia(projectId, {});
          return assetsResult;
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      }
    );

    ipcMain.handle(
      'media:delete',
      async (event, assetId: string): Promise<IpcResponse> => {
        try {
          const userId = this.getCurrentUserId();
          if (!userId) {
            return { success: false, error: 'User not authenticated' };
          }

          const result = await mediaService.deleteMediaAsset(assetId);
          return result;
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      }
    );

    // Video processing with background workers
    ipcMain.handle(
      'video:process',
      async (
        event,
        jobId: string,
        inputPath: string,
        outputPath: string,
        options: any
      ): Promise<IpcResponse> => {
        try {
          const job: VideoProcessingJob = {
            id: jobId,
            inputPath,
            outputPath,
            options,
            type: 'process',
            priority: options.priority || 'normal'
          };

          await videoProcessingManager.addJob(job);
          return { success: true, data: { jobId } };
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      }
    );

    ipcMain.handle(
      'video:thumbnail',
      async (
        event,
        jobId: string,
        videoPath: string,
        outputPath: string,
        timeOffset: number = 1
      ): Promise<IpcResponse> => {
        try {
          const job: VideoProcessingJob = {
            id: jobId,
            inputPath: videoPath,
            outputPath,
            options: { startTime: timeOffset },
            type: 'thumbnail',
            priority: 'high'
          };

          await videoProcessingManager.addJob(job);
          return { success: true, data: { jobId } };
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      }
    );

    ipcMain.handle(
      'video:info',
      async (event, jobId: string, videoPath: string): Promise<IpcResponse> => {
        try {
          const job: VideoProcessingJob = {
            id: jobId,
            inputPath: videoPath,
            outputPath: '', // Not needed for info extraction
            options: {},
            type: 'info',
            priority: 'high'
          };

          await videoProcessingManager.addJob(job);
          return { success: true, data: { jobId } };
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      }
    );

    // Video processing job management
    ipcMain.handle(
      'video:job:progress',
      async (event, jobId: string): Promise<IpcResponse> => {
        try {
          // Set up progress callback for renderer process
          videoProcessingManager.setProgressCallback(jobId, (progress) => {
            this.mainWindow?.webContents.send('video:progress', progress);
          });
          return { success: true, data: { message: 'Progress callback set' } };
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      }
    );

    ipcMain.handle(
      'video:job:cancel',
      async (event, jobId: string): Promise<IpcResponse> => {
        try {
          const cancelled = await videoProcessingManager.cancelJob(jobId);
          return { success: true, data: { cancelled } };
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      }
    );

    ipcMain.handle(
      'video:queue:status',
      async (): Promise<IpcResponse> => {
        try {
          const status = videoProcessingManager.getQueueStatus();
          return { success: true, data: status };
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      }
    );

    // Timeline management
    ipcMain.handle(
      'timeline:create',
      async (event, sequenceData: any): Promise<IpcResponse> => {
        try {
          const userId = this.getCurrentUserId();
          if (!userId) {
            return { success: false, error: 'User not authenticated' };
          }

          const result = await timelineService.createSequence({
            ...sequenceData,
            created_by: userId
          });
          return result;
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      }
    );

    ipcMain.handle(
      'timeline:get',
      async (event, sequenceId: string): Promise<IpcResponse> => {
        try {
          const userId = this.getCurrentUserId();
          if (!userId) {
            return { success: false, error: 'User not authenticated' };
          }

          const result = await timelineService.getSequenceWithTracks(sequenceId);
          return result;
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      }
    );

    ipcMain.handle(
      'timeline:add-clip',
      async (event, clipData: any): Promise<IpcResponse> => {
        try {
          const userId = this.getCurrentUserId();
          if (!userId) {
            return { success: false, error: 'User not authenticated' };
          }

          const result = await timelineService.addClip({
            ...clipData,
            created_by: userId
          });
          return result;
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      }
    );

    // Collaboration
    ipcMain.handle(
      'collaboration:join',
      async (event, projectId: string, sequenceId: string): Promise<IpcResponse> => {
        try {
          const userId = this.getCurrentUserId();
          if (!userId) {
            return { success: false, error: 'User not authenticated' };
          }

          const result = await collaborationService.updateCursorPosition(
            userId,
            projectId,
            sequenceId,
            0,
            ActivityType.VIEWING
          );
          return result;
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      }
    );

    ipcMain.handle(
      'collaboration:leave',
      async (event, projectId: string, sequenceId: string): Promise<IpcResponse> => {
        try {
          const userId = this.getCurrentUserId();
          if (!userId) {
            return { success: false, error: 'User not authenticated' };
          }

          const result = await collaborationService.deactivateCursors(userId, projectId);
          return result;
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      }
    );

    ipcMain.handle(
      'collaboration:add-comment',
      async (event, commentData: any): Promise<IpcResponse> => {
        try {
          const userId = this.getCurrentUserId();
          if (!userId) {
            return { success: false, error: 'User not authenticated' };
          }

          const result = await collaborationService.addComment({
            ...commentData,
            author_id: userId
          });
          return result;
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      }
    );

    // File system operations
    ipcMain.handle('file:select', async (): Promise<IpcResponse> => {
      try {
        const result = await dialog.showOpenDialog(this.mainWindow!, {
          properties: ['openFile', 'multiSelections'],
          filters: [
            {
              name: 'Video Files',
              extensions: ['mp4', 'avi', 'mov', 'mkv', 'webm'],
            },
            { name: 'Audio Files', extensions: ['mp3', 'wav', 'aac', 'flac'] },
            {
              name: 'Image Files',
              extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp'],
            },
            { name: 'All Files', extensions: ['*'] },
          ],
        });

        if (!result.canceled) {
          return { success: true, data: result.filePaths };
        } else {
          return { success: false, error: 'No files selected' };
        }
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle(
      'file:save',
      async (event, defaultPath?: string): Promise<IpcResponse> => {
        try {
          const result = await dialog.showSaveDialog(this.mainWindow!, {
            defaultPath,
            filters: [
              { name: 'Video Files', extensions: ['mp4', 'mov', 'avi'] },
              { name: 'All Files', extensions: ['*'] },
            ],
          });

          if (!result.canceled) {
            return { success: true, data: result.filePath };
          } else {
            return { success: false, error: 'Save canceled' };
          }
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      }
    );

    // Application info
    ipcMain.handle('app:version', (): string => {
      return app.getVersion();
    });

    ipcMain.handle('app:platform', (): NodeJS.Platform => {
      return process.platform;
    });
  }

  private startWebSocketServer(): void {
    const port = 8080;
    this.wsServer = new WebSocket.Server({ port });

    this.wsServer.on('connection', (ws: WebSocket) => {
      console.log('New WebSocket connection established');

      ws.on('message', (message: WebSocket.Data) => {
        try {
          const data = JSON.parse(message.toString());
          this.handleWebSocketMessage(ws, data);
        } catch (error) {
          console.error('Invalid WebSocket message:', error);
        }
      });

      ws.on('close', () => {
        console.log('WebSocket connection closed');
      });

      ws.on('error', (error: Error) => {
        console.error('WebSocket error:', error);
      });
    });

    console.log(`WebSocket server listening on port ${port}`);
  }

  private handleWebSocketMessage(ws: WebSocket, data: WebSocketMessage): void {
    const { type, payload } = data;

    switch (type) {
      case 'cursor:update':
        // Broadcast cursor position to all connected clients
        this.broadcastToClients(
          {
            type: 'cursor:position',
            payload: {
              userId: payload.userId,
              projectId: payload.projectId,
              position: payload.position,
              timestamp: Date.now(),
            },
          },
          ws
        );
        break;

      case 'timeline:edit':
        // Broadcast timeline changes
        this.broadcastToClients(
          {
            type: 'timeline:change',
            payload: {
              projectId: payload.projectId,
              operation: payload.operation,
              data: payload.data,
              userId: payload.userId,
              timestamp: Date.now(),
            },
          },
          ws
        );
        break;

      case 'comment:add':
        // Broadcast new comment
        this.broadcastToClients(
          {
            type: 'comment:new',
            payload: {
              ...payload,
              timestamp: Date.now(),
            },
          },
          ws
        );
        break;

      default:
        console.log('Unknown message type:', type);
    }
  }

  private broadcastToClients(
    message: WebSocketMessage,
    excludeClient: WebSocket | null = null
  ): void {
    if (!this.wsServer) {
      console.warn('WebSocket server not initialized');
      return;
    }
    
    this.wsServer.clients.forEach((client) => {
      if (client !== excludeClient && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    });
  }

  private async cleanup(): Promise<void> {
    console.log('Cleaning up application...');

    // Cleanup video processing manager
    await videoProcessingManager.cleanup();

    if (this.wsServer) {
      this.wsServer.close();
    }

    if (databaseService) {
      await databaseService.close();
    }

    if (ffmpegService) {
      ffmpegService.terminate();
    }
  }
}

// Initialize and start the application
const collabCutApp = new CollabCutApp();

// Handle app startup
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance, focus our window instead
    if (collabCutApp.mainWindow) {
      if (collabCutApp.mainWindow.isMinimized()) {
        collabCutApp.mainWindow.restore();
      }
      collabCutApp.mainWindow.focus();
    }
  });

  // Start the application
  collabCutApp.initialize().catch((error) => {
    console.error('Failed to initialize CollabCut:', error);
    app.quit();
  });
}
