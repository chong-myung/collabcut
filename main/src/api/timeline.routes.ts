/**
 * Timeline API Routes (T037)
 * HTTP endpoints for timeline operations
 * Handles Sequence, Track, Clip operations and timeline editing
 */

import { Router, Request, Response } from 'express';
import { TimelineService, CreateTrackData } from '../services/timeline.service';
import { ProjectService } from '../services/project.service';
import { databaseService } from '../services/database.service';
import {
  CreateTimelineSequenceData,
  UpdateTimelineSequenceData,
} from '../models/timeline-sequence';
import { CreateClipData, UpdateClipData } from '../models/clip';
import { TrackType } from '../../../shared/types/database';

// Initialize services
const timelineService = new TimelineService(databaseService);
const projectService = new ProjectService(databaseService);

const router = Router();

/**
 * Middleware to validate user authentication
 */
const authenticateUser = (req: Request, res: Response, next: Function) => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
    });
  }
  req.user = { id: userId };
  next();
};

/**
 * Middleware to validate project access
 */
const validateProjectAccess = async (
  req: Request,
  res: Response,
  next: Function
) => {
  try {
    const projectId = req.params.projectId;
    const userId = req.user.id;

    const accessResult = await projectService.checkProjectAccess(
      projectId,
      userId
    );
    if (!accessResult.success || !accessResult.data) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to validate access',
    });
  }
};

/**
 * POST /api/v1/projects/:projectId/timeline/sequences
 * Create a new timeline sequence
 */
