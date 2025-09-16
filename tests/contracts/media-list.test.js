/**
 * Contract Tests: Media Asset Management API
 * GET /api/v1/projects/{id}/media
 *
 * These tests verify that the API contract matches the specification
 * defined in specs/001-collabcut-is-a/contracts/media-api.md
 */

const request = require('supertest');
const { v4: uuidv4 } = require('uuid');

// Mock Express app - This doesn't exist yet, hence tests will fail (RED phase)
const app = require('../../../main/src/app'); // This will fail until implemented

describe('Media Asset Management API - GET /api/v1/projects/{id}/media', () => {
  describe('Contract: List Media Assets', () => {
    const validProjectId = uuidv4();
    const invalidProjectId = uuidv4();
    const validAssetId = uuidv4();
    const invalidAssetId = uuidv4();

    it('should return media assets list with default parameters', async () => {
      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}/media`)
        .expect(200);

      // Verify response structure matches contract
      expect(response.body).toHaveProperty('assets');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('limit');
      expect(response.body).toHaveProperty('offset');

      // Verify data types
      expect(Array.isArray(response.body.assets)).toBe(true);
      expect(typeof response.body.total).toBe('number');
      expect(typeof response.body.limit).toBe('number');
      expect(typeof response.body.offset).toBe('number');

      // Verify default pagination values
      expect(response.body.limit).toBe(20);
      expect(response.body.offset).toBe(0);

      // Verify asset structure in list
      if (response.body.assets.length > 0) {
        const asset = response.body.assets[0];

        expect(asset).toHaveProperty('id');
        expect(asset).toHaveProperty('filename');
        expect(asset).toHaveProperty('file_type');
        expect(asset).toHaveProperty('file_size');
        expect(asset).toHaveProperty('duration');
        expect(asset).toHaveProperty('resolution');
        expect(asset).toHaveProperty('thumbnail_url');
        expect(asset).toHaveProperty('folder_path');
        expect(asset).toHaveProperty('created_at');

        // Verify data types
        expect(typeof asset.id).toBe('string');
        expect(typeof asset.filename).toBe('string');
        expect(typeof asset.file_type).toBe('string');
        expect(typeof asset.file_size).toBe('number');
        expect(typeof asset.thumbnail_url).toBe('string');
        expect(typeof asset.folder_path).toBe('string');
        expect(typeof asset.created_at).toBe('string');

        // Verify UUID format
        expect(asset.id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );

        // Verify datetime format
        expect(asset.created_at).toMatch(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/
        );

        // Verify file type is valid
        expect(['video', 'audio', 'image', 'subtitle']).toContain(
          asset.file_type
        );

        // Verify file size is positive
        expect(asset.file_size).toBeGreaterThan(0);
      }
    });

    it('should filter by folder_path parameter', async () => {
      const folderPath = '/videos/';

      const response = await request(app)
        .get(
          `/api/v1/projects/${validProjectId}/media?folder_path=${encodeURIComponent(folderPath)}`
        )
        .expect(200);

      if (response.body.assets.length > 0) {
        response.body.assets.forEach((asset) => {
          expect(asset.folder_path).toBe(folderPath);
        });
      }
    });

    it('should filter by file_type parameter', async () => {
      const fileType = 'video';

      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}/media?file_type=${fileType}`)
        .expect(200);

      if (response.body.assets.length > 0) {
        response.body.assets.forEach((asset) => {
          expect(asset.file_type).toBe(fileType);
        });
      }
    });

    it('should filter by multiple file types', async () => {
      const response = await request(app)
        .get(
          `/api/v1/projects/${validProjectId}/media?file_type=video&file_type=audio`
        )
        .expect(200);

      if (response.body.assets.length > 0) {
        response.body.assets.forEach((asset) => {
          expect(['video', 'audio']).toContain(asset.file_type);
        });
      }
    });

    it('should search by filename', async () => {
      const searchTerm = 'test';

      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}/media?search=${searchTerm}`)
        .expect(200);

      if (response.body.assets.length > 0) {
        response.body.assets.forEach((asset) => {
          expect(asset.filename.toLowerCase()).toContain(
            searchTerm.toLowerCase()
          );
        });
      }
    });

    it('should respect limit and offset parameters', async () => {
      const limit = 5;
      const offset = 10;

      const response = await request(app)
        .get(
          `/api/v1/projects/${validProjectId}/media?limit=${limit}&offset=${offset}`
        )
        .expect(200);

      expect(response.body.limit).toBe(limit);
      expect(response.body.offset).toBe(offset);
      expect(response.body.assets.length).toBeLessThanOrEqual(limit);
    });

    it('should enforce maximum limit of 100', async () => {
      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}/media?limit=150`)
        .expect(200);

      expect(response.body.limit).toBeLessThanOrEqual(100);
    });

    it('should handle empty results gracefully', async () => {
      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}/media?search=nonexistent`)
        .expect(200);

      expect(response.body.assets).toEqual([]);
      expect(response.body.total).toBe(0);
    });

    it('should return 404 for non-existent project', async () => {
      const response = await request(app)
        .get(`/api/v1/projects/${invalidProjectId}/media`)
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('project not found');
    });

    it('should return 400 for invalid project ID', async () => {
      await request(app).get('/api/v1/projects/invalid-uuid/media').expect(400);
    });

    it('should return 401 for unauthorized request', async () => {
      await request(app)
        .get(`/api/v1/projects/${validProjectId}/media`)
        .expect(401);
    });

    it('should return 403 for insufficient permissions', async () => {
      await request(app)
        .get(`/api/v1/projects/${validProjectId}/media`)
        .set('Authorization', 'Bearer insufficient-permissions-token')
        .expect(403);
    });
  });

  describe('Contract: Get Media Asset', () => {
    const validProjectId = uuidv4();
    const validAssetId = uuidv4();
    const invalidAssetId = uuidv4();

    it('should return detailed media asset information', async () => {
      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}/media/${validAssetId}`)
        .expect(200);

      // Verify response structure matches contract
      expect(response.body).toHaveProperty('id', validAssetId);
      expect(response.body).toHaveProperty('project_id', validProjectId);
      expect(response.body).toHaveProperty('filename');
      expect(response.body).toHaveProperty('file_path');
      expect(response.body).toHaveProperty('cloud_url');
      expect(response.body).toHaveProperty('file_type');
      expect(response.body).toHaveProperty('file_size');
      expect(response.body).toHaveProperty('duration');
      expect(response.body).toHaveProperty('resolution');
      expect(response.body).toHaveProperty('framerate');
      expect(response.body).toHaveProperty('codec');
      expect(response.body).toHaveProperty('thumbnail_url');
      expect(response.body).toHaveProperty('created_at');
      expect(response.body).toHaveProperty('uploaded_by');
      expect(response.body).toHaveProperty('metadata');
      expect(response.body).toHaveProperty('folder_path');

      // Verify data types
      expect(typeof response.body.filename).toBe('string');
      expect(typeof response.body.file_path).toBe('string');
      expect(typeof response.body.cloud_url).toBe('string');
      expect(typeof response.body.file_type).toBe('string');
      expect(typeof response.body.file_size).toBe('number');
      expect(typeof response.body.thumbnail_url).toBe('string');
      expect(typeof response.body.created_at).toBe('string');
      expect(typeof response.body.uploaded_by).toBe('string');
      expect(typeof response.body.metadata).toBe('object');
      expect(typeof response.body.folder_path).toBe('string');

      // Verify UUID formats
      expect(response.body.uploaded_by).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );

      // Verify datetime format
      expect(response.body.created_at).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/
      );

      // Verify file type is valid
      expect(['video', 'audio', 'image', 'subtitle']).toContain(
        response.body.file_type
      );
    });

    it('should handle nullable fields correctly for different file types', async () => {
      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}/media/${validAssetId}`)
        .expect(200);

      const { file_type } = response.body;

      if (file_type === 'video') {
        // Video files should have all media properties
        expect(response.body.duration).not.toBeNull();
        expect(response.body.resolution).not.toBeNull();
        expect(response.body.framerate).not.toBeNull();
        expect(response.body.codec).not.toBeNull();
      } else if (file_type === 'audio') {
        // Audio files should have duration and codec but not video properties
        expect(response.body.duration).not.toBeNull();
        expect(response.body.codec).not.toBeNull();
        expect(response.body.resolution).toBeNull();
        expect(response.body.framerate).toBeNull();
      } else if (file_type === 'image') {
        // Image files should have resolution but not temporal properties
        expect(response.body.resolution).not.toBeNull();
        expect(response.body.duration).toBeNull();
        expect(response.body.framerate).toBeNull();
        expect(response.body.codec).toBeNull();
      } else if (file_type === 'subtitle') {
        // Subtitle files should not have media properties
        expect(response.body.duration).toBeNull();
        expect(response.body.resolution).toBeNull();
        expect(response.body.framerate).toBeNull();
        expect(response.body.codec).toBeNull();
      }
    });

    it('should return 404 for non-existent asset', async () => {
      const response = await request(app)
        .get(`/api/v1/projects/${validProjectId}/media/${invalidAssetId}`)
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('asset not found');
    });

    it('should return 400 for malformed asset ID', async () => {
      await request(app)
        .get(`/api/v1/projects/${validProjectId}/media/invalid-uuid`)
        .expect(400);
    });

    it('should return 401 for unauthorized request', async () => {
      await request(app)
        .get(`/api/v1/projects/${validProjectId}/media/${validAssetId}`)
        .expect(401);
    });

    it('should return 403 for insufficient permissions', async () => {
      await request(app)
        .get(`/api/v1/projects/${validProjectId}/media/${validAssetId}`)
        .set('Authorization', 'Bearer no-access-token')
        .expect(403);
    });
  });

  describe('Contract: Media Folder Operations', () => {
    const validProjectId = uuidv4();

    describe('Create Folder - POST /api/v1/projects/{id}/media/folders', () => {
      it('should create folder and return 201', async () => {
        const folderData = {
          name: 'New Folder',
          parent_path: '/',
        };

        const response = await request(app)
          .post(`/api/v1/projects/${validProjectId}/media/folders`)
          .send(folderData)
          .expect(201);

        expect(response.body).toHaveProperty('path');
        expect(response.body).toHaveProperty('name', 'New Folder');
        expect(response.body).toHaveProperty('created_at');

        expect(typeof response.body.path).toBe('string');
        expect(typeof response.body.created_at).toBe('string');

        // Verify datetime format
        expect(response.body.created_at).toMatch(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/
        );

        // Verify path construction
        expect(response.body.path).toBe('/New Folder/');
      });

      it('should create nested folder', async () => {
        const folderData = {
          name: 'Subfolder',
          parent_path: '/videos/',
        };

        const response = await request(app)
          .post(`/api/v1/projects/${validProjectId}/media/folders`)
          .send(folderData)
          .expect(201);

        expect(response.body.path).toBe('/videos/Subfolder/');
      });

      it('should default to root parent path when not specified', async () => {
        const folderData = {
          name: 'Root Folder',
        };

        const response = await request(app)
          .post(`/api/v1/projects/${validProjectId}/media/folders`)
          .send(folderData)
          .expect(201);

        expect(response.body.path).toBe('/Root Folder/');
      });

      it('should return 400 for missing name', async () => {
        const folderData = {
          parent_path: '/',
        };

        await request(app)
          .post(`/api/v1/projects/${validProjectId}/media/folders`)
          .send(folderData)
          .expect(400);
      });
    });

    describe('List Folders - GET /api/v1/projects/{id}/media/folders', () => {
      it('should return folders list', async () => {
        const response = await request(app)
          .get(`/api/v1/projects/${validProjectId}/media/folders`)
          .expect(200);

        expect(response.body).toHaveProperty('folders');
        expect(Array.isArray(response.body.folders)).toBe(true);

        if (response.body.folders.length > 0) {
          const folder = response.body.folders[0];

          expect(folder).toHaveProperty('path');
          expect(folder).toHaveProperty('name');
          expect(folder).toHaveProperty('asset_count');
          expect(folder).toHaveProperty('created_at');

          expect(typeof folder.path).toBe('string');
          expect(typeof folder.name).toBe('string');
          expect(typeof folder.asset_count).toBe('number');
          expect(typeof folder.created_at).toBe('string');

          expect(folder.asset_count).toBeGreaterThanOrEqual(0);
        }
      });

      it('should filter by parent_path parameter', async () => {
        const parentPath = '/videos/';

        const response = await request(app)
          .get(
            `/api/v1/projects/${validProjectId}/media/folders?parent_path=${encodeURIComponent(parentPath)}`
          )
          .expect(200);

        if (response.body.folders.length > 0) {
          response.body.folders.forEach((folder) => {
            expect(folder.path).toMatch(
              new RegExp(
                `^${parentPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`
              )
            );
          });
        }
      });
    });
  });

  describe('Contract: Generate Thumbnail', () => {
    const validProjectId = uuidv4();
    const validAssetId = uuidv4();

    it('should generate thumbnail and return URL', async () => {
      const response = await request(app)
        .post(
          `/api/v1/projects/${validProjectId}/media/${validAssetId}/thumbnail`
        )
        .send({})
        .expect(200);

      expect(response.body).toHaveProperty('thumbnail_url');
      expect(typeof response.body.thumbnail_url).toBe('string');
      expect(response.body.thumbnail_url).toMatch(/^https?:\/\//);
    });

    it('should generate thumbnail at specific time', async () => {
      const thumbnailData = {
        time: 30.5, // 30.5 seconds
      };

      const response = await request(app)
        .post(
          `/api/v1/projects/${validProjectId}/media/${validAssetId}/thumbnail`
        )
        .send(thumbnailData)
        .expect(200);

      expect(response.body.thumbnail_url).toBeTruthy();
    });

    it('should return 400 for invalid time parameter', async () => {
      const thumbnailData = {
        time: -5, // Negative time
      };

      await request(app)
        .post(
          `/api/v1/projects/${validProjectId}/media/${validAssetId}/thumbnail`
        )
        .send(thumbnailData)
        .expect(400);
    });
  });
});
