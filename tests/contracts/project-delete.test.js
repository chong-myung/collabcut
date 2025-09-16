/**
 * Contract Tests: Project Management API
 * DELETE /api/v1/projects/{id}
 *
 * These tests verify that the API contract matches the specification
 * defined in specs/001-collabcut-is-a/contracts/project-api.md
 */

const request = require('supertest');
const { v4: uuidv4 } = require('uuid');

// Mock Express app - This doesn't exist yet, hence tests will fail (RED phase)
const app = require('../../../main/src/app'); // This will fail until implemented

describe('Project Management API - DELETE /api/v1/projects/{id}', () => {
  describe('Contract: Delete Project', () => {
    const validProjectId = uuidv4();
    const invalidProjectId = uuidv4();
    const unauthorizedProjectId = uuidv4();
    const malformedProjectId = 'invalid-uuid';

    it('should delete project and return 204 for valid project ID', async () => {
      const response = await request(app)
        .delete(`/api/v1/projects/${validProjectId}`)
        .expect(204);

      // 204 No Content should have no response body
      expect(response.body).toEqual({});
      expect(response.text).toBe('');
    });

    it('should return 404 for non-existent project', async () => {
      const response = await request(app)
        .delete(`/api/v1/projects/${invalidProjectId}`)
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('not found');
    });

    it('should return 403 for insufficient permissions', async () => {
      const response = await request(app)
        .delete(`/api/v1/projects/${unauthorizedProjectId}`)
        .expect(403);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('permission');
    });

    it('should return 401 for unauthorized request', async () => {
      // Request without authentication header
      await request(app)
        .delete(`/api/v1/projects/${validProjectId}`)
        .expect(401);
    });

    it('should return 400 for malformed project ID', async () => {
      await request(app)
        .delete(`/api/v1/projects/${malformedProjectId}`)
        .expect(400);
    });

    it('should ensure project is actually deleted (idempotent)', async () => {
      // First deletion should succeed
      await request(app)
        .delete(`/api/v1/projects/${validProjectId}`)
        .expect(204);

      // Second deletion of same project should return 404
      await request(app)
        .delete(`/api/v1/projects/${validProjectId}`)
        .expect(404);
    });

    it('should prevent access to deleted project via GET', async () => {
      // Delete the project
      await request(app)
        .delete(`/api/v1/projects/${validProjectId}`)
        .expect(204);

      // Verify project can no longer be accessed
      await request(app).get(`/api/v1/projects/${validProjectId}`).expect(404);
    });

    it('should handle concurrent deletion attempts gracefully', async () => {
      const projectToDelete = uuidv4();

      // Simulate concurrent deletion requests
      const deletePromises = [
        request(app).delete(`/api/v1/projects/${projectToDelete}`),
        request(app).delete(`/api/v1/projects/${projectToDelete}`),
        request(app).delete(`/api/v1/projects/${projectToDelete}`),
      ];

      const responses = await Promise.all(deletePromises);

      // At least one should succeed (204), others may be 404 or 204
      const successResponses = responses.filter((res) => res.status === 204);
      const notFoundResponses = responses.filter((res) => res.status === 404);

      expect(successResponses.length).toBeGreaterThanOrEqual(1);
      expect(successResponses.length + notFoundResponses.length).toBe(3);
    });
  });

  describe('Contract: Project Member Management', () => {
    const projectId = uuidv4();
    const userId = uuidv4();
    const invalidUserId = uuidv4();

    describe('Add Project Member - POST /api/v1/projects/{id}/members', () => {
      it('should add member with valid data and return 201', async () => {
        const memberData = {
          user_id: userId,
          role: 'editor',
        };

        const response = await request(app)
          .post(`/api/v1/projects/${projectId}/members`)
          .send(memberData)
          .expect(201);

        // Verify response structure matches contract
        expect(response.body).toHaveProperty('user_id', userId);
        expect(response.body).toHaveProperty('username');
        expect(response.body).toHaveProperty('display_name');
        expect(response.body).toHaveProperty('role', 'editor');
        expect(response.body).toHaveProperty('joined_at');
        expect(response.body).toHaveProperty('invited_by');

        // Verify data types
        expect(typeof response.body.username).toBe('string');
        expect(typeof response.body.display_name).toBe('string');
        expect(typeof response.body.joined_at).toBe('string');
        expect(typeof response.body.invited_by).toBe('string');

        // Verify UUID formats
        expect(response.body.user_id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );
        expect(response.body.invited_by).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );

        // Verify datetime format
        expect(response.body.joined_at).toMatch(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/
        );

        // Verify role is valid
        expect(['owner', 'editor', 'viewer', 'commenter']).toContain(
          response.body.role
        );
      });

      it('should add member with each valid role', async () => {
        const roles = ['owner', 'editor', 'viewer', 'commenter'];

        for (const role of roles) {
          const memberData = {
            user_id: uuidv4(),
            role: role,
          };

          const response = await request(app)
            .post(`/api/v1/projects/${projectId}/members`)
            .send(memberData)
            .expect(201);

          expect(response.body.role).toBe(role);
        }
      });

      it('should return 400 for missing user_id', async () => {
        const memberData = {
          role: 'editor',
        };

        await request(app)
          .post(`/api/v1/projects/${projectId}/members`)
          .send(memberData)
          .expect(400);
      });

      it('should return 400 for missing role', async () => {
        const memberData = {
          user_id: userId,
        };

        await request(app)
          .post(`/api/v1/projects/${projectId}/members`)
          .send(memberData)
          .expect(400);
      });

      it('should return 400 for invalid role', async () => {
        const memberData = {
          user_id: userId,
          role: 'invalid_role',
        };

        await request(app)
          .post(`/api/v1/projects/${projectId}/members`)
          .send(memberData)
          .expect(400);
      });

      it('should return 400 for malformed user_id', async () => {
        const memberData = {
          user_id: 'invalid-uuid',
          role: 'editor',
        };

        await request(app)
          .post(`/api/v1/projects/${projectId}/members`)
          .send(memberData)
          .expect(400);
      });
    });

    describe('Update Member Role - PUT /api/v1/projects/{id}/members/{user_id}', () => {
      it('should update member role and return 200', async () => {
        const updateData = {
          role: 'owner',
        };

        const response = await request(app)
          .put(`/api/v1/projects/${projectId}/members/${userId}`)
          .send(updateData)
          .expect(200);

        expect(response.body).toHaveProperty('role', 'owner');
        expect(response.body).toHaveProperty('user_id', userId);
      });

      it('should return 400 for missing role', async () => {
        const updateData = {};

        await request(app)
          .put(`/api/v1/projects/${projectId}/members/${userId}`)
          .send(updateData)
          .expect(400);
      });

      it('should return 404 for non-existent member', async () => {
        const updateData = {
          role: 'editor',
        };

        await request(app)
          .put(`/api/v1/projects/${projectId}/members/${invalidUserId}`)
          .send(updateData)
          .expect(404);
      });
    });

    describe('Remove Project Member - DELETE /api/v1/projects/{id}/members/{user_id}', () => {
      it('should remove member and return 204', async () => {
        const response = await request(app)
          .delete(`/api/v1/projects/${projectId}/members/${userId}`)
          .expect(204);

        // 204 No Content should have no response body
        expect(response.body).toEqual({});
        expect(response.text).toBe('');
      });

      it('should return 404 for non-existent member', async () => {
        await request(app)
          .delete(`/api/v1/projects/${projectId}/members/${invalidUserId}`)
          .expect(404);
      });
    });
  });
});
