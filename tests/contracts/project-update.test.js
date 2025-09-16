/**
 * Contract Tests: Project Management API
 * PUT /api/v1/projects/{id}
 *
 * These tests verify that the API contract matches the specification
 * defined in specs/001-collabcut-is-a/contracts/project-api.md
 */

const request = require('supertest');
const { v4: uuidv4 } = require('uuid');

// Mock Express app - This doesn't exist yet, hence tests will fail (RED phase)
const app = require('../../../main/src/app'); // This will fail until implemented

describe('Project Management API - PUT /api/v1/projects/{id}', () => {
  describe('Contract: Update Project', () => {
    const validProjectId = uuidv4();
    const invalidProjectId = uuidv4();
    const unauthorizedProjectId = uuidv4();

    it('should update project with valid data and return 200', async () => {
      const updateData = {
        name: 'Updated Project Name',
        description: 'Updated project description',
        settings: {
          resolution: '3840x2160',
          framerate: 60,
          sample_rate: 96000,
        },
        cloud_sync_enabled: false,
      };

      const response = await request(app)
        .put(`/api/v1/projects/${validProjectId}`)
        .send(updateData)
        .expect(200);

      // Verify response contains updated project object
      expect(response.body).toHaveProperty('id', validProjectId);
      expect(response.body).toHaveProperty('name', updateData.name);
      expect(response.body).toHaveProperty(
        'description',
        updateData.description
      );
      expect(response.body).toHaveProperty('cloud_sync_enabled', false);
      expect(response.body).toHaveProperty('updated_at');

      // Verify settings were updated
      expect(response.body.settings).toHaveProperty('resolution', '3840x2160');
      expect(response.body.settings).toHaveProperty('framerate', 60);
      expect(response.body.settings).toHaveProperty('sample_rate', 96000);

      // Verify updated_at is recent (ISO 8601 format)
      expect(response.body.updated_at).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/
      );
    });

    it('should update only name field when provided', async () => {
      const updateData = {
        name: 'Only Name Updated',
      };

      const response = await request(app)
        .put(`/api/v1/projects/${validProjectId}`)
        .send(updateData)
        .expect(200);

      expect(response.body.name).toBe('Only Name Updated');
      // Other fields should remain unchanged from the original project
      expect(response.body).toHaveProperty('description');
      expect(response.body).toHaveProperty('settings');
      expect(response.body).toHaveProperty('cloud_sync_enabled');
    });

    it('should update only description field when provided', async () => {
      const updateData = {
        description: 'Only description updated',
      };

      const response = await request(app)
        .put(`/api/v1/projects/${validProjectId}`)
        .send(updateData)
        .expect(200);

      expect(response.body.description).toBe('Only description updated');
    });

    it('should update only settings field when provided', async () => {
      const updateData = {
        settings: {
          resolution: '2560x1440',
          framerate: 120,
        },
      };

      const response = await request(app)
        .put(`/api/v1/projects/${validProjectId}`)
        .send(updateData)
        .expect(200);

      expect(response.body.settings.resolution).toBe('2560x1440');
      expect(response.body.settings.framerate).toBe(120);
    });

    it('should update only cloud_sync_enabled field when provided', async () => {
      const updateData = {
        cloud_sync_enabled: true,
      };

      const response = await request(app)
        .put(`/api/v1/projects/${validProjectId}`)
        .send(updateData)
        .expect(200);

      expect(response.body.cloud_sync_enabled).toBe(true);
    });

    it('should handle empty update request', async () => {
      const updateData = {};

      const response = await request(app)
        .put(`/api/v1/projects/${validProjectId}`)
        .send(updateData)
        .expect(200);

      // Should return the project without changes but with updated timestamp
      expect(response.body).toHaveProperty('id', validProjectId);
      expect(response.body).toHaveProperty('updated_at');
    });

    it('should return 400 for invalid name length', async () => {
      const updateData = {
        name: 'a'.repeat(101), // Exceeds 100 character limit
      };

      const response = await request(app)
        .put(`/api/v1/projects/${validProjectId}`)
        .send(updateData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('name');
    });

    it('should return 400 for invalid description length', async () => {
      const updateData = {
        description: 'a'.repeat(501), // Exceeds 500 character limit
      };

      await request(app)
        .put(`/api/v1/projects/${validProjectId}`)
        .send(updateData)
        .expect(400);
    });

    it('should return 400 for invalid settings format', async () => {
      const updateData = {
        settings: {
          resolution: 'invalid-resolution',
          framerate: -10, // Negative framerate
        },
      };

      await request(app)
        .put(`/api/v1/projects/${validProjectId}`)
        .send(updateData)
        .expect(400);
    });

    it('should return 404 for non-existent project', async () => {
      const updateData = {
        name: 'Updated Name',
      };

      const response = await request(app)
        .put(`/api/v1/projects/${invalidProjectId}`)
        .send(updateData)
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('not found');
    });

    it('should return 403 for insufficient permissions', async () => {
      const updateData = {
        name: 'Unauthorized Update',
      };

      const response = await request(app)
        .put(`/api/v1/projects/${unauthorizedProjectId}`)
        .send(updateData)
        .expect(403);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('permission');
    });

    it('should return 401 for unauthorized request', async () => {
      const updateData = {
        name: 'Unauthorized',
      };

      // Request without authentication header
      await request(app)
        .put(`/api/v1/projects/${validProjectId}`)
        .send(updateData)
        .expect(401);
    });

    it('should preserve required fields during partial update', async () => {
      const updateData = {
        description: 'Updated description only',
      };

      const response = await request(app)
        .put(`/api/v1/projects/${validProjectId}`)
        .send(updateData)
        .expect(200);

      // Verify required fields are still present
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('name');
      expect(response.body).toHaveProperty('created_at');
      expect(response.body).toHaveProperty('created_by');
      expect(response.body).toHaveProperty('settings');
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('cloud_sync_enabled');

      // Verify the updated field
      expect(response.body.description).toBe('Updated description only');
    });
  });
});
