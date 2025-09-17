/**
 * Contract Tests: Project Panel State API
 * PUT /projects/{projectId}/panel/state
 *
 * These tests verify that the API contract matches the specification
 * defined in specs/002-collabcut-adobe-premiere/contracts/project-panel-api.yaml
 */

import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';

// Mock Express app - This doesn't exist yet, hence tests will fail (RED phase)
const app = require('../../../main/src/app'); // This will fail until implemented

describe('Project Panel State API - PUT /projects/{projectId}/panel/state', () => {
  describe('Contract: Update Panel State', () => {
    const validProjectId = uuidv4();
    const validUserId = uuidv4();
    const invalidProjectId = uuidv4();

    it('should update panel state with valid data', async () => {
      const updateData = {
        viewMode: 'list',
        sortPreference: 'date',
        layoutConfig: {
          width: 400,
          height: 600,
          columns: ['name', 'type', 'date', 'size']
        },
        filterSettings: {
          fileTypes: ['video', 'audio'],
          dateRange: {
            start: '2024-01-01T00:00:00.000Z',
            end: '2024-12-31T23:59:59.999Z'
          }
        },
        expandedFolders: [uuidv4(), uuidv4()],
        selectedItems: [uuidv4()]
      };

      const response = await request(app)
        .put(`/api/v1/projects/${validProjectId}/panel/state`)
        .send(updateData)
        .expect(200);

      // Should return success response (empty body or confirmation)
      expect(response.status).toBe(200);
    });

    it('should update partial panel state', async () => {
      const partialUpdate = {
        viewMode: 'grid',
        sortPreference: 'name'
      };

      await request(app)
        .put(`/api/v1/projects/${validProjectId}/panel/state`)
        .send(partialUpdate)
        .expect(200);
    });

    it('should update layout configuration only', async () => {
      const layoutUpdate = {
        layoutConfig: {
          width: 350,
          height: 500,
          columns: ['name', 'date']
        }
      };

      await request(app)
        .put(`/api/v1/projects/${validProjectId}/panel/state`)
        .send(layoutUpdate)
        .expect(200);
    });

    it('should update filter settings only', async () => {
      const filterUpdate = {
        filterSettings: {
          fileTypes: ['video'],
          dateRange: {
            start: '2024-06-01T00:00:00.000Z',
            end: '2024-06-30T23:59:59.999Z'
          }
        }
      };

      await request(app)
        .put(`/api/v1/projects/${validProjectId}/panel/state`)
        .send(filterUpdate)
        .expect(200);
    });

    it('should update expanded folders', async () => {
      const foldersUpdate = {
        expandedFolders: [uuidv4(), uuidv4(), uuidv4()]
      };

      await request(app)
        .put(`/api/v1/projects/${validProjectId}/panel/state`)
        .send(foldersUpdate)
        .expect(200);
    });

    it('should update selected items', async () => {
      const selectionUpdate = {
        selectedItems: [uuidv4(), uuidv4()]
      };

      await request(app)
        .put(`/api/v1/projects/${validProjectId}/panel/state`)
        .send(selectionUpdate)
        .expect(200);
    });

    it('should return 400 for invalid view mode', async () => {
      const invalidUpdate = {
        viewMode: 'invalid-mode'
      };

      const response = await request(app)
        .put(`/api/v1/projects/${validProjectId}/panel/state`)
        .send(invalidUpdate)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('viewMode');
    });

    it('should return 400 for invalid sort preference', async () => {
      const invalidUpdate = {
        sortPreference: 'invalid-sort'
      };

      const response = await request(app)
        .put(`/api/v1/projects/${validProjectId}/panel/state`)
        .send(invalidUpdate)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('sortPreference');
    });

    it('should return 400 for invalid layout width', async () => {
      const invalidUpdate = {
        layoutConfig: {
          width: 100 // Below minimum (200)
        }
      };

      const response = await request(app)
        .put(`/api/v1/projects/${validProjectId}/panel/state`)
        .send(invalidUpdate)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('width');
    });

    it('should return 400 for width exceeding maximum', async () => {
      const invalidUpdate = {
        layoutConfig: {
          width: 900 // Above maximum (800)
        }
      };

      await request(app)
        .put(`/api/v1/projects/${validProjectId}/panel/state`)
        .send(invalidUpdate)
        .expect(400);
    });

    it('should return 400 for invalid layout height', async () => {
      const invalidUpdate = {
        layoutConfig: {
          height: 200 // Below minimum (300)
        }
      };

      const response = await request(app)
        .put(`/api/v1/projects/${validProjectId}/panel/state`)
        .send(invalidUpdate)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('height');
    });

    it('should return 400 for invalid UUID in expanded folders', async () => {
      const invalidUpdate = {
        expandedFolders: ['invalid-uuid', uuidv4()]
      };

      const response = await request(app)
        .put(`/api/v1/projects/${validProjectId}/panel/state`)
        .send(invalidUpdate)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('UUID');
    });

    it('should return 400 for invalid UUID in selected items', async () => {
      const invalidUpdate = {
        selectedItems: [uuidv4(), 'not-a-uuid']
      };

      const response = await request(app)
        .put(`/api/v1/projects/${validProjectId}/panel/state`)
        .send(invalidUpdate)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('UUID');
    });

    it('should return 400 for invalid date format in filter settings', async () => {
      const invalidUpdate = {
        filterSettings: {
          dateRange: {
            start: 'invalid-date',
            end: '2024-12-31T23:59:59.999Z'
          }
        }
      };

      const response = await request(app)
        .put(`/api/v1/projects/${validProjectId}/panel/state`)
        .send(invalidUpdate)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('date');
    });

    it('should return 400 for invalid project ID format', async () => {
      const updateData = {
        viewMode: 'list'
      };

      await request(app)
        .put('/api/v1/projects/invalid-uuid/panel/state')
        .send(updateData)
        .expect(400);
    });

    it('should return 404 for non-existent project', async () => {
      const updateData = {
        viewMode: 'grid'
      };

      const response = await request(app)
        .put(`/api/v1/projects/${invalidProjectId}/panel/state`)
        .send(updateData)
        .expect(404);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('project not found');
    });

    it('should return 401 for unauthorized request', async () => {
      const updateData = {
        viewMode: 'list'
      };

      await request(app)
        .put(`/api/v1/projects/${validProjectId}/panel/state`)
        .send(updateData)
        .expect(401);
    });

    it('should return 403 for insufficient permissions', async () => {
      const updateData = {
        viewMode: 'tree'
      };

      await request(app)
        .put(`/api/v1/projects/${validProjectId}/panel/state`)
        .send(updateData)
        .set('Authorization', 'Bearer read-only-token')
        .expect(403);
    });

    it('should handle empty update gracefully', async () => {
      const emptyUpdate = {};

      await request(app)
        .put(`/api/v1/projects/${validProjectId}/panel/state`)
        .send(emptyUpdate)
        .expect(200);
    });
  });
});