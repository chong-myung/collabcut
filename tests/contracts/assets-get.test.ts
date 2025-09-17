/**
 * Contract Tests: Project Panel Assets API
 * GET /projects/{projectId}/assets
 *
 * These tests verify that the API contract matches the specification
 * defined in specs/002-collabcut-adobe-premiere/contracts/project-panel-api.yaml
 * Note: This complements the existing media-list.test.js with panel-specific requirements
 */

import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';

// Mock Express app - This doesn't exist yet, hence tests will fail (RED phase)
const app = require('../../../main/src/app'); // This will fail until implemented

describe('Project Panel Assets API - GET /projects/{projectId}/assets', () => {
  describe('Contract: Get Project Assets with Panel Metadata', () => {
    const validProjectId = uuidv4();
    const invalidProjectId = uuidv4();
    const validFolderId = uuidv4();
    const invalidFolderId = uuidv4();

    it('should return assets list with panel-specific structure', async () => {
      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}/assets`)
        .expect(200);

      // Verify response structure matches panel contract
      expect(response.body).toHaveProperty('items');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('limit');
      expect(response.body).toHaveProperty('offset');

      // Verify data types
      expect(Array.isArray(response.body.items)).toBe(true);
      expect(typeof response.body.total).toBe('number');
      expect(typeof response.body.limit).toBe('number');
      expect(typeof response.body.offset).toBe('number');

      // Verify default pagination values for panel
      expect(response.body.limit).toBe(50); // Panel default is 50, not 20
      expect(response.body.offset).toBe(0);

      // Verify asset structure with panel requirements
      if (response.body.items.length > 0) {
        const asset = response.body.items[0];

        // Required panel fields
        expect(asset).toHaveProperty('id');
        expect(asset).toHaveProperty('projectId');
        expect(asset).toHaveProperty('filename');
        expect(asset).toHaveProperty('fileType');
        expect(asset).toHaveProperty('fileSize');
        expect(asset).toHaveProperty('createdAt');

        // Panel-specific fields
        expect(asset).toHaveProperty('folderId');
        expect(asset).toHaveProperty('thumbnailUrl');
        expect(asset).toHaveProperty('metadata');

        // Verify data types
        expect(typeof asset.id).toBe('string');
        expect(typeof asset.projectId).toBe('string');
        expect(typeof asset.filename).toBe('string');
        expect(typeof asset.fileType).toBe('string');
        expect(typeof asset.fileSize).toBe('number');
        expect(typeof asset.createdAt).toBe('string');

        if (asset.folderId) {
          expect(typeof asset.folderId).toBe('string');
        }
        if (asset.thumbnailUrl) {
          expect(typeof asset.thumbnailUrl).toBe('string');
        }
        if (asset.metadata) {
          expect(typeof asset.metadata).toBe('object');
        }

        // Verify UUID formats
        expect(asset.id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );
        expect(asset.projectId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );

        if (asset.folderId) {
          expect(asset.folderId).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          );
        }

        // Verify datetime format
        expect(asset.createdAt).toMatch(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/
        );

        // Verify file type enum
        expect(['video', 'audio', 'image', 'subtitle']).toContain(asset.fileType);

        // Verify file size is positive
        expect(asset.fileSize).toBeGreaterThan(0);

        // Verify filename constraints
        expect(asset.filename.length).toBeLessThanOrEqual(255);
      }
    });

    it('should filter assets by folder ID', async () => {
      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}/assets`)
        .query({ folderId: validFolderId })
        .expect(200);

      // All returned assets should belong to the specified folder
      response.body.items.forEach((asset: any) => {
        expect(asset.folderId).toBe(validFolderId);
      });
    });

    it('should search assets by filename with panel search', async () => {
      const searchTerm = 'test';

      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}/assets`)
        .query({ search: searchTerm })
        .expect(200);

      if (response.body.items.length > 0) {
        response.body.items.forEach((asset: any) => {
          expect(asset.filename.toLowerCase()).toContain(searchTerm.toLowerCase());
        });
      }
    });

    it('should filter by file type using panel enum values', async () => {
      const fileType = 'video';

      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}/assets`)
        .query({ type: fileType })
        .expect(200);

      response.body.items.forEach((asset: any) => {
        expect(asset.fileType).toBe(fileType);
      });
    });

    it('should filter by all file types', async () => {
      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}/assets`)
        .query({ type: 'all' })
        .expect(200);

      // Should return assets of any type
      const fileTypes = response.body.items.map((asset: any) => asset.fileType);
      const uniqueTypes = [...new Set(fileTypes)];

      uniqueTypes.forEach((type: string) => {
        expect(['video', 'audio', 'image', 'subtitle']).toContain(type);
      });
    });

    it('should respect panel pagination limits', async () => {
      const limit = 25;
      const offset = 10;

      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}/assets`)
        .query({ limit, offset })
        .expect(200);

      expect(response.body.limit).toBe(limit);
      expect(response.body.offset).toBe(offset);
      expect(response.body.items.length).toBeLessThanOrEqual(limit);
    });

    it('should enforce maximum limit of 100 for panel', async () => {
      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}/assets`)
        .query({ limit: 150 })
        .expect(200);

      expect(response.body.limit).toBeLessThanOrEqual(100);
    });

    it('should enforce minimum limit of 1', async () => {
      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}/assets`)
        .query({ limit: 0 })
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('limit');
    });

    it('should return 400 for search term exceeding 100 characters', async () => {
      const longSearch = 'a'.repeat(101);

      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}/assets`)
        .query({ search: longSearch })
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('search');
    });

    it('should return 400 for invalid file type', async () => {
      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}/assets`)
        .query({ type: 'invalid-type' })
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('type');
    });

    it('should return 400 for invalid folder ID format', async () => {
      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}/assets`)
        .query({ folderId: 'invalid-uuid' })
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('folderId');
    });

    it('should return 400 for invalid project ID format', async () => {
      await request(app).get('/api/v1/projects/invalid-uuid/assets').expect(400);
    });

    it('should return 400 for negative offset', async () => {
      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}/assets`)
        .query({ offset: -1 })
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('offset');
    });

    it('should return 404 for non-existent project', async () => {
      const response = await request(app)
        .get(`/api/v1/projects/${invalidProjectId}/assets`)
        .expect(404);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('project not found');
    });

    it('should return empty list for non-existent folder', async () => {
      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}/assets`)
        .query({ folderId: invalidFolderId })
        .expect(200);

      expect(response.body.items).toEqual([]);
      expect(response.body.total).toBe(0);
    });

    it('should return 401 for unauthorized request', async () => {
      await request(app).get(`/api/v1/projects/${validProjectId}/assets`).expect(401);
    });

    it('should return 403 for insufficient permissions', async () => {
      await request(app)
        .get(`/api/v1/projects/${validProjectId}/assets`)
        .set('Authorization', 'Bearer no-access-token')
        .expect(403);
    });

    it('should handle combined filters', async () => {
      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}/assets`)
        .query({
          folderId: validFolderId,
          type: 'video',
          search: 'test',
          limit: 10,
          offset: 0
        })
        .expect(200);

      response.body.items.forEach((asset: any) => {
        expect(asset.folderId).toBe(validFolderId);
        expect(asset.fileType).toBe('video');
        expect(asset.filename.toLowerCase()).toContain('test');
      });

      expect(response.body.limit).toBe(10);
      expect(response.body.offset).toBe(0);
    });

    it('should include panel-specific metadata for assets', async () => {
      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}/assets`)
        .expect(200);

      if (response.body.items.length > 0) {
        const asset = response.body.items[0];

        // Panel should include all metadata needed for UI display
        expect(asset).toHaveProperty('thumbnailUrl');
        expect(asset).toHaveProperty('metadata');

        if (asset.thumbnailUrl) {
          expect(asset.thumbnailUrl).toMatch(/^https?:\/\//);
        }

        // Metadata should be an object that can contain various properties
        if (asset.metadata) {
          expect(typeof asset.metadata).toBe('object');
        }
      }
    });
  });
});