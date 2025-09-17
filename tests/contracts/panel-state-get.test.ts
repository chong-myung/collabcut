/**
 * Contract Tests: Project Panel State API
 * GET /projects/{projectId}/panel/state
 *
 * These tests verify that the API contract matches the specification
 * defined in specs/002-collabcut-adobe-premiere/contracts/project-panel-api.yaml
 */

import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';

// Mock Express app - This doesn't exist yet, hence tests will fail (RED phase)
const app = require('../../../main/src/app'); // This will fail until implemented

describe('Project Panel State API - GET /projects/{projectId}/panel/state', () => {
  describe('Contract: Get Panel State', () => {
    const validProjectId = uuidv4();
    const validUserId = uuidv4();
    const invalidProjectId = uuidv4();
    const invalidUserId = uuidv4();

    it('should return user panel state with valid parameters', async () => {
      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}/panel/state`)
        .query({ userId: validUserId })
        .expect(200);

      // Verify response structure matches contract
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('projectId', validProjectId);
      expect(response.body).toHaveProperty('userId', validUserId);
      expect(response.body).toHaveProperty('viewMode');
      expect(response.body).toHaveProperty('sortPreference');
      expect(response.body).toHaveProperty('layoutConfig');
      expect(response.body).toHaveProperty('filterSettings');
      expect(response.body).toHaveProperty('expandedFolders');
      expect(response.body).toHaveProperty('selectedItems');
      expect(response.body).toHaveProperty('lastUpdated');

      // Verify data types
      expect(typeof response.body.id).toBe('string');
      expect(typeof response.body.projectId).toBe('string');
      expect(typeof response.body.userId).toBe('string');
      expect(typeof response.body.viewMode).toBe('string');
      expect(typeof response.body.sortPreference).toBe('string');
      expect(typeof response.body.layoutConfig).toBe('object');
      expect(typeof response.body.filterSettings).toBe('object');
      expect(Array.isArray(response.body.expandedFolders)).toBe(true);
      expect(Array.isArray(response.body.selectedItems)).toBe(true);
      expect(typeof response.body.lastUpdated).toBe('string');

      // Verify UUID formats
      expect(response.body.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
      expect(response.body.projectId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
      expect(response.body.userId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );

      // Verify datetime format (ISO 8601)
      expect(response.body.lastUpdated).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/
      );

      // Verify enum values
      expect(['list', 'grid', 'tree']).toContain(response.body.viewMode);
      expect(['name', 'date', 'type', 'size']).toContain(response.body.sortPreference);

      // Verify layoutConfig structure if present
      if (response.body.layoutConfig) {
        if (response.body.layoutConfig.width) {
          expect(response.body.layoutConfig.width).toBeGreaterThanOrEqual(200);
          expect(response.body.layoutConfig.width).toBeLessThanOrEqual(800);
        }
        if (response.body.layoutConfig.height) {
          expect(response.body.layoutConfig.height).toBeGreaterThanOrEqual(300);
        }
        if (response.body.layoutConfig.columns) {
          expect(Array.isArray(response.body.layoutConfig.columns)).toBe(true);
        }
      }

      // Verify expanded folders are valid UUIDs
      response.body.expandedFolders.forEach((folderId: string) => {
        expect(folderId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );
      });

      // Verify selected items are valid UUIDs
      response.body.selectedItems.forEach((itemId: string) => {
        expect(itemId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );
      });
    });

    it('should return default panel state for new user', async () => {
      const newUserId = uuidv4();

      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}/panel/state`)
        .query({ userId: newUserId })
        .expect(200);

      // Should return default values for new user
      expect(response.body.viewMode).toBe('grid'); // Default view mode
      expect(response.body.sortPreference).toBe('name'); // Default sort
      expect(response.body.expandedFolders).toEqual([]);
      expect(response.body.selectedItems).toEqual([]);
    });

    it('should return 400 for missing userId parameter', async () => {
      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}/panel/state`)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('userId');
    });

    it('should return 400 for invalid project ID format', async () => {
      await request(app)
        .get('/api/v1/projects/invalid-uuid/panel/state')
        .query({ userId: validUserId })
        .expect(400);
    });

    it('should return 400 for invalid user ID format', async () => {
      await request(app)
        .get(`/api/v1/projects/${validProjectId}/panel/state`)
        .query({ userId: 'invalid-uuid' })
        .expect(400);
    });

    it('should return 404 for non-existent project', async () => {
      const response = await request(app)
        .get(`/api/v1/projects/${invalidProjectId}/panel/state`)
        .query({ userId: validUserId })
        .expect(404);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('project not found');
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}/panel/state`)
        .query({ userId: invalidUserId })
        .expect(404);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('user not found');
    });

    it('should return 401 for unauthorized request', async () => {
      await request(app)
        .get(`/api/v1/projects/${validProjectId}/panel/state`)
        .query({ userId: validUserId })
        .expect(401);
    });

    it('should return 403 for insufficient permissions', async () => {
      await request(app)
        .get(`/api/v1/projects/${validProjectId}/panel/state`)
        .query({ userId: validUserId })
        .set('Authorization', 'Bearer insufficient-permissions-token')
        .expect(403);
    });
  });
});