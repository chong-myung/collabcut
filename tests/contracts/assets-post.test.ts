/**
 * Contract Tests: Project Panel Assets API
 * POST /projects/{projectId}/assets
 *
 * These tests verify that the API contract matches the specification
 * defined in specs/002-collabcut-adobe-premiere/contracts/project-panel-api.yaml
 * Note: This complements the existing media-upload.test.js with panel-specific requirements
 */

import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

// Mock Express app - This doesn't exist yet, hence tests will fail (RED phase)
const app = require('../../../main/src/app'); // This will fail until implemented

describe('Project Panel Assets API - POST /projects/{projectId}/assets', () => {
  describe('Contract: Upload Asset to Panel', () => {
    const validProjectId = uuidv4();
    const invalidProjectId = uuidv4();
    const validFolderId = uuidv4();
    const invalidFolderId = uuidv4();

    // Mock file paths for panel testing
    const videoFile = path.join(__dirname, '../fixtures/panel-test-video.mp4');
    const audioFile = path.join(__dirname, '../fixtures/panel-test-audio.wav');
    const imageFile = path.join(__dirname, '../fixtures/panel-test-image.jpg');
    const subtitleFile = path.join(__dirname, '../fixtures/panel-test-subtitle.srt');
    const largeFile = path.join(__dirname, '../fixtures/panel-large-video.mp4');
    const invalidFile = path.join(__dirname, '../fixtures/panel-invalid.pdf');

    it('should upload asset with panel metadata and return 201', async () => {
      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/assets`)
        .attach('file', videoFile)
        .field('filename', 'panel-video.mp4')
        .field('folderId', validFolderId)
        .field('metadata', JSON.stringify({ panelContext: 'test' }))
        .expect(201);

      // Verify response structure matches panel contract
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('projectId', validProjectId);
      expect(response.body).toHaveProperty('filename');
      expect(response.body).toHaveProperty('fileType');
      expect(response.body).toHaveProperty('fileSize');
      expect(response.body).toHaveProperty('createdAt');

      // Panel-specific required fields
      expect(response.body).toHaveProperty('folderId', validFolderId);
      expect(response.body).toHaveProperty('thumbnailUrl');
      expect(response.body).toHaveProperty('metadata');

      // Panel-specific optional fields
      expect(response.body).toHaveProperty('filePath');
      expect(response.body).toHaveProperty('cloudUrl');
      expect(response.body).toHaveProperty('uploadedBy');

      // Media-specific fields for video
      expect(response.body).toHaveProperty('duration');
      expect(response.body).toHaveProperty('resolution');
      expect(response.body).toHaveProperty('framerate');
      expect(response.body).toHaveProperty('codec');

      // Verify data types
      expect(typeof response.body.id).toBe('string');
      expect(typeof response.body.projectId).toBe('string');
      expect(typeof response.body.filename).toBe('string');
      expect(typeof response.body.fileType).toBe('string');
      expect(typeof response.body.fileSize).toBe('number');
      expect(typeof response.body.createdAt).toBe('string');
      expect(typeof response.body.folderId).toBe('string');
      expect(typeof response.body.metadata).toBe('object');

      // Verify UUID formats
      expect(response.body.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
      expect(response.body.projectId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
      expect(response.body.folderId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );

      if (response.body.uploadedBy) {
        expect(response.body.uploadedBy).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );
      }

      // Verify datetime format
      expect(response.body.createdAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/
      );

      // Verify file type enum
      expect(['video', 'audio', 'image', 'subtitle']).toContain(response.body.fileType);

      // Verify filename constraint
      expect(response.body.filename.length).toBeLessThanOrEqual(255);

      // Verify file size is positive
      expect(response.body.fileSize).toBeGreaterThan(0);

      // For video files, verify media properties
      if (response.body.fileType === 'video') {
        expect(response.body.duration).toBeGreaterThan(0);
        expect(response.body.resolution).toMatch(/^\d+x\d+$/);
        expect(response.body.framerate).toBeGreaterThan(0);
        expect(response.body.codec).toBeTruthy();
      }

      // Verify thumbnail URL format
      if (response.body.thumbnailUrl) {
        expect(response.body.thumbnailUrl).toMatch(/^https?:\/\//);
      }
    });

    it('should upload asset without folder to root', async () => {
      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/assets`)
        .attach('file', imageFile)
        .field('filename', 'panel-image.jpg')
        .expect(201);

      // Should default to null folder (root)
      expect(response.body.folderId).toBeNull();
      expect(response.body.fileType).toBe('image');
    });

    it('should upload asset with custom metadata', async () => {
      const customMetadata = {
        tags: ['important', 'draft'],
        description: 'Panel test asset',
        customField: 'value'
      };

      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/assets`)
        .attach('file', audioFile)
        .field('metadata', JSON.stringify(customMetadata))
        .expect(201);

      expect(response.body.metadata).toEqual(customMetadata);
      expect(response.body.fileType).toBe('audio');
    });

    it('should upload subtitle file with panel metadata', async () => {
      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/assets`)
        .attach('file', subtitleFile)
        .field('folderId', validFolderId)
        .expect(201);

      expect(response.body.fileType).toBe('subtitle');
      expect(response.body.folderId).toBe(validFolderId);

      // Subtitle files should not have media properties
      expect(response.body.duration).toBeNull();
      expect(response.body.resolution).toBeNull();
      expect(response.body.framerate).toBeNull();
      expect(response.body.codec).toBeNull();
    });

    it('should auto-generate filename when not provided', async () => {
      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/assets`)
        .attach('file', videoFile)
        .field('folderId', validFolderId)
        .expect(201);

      // Should use original filename or generate one
      expect(response.body.filename).toBeTruthy();
      expect(typeof response.body.filename).toBe('string');
      expect(response.body.filename.length).toBeGreaterThan(0);
    });

    it('should return 400 for missing file', async () => {
      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/assets`)
        .field('folderId', validFolderId)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('file');
    });

    it('should return 400 for filename exceeding 255 characters', async () => {
      const longFilename = 'a'.repeat(256) + '.mp4';

      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/assets`)
        .attach('file', videoFile)
        .field('filename', longFilename)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('filename');
    });

    it('should return 400 for invalid folder ID format', async () => {
      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/assets`)
        .attach('file', videoFile)
        .field('folderId', 'invalid-uuid')
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('folderId');
    });

    it('should return 400 for invalid project ID format', async () => {
      await request(app)
        .post('/api/v1/projects/invalid-uuid/assets')
        .attach('file', videoFile)
        .expect(400);
    });

    it('should return 400 for invalid metadata JSON', async () => {
      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/assets`)
        .attach('file', videoFile)
        .field('metadata', 'invalid-json{')
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('metadata');
    });

    it('should return 404 for non-existent project', async () => {
      const response = await request(app)
        .post(`/api/v1/projects/${invalidProjectId}/assets`)
        .attach('file', videoFile)
        .expect(404);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('project not found');
    });

    it('should return 404 for non-existent folder', async () => {
      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/assets`)
        .attach('file', videoFile)
        .field('folderId', invalidFolderId)
        .expect(404);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('folder not found');
    });

    it('should return 413 for file too large', async () => {
      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/assets`)
        .attach('file', largeFile)
        .expect(413);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('too large');
    });

    it('should return 415 for unsupported media type', async () => {
      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/assets`)
        .attach('file', invalidFile)
        .expect(415);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('unsupported');
    });

    it('should return 401 for unauthorized request', async () => {
      await request(app)
        .post(`/api/v1/projects/${validProjectId}/assets`)
        .attach('file', videoFile)
        .expect(401);
    });

    it('should return 403 for insufficient permissions', async () => {
      await request(app)
        .post(`/api/v1/projects/${validProjectId}/assets`)
        .attach('file', videoFile)
        .set('Authorization', 'Bearer read-only-token')
        .expect(403);
    });

    it('should generate thumbnail for video assets', async () => {
      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/assets`)
        .attach('file', videoFile)
        .expect(201);

      expect(response.body.thumbnailUrl).toBeTruthy();
      expect(response.body.thumbnailUrl).toMatch(/^https?:\/\//);
    });

    it('should handle different file types with appropriate metadata', async () => {
      // Test video file
      const videoResponse = await request(app)
        .post(`/api/v1/projects/${validProjectId}/assets`)
        .attach('file', videoFile)
        .expect(201);

      expect(videoResponse.body.fileType).toBe('video');
      expect(videoResponse.body.duration).not.toBeNull();
      expect(videoResponse.body.resolution).not.toBeNull();

      // Test audio file
      const audioResponse = await request(app)
        .post(`/api/v1/projects/${validProjectId}/assets`)
        .attach('file', audioFile)
        .expect(201);

      expect(audioResponse.body.fileType).toBe('audio');
      expect(audioResponse.body.duration).not.toBeNull();
      expect(audioResponse.body.resolution).toBeNull();

      // Test image file
      const imageResponse = await request(app)
        .post(`/api/v1/projects/${validProjectId}/assets`)
        .attach('file', imageFile)
        .expect(201);

      expect(imageResponse.body.fileType).toBe('image');
      expect(imageResponse.body.resolution).not.toBeNull();
      expect(imageResponse.body.duration).toBeNull();
    });

    it('should validate folder ownership within project', async () => {
      // This test ensures folder belongs to the specified project
      const otherProjectId = uuidv4();

      const response = await request(app)
        .post(`/api/v1/projects/${otherProjectId}/assets`)
        .attach('file', videoFile)
        .field('folderId', validFolderId) // Folder from different project
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('folder does not belong to project');
    });
  });
});