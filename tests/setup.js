// Global test setup for Jest
// This file is run before all tests

// Set up environment variables for testing
process.env.NODE_ENV = 'test';

// Mock Electron APIs for testing
const mockElectron = {
  app: {
    getVersion: () => '1.0.0',
    getPath: (path) => `/mock/${path}`,
    quit: jest.fn(),
  },
  ipcMain: {
    on: jest.fn(),
    handle: jest.fn(),
    emit: jest.fn(),
  },
  BrowserWindow: jest.fn(() => ({
    loadURL: jest.fn(),
    show: jest.fn(),
    hide: jest.fn(),
    close: jest.fn(),
    webContents: {
      send: jest.fn(),
    },
  })),
};

// Mock electron module
jest.mock('electron', () => mockElectron);

// Global test utilities
global.testUtils = {
  delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  mockElectron,
};
