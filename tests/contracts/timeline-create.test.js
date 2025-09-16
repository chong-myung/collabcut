/**
 * Contract Tests: Timeline Management API
 * POST /api/v1/projects/{id}/timeline/sequences
 *
 * These tests verify that the API contract matches the specification
 * defined in specs/001-collabcut-is-a/contracts/timeline-api.md
 */

const request = require('supertest');
const { v4: uuidv4 } = require('uuid');

// Mock Express app - This doesn't exist yet, hence tests will fail (RED phase)
const app = require('../../../main/src/app'); // This will fail until implemented

describe('Timeline Management API - POST /api/v1/projects/{id}/timeline/sequences', () => {
  describe('Contract: Create Timeline Sequence', () => {
    const validProjectId = uuidv4();
    const invalidProjectId = uuidv4();

    it('should create sequence with valid data and return 201', async () => {
      const sequenceData = {
        name: 'Main Sequence',
        framerate: 30,
        resolution: '1920x1080',
        settings: {
          audio_tracks: 4,
          video_tracks: 2,
          background_color: '#000000',
        },
      };

      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/timeline/sequences`)
        .send(sequenceData)
        .expect(201);

      // Verify response structure matches contract
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('project_id', validProjectId);
      expect(response.body).toHaveProperty('name', 'Main Sequence');
      expect(response.body).toHaveProperty('duration', 0); // New sequence starts with 0 duration
      expect(response.body).toHaveProperty('framerate', 30);
      expect(response.body).toHaveProperty('resolution', '1920x1080');
      expect(response.body).toHaveProperty('created_at');
      expect(response.body).toHaveProperty('created_by');
      expect(response.body).toHaveProperty('settings');

      // Verify data types
      expect(typeof response.body.id).toBe('string');
      expect(typeof response.body.name).toBe('string');
      expect(typeof response.body.duration).toBe('number');
      expect(typeof response.body.framerate).toBe('number');
      expect(typeof response.body.resolution).toBe('string');
      expect(typeof response.body.created_at).toBe('string');
      expect(typeof response.body.created_by).toBe('string');
      expect(typeof response.body.settings).toBe('object');

      // Verify UUID format
      expect(response.body.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
      expect(response.body.created_by).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );

      // Verify datetime format
      expect(response.body.created_at).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/
      );

      // Verify resolution format
      expect(response.body.resolution).toMatch(/^\d+x\d+$/);

      // Verify framerate is positive
      expect(response.body.framerate).toBeGreaterThan(0);

      // Verify duration starts at 0
      expect(response.body.duration).toBe(0);

      // Verify settings object
      expect(response.body.settings).toEqual(sequenceData.settings);
    });

    it('should create sequence with minimal required data', async () => {
      const sequenceData = {
        name: 'Minimal Sequence',
        framerate: 24,
        resolution: '1280x720',
      };

      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/timeline/sequences`)
        .send(sequenceData)
        .expect(201);

      expect(response.body.name).toBe('Minimal Sequence');
      expect(response.body.framerate).toBe(24);
      expect(response.body.resolution).toBe('1280x720');
      expect(response.body.settings).toEqual({});
    });

    it('should handle various standard resolutions', async () => {
      const resolutions = [
        '1920x1080',
        '3840x2160',
        '1280x720',
        '2560x1440',
        '1024x576',
      ];

      for (const resolution of resolutions) {
        const sequenceData = {
          name: `Sequence ${resolution}`,
          framerate: 30,
          resolution: resolution,
        };

        const response = await request(app)
          .post(`/api/v1/projects/${validProjectId}/timeline/sequences`)
          .send(sequenceData)
          .expect(201);

        expect(response.body.resolution).toBe(resolution);
      }
    });

    it('should handle various standard framerates', async () => {
      const framerates = [23.98, 24, 25, 29.97, 30, 50, 59.94, 60, 120];

      for (const framerate of framerates) {
        const sequenceData = {
          name: `Sequence ${framerate}fps`,
          framerate: framerate,
          resolution: '1920x1080',
        };

        const response = await request(app)
          .post(`/api/v1/projects/${validProjectId}/timeline/sequences`)
          .send(sequenceData)
          .expect(201);

        expect(response.body.framerate).toBe(framerate);
      }
    });

    it('should return 400 for missing required name field', async () => {
      const sequenceData = {
        framerate: 30,
        resolution: '1920x1080',
      };

      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/timeline/sequences`)
        .send(sequenceData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('name');
    });

    it('should return 400 for name exceeding 100 characters', async () => {
      const longName = 'a'.repeat(101);
      const sequenceData = {
        name: longName,
        framerate: 30,
        resolution: '1920x1080',
      };

      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/timeline/sequences`)
        .send(sequenceData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('name');
    });

    it('should return 400 for missing required framerate field', async () => {
      const sequenceData = {
        name: 'Test Sequence',
        resolution: '1920x1080',
      };

      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/timeline/sequences`)
        .send(sequenceData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('framerate');
    });

    it('should return 400 for non-positive framerate', async () => {
      const sequenceData = {
        name: 'Test Sequence',
        framerate: -5,
        resolution: '1920x1080',
      };

      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/timeline/sequences`)
        .send(sequenceData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('framerate');
    });

    it('should return 400 for zero framerate', async () => {
      const sequenceData = {
        name: 'Test Sequence',
        framerate: 0,
        resolution: '1920x1080',
      };

      await request(app)
        .post(`/api/v1/projects/${validProjectId}/timeline/sequences`)
        .send(sequenceData)
        .expect(400);
    });

    it('should return 400 for missing required resolution field', async () => {
      const sequenceData = {
        name: 'Test Sequence',
        framerate: 30,
      };

      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/timeline/sequences`)
        .send(sequenceData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('resolution');
    });

    it('should return 400 for invalid resolution format', async () => {
      const invalidResolutions = [
        '1920',
        'invalid',
        '1920x',
        'x1080',
        '1920x1080x30',
      ];

      for (const resolution of invalidResolutions) {
        const sequenceData = {
          name: 'Test Sequence',
          framerate: 30,
          resolution: resolution,
        };

        await request(app)
          .post(`/api/v1/projects/${validProjectId}/timeline/sequences`)
          .send(sequenceData)
          .expect(400);
      }
    });

    it('should return 404 for non-existent project', async () => {
      const sequenceData = {
        name: 'Test Sequence',
        framerate: 30,
        resolution: '1920x1080',
      };

      const response = await request(app)
        .post(`/api/v1/projects/${invalidProjectId}/timeline/sequences`)
        .send(sequenceData)
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('project not found');
    });

    it('should return 400 for invalid project ID format', async () => {
      const sequenceData = {
        name: 'Test Sequence',
        framerate: 30,
        resolution: '1920x1080',
      };

      await request(app)
        .post('/api/v1/projects/invalid-uuid/timeline/sequences')
        .send(sequenceData)
        .expect(400);
    });

    it('should return 401 for unauthorized request', async () => {
      const sequenceData = {
        name: 'Test Sequence',
        framerate: 30,
        resolution: '1920x1080',
      };

      // Request without authentication header
      await request(app)
        .post(`/api/v1/projects/${validProjectId}/timeline/sequences`)
        .send(sequenceData)
        .expect(401);
    });

    it('should return 403 for insufficient permissions', async () => {
      const sequenceData = {
        name: 'Test Sequence',
        framerate: 30,
        resolution: '1920x1080',
      };

      // Request with read-only permissions
      await request(app)
        .post(`/api/v1/projects/${validProjectId}/timeline/sequences`)
        .send(sequenceData)
        .set('Authorization', 'Bearer read-only-token')
        .expect(403);
    });

    it('should handle complex settings object', async () => {
      const sequenceData = {
        name: 'Advanced Sequence',
        framerate: 30,
        resolution: '1920x1080',
        settings: {
          audio_tracks: 8,
          video_tracks: 4,
          subtitle_tracks: 2,
          background_color: '#1a1a1a',
          timecode_format: 'SMPTE',
          audio_sample_rate: 48000,
          audio_bit_depth: 24,
          video_codec: 'h264',
          audio_codec: 'aac',
        },
      };

      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/timeline/sequences`)
        .send(sequenceData)
        .expect(201);

      expect(response.body.settings).toEqual(sequenceData.settings);
    });

    it('should handle empty settings object', async () => {
      const sequenceData = {
        name: 'Empty Settings Sequence',
        framerate: 30,
        resolution: '1920x1080',
        settings: {},
      };

      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/timeline/sequences`)
        .send(sequenceData)
        .expect(201);

      expect(response.body.settings).toEqual({});
    });
  });
});
