/**
 * Contract Tests: Project Sync Status API
 * GET /projects/{projectId}/sync/status
 *
 * These tests verify that the API contract matches the specification
 * defined in specs/002-collabcut-adobe-premiere/contracts/project-panel-api.yaml
 */

import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';

// Mock Express app - This doesn't exist yet, hence tests will fail (RED phase)
const app = require('../../../main/src/app'); // This will fail until implemented

describe('Project Sync Status API - GET /projects/{projectId}/sync/status', () => {
  describe('Contract: Get Sync Status', () => {
    const validProjectId = uuidv4();
    const invalidProjectId = uuidv4();
    const validItemId1 = uuidv4();
    const validItemId2 = uuidv4();
    const validItemId3 = uuidv4();

    it('should return sync status for all project items when no filter specified', async () => {
      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}/sync/status`)
        .expect(200);

      // Verify response structure matches contract
      expect(response.body).toHaveProperty('items');
      expect(Array.isArray(response.body.items)).toBe(true);

      if (response.body.items.length > 0) {
        const syncStatus = response.body.items[0];

        // Verify required properties
        expect(syncStatus).toHaveProperty('itemId');
        expect(syncStatus).toHaveProperty('itemType');
        expect(syncStatus).toHaveProperty('syncStatus');

        // Verify optional properties
        expect(syncStatus).toHaveProperty('lastSync');
        expect(syncStatus).toHaveProperty('syncProgress');
        expect(syncStatus).toHaveProperty('errorMessage');
        expect(syncStatus).toHaveProperty('conflictType');
        expect(syncStatus).toHaveProperty('userId');

        // Verify data types
        expect(typeof syncStatus.itemId).toBe('string');
        expect(typeof syncStatus.itemType).toBe('string');
        expect(typeof syncStatus.syncStatus).toBe('string');

        if (syncStatus.lastSync) {
          expect(typeof syncStatus.lastSync).toBe('string');
        }
        if (syncStatus.syncProgress !== null && syncStatus.syncProgress !== undefined) {
          expect(typeof syncStatus.syncProgress).toBe('number');
        }
        if (syncStatus.errorMessage) {
          expect(typeof syncStatus.errorMessage).toBe('string');
        }
        if (syncStatus.conflictType) {
          expect(typeof syncStatus.conflictType).toBe('string');
        }
        if (syncStatus.userId) {
          expect(typeof syncStatus.userId).toBe('string');
        }

        // Verify UUID formats
        expect(syncStatus.itemId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );

        if (syncStatus.userId) {
          expect(syncStatus.userId).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          );
        }

        // Verify datetime format (ISO 8601)
        if (syncStatus.lastSync) {
          expect(syncStatus.lastSync).toMatch(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/
          );
        }

        // Verify enum values
        expect(['folder', 'media_asset', 'project']).toContain(syncStatus.itemType);
        expect(['synced', 'syncing', 'conflict', 'error', 'offline']).toContain(
          syncStatus.syncStatus
        );

        if (syncStatus.conflictType) {
          expect(['none', 'name_conflict', 'content_conflict', 'permission_conflict']).toContain(
            syncStatus.conflictType
          );
        }

        // Verify sync progress is between 0 and 1
        if (syncStatus.syncProgress !== null && syncStatus.syncProgress !== undefined) {
          expect(syncStatus.syncProgress).toBeGreaterThanOrEqual(0);
          expect(syncStatus.syncProgress).toBeLessThanOrEqual(1);
        }
      }
    });

    it('should filter sync status by specific item IDs', async () => {
      const itemIds = [validItemId1, validItemId2];

      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}/sync/status`)
        .query({ itemIds: itemIds })
        .expect(200);

      expect(response.body).toHaveProperty('items');
      expect(Array.isArray(response.body.items)).toBe(true);

      // All returned items should have IDs in the requested list
      response.body.items.forEach((syncStatus: any) => {
        expect(itemIds).toContain(syncStatus.itemId);
      });
    });

    it('should handle single item ID query', async () => {
      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}/sync/status`)
        .query({ itemIds: [validItemId1] })
        .expect(200);

      expect(response.body.items.length).toBeLessThanOrEqual(1);

      if (response.body.items.length === 1) {
        expect(response.body.items[0].itemId).toBe(validItemId1);
      }
    });

    it('should handle multiple item IDs in query array format', async () => {
      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}/sync/status`)
        .query({ itemIds: [validItemId1, validItemId2, validItemId3] })
        .expect(200);

      const returnedIds = response.body.items.map((item: any) => item.itemId);
      const requestedIds = [validItemId1, validItemId2, validItemId3];

      // All returned IDs should be in the requested list
      returnedIds.forEach((id: string) => {
        expect(requestedIds).toContain(id);
      });
    });

    it('should return empty list when no items match filter', async () => {
      const nonExistentId = uuidv4();

      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}/sync/status`)
        .query({ itemIds: [nonExistentId] })
        .expect(200);

      expect(response.body).toHaveProperty('items');
      expect(response.body.items).toEqual([]);
    });

    it('should show different sync statuses for different items', async () => {
      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}/sync/status`)
        .expect(200);

      // Verify that different sync statuses can coexist
      const statuses = response.body.items.map((item: any) => item.syncStatus);
      const uniqueStatuses = [...new Set(statuses)];

      expect(uniqueStatuses.length).toBeGreaterThanOrEqual(1);
      uniqueStatuses.forEach((status: string) => {
        expect(['synced', 'syncing', 'conflict', 'error', 'offline']).toContain(status);
      });
    });

    it('should show sync progress for syncing items', async () => {
      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}/sync/status`)
        .expect(200);

      const syncingItems = response.body.items.filter(
        (item: any) => item.syncStatus === 'syncing'
      );

      syncingItems.forEach((item: any) => {
        expect(item.syncProgress).toBeDefined();
        expect(typeof item.syncProgress).toBe('number');
        expect(item.syncProgress).toBeGreaterThanOrEqual(0);
        expect(item.syncProgress).toBeLessThanOrEqual(1);
      });
    });

    it('should show error messages for error status items', async () => {
      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}/sync/status`)
        .expect(200);

      const errorItems = response.body.items.filter((item: any) => item.syncStatus === 'error');

      errorItems.forEach((item: any) => {
        expect(item.errorMessage).toBeDefined();
        expect(typeof item.errorMessage).toBe('string');
        expect(item.errorMessage.length).toBeGreaterThan(0);
      });
    });

    it('should show conflict types for conflict status items', async () => {
      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}/sync/status`)
        .expect(200);

      const conflictItems = response.body.items.filter(
        (item: any) => item.syncStatus === 'conflict'
      );

      conflictItems.forEach((item: any) => {
        expect(item.conflictType).toBeDefined();
        expect(['name_conflict', 'content_conflict', 'permission_conflict']).toContain(
          item.conflictType
        );
      });
    });

    it('should return 400 for invalid project ID format', async () => {
      await request(app).get('/api/v1/projects/invalid-uuid/sync/status').expect(400);
    });

    it('should return 400 for invalid item ID format in query', async () => {
      await request(app)
        .get(`/api/v1/projects/${validProjectId}/sync/status`)
        .query({ itemIds: ['invalid-uuid'] })
        .expect(400);
    });

    it('should return 400 for mixed valid and invalid item IDs', async () => {
      await request(app)
        .get(`/api/v1/projects/${validProjectId}/sync/status`)
        .query({ itemIds: [validItemId1, 'invalid-uuid', validItemId2] })
        .expect(400);
    });

    it('should return 404 for non-existent project', async () => {
      const response = await request(app)
        .get(`/api/v1/projects/${invalidProjectId}/sync/status`)
        .expect(404);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('project not found');
    });

    it('should return 401 for unauthorized request', async () => {
      await request(app).get(`/api/v1/projects/${validProjectId}/sync/status`).expect(401);
    });

    it('should return 403 for insufficient permissions', async () => {
      await request(app)
        .get(`/api/v1/projects/${validProjectId}/sync/status`)
        .set('Authorization', 'Bearer no-access-token')
        .expect(403);
    });

    it('should handle different item types in sync status', async () => {
      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}/sync/status`)
        .expect(200);

      const itemTypes = response.body.items.map((item: any) => item.itemType);
      const uniqueTypes = [...new Set(itemTypes)];

      uniqueTypes.forEach((type: string) => {
        expect(['folder', 'media_asset', 'project']).toContain(type);
      });
    });
  });
});