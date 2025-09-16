import { contextBridge, ipcRenderer } from 'electron';

// Type definitions for the exposed API
interface ElectronAPI {
  // User authentication
  login: (userId: string) => Promise<any>;
  logout: () => Promise<any>;
  getCurrentUser: () => Promise<any>;

  // Project operations
  createProject: (projectData: any) => Promise<any>;
  getProject: (projectId: string) => Promise<any>;
  listProjects: () => Promise<any>;

  // Media operations
  uploadMedia: (filePath: string, projectId: string) => Promise<any>;
  listMedia: (projectId: string) => Promise<any>;

  // Video processing
  processVideo: (
    inputPath: string,
    outputPath: string,
    options: any
  ) => Promise<any>;
  extractThumbnail: (
    videoPath: string,
    outputPath: string,
    timeOffset: number
  ) => Promise<any>;
  getVideoInfo: (videoPath: string) => Promise<any>;

  // File system operations
  selectFiles: () => Promise<any>;
  saveFile: (defaultPath?: string) => Promise<any>;

  // Application info
  getVersion: () => Promise<string>;
  getPlatform: () => Promise<string>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
const electronAPI: ElectronAPI = {
  // User authentication
  login: (userId: string) => ipcRenderer.invoke('user:login', userId),
  logout: () => ipcRenderer.invoke('user:logout'),
  getCurrentUser: () => ipcRenderer.invoke('user:getCurrentUser'),

  // Project operations
  createProject: (projectData: any) =>
    ipcRenderer.invoke('project:create', projectData),
  getProject: (projectId: string) =>
    ipcRenderer.invoke('project:get', projectId),
  listProjects: () => ipcRenderer.invoke('project:list'),

  // Media operations
  uploadMedia: (filePath: string, projectId: string) =>
    ipcRenderer.invoke('media:upload', filePath, projectId),
  listMedia: (projectId: string) => ipcRenderer.invoke('media:list', projectId),

  // Video processing
  processVideo: (inputPath: string, outputPath: string, options: any) =>
    ipcRenderer.invoke('video:process', inputPath, outputPath, options),
  extractThumbnail: (
    videoPath: string,
    outputPath: string,
    timeOffset: number
  ) => ipcRenderer.invoke('video:thumbnail', videoPath, outputPath, timeOffset),
  getVideoInfo: (videoPath: string) =>
    ipcRenderer.invoke('video:info', videoPath),

  // File system operations
  selectFiles: () => ipcRenderer.invoke('file:select'),
  saveFile: (defaultPath?: string) =>
    ipcRenderer.invoke('file:save', defaultPath),

  // Application info
  getVersion: () => ipcRenderer.invoke('app:version'),
  getPlatform: () => ipcRenderer.invoke('app:platform'),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
