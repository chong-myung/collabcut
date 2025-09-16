/**
 * Contract Tests: Media Asset Management API
 * POST /api/v1/projects/{id}/media
 *
 * These tests verify that the API contract matches the specification
 * defined in specs/001-collabcut-is-a/contracts/media-api.md
 */

const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

// Mock Express app - This doesn't exist yet, hence tests will fail (RED phase)
const app = require('../../../main/src/app'); // This will fail until implemented

describe('Media Asset Management API - POST /api/v1/projects/{id}/media', () => {
  describe('Contract: Upload Media Asset', () => {
    const validProjectId = uuidv4();
    const invalidProjectId = uuidv4();

    // Mock file paths (these would be real test files in actual implementation)
    const videoFile = path.join(__dirname, '../fixtures/test-video.mp4');
    const audioFile = path.join(__dirname, '../fixtures/test-audio.wav');
    const imageFile = path.join(__dirname, '../fixtures/test-image.jpg');
    const subtitleFile = path.join(__dirname, '../fixtures/test-subtitle.srt');
    const invalidFile = path.join(__dirname, '../fixtures/test-document.pdf');
    const largeFile = path.join(__dirname, '../fixtures/large-video.mp4');

    it('should upload video file and return 201 with correct metadata', async () => {
      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/media`)
        .attach('file', videoFile)
        .field('folder_path', '/videos/')
        .expect(201);

      // Verify response structure matches contract
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('project_id', validProjectId);
      expect(response.body).toHaveProperty('filename');
      expect(response.body).toHaveProperty('file_type', 'video');
      expect(response.body).toHaveProperty('file_size');
      expect(response.body).toHaveProperty('duration');
      expect(response.body).toHaveProperty('resolution');
      expect(response.body).toHaveProperty('framerate');
      expect(response.body).toHaveProperty('codec');
      expect(response.body).toHaveProperty('thumbnail_url');
      expect(response.body).toHaveProperty('folder_path', '/videos/');
      expect(response.body).toHaveProperty('created_at');
      expect(response.body).toHaveProperty('uploaded_by');
      expect(response.body).toHaveProperty('cloud_url');
      expect(response.body).toHaveProperty('metadata');

      // Verify data types
      expect(typeof response.body.id).toBe('string');
      expect(typeof response.body.filename).toBe('string');
      expect(typeof response.body.file_size).toBe('number');
      expect(typeof response.body.duration).toBe('number');
      expect(typeof response.body.resolution).toBe('string');
      expect(typeof response.body.framerate).toBe('number');
      expect(typeof response.body.codec).toBe('string');
      expect(typeof response.body.thumbnail_url).toBe('string');
      expect(typeof response.body.created_at).toBe('string');
      expect(typeof response.body.uploaded_by).toBe('string');
      expect(typeof response.body.cloud_url).toBe('string');
      expect(typeof response.body.metadata).toBe('object');

      // Verify UUID format
      expect(response.body.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
      expect(response.body.uploaded_by).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );

      // Verify datetime format
      expect(response.body.created_at).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/
      );

      // Verify video-specific properties are not null
      expect(response.body.duration).not.toBeNull();
      expect(response.body.resolution).not.toBeNull();
      expect(response.body.framerate).not.toBeNull();
      expect(response.body.codec).not.toBeNull();

      // Verify file size is positive
      expect(response.body.file_size).toBeGreaterThan(0);

      // Verify duration is positive for video
      expect(response.body.duration).toBeGreaterThan(0);

      // Verify resolution format (e.g., "1920x1080")
      expect(response.body.resolution).toMatch(/^\d+x\d+$/);
    });

    it('should upload audio file and return 201 with correct metadata', async () => {
      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/media`)
        .attach('file', audioFile)
        .field('folder_path', '/audio/')
        .expect(201);

      expect(response.body.file_type).toBe('audio');
      expect(response.body.folder_path).toBe('/audio/');

      // Audio files should have duration but not video properties
      expect(response.body.duration).not.toBeNull();
      expect(response.body.resolution).toBeNull();
      expect(response.body.framerate).toBeNull();

      // Codec should still be present for audio
      expect(response.body.codec).not.toBeNull();
    });

    it('should upload image file and return 201 with correct metadata', async () => {
      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/media`)
        .attach('file', imageFile)
        .expect(201);

      expect(response.body.file_type).toBe('image');
      expect(response.body.folder_path).toBe('/'); // Default folder

      // Images should have resolution but not duration/framerate
      expect(response.body.resolution).not.toBeNull();
      expect(response.body.duration).toBeNull();
      expect(response.body.framerate).toBeNull();
      expect(response.body.codec).toBeNull();
    });

    it('should upload subtitle file and return 201 with correct metadata', async () => {
      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/media`)
        .attach('file', subtitleFile)
        .expect(201);

      expect(response.body.file_type).toBe('subtitle');

      // Subtitles should not have media properties
      expect(response.body.duration).toBeNull();
      expect(response.body.resolution).toBeNull();
      expect(response.body.framerate).toBeNull();
      expect(response.body.codec).toBeNull();
    });

    it('should use default folder path when not specified', async () => {
      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/media`)
        .attach('file', videoFile)
        .expect(201);

      expect(response.body.folder_path).toBe('/');
    });

    it('should generate thumbnail URL for video files', async () => {
      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/media`)
        .attach('file', videoFile)
        .expect(201);

      expect(response.body.thumbnail_url).toBeTruthy();
      expect(response.body.thumbnail_url).toMatch(/^https?:\/\//);
    });

    it('should return 400 for missing file', async () => {
      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/media`)
        .field('folder_path', '/')
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('file');
    });

    it('should return 400 for invalid project ID', async () => {
      await request(app)
        .post('/api/v1/projects/invalid-uuid/media')
        .attach('file', videoFile)
        .expect(400);
    });

    it('should return 404 for non-existent project', async () => {
      const response = await request(app)
        .post(`/api/v1/projects/${invalidProjectId}/media`)
        .attach('file', videoFile)
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('project not found');
    });

    it('should return 413 for file too large', async () => {
      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/media`)
        .attach('file', largeFile) // Assume this exceeds size limit
        .expect(413);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('too large');
    });

    it('should return 415 for unsupported media type', async () => {
      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/media`)
        .attach('file', invalidFile) // PDF file should be unsupported
        .expect(415);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('unsupported');
    });

    it('should return 401 for unauthorized request', async () => {
      // Request without authentication header
      await request(app)
        .post(`/api/v1/projects/${validProjectId}/media`)
        .attach('file', videoFile)
        .expect(401);
    });

    it('should return 403 for insufficient permissions', async () => {
      // Request with insufficient permissions
      await request(app)
        .post(`/api/v1/projects/${validProjectId}/media`)
        .attach('file', videoFile)
        .set('Authorization', 'Bearer read-only-token')
        .expect(403);
    });

    it('should handle nested folder paths correctly', async () => {
      const nestedPath = '/projects/2024/videos/draft/';

      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/media`)
        .attach('file', videoFile)
        .field('folder_path', nestedPath)
        .expect(201);

      expect(response.body.folder_path).toBe(nestedPath);
    });

    it('should normalize folder paths with trailing slashes', async () => {
      const pathWithoutSlash = '/videos';

      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/media`)
        .attach('file', videoFile)
        .field('folder_path', pathWithoutSlash)
        .expect(201);

      // Should normalize to include trailing slash
      expect(response.body.folder_path).toBe('/videos/');
    });

    it('should extract correct metadata from uploaded files', async () => {
      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/media`)
        .attach('file', videoFile)
        .expect(201);

      // Verify metadata object contains expected properties
      expect(response.body.metadata).toBeDefined();
      expect(typeof response.body.metadata).toBe('object');

      // Common metadata properties that might be extracted
      if (response.body.metadata.bitrate) {
        expect(typeof response.body.metadata.bitrate).toBe('number');
      }
      if (response.body.metadata.format) {
        expect(typeof response.body.metadata.format).toBe('string');
      }
    });
  });
});
