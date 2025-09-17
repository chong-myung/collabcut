/**
 * Contract Tests: Project Folders API
 * GET /projects/{projectId}/folders
 *
 * These tests verify that the API contract matches the specification
 * defined in specs/002-collabcut-adobe-premiere/contracts/project-panel-api.yaml
 */

import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';

// Mock Express app - This doesn't exist yet, hence tests will fail (RED phase)
const app = require('../../../main/src/app'); // This will fail until implemented

describe('Project Folders API - GET /projects/{projectId}/folders', () => {
  describe('Contract: Get Project Folders', () => {
    const validProjectId = uuidv4();
    const invalidProjectId = uuidv4();
    const validParentId = uuidv4();

    it('should return project folder structure', async () => {
      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}/folders`)
        .expect(200);

      // Verify response structure matches contract
      expect(response.body).toHaveProperty('items');
      expect(Array.isArray(response.body.items)).toBe(true);

      if (response.body.items.length > 0) {
        const folder = response.body.items[0];

        // Verify required properties
        expect(folder).toHaveProperty('id');
        expect(folder).toHaveProperty('projectId');
        expect(folder).toHaveProperty('name');
        expect(folder).toHaveProperty('createdAt');

        // Verify optional properties structure
        expect(folder).toHaveProperty('parentId');
        expect(folder).toHaveProperty('path');
        expect(folder).toHaveProperty('description');
        expect(folder).toHaveProperty('createdBy');
        expect(folder).toHaveProperty('permissions');
        expect(folder).toHaveProperty('color');
        expect(folder).toHaveProperty('sortOrder');

        // Verify data types
        expect(typeof folder.id).toBe('string');
        expect(typeof folder.projectId).toBe('string');
        expect(typeof folder.name).toBe('string');
        expect(typeof folder.createdAt).toBe('string');

        if (folder.parentId) {
          expect(typeof folder.parentId).toBe('string');
        }
        if (folder.path) {
          expect(typeof folder.path).toBe('string');
        }
        if (folder.description) {
          expect(typeof folder.description).toBe('string');
        }
        if (folder.createdBy) {
          expect(typeof folder.createdBy).toBe('string');
        }
        if (folder.permissions) {
          expect(typeof folder.permissions).toBe('object');
        }
        if (folder.color) {
          expect(typeof folder.color).toBe('string');
        }
        if (folder.sortOrder !== null && folder.sortOrder !== undefined) {
          expect(typeof folder.sortOrder).toBe('number');
        }

        // Verify UUID formats
        expect(folder.id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );
        expect(folder.projectId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );

        if (folder.parentId) {
          expect(folder.parentId).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          );
        }

        if (folder.createdBy) {
          expect(folder.createdBy).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          );
        }

        // Verify datetime format (ISO 8601)
        expect(folder.createdAt).toMatch(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/
        );

        // Verify constraints
        expect(folder.name.length).toBeLessThanOrEqual(100);

        if (folder.description) {
          expect(folder.description.length).toBeLessThanOrEqual(500);
        }

        if (folder.color) {
          expect(folder.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
        }

        if (folder.sortOrder !== null && folder.sortOrder !== undefined) {
          expect(folder.sortOrder).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('should filter folders by parent ID', async () => {
      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}/folders`)
        .query({ parentId: validParentId })
        .expect(200);

      expect(response.body).toHaveProperty('items');
      expect(Array.isArray(response.body.items)).toBe(true);

      // All returned folders should have the specified parent ID
      response.body.items.forEach((folder: any) => {
        expect(folder.parentId).toBe(validParentId);
      });
    });

    it('should return empty list when no folders exist', async () => {
      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}/folders`)
        .expect(200);

      expect(response.body).toHaveProperty('items');
      expect(Array.isArray(response.body.items)).toBe(true);
      expect(response.body.items).toEqual([]);
    });

    it('should return only root folders when no parent ID specified', async () => {
      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}/folders`)
        .expect(200);

      // Root folders should have null or undefined parentId
      response.body.items.forEach((folder: any) => {
        expect(folder.parentId).toBeNull();
      });
    });

    it('should return 400 for invalid project ID format', async () => {
      await request(app)
        .get('/api/v1/projects/invalid-uuid/folders')
        .expect(400);
    });

    it('should return 400 for invalid parent ID format', async () => {
      await request(app)
        .get(`/api/v1/projects/${validProjectId}/folders`)
        .query({ parentId: 'invalid-uuid' })
        .expect(400);
    });

    it('should return 404 for non-existent project', async () => {
      const response = await request(app)
        .get(`/api/v1/projects/${invalidProjectId}/folders`)
        .expect(404);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('project not found');
    });

    it('should return 401 for unauthorized request', async () => {
      await request(app)
        .get(`/api/v1/projects/${validProjectId}/folders`)
        .expect(401);
    });

    it('should return 403 for insufficient permissions', async () => {
      await request(app)
        .get(`/api/v1/projects/${validProjectId}/folders`)
        .set('Authorization', 'Bearer no-access-token')
        .expect(403);
    });

    it('should handle nested folder hierarchy', async () => {
      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}/folders`)
        .expect(200);

      // Verify that folders can be hierarchically organized
      const foldersWithParents = response.body.items.filter((folder: any) => folder.parentId);

      foldersWithParents.forEach((folder: any) => {
        expect(folder.parentId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );
        expect(folder.path).toBeTruthy();
        expect(typeof folder.path).toBe('string');
      });
    });

    it('should return folders ordered by sort order when specified', async () => {
      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}/folders`)
        .expect(200);

      // Check if folders with sortOrder are properly ordered
      const foldersWithSortOrder = response.body.items.filter(
        (folder: any) => folder.sortOrder !== null && folder.sortOrder !== undefined
      );

      if (foldersWithSortOrder.length > 1) {
        for (let i = 1; i < foldersWithSortOrder.length; i++) {
          expect(foldersWithSortOrder[i].sortOrder).toBeGreaterThanOrEqual(
            foldersWithSortOrder[i - 1].sortOrder
          );
        }
      }
    });
  });
});