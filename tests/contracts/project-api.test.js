/**
 * Contract Tests: Project Management API
 * POST /api/v1/projects
 *
 * These tests verify that the API contract matches the specification
 * defined in specs/001-collabcut-is-a/contracts/project-api.md
 */

const request = require('supertest');

// Simple UUID generator for testing
function generateUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c == 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Mock Express app - This doesn't exist yet, hence tests will fail (RED phase)
const app = require('../../../main/src/app'); // This will fail until implemented

describe('Project Management API - POST /api/v1/projects', () => {
  describe('Contract: Create Project', () => {
    it('should create a project with valid data and return 201', async () => {
      const projectData = {
        name: 'Test Project',
        description: 'A test project for validation',
        settings: {
          resolution: '1920x1080',
          framerate: 30,
          sample_rate: 48000,
        },
        cloud_sync_enabled: true,
      };

      const response = await request(app)
        .post('/api/v1/projects')
        .send(projectData)
        .expect(201);

      // Verify response structure matches contract
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('name', projectData.name);
      expect(response.body).toHaveProperty(
        'description',
        projectData.description
      );
      expect(response.body).toHaveProperty('created_at');
      expect(response.body).toHaveProperty('created_by');
      expect(response.body).toHaveProperty('settings');
      expect(response.body).toHaveProperty('status', 'active');
      expect(response.body).toHaveProperty('cloud_sync_enabled', true);

      // Verify UUID format
      expect(response.body.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );

      // Verify ISO 8601 datetime format
      expect(response.body.created_at).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/
      );

      // Verify settings structure
      expect(response.body.settings).toHaveProperty('resolution', '1920x1080');
      expect(response.body.settings).toHaveProperty('framerate', 30);
      expect(response.body.settings).toHaveProperty('sample_rate', 48000);
    });

    it('should create a project with minimal required data', async () => {
      const projectData = {
        name: 'Minimal Project',
        settings: {
          resolution: '1280x720',
          framerate: 24,
        },
      };

      const response = await request(app)
        .post('/api/v1/projects')
        .send(projectData)
        .expect(201);

      expect(response.body.name).toBe('Minimal Project');
      expect(response.body.description).toBe(''); // Should default to empty string
      expect(response.body.cloud_sync_enabled).toBe(true); // Should default to true
      expect(response.body.settings.sample_rate).toBe(48000); // Should default to 48000
    });

    it('should return 400 for missing required name field', async () => {
      const projectData = {
        settings: {
          resolution: '1920x1080',
          framerate: 30,
        },
      };

      const response = await request(app)
        .post('/api/v1/projects')
        .send(projectData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('name');
    });

    it('should return 400 for name exceeding 100 characters', async () => {
      const longName = 'a'.repeat(101);
      const projectData = {
        name: longName,
        settings: {
          resolution: '1920x1080',
          framerate: 30,
        },
      };

      await request(app).post('/api/v1/projects').send(projectData).expect(400);
    });

    it('should return 400 for description exceeding 500 characters', async () => {
      const longDescription = 'a'.repeat(501);
      const projectData = {
        name: 'Test Project',
        description: longDescription,
        settings: {
          resolution: '1920x1080',
          framerate: 30,
        },
      };

      await request(app).post('/api/v1/projects').send(projectData).expect(400);
    });

    it('should return 400 for missing resolution in settings', async () => {
      const projectData = {
        name: 'Test Project',
        settings: {
          framerate: 30,
        },
      };

      await request(app).post('/api/v1/projects').send(projectData).expect(400);
    });

    it('should return 400 for missing framerate in settings', async () => {
      const projectData = {
        name: 'Test Project',
        settings: {
          resolution: '1920x1080',
        },
      };

      await request(app).post('/api/v1/projects').send(projectData).expect(400);
    });

    it('should return 400 for non-positive framerate', async () => {
      const projectData = {
        name: 'Test Project',
        settings: {
          resolution: '1920x1080',
          framerate: -5,
        },
      };

      await request(app).post('/api/v1/projects').send(projectData).expect(400);
    });

    it('should return 401 for unauthorized request', async () => {
      const projectData = {
        name: 'Test Project',
        settings: {
          resolution: '1920x1080',
          framerate: 30,
        },
      };

      // Simulate unauthorized request (no auth header)
      await request(app).post('/api/v1/projects').send(projectData).expect(401);
    });
  });
});
