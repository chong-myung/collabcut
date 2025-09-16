/**
 * Contract Tests: Project Management API
 * GET /api/v1/projects/{id}
 *
 * These tests verify that the API contract matches the specification
 * defined in specs/001-collabcut-is-a/contracts/project-api.md
 */

const request = require('supertest');
const { v4: uuidv4 } = require('uuid');

// Mock Express app - This doesn't exist yet, hence tests will fail (RED phase)
const app = require('../../../main/src/app'); // This will fail until implemented

describe('Project Management API - GET /api/v1/projects/{id}', () => {
  describe('Contract: Get Project', () => {
    const validProjectId = uuidv4();
    const invalidProjectId = uuidv4();
    const malformedProjectId = 'invalid-uuid';

    it('should return project details with 200 for valid project ID', async () => {
      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}`)
        .expect(200);

      // Verify response structure matches contract
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('name');
      expect(response.body).toHaveProperty('description');
      expect(response.body).toHaveProperty('created_at');
      expect(response.body).toHaveProperty('updated_at');
      expect(response.body).toHaveProperty('created_by');
      expect(response.body).toHaveProperty('settings');
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('cloud_sync_enabled');
      expect(response.body).toHaveProperty('last_sync_at');
      expect(response.body).toHaveProperty('members');

      // Verify data types
      expect(typeof response.body.id).toBe('string');
      expect(typeof response.body.name).toBe('string');
      expect(typeof response.body.description).toBe('string');
      expect(typeof response.body.created_at).toBe('string');
      expect(typeof response.body.updated_at).toBe('string');
      expect(typeof response.body.created_by).toBe('string');
      expect(typeof response.body.settings).toBe('object');
      expect(typeof response.body.status).toBe('string');
      expect(typeof response.body.cloud_sync_enabled).toBe('boolean');
      expect(Array.isArray(response.body.members)).toBe(true);

      // Verify UUID format
      expect(response.body.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
      expect(response.body.created_by).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );

      // Verify ISO 8601 datetime format
      expect(response.body.created_at).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/
      );
      expect(response.body.updated_at).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/
      );

      if (response.body.last_sync_at) {
        expect(response.body.last_sync_at).toMatch(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/
        );
      }
    });

    it('should return project with members array in correct format', async () => {
      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}`)
        .expect(200);

      if (response.body.members.length > 0) {
        const member = response.body.members[0];

        expect(member).toHaveProperty('user_id');
        expect(member).toHaveProperty('username');
        expect(member).toHaveProperty('display_name');
        expect(member).toHaveProperty('role');
        expect(member).toHaveProperty('joined_at');

        // Verify member data types
        expect(typeof member.user_id).toBe('string');
        expect(typeof member.username).toBe('string');
        expect(typeof member.display_name).toBe('string');
        expect(typeof member.role).toBe('string');
        expect(typeof member.joined_at).toBe('string');

        // Verify UUID format for user_id
        expect(member.user_id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );

        // Verify datetime format for joined_at
        expect(member.joined_at).toMatch(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/
        );

        // Verify role is valid
        expect(['owner', 'editor', 'viewer', 'commenter']).toContain(
          member.role
        );
      }
    });

    it('should return 404 for non-existent project ID', async () => {
      const response = await request(app)
        .get(`/api/v1/projects/${invalidProjectId}`)
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('not found');
    });

    it('should return 400 for malformed project ID', async () => {
      await request(app)
        .get(`/api/v1/projects/${malformedProjectId}`)
        .expect(400);
    });

    it('should return 403 for access denied (no permission)', async () => {
      // Test with a valid project ID but no access permission
      await request(app)
        .get(`/api/v1/projects/${validProjectId}`)
        .set('Authorization', 'Bearer invalid-token')
        .expect(403);
    });

    it('should return 401 for unauthorized request', async () => {
      // Test without authentication header
      await request(app).get(`/api/v1/projects/${validProjectId}`).expect(401);
    });
  });

  describe('Contract: List Projects', () => {
    it('should return projects list with default pagination', async () => {
      const response = await request(app).get('/api/v1/projects').expect(200);

      // Verify response structure matches contract
      expect(response.body).toHaveProperty('projects');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('limit');
      expect(response.body).toHaveProperty('offset');

      // Verify data types
      expect(Array.isArray(response.body.projects)).toBe(true);
      expect(typeof response.body.total).toBe('number');
      expect(typeof response.body.limit).toBe('number');
      expect(typeof response.body.offset).toBe('number');

      // Verify default pagination values
      expect(response.body.limit).toBe(20);
      expect(response.body.offset).toBe(0);

      // Verify project structure in list
      if (response.body.projects.length > 0) {
        const project = response.body.projects[0];

        expect(project).toHaveProperty('id');
        expect(project).toHaveProperty('name');
        expect(project).toHaveProperty('description');
        expect(project).toHaveProperty('created_at');
        expect(project).toHaveProperty('updated_at');
        expect(project).toHaveProperty('status');
        expect(project).toHaveProperty('member_count');

        expect(typeof project.member_count).toBe('number');
      }
    });

    it('should respect limit and offset query parameters', async () => {
      const response = await request(app)
        .get('/api/v1/projects?limit=5&offset=10')
        .expect(200);

      expect(response.body.limit).toBe(5);
      expect(response.body.offset).toBe(10);
      expect(response.body.projects.length).toBeLessThanOrEqual(5);
    });

    it('should filter by status query parameter', async () => {
      const response = await request(app)
        .get('/api/v1/projects?status=active')
        .expect(200);

      if (response.body.projects.length > 0) {
        response.body.projects.forEach((project) => {
          expect(project.status).toBe('active');
        });
      }
    });

    it('should enforce maximum limit of 100', async () => {
      const response = await request(app)
        .get('/api/v1/projects?limit=150')
        .expect(200);

      expect(response.body.limit).toBeLessThanOrEqual(100);
    });

    it('should return 401 for unauthorized list request', async () => {
      await request(app).get('/api/v1/projects').expect(401);
    });
  });
});
