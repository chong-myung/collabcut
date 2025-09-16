/**
 * Contract Tests: Timeline Management API
 * GET /api/v1/projects/{id}/timeline/sequences/{id}
 *
 * These tests verify that the API contract matches the specification
 * defined in specs/001-collabcut-is-a/contracts/timeline-api.md
 */

const request = require('supertest');
const { v4: uuidv4 } = require('uuid');

// Mock Express app - This doesn't exist yet, hence tests will fail (RED phase)
const app = require('../../../main/src/app'); // This will fail until implemented

describe('Timeline Management API - GET /api/v1/projects/{id}/timeline/sequences/{id}', () => {
  describe('Contract: Get Timeline Sequence', () => {
    const validProjectId = uuidv4();
    const validSequenceId = uuidv4();
    const invalidProjectId = uuidv4();
    const invalidSequenceId = uuidv4();

    it('should return detailed sequence information with tracks and clips', async () => {
      const response = await request(app)
        .get(
          `/api/v1/projects/${validProjectId}/timeline/sequences/${validSequenceId}`
        )
        .expect(200);

      // Verify response structure matches contract
      expect(response.body).toHaveProperty('id', validSequenceId);
      expect(response.body).toHaveProperty('project_id', validProjectId);
      expect(response.body).toHaveProperty('name');
      expect(response.body).toHaveProperty('duration');
      expect(response.body).toHaveProperty('framerate');
      expect(response.body).toHaveProperty('resolution');
      expect(response.body).toHaveProperty('created_at');
      expect(response.body).toHaveProperty('created_by');
      expect(response.body).toHaveProperty('settings');
      expect(response.body).toHaveProperty('tracks');

      // Verify data types
      expect(typeof response.body.name).toBe('string');
      expect(typeof response.body.duration).toBe('number');
      expect(typeof response.body.framerate).toBe('number');
      expect(typeof response.body.resolution).toBe('string');
      expect(typeof response.body.created_at).toBe('string');
      expect(typeof response.body.created_by).toBe('string');
      expect(typeof response.body.settings).toBe('object');
      expect(Array.isArray(response.body.tracks)).toBe(true);

      // Verify UUID formats
      expect(response.body.created_by).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );

      // Verify datetime format
      expect(response.body.created_at).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/
      );

      // Verify resolution format
      expect(response.body.resolution).toMatch(/^\d+x\d+$/);

      // Verify framerate is positive
      expect(response.body.framerate).toBeGreaterThan(0);

      // Verify duration is non-negative
      expect(response.body.duration).toBeGreaterThanOrEqual(0);
    });

    it('should return tracks with correct structure', async () => {
      const response = await request(app)
        .get(
          `/api/v1/projects/${validProjectId}/timeline/sequences/${validSequenceId}`
        )
        .expect(200);

      if (response.body.tracks.length > 0) {
        const track = response.body.tracks[0];

        // Verify track structure
        expect(track).toHaveProperty('id');
        expect(track).toHaveProperty('track_type');
        expect(track).toHaveProperty('track_index');
        expect(track).toHaveProperty('name');
        expect(track).toHaveProperty('enabled');
        expect(track).toHaveProperty('locked');
        expect(track).toHaveProperty('clips');

        // Verify track data types
        expect(typeof track.id).toBe('string');
        expect(typeof track.track_type).toBe('string');
        expect(typeof track.track_index).toBe('number');
        expect(typeof track.name).toBe('string');
        expect(typeof track.enabled).toBe('boolean');
        expect(typeof track.locked).toBe('boolean');
        expect(Array.isArray(track.clips)).toBe(true);

        // Verify track UUID format
        expect(track.id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );

        // Verify track type is valid
        expect(['video', 'audio', 'subtitle']).toContain(track.track_type);

        // Verify track index is non-negative
        expect(track.track_index).toBeGreaterThanOrEqual(0);
      }
    });

    it('should return clips with correct structure', async () => {
      const response = await request(app)
        .get(
          `/api/v1/projects/${validProjectId}/timeline/sequences/${validSequenceId}`
        )
        .expect(200);

      // Find a track with clips
      const trackWithClips = response.body.tracks.find(
        (track) => track.clips.length > 0
      );

      if (trackWithClips) {
        const clip = trackWithClips.clips[0];

        // Verify clip structure
        expect(clip).toHaveProperty('id');
        expect(clip).toHaveProperty('media_asset_id');
        expect(clip).toHaveProperty('start_time');
        expect(clip).toHaveProperty('end_time');
        expect(clip).toHaveProperty('media_in');
        expect(clip).toHaveProperty('media_out');
        expect(clip).toHaveProperty('name');

        // Verify clip data types
        expect(typeof clip.id).toBe('string');
        expect(typeof clip.media_asset_id).toBe('string');
        expect(typeof clip.start_time).toBe('number');
        expect(typeof clip.end_time).toBe('number');
        expect(typeof clip.media_in).toBe('number');
        expect(typeof clip.media_out).toBe('number');
        expect(typeof clip.name).toBe('string');

        // Verify UUID formats
        expect(clip.id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );
        expect(clip.media_asset_id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );

        // Verify time values are non-negative
        expect(clip.start_time).toBeGreaterThanOrEqual(0);
        expect(clip.end_time).toBeGreaterThan(clip.start_time);
        expect(clip.media_in).toBeGreaterThanOrEqual(0);
        expect(clip.media_out).toBeGreaterThan(clip.media_in);
      }
    });

    it('should return tracks ordered by track_index', async () => {
      const response = await request(app)
        .get(
          `/api/v1/projects/${validProjectId}/timeline/sequences/${validSequenceId}`
        )
        .expect(200);

      if (response.body.tracks.length > 1) {
        for (let i = 1; i < response.body.tracks.length; i++) {
          expect(response.body.tracks[i].track_index).toBeGreaterThanOrEqual(
            response.body.tracks[i - 1].track_index
          );
        }
      }
    });

    it('should return clips ordered by start_time within tracks', async () => {
      const response = await request(app)
        .get(
          `/api/v1/projects/${validProjectId}/timeline/sequences/${validSequenceId}`
        )
        .expect(200);

      response.body.tracks.forEach((track) => {
        if (track.clips.length > 1) {
          for (let i = 1; i < track.clips.length; i++) {
            expect(track.clips[i].start_time).toBeGreaterThanOrEqual(
              track.clips[i - 1].start_time
            );
          }
        }
      });
    });

    it('should handle empty sequence with no tracks', async () => {
      const response = await request(app)
        .get(
          `/api/v1/projects/${validProjectId}/timeline/sequences/${validSequenceId}`
        )
        .expect(200);

      // Empty sequence should still have valid structure
      expect(response.body.tracks).toEqual([]);
      expect(response.body.duration).toBe(0);
    });

    it('should handle tracks with no clips', async () => {
      const response = await request(app)
        .get(
          `/api/v1/projects/${validProjectId}/timeline/sequences/${validSequenceId}`
        )
        .expect(200);

      response.body.tracks.forEach((track) => {
        // Each track should have clips array even if empty
        expect(Array.isArray(track.clips)).toBe(true);
      });
    });

    it('should return 404 for non-existent sequence', async () => {
      const response = await request(app)
        .get(
          `/api/v1/projects/${validProjectId}/timeline/sequences/${invalidSequenceId}`
        )
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('sequence not found');
    });

    it('should return 404 for non-existent project', async () => {
      const response = await request(app)
        .get(
          `/api/v1/projects/${invalidProjectId}/timeline/sequences/${validSequenceId}`
        )
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('project not found');
    });

    it('should return 400 for malformed sequence ID', async () => {
      await request(app)
        .get(
          `/api/v1/projects/${validProjectId}/timeline/sequences/invalid-uuid`
        )
        .expect(400);
    });

    it('should return 400 for malformed project ID', async () => {
      await request(app)
        .get(
          `/api/v1/projects/invalid-uuid/timeline/sequences/${validSequenceId}`
        )
        .expect(400);
    });

    it('should return 401 for unauthorized request', async () => {
      // Request without authentication header
      await request(app)
        .get(
          `/api/v1/projects/${validProjectId}/timeline/sequences/${validSequenceId}`
        )
        .expect(401);
    });

    it('should return 403 for insufficient permissions', async () => {
      // Request with insufficient permissions
      await request(app)
        .get(
          `/api/v1/projects/${validProjectId}/timeline/sequences/${validSequenceId}`
        )
        .set('Authorization', 'Bearer no-access-token')
        .expect(403);
    });
  });

  describe('Contract: Clip Operations', () => {
    const validProjectId = uuidv4();
    const validSequenceId = uuidv4();
    const validTrackId = uuidv4();
    const validMediaAssetId = uuidv4();
    const validClipId = uuidv4();

    describe('Add Clip to Timeline - POST /api/v1/projects/{id}/timeline/sequences/{id}/clips', () => {
      it('should add clip and return 201 with clip details', async () => {
        const clipData = {
          track_id: validTrackId,
          media_asset_id: validMediaAssetId,
          start_time: 10.5,
          end_time: 20.5,
          media_in: 5.0,
          media_out: 15.0,
          name: 'Test Clip',
        };

        const response = await request(app)
          .post(
            `/api/v1/projects/${validProjectId}/timeline/sequences/${validSequenceId}/clips`
          )
          .send(clipData)
          .expect(201);

        // Verify response structure matches contract
        expect(response.body).toHaveProperty('id');
        expect(response.body).toHaveProperty('track_id', validTrackId);
        expect(response.body).toHaveProperty(
          'media_asset_id',
          validMediaAssetId
        );
        expect(response.body).toHaveProperty('start_time', 10.5);
        expect(response.body).toHaveProperty('end_time', 20.5);
        expect(response.body).toHaveProperty('media_in', 5.0);
        expect(response.body).toHaveProperty('media_out', 15.0);
        expect(response.body).toHaveProperty('name', 'Test Clip');
        expect(response.body).toHaveProperty('enabled');
        expect(response.body).toHaveProperty('locked');
        expect(response.body).toHaveProperty('opacity');
        expect(response.body).toHaveProperty('speed');
        expect(response.body).toHaveProperty('created_at');
        expect(response.body).toHaveProperty('created_by');

        // Verify data types
        expect(typeof response.body.id).toBe('string');
        expect(typeof response.body.enabled).toBe('boolean');
        expect(typeof response.body.locked).toBe('boolean');
        expect(typeof response.body.opacity).toBe('number');
        expect(typeof response.body.speed).toBe('number');
        expect(typeof response.body.created_at).toBe('string');
        expect(typeof response.body.created_by).toBe('string');

        // Verify UUID format
        expect(response.body.id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );
        expect(response.body.created_by).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );

        // Verify default values
        expect(response.body.enabled).toBe(true);
        expect(response.body.locked).toBe(false);
        expect(response.body.opacity).toBe(1.0);
        expect(response.body.speed).toBe(1.0);
      });

      it('should add clip without optional name', async () => {
        const clipData = {
          track_id: validTrackId,
          media_asset_id: validMediaAssetId,
          start_time: 0,
          end_time: 10,
          media_in: 0,
          media_out: 10,
        };

        const response = await request(app)
          .post(
            `/api/v1/projects/${validProjectId}/timeline/sequences/${validSequenceId}/clips`
          )
          .send(clipData)
          .expect(201);

        expect(response.body.name).toBeTruthy(); // Should have a default name
      });

      it('should return 400 for missing required fields', async () => {
        const invalidClipData = {
          track_id: validTrackId,
          // Missing media_asset_id, start_time, end_time, media_in, media_out
        };

        await request(app)
          .post(
            `/api/v1/projects/${validProjectId}/timeline/sequences/${validSequenceId}/clips`
          )
          .send(invalidClipData)
          .expect(400);
      });

      it('should return 400 for invalid time values', async () => {
        const clipData = {
          track_id: validTrackId,
          media_asset_id: validMediaAssetId,
          start_time: 20, // start_time > end_time
          end_time: 10,
          media_in: 0,
          media_out: 10,
        };

        await request(app)
          .post(
            `/api/v1/projects/${validProjectId}/timeline/sequences/${validSequenceId}/clips`
          )
          .send(clipData)
          .expect(400);
      });
    });

    describe('Update Clip - PUT /api/v1/projects/{id}/timeline/clips/{id}', () => {
      it('should update clip properties and return 200', async () => {
        const updateData = {
          start_time: 15.0,
          end_time: 25.0,
          name: 'Updated Clip Name',
          enabled: false,
          opacity: 0.8,
          speed: 1.5,
        };

        const response = await request(app)
          .put(
            `/api/v1/projects/${validProjectId}/timeline/clips/${validClipId}`
          )
          .send(updateData)
          .expect(200);

        expect(response.body.start_time).toBe(15.0);
        expect(response.body.end_time).toBe(25.0);
        expect(response.body.name).toBe('Updated Clip Name');
        expect(response.body.enabled).toBe(false);
        expect(response.body.opacity).toBe(0.8);
        expect(response.body.speed).toBe(1.5);
      });

      it('should validate opacity range (0.0-1.0)', async () => {
        const updateData = {
          opacity: 1.5, // Invalid: > 1.0
        };

        await request(app)
          .put(
            `/api/v1/projects/${validProjectId}/timeline/clips/${validClipId}`
          )
          .send(updateData)
          .expect(400);
      });

      it('should validate positive speed', async () => {
        const updateData = {
          speed: -0.5, // Invalid: negative
        };

        await request(app)
          .put(
            `/api/v1/projects/${validProjectId}/timeline/clips/${validClipId}`
          )
          .send(updateData)
          .expect(400);
      });
    });

    describe('Delete Clip - DELETE /api/v1/projects/{id}/timeline/clips/{id}', () => {
      it('should delete clip and return 204', async () => {
        const response = await request(app)
          .delete(
            `/api/v1/projects/${validProjectId}/timeline/clips/${validClipId}`
          )
          .expect(204);

        expect(response.body).toEqual({});
      });

      it('should return 404 for non-existent clip', async () => {
        const invalidClipId = uuidv4();

        await request(app)
          .delete(
            `/api/v1/projects/${validProjectId}/timeline/clips/${invalidClipId}`
          )
          .expect(404);
      });
    });
  });
});