router.post(
  '/:projectId/timeline/sequences',
  authenticateUser,
  validateProjectAccess,
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId;
      const { name, framerate, resolution, settings } = req.body;

      // Validate required fields
      if (!name || !framerate || !resolution) {
        return res.status(400).json({
          success: false,
          error: 'Name, framerate, and resolution are required',
        });
      }

      const sequenceData: CreateTimelineSequenceData = {
        project_id: projectId,
        name,
        framerate,
        resolution,
        created_by: req.user.id,
        settings,
      };

      const result = await timelineService.createSequence(sequenceData);

      if (result.success) {
        res.status(201).json({
          success: true,
          data: result.data,
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error('Create sequence error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * GET /api/v1/projects/:projectId/timeline/sequences
 * Get timeline sequences for project
 */
router.get(
  '/:projectId/timeline/sequences',
  authenticateUser,
  validateProjectAccess,
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId;

      const sequences = await databaseService.all(
        `
      SELECT * FROM timeline_sequences
      WHERE project_id = ?
      ORDER BY created_at DESC
    `,
        [projectId]
      );

      const mappedSequences = sequences.map((row: any) => ({
        id: row.id,
        project_id: row.project_id,
        name: row.name,
        duration: row.duration,
        framerate: row.framerate,
        resolution: row.resolution,
        created_by: row.created_by,
        settings: JSON.parse(row.settings || '{}'),
        created_at: new Date(row.created_at),
      }));

      res.json({
        success: true,
        data: mappedSequences,
      });
    } catch (error) {
      console.error('Get sequences error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * GET /api/v1/projects/:projectId/timeline/sequences/:sequenceId
 * Get specific timeline sequence with tracks
 */
router.get(
  '/:projectId/timeline/sequences/:sequenceId',
  authenticateUser,
  validateProjectAccess,
  async (req: Request, res: Response) => {
    try {
      const sequenceId = req.params.sequenceId;
      const result = await timelineService.getSequenceWithTracks(sequenceId);

      if (result.success) {
        res.json({
          success: true,
          data: result.data,
        });
      } else {
        res.status(404).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error('Get sequence error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * PUT /api/v1/projects/:projectId/timeline/sequences/:sequenceId
 * Update timeline sequence
 */
router.put(
  '/:projectId/timeline/sequences/:sequenceId',
  authenticateUser,
  validateProjectAccess,
  async (req: Request, res: Response) => {
    try {
      const sequenceId = req.params.sequenceId;
      const { name, duration, framerate, resolution, settings } = req.body;

      const updateData: UpdateTimelineSequenceData = {
        name,
        duration,
        framerate,
        resolution,
        settings,
      };

      // Update sequence using database service directly
      const updates: string[] = [];
      const values: any[] = [];

      if (updateData.name !== undefined) {
        updates.push('name = ?');
        values.push(updateData.name);
      }
      if (updateData.duration !== undefined) {
        updates.push('duration = ?');
        values.push(updateData.duration);
      }
      if (updateData.framerate !== undefined) {
        updates.push('framerate = ?');
        values.push(updateData.framerate);
      }
      if (updateData.resolution !== undefined) {
        updates.push('resolution = ?');
        values.push(updateData.resolution);
      }
      if (updateData.settings !== undefined) {
        updates.push('settings = ?');
        values.push(JSON.stringify(updateData.settings));
      }

      if (updates.length > 0) {
        values.push(sequenceId);
        await databaseService.run(
          `UPDATE timeline_sequences SET ${updates.join(', ')} WHERE id = ?`,
          values
        );
      }

      // Get updated sequence
      const updatedSequence =
        await timelineService.getSequenceWithTracks(sequenceId);
      res.json({
        success: true,
        data: updatedSequence.data,
      });
    } catch (error) {
      console.error('Update sequence error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * DELETE /api/v1/projects/:projectId/timeline/sequences/:sequenceId
 * Delete timeline sequence
 */
router.delete(
  '/:projectId/timeline/sequences/:sequenceId',
  authenticateUser,
  validateProjectAccess,
  async (req: Request, res: Response) => {
    try {
      const sequenceId = req.params.sequenceId;

      // Check if user has permission to delete
      const hasPermission = await projectService.checkProjectPermission(
        req.params.projectId,
        req.user.id,
        ['owner', 'editor']
      );

      if (!hasPermission.success || !hasPermission.data) {
        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
        });
      }

      // Delete sequence (this will cascade to tracks and clips)
      await databaseService.run('DELETE FROM timeline_sequences WHERE id = ?', [
        sequenceId,
      ]);

      res.json({
        success: true,
        message: 'Timeline sequence deleted successfully',
      });
    } catch (error) {
      console.error('Delete sequence error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * POST /api/v1/projects/:projectId/timeline/sequences/:sequenceId/tracks
 * Create a new track in sequence
 */
router.post(
  '/:projectId/timeline/sequences/:sequenceId/tracks',
  authenticateUser,
  validateProjectAccess,
  async (req: Request, res: Response) => {
    try {
      const sequenceId = req.params.sequenceId;
      const { track_type, name, track_index, enabled, locked, height } =
        req.body;

      // Validate required fields
      if (!track_type || !name) {
        return res.status(400).json({
          success: false,
          error: 'Track type and name are required',
        });
      }

      // Validate track type
      if (!Object.values(TrackType).includes(track_type)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid track type',
        });
      }

      const trackData: CreateTrackData = {
        sequence_id: sequenceId,
        track_type,
        name,
        track_index,
        enabled,
        locked,
        height,
      };

      const result = await timelineService.createTrack(trackData);

      if (result.success) {
        res.status(201).json({
          success: true,
          data: result.data,
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error('Create track error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * GET /api/v1/projects/:projectId/timeline/sequences/:sequenceId/tracks
 * Get tracks for sequence
 */
router.get(
  '/:projectId/timeline/sequences/:sequenceId/tracks',
  authenticateUser,
  validateProjectAccess,
  async (req: Request, res: Response) => {
    try {
      const sequenceId = req.params.sequenceId;
      const result = await timelineService.getSequenceTracks(sequenceId);

      if (result.success) {
        res.json({
          success: true,
          data: result.data,
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error('Get tracks error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * PUT /api/v1/projects/:projectId/timeline/tracks/:trackId
 * Update track properties
 */
router.put(
  '/:projectId/timeline/tracks/:trackId',
  authenticateUser,
  validateProjectAccess,
  async (req: Request, res: Response) => {
    try {
      const trackId = req.params.trackId;
      const updates = req.body;

      const result = await timelineService.updateTrack(trackId, updates);

      if (result.success) {
        res.json({
          success: true,
          message: 'Track updated successfully',
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error('Update track error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * DELETE /api/v1/projects/:projectId/timeline/tracks/:trackId
 * Delete track and all its clips
 */
router.delete(
  '/:projectId/timeline/tracks/:trackId',
  authenticateUser,
  validateProjectAccess,
  async (req: Request, res: Response) => {
    try {
      const trackId = req.params.trackId;

      // Check if user has permission to delete
      const hasPermission = await projectService.checkProjectPermission(
        req.params.projectId,
        req.user.id,
        ['owner', 'editor']
      );

      if (!hasPermission.success || !hasPermission.data) {
        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
        });
      }

      const result = await timelineService.deleteTrack(trackId);

      if (result.success) {
        res.json({
          success: true,
          message: 'Track deleted successfully',
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error('Delete track error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * POST /api/v1/projects/:projectId/timeline/tracks/:trackId/clips
 * Add clip to track
 */
router.post(
  '/:projectId/timeline/tracks/:trackId/clips',
  authenticateUser,
  validateProjectAccess,
  async (req: Request, res: Response) => {
    try {
      const trackId = req.params.trackId;
      const {
        media_asset_id,
        start_time,
        end_time,
        media_in,
        media_out,
        name,
      } = req.body;

      // Validate required fields
      if (
        !media_asset_id ||
        start_time === undefined ||
        end_time === undefined ||
        media_in === undefined ||
        media_out === undefined ||
        !name
      ) {
        return res.status(400).json({
          success: false,
          error: 'All clip properties are required',
        });
      }

      const clipData: CreateClipData = {
        track_id: trackId,
        media_asset_id,
        start_time,
        end_time,
        media_in,
        media_out,
        name,
        created_by: req.user.id,
      };

      const result = await timelineService.addClip(clipData);

      if (result.success) {
        res.status(201).json({
          success: true,
          data: result.data,
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error('Add clip error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * GET /api/v1/projects/:projectId/timeline/tracks/:trackId/clips
 * Get clips for track
 */
router.get(
  '/:projectId/timeline/tracks/:trackId/clips',
  authenticateUser,
  validateProjectAccess,
  async (req: Request, res: Response) => {
    try {
      const trackId = req.params.trackId;
      const options = {
        limit: req.query.limit
          ? parseInt(req.query.limit as string)
          : undefined,
        offset: req.query.offset
          ? parseInt(req.query.offset as string)
          : undefined,
      };

      const result = await timelineService.getTrackClips(trackId, options);

      if (result.success) {
        res.json({
          success: true,
          data: result.data,
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error('Get track clips error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * PUT /api/v1/projects/:projectId/timeline/clips/:clipId
 * Update clip properties
 */
router.put(
  '/:projectId/timeline/clips/:clipId',
  authenticateUser,
  validateProjectAccess,
  async (req: Request, res: Response) => {
    try {
      const clipId = req.params.clipId;
      const {
        start_time,
        end_time,
        media_in,
        media_out,
        name,
        enabled,
        locked,
        opacity,
        speed,
      } = req.body;

      const updateData: UpdateClipData = {
        start_time,
        end_time,
        media_in,
        media_out,
        name,
        enabled,
        locked,
        opacity,
        speed,
      };

      const result = await timelineService.trimClip(
        clipId,
        start_time,
        end_time
      );

      if (result.success) {
        res.json({
          success: true,
          message: 'Clip updated successfully',
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error('Update clip error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * POST /api/v1/projects/:projectId/timeline/clips/:clipId/move
 * Move clip to new position/track
 */
router.post(
  '/:projectId/timeline/clips/:clipId/move',
  authenticateUser,
  validateProjectAccess,
  async (req: Request, res: Response) => {
    try {
      const clipId = req.params.clipId;
      const { new_start_time, new_track_id } = req.body;

      if (new_start_time === undefined) {
        return res.status(400).json({
          success: false,
          error: 'New start time is required',
        });
      }

      const result = await timelineService.moveClip(
        clipId,
        new_start_time,
        new_track_id
      );

      if (result.success) {
        res.json({
          success: true,
          data: result.data,
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error('Move clip error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * POST /api/v1/projects/:projectId/timeline/clips/:clipId/split
 * Split clip at specified time
 */
router.post(
  '/:projectId/timeline/clips/:clipId/split',
  authenticateUser,
  validateProjectAccess,
  async (req: Request, res: Response) => {
    try {
      const clipId = req.params.clipId;
      const { split_time } = req.body;

      if (split_time === undefined) {
        return res.status(400).json({
          success: false,
          error: 'Split time is required',
        });
      }

      const result = await timelineService.splitClip(
        clipId,
        split_time,
        req.user.id
      );

      if (result.success) {
        res.json({
          success: true,
          data: result.data,
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error('Split clip error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * DELETE /api/v1/projects/:projectId/timeline/clips/:clipId
 * Delete clip from timeline
 */
router.delete(
  '/:projectId/timeline/clips/:clipId',
  authenticateUser,
  validateProjectAccess,
  async (req: Request, res: Response) => {
    try {
      const clipId = req.params.clipId;

      // Check if user has permission to delete
      const hasPermission = await projectService.checkProjectPermission(
        req.params.projectId,
        req.user.id,
        ['owner', 'editor']
      );

      if (!hasPermission.success || !hasPermission.data) {
        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
        });
      }

      const result = await timelineService.deleteClip(clipId);

      if (result.success) {
        res.json({
          success: true,
          message: 'Clip deleted successfully',
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error('Delete clip error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * GET /api/v1/projects/:projectId/timeline/sequences/:sequenceId/clips
 * Get clips in time range for sequence
 */
router.get(
  '/:projectId/timeline/sequences/:sequenceId/clips',
  authenticateUser,
  validateProjectAccess,
  async (req: Request, res: Response) => {
    try {
      const sequenceId = req.params.sequenceId;
      const startTime = req.query.start_time
        ? parseFloat(req.query.start_time as string)
        : 0;
      const endTime = req.query.end_time
        ? parseFloat(req.query.end_time as string)
        : Number.MAX_SAFE_INTEGER;

      const result = await timelineService.getClipsInRange(
        sequenceId,
        startTime,
        endTime
      );

      if (result.success) {
        res.json({
          success: true,
          data: result.data,
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error('Get clips in range error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * PUT /api/v1/projects/:projectId/timeline/sequences/:sequenceId/tracks/reorder
 * Reorder tracks in sequence
 */
router.put(
  '/:projectId/timeline/sequences/:sequenceId/tracks/reorder',
  authenticateUser,
  validateProjectAccess,
  async (req: Request, res: Response) => {
    try {
      const sequenceId = req.params.sequenceId;
      const { track_ids } = req.body;

      if (!Array.isArray(track_ids)) {
        return res.status(400).json({
          success: false,
          error: 'Track IDs array is required',
        });
      }

      const result = await timelineService.reorderTracks(sequenceId, track_ids);

      if (result.success) {
        res.json({
          success: true,
          message: 'Tracks reordered successfully',
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error('Reorder tracks error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      user: {
        id: string;
      };
    }
  }
}

export default router;
