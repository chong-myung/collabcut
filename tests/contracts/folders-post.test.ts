/**
 * Contract Tests: Project Folders API
 * POST /projects/{projectId}/folders
 *
 * These tests verify that the API contract matches the specification
 * defined in specs/002-collabcut-adobe-premiere/contracts/project-panel-api.yaml
 */

import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';

// Mock Express app - This doesn't exist yet, hence tests will fail (RED phase)
const app = require('../../../main/src/app'); // This will fail until implemented

describe('Project Folders API - POST /projects/{projectId}/folders', () => {
  describe('Contract: Create Folder', () => {
    const validProjectId = uuidv4();
    const invalidProjectId = uuidv4();
    const validParentId = uuidv4();

    it('should create folder with required fields and return 201', async () => {
      const folderData = {
        name: 'New Project Folder'
      };

      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/folders`)
        .send(folderData)
        .expect(201);

      // Verify response structure matches contract
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('projectId', validProjectId);
      expect(response.body).toHaveProperty('name', folderData.name);
      expect(response.body).toHaveProperty('createdAt');

      // Verify optional fields have defaults
      expect(response.body).toHaveProperty('parentId');
      expect(response.body).toHaveProperty('path');
      expect(response.body).toHaveProperty('description');
      expect(response.body).toHaveProperty('createdBy');
      expect(response.body).toHaveProperty('permissions');
      expect(response.body).toHaveProperty('color');
      expect(response.body).toHaveProperty('sortOrder');

      // Verify data types
      expect(typeof response.body.id).toBe('string');
      expect(typeof response.body.projectId).toBe('string');
      expect(typeof response.body.name).toBe('string');
      expect(typeof response.body.createdAt).toBe('string');

      // Verify UUID formats
      expect(response.body.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
      expect(response.body.projectId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );

      if (response.body.createdBy) {
        expect(response.body.createdBy).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );
      }

      // Verify datetime format (ISO 8601)
      expect(response.body.createdAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/
      );

      // For root folder, parentId should be null
      expect(response.body.parentId).toBeNull();

      // Root folder path should start with /
      expect(response.body.path).toMatch(/^\//);
    });

    it('should create folder with all optional fields', async () => {
      const folderData = {
        name: 'Complete Folder',
        parentId: validParentId,
        description: 'A folder with all fields specified',
        color: '#FF5733'
      };

      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/folders`)
        .send(folderData)
        .expect(201);

      expect(response.body.name).toBe(folderData.name);
      expect(response.body.parentId).toBe(folderData.parentId);
      expect(response.body.description).toBe(folderData.description);
      expect(response.body.color).toBe(folderData.color);

      // Verify color format
      expect(response.body.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });

    it('should create nested folder with valid parent', async () => {
      const folderData = {
        name: 'Nested Folder',
        parentId: validParentId,
        description: 'Folder inside another folder'
      };

      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/folders`)
        .send(folderData)
        .expect(201);

      expect(response.body.parentId).toBe(validParentId);
      expect(response.body.name).toBe(folderData.name);

      // Path should reflect hierarchy
      expect(response.body.path).toBeTruthy();
      expect(typeof response.body.path).toBe('string');
    });

    it('should create folder with valid color code', async () => {
      const folderData = {
        name: 'Colored Folder',
        color: '#3498DB'
      };

      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/folders`)
        .send(folderData)
        .expect(201);

      expect(response.body.color).toBe('#3498DB');
    });

    it('should return 400 for missing name field', async () => {
      const folderData = {
        description: 'Folder without name'
      };

      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/folders`)
        .send(folderData)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('name');
    });

    it('should return 400 for empty name field', async () => {
      const folderData = {
        name: ''
      };

      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/folders`)
        .send(folderData)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('name');
    });

    it('should return 400 for name exceeding 100 characters', async () => {
      const longName = 'a'.repeat(101);
      const folderData = {
        name: longName
      };

      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/folders`)
        .send(folderData)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('name');
    });

    it('should return 400 for description exceeding 500 characters', async () => {
      const longDescription = 'a'.repeat(501);
      const folderData = {
        name: 'Valid Name',
        description: longDescription
      };

      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/folders`)
        .send(folderData)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('description');
    });

    it('should return 400 for invalid color format', async () => {
      const folderData = {
        name: 'Invalid Color Folder',
        color: 'not-a-color'
      };

      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/folders`)
        .send(folderData)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('color');
    });

    it('should return 400 for invalid color hex format', async () => {
      const folderData = {
        name: 'Invalid Hex Color',
        color: '#GGGGGG' // Invalid hex characters
      };

      await request(app)
        .post(`/api/v1/projects/${validProjectId}/folders`)
        .send(folderData)
        .expect(400);
    });

    it('should return 400 for short color hex format', async () => {
      const folderData = {
        name: 'Short Hex Color',
        color: '#FFF' // Should be 6 characters
      };

      await request(app)
        .post(`/api/v1/projects/${validProjectId}/folders`)
        .send(folderData)
        .expect(400);
    });

    it('should return 400 for invalid parent ID format', async () => {
      const folderData = {
        name: 'Invalid Parent Folder',
        parentId: 'not-a-uuid'
      };

      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/folders`)
        .send(folderData)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('parentId');
    });

    it('should return 400 for invalid project ID format', async () => {
      const folderData = {
        name: 'Valid Folder'
      };

      await request(app)
        .post('/api/v1/projects/invalid-uuid/folders')
        .send(folderData)
        .expect(400);
    });

    it('should return 404 for non-existent project', async () => {
      const folderData = {
        name: 'Folder in Non-existent Project'
      };

      const response = await request(app)
        .post(`/api/v1/projects/${invalidProjectId}/folders`)
        .send(folderData)
        .expect(404);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('project not found');
    });

    it('should return 404 for non-existent parent folder', async () => {
      const nonExistentParentId = uuidv4();
      const folderData = {
        name: 'Orphaned Folder',
        parentId: nonExistentParentId
      };

      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/folders`)
        .send(folderData)
        .expect(404);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('parent folder not found');
    });

    it('should return 401 for unauthorized request', async () => {
      const folderData = {
        name: 'Unauthorized Folder'
      };

      await request(app)
        .post(`/api/v1/projects/${validProjectId}/folders`)
        .send(folderData)
        .expect(401);
    });

    it('should return 403 for insufficient permissions', async () => {
      const folderData = {
        name: 'No Permission Folder'
      };

      await request(app)
        .post(`/api/v1/projects/${validProjectId}/folders`)
        .send(folderData)
        .set('Authorization', 'Bearer read-only-token')
        .expect(403);
    });

    it('should prevent circular parent relationships', async () => {
      // This would need to be tested with actual folder IDs in implementation
      const folderData = {
        name: 'Circular Folder',
        parentId: validProjectId // Using project ID as invalid parent
      };

      const response = await request(app)
        .post(`/api/v1/projects/${validProjectId}/folders`)
        .send(folderData)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('circular');
    });
  });
});