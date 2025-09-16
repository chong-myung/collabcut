/**
 * Timeline Service (T033)
 * Timeline editing operations and sequence management
 * Handles tracks, clips, transitions, and timeline manipulation
 */

import {
  TimelineSequenceModel,
  TimelineSequence,
  CreateTimelineSequenceData,
  UpdateTimelineSequenceData,
  TimelineSequenceWithTracks,
} from '../models/timeline-sequence';
import {
  ClipModel,
  Clip,
  CreateClipData,
  UpdateClipData,
  ClipWithMedia,
  ClipCollision,
} from '../models/clip';
import { MediaAssetModel } from '../models/media-asset';
import { DatabaseService, databaseService } from './database.service';
import {
  DatabaseResult,
  TrackType,
  PaginationOptions,
} from '../../../shared/types/database';

export interface Track {
  id: string;
  sequence_id: string;
  track_type: TrackType;
  track_index: number;
  name: string;
  enabled: boolean;
  locked: boolean;
  height: number;
  created_at: Date;
}

export interface CreateTrackData {
  sequence_id: string;
  track_type: TrackType;
  name: string;
  track_index?: number;
  enabled?: boolean;
  locked?: boolean;
  height?: number;
}

export interface TrackWithClips extends Track {
  clips: ClipWithMedia[];
  clip_count: number;
  total_duration: number;
}

export interface TimelineEdit {
  type: 'insert' | 'delete' | 'move' | 'trim' | 'split';
  clip_id?: string;
  track_id?: string;
  position: number;
  data: any;
  timestamp: Date;
  user_id: string;
}

export interface TimelineRenderOptions {
  start_time: number;
  end_time: number;
  resolution: string;
  framerate: number;
  format: string;
  quality: 'draft' | 'preview' | 'final';
}

export interface ClipOperation {
  clip_id: string;
  operation: 'cut' | 'copy' | 'paste' | 'delete';
  new_position?: number;
  new_track_id?: string;
  new_duration?: number;
}

/**
 * Timeline Service Class
 * Handles timeline editing operations, track management, and clip manipulation
 */
export class TimelineService {
  private sequenceModel: TimelineSequenceModel;
  private clipModel: ClipModel;
  private mediaModel: MediaAssetModel;
  private db: DatabaseService;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService;
    this.sequenceModel = new TimelineSequenceModel(
      databaseService.getDatabase()!
    );
    this.clipModel = new ClipModel(databaseService.getDatabase()!);
    this.mediaModel = new MediaAssetModel(databaseService.getDatabase()!);
  }

  /**
   * Create a new timeline sequence
   * @param data - Sequence creation data
   * @returns Promise with created sequence
   */
  async createSequence(
    data: CreateTimelineSequenceData
  ): Promise<DatabaseResult<TimelineSequence>> {
    try {
      const result = await this.db.transaction(async () => {
        // Create sequence
        const sequenceResult = await this.sequenceModel.create(data);
        if (!sequenceResult.success || !sequenceResult.data) {
          throw new Error(sequenceResult.error || 'Failed to create sequence');
        }

        const sequence = sequenceResult.data;

        // Create default tracks (1 video, 2 audio)
        await this.createTrack({
          sequence_id: sequence.id,
          track_type: TrackType.VIDEO,
          name: 'Video 1',
          track_index: 0,
        });

        await this.createTrack({
          sequence_id: sequence.id,
          track_type: TrackType.AUDIO,
          name: 'Audio 1',
          track_index: 0,
        });

        await this.createTrack({
          sequence_id: sequence.id,
          track_type: TrackType.AUDIO,
          name: 'Audio 2',
          track_index: 1,
        });

        return sequence;
      });

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get timeline sequence with tracks and clips
   * @param sequenceId - Sequence ID
   * @returns Promise with sequence and tracks
   */
  async getSequenceWithTracks(
    sequenceId: string
  ): Promise<DatabaseResult<TimelineSequenceWithTracks>> {
    try {
      const sequenceResult =
        await this.sequenceModel.findWithTracks(sequenceId);
      if (!sequenceResult.success || !sequenceResult.data) {
        return sequenceResult;
      }

      return { success: true, data: sequenceResult.data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Create a new track
   * @param data - Track creation data
   * @returns Promise with created track
   */
  async createTrack(data: CreateTrackData): Promise<DatabaseResult<Track>> {
    try {
      const trackId = this.db.generateId('track');
      const now = new Date();

      // Get next track index if not specified
      let trackIndex = data.track_index;
      if (trackIndex === undefined) {
        const maxIndexResult = await this.db.get<{ max_index: number | null }>(
          'SELECT MAX(track_index) as max_index FROM tracks WHERE sequence_id = ? AND track_type = ?',
          [data.sequence_id, data.track_type]
        );
        trackIndex = (maxIndexResult?.max_index ?? -1) + 1;
      }

      await this.db.run(
        `
        INSERT INTO tracks (
          id, sequence_id, track_type, track_index, name, enabled, locked, height, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          trackId,
          data.sequence_id,
          data.track_type,
          trackIndex,
          data.name,
          data.enabled !== false ? 1 : 0,
          data.locked === true ? 1 : 0,
          data.height || 100,
          now.toISOString(),
        ]
      );

      const track: Track = {
        id: trackId,
        sequence_id: data.sequence_id,
        track_type: data.track_type,
        track_index: trackIndex,
        name: data.name,
        enabled: data.enabled !== false,
        locked: data.locked === true,
        height: data.height || 100,
        created_at: now,
      };

      return { success: true, data: track };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get tracks for a sequence
   * @param sequenceId - Sequence ID
   * @returns Promise with tracks array
   */
  async getSequenceTracks(
    sequenceId: string
  ): Promise<DatabaseResult<Track[]>> {
    try {
      const tracks = await this.db.all(
        `
        SELECT * FROM tracks 
        WHERE sequence_id = ? 
        ORDER BY track_type, track_index
      `,
        [sequenceId]
      );

      const mappedTracks: Track[] = tracks.map((row: any) => ({
        id: row.id,
        sequence_id: row.sequence_id,
        track_type: row.track_type as TrackType,
        track_index: row.track_index,
        name: row.name,
        enabled: Boolean(row.enabled),
        locked: Boolean(row.locked),
        height: row.height,
        created_at: new Date(row.created_at),
      }));

      return { success: true, data: mappedTracks };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Add clip to timeline
   * @param data - Clip creation data
   * @returns Promise with created clip
   */
  async addClip(data: CreateClipData): Promise<DatabaseResult<Clip>> {
    try {
      // Verify media asset exists
      const assetResult = await this.mediaModel.findById(data.media_asset_id);
      if (!assetResult.success || !assetResult.data) {
        return { success: false, error: 'Media asset not found' };
      }

      // Create clip
      const clipResult = await this.clipModel.create(data);
      if (!clipResult.success) {
        return clipResult;
      }

      // Update sequence duration
      const track = await this.db.get(
        'SELECT sequence_id FROM tracks WHERE id = ?',
        [data.track_id]
      );
      if (track) {
        await this.sequenceModel.updateDurationFromClips(track.sequence_id);
      }

      return clipResult;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Move clip to new position
   * @param clipId - Clip ID
   * @param newStartTime - New start time
   * @param newTrackId - Optional new track ID
   * @returns Promise with updated clip
   */
  async moveClip(
    clipId: string,
    newStartTime: number,
    newTrackId?: string
  ): Promise<DatabaseResult<Clip>> {
    try {
      const result = await this.db.transaction(async () => {
        const currentClip = await this.clipModel.findById(clipId);
        if (!currentClip.success || !currentClip.data) {
          throw new Error('Clip not found');
        }

        const clip = currentClip.data;
        const duration = clip.end_time - clip.start_time;
        const newEndTime = newStartTime + duration;

        // Check for collisions on target track
        const targetTrackId = newTrackId || clip.track_id;
        const collisionResult = await this.clipModel.checkCollisions(
          targetTrackId,
          newStartTime,
          newEndTime,
          clipId
        );

        if (!collisionResult.success) {
          throw new Error(collisionResult.error || 'Collision check failed');
        }

        if (collisionResult.data?.hasCollision) {
          throw new Error(
            `Clip would collide with existing clips: ${collisionResult.data.collidingClips.map((c) => c.name).join(', ')}`
          );
        }

        // Update clip position
        const updateData: UpdateClipData = {
          start_time: newStartTime,
          end_time: newEndTime,
        };

        // If moving to different track, update track_id
        if (newTrackId && newTrackId !== clip.track_id) {
          // Update via direct database query since model doesn't support track_id updates
          await this.db.run(
            'UPDATE clips SET track_id = ?, start_time = ?, end_time = ? WHERE id = ?',
            [newTrackId, newStartTime, newEndTime, clipId]
          );
        } else {
          const updateResult = await this.clipModel.update(clipId, updateData);
          if (!updateResult.success) {
            throw new Error(updateResult.error || 'Failed to update clip');
          }
        }

        // Update sequence durations for affected sequences
        const tracks = await this.db.all(
          'SELECT DISTINCT sequence_id FROM tracks WHERE id IN (?, ?)',
          [clip.track_id, targetTrackId]
        );

        for (const track of tracks) {
          await this.sequenceModel.updateDurationFromClips(track.sequence_id);
        }

        // Return updated clip
        const updatedClip = await this.clipModel.findById(clipId);
        if (!updatedClip.success || !updatedClip.data) {
          throw new Error('Failed to retrieve updated clip');
        }

        return updatedClip.data;
      });

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Trim clip (adjust in/out points)
   * @param clipId - Clip ID
   * @param newStartTime - New start time
   * @param newEndTime - New end time
   * @returns Promise with updated clip
   */
  async trimClip(
    clipId: string,
    newStartTime: number,
    newEndTime: number
  ): Promise<DatabaseResult<Clip>> {
    try {
      const result = await this.clipModel.update(clipId, {
        start_time: newStartTime,
        end_time: newEndTime,
      });

      if (result.success) {
        // Update sequence duration
        const clip = await this.clipModel.findById(clipId);
        if (clip.success && clip.data) {
          const track = await this.db.get(
            'SELECT sequence_id FROM tracks WHERE id = ?',
            [clip.data.track_id]
          );
          if (track) {
            await this.sequenceModel.updateDurationFromClips(track.sequence_id);
          }
        }
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Split clip at specified time
   * @param clipId - Clip ID
   * @param splitTime - Time to split at (relative to clip start)
   * @param userId - User performing the split
   * @returns Promise with both resulting clips
   */
  async splitClip(
    clipId: string,
    splitTime: number,
    userId: string
  ): Promise<DatabaseResult<[Clip, Clip]>> {
    try {
      const result = await this.clipModel.splitClip(clipId, splitTime, userId);

      if (result.success && result.data) {
        // Update sequence duration
        const clip = result.data[0];
        const track = await this.db.get(
          'SELECT sequence_id FROM tracks WHERE id = ?',
          [clip.track_id]
        );
        if (track) {
          await this.sequenceModel.updateDurationFromClips(track.sequence_id);
        }
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Delete clip from timeline
   * @param clipId - Clip ID
   * @returns Promise with success status
   */
  async deleteClip(clipId: string): Promise<DatabaseResult<boolean>> {
    try {
      // Get clip info first for sequence update
      const clipResult = await this.clipModel.findById(clipId);
      let sequenceId: string | null = null;

      if (clipResult.success && clipResult.data) {
        const track = await this.db.get(
          'SELECT sequence_id FROM tracks WHERE id = ?',
          [clipResult.data.track_id]
        );
        sequenceId = track?.sequence_id;
      }

      const result = await this.clipModel.delete(clipId);

      if (result.success && sequenceId) {
        // Update sequence duration
        await this.sequenceModel.updateDurationFromClips(sequenceId);
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get clips for a track
   * @param trackId - Track ID
   * @param options - Pagination options
   * @returns Promise with clips array
   */
  async getTrackClips(
    trackId: string,
    options: PaginationOptions = {}
  ): Promise<DatabaseResult<ClipWithMedia[]>> {
    try {
      const clips = await this.db.all(
        `
        SELECT c.*, 
               ma.filename, ma.file_type, ma.duration as media_duration, 
               ma.resolution, ma.thumbnail_url
        FROM clips c
        LEFT JOIN media_assets ma ON c.media_asset_id = ma.id
        WHERE c.track_id = ?
        ORDER BY c.start_time
        LIMIT ? OFFSET ?
      `,
        [trackId, options.limit || 100, options.offset || 0]
      );

      const mappedClips: ClipWithMedia[] = clips.map((row: any) => ({
        id: row.id,
        track_id: row.track_id,
        media_asset_id: row.media_asset_id,
        start_time: row.start_time,
        end_time: row.end_time,
        media_in: row.media_in,
        media_out: row.media_out,
        name: row.name,
        enabled: Boolean(row.enabled),
        locked: Boolean(row.locked),
        opacity: row.opacity,
        speed: row.speed,
        created_by: row.created_by,
        created_at: new Date(row.created_at),
        media_asset: row.filename
          ? {
              id: row.media_asset_id,
              filename: row.filename,
              file_type: row.file_type,
              duration: row.media_duration,
              resolution: row.resolution,
              thumbnail_url: row.thumbnail_url,
            }
          : undefined,
      }));

      return { success: true, data: mappedClips };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get clips in time range
   * @param sequenceId - Sequence ID
   * @param startTime - Range start time
   * @param endTime - Range end time
   * @returns Promise with clips array
   */
  async getClipsInRange(
    sequenceId: string,
    startTime: number,
    endTime: number
  ): Promise<DatabaseResult<ClipWithMedia[]>> {
    try {
      const clips = await this.db.all(
        `
        SELECT c.*, 
               ma.filename, ma.file_type, ma.duration as media_duration, 
               ma.resolution, ma.thumbnail_url,
               t.track_type, t.track_index
        FROM clips c
        JOIN tracks t ON c.track_id = t.id
        LEFT JOIN media_assets ma ON c.media_asset_id = ma.id
        WHERE t.sequence_id = ?
        AND (
          (c.start_time >= ? AND c.start_time < ?) OR
          (c.end_time > ? AND c.end_time <= ?) OR
          (c.start_time < ? AND c.end_time > ?)
        )
        ORDER BY t.track_index, c.start_time
      `,
        [sequenceId, startTime, endTime, startTime, endTime, startTime, endTime]
      );

      const mappedClips: ClipWithMedia[] = clips.map((row: any) => ({
        id: row.id,
        track_id: row.track_id,
        media_asset_id: row.media_asset_id,
        start_time: row.start_time,
        end_time: row.end_time,
        media_in: row.media_in,
        media_out: row.media_out,
        name: row.name,
        enabled: Boolean(row.enabled),
        locked: Boolean(row.locked),
        opacity: row.opacity,
        speed: row.speed,
        created_by: row.created_by,
        created_at: new Date(row.created_at),
        media_asset: row.filename
          ? {
              id: row.media_asset_id,
              filename: row.filename,
              file_type: row.file_type,
              duration: row.media_duration,
              resolution: row.resolution,
              thumbnail_url: row.thumbnail_url,
            }
          : undefined,
      }));

      return { success: true, data: mappedClips };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Update track properties
   * @param trackId - Track ID
   * @param updates - Properties to update
   * @returns Promise with success status
   */
  async updateTrack(
    trackId: string,
    updates: Partial<Track>
  ): Promise<DatabaseResult<boolean>> {
    try {
      const setClause: string[] = [];
      const values: any[] = [];

      if (updates.name !== undefined) {
        setClause.push('name = ?');
        values.push(updates.name);
      }
      if (updates.enabled !== undefined) {
        setClause.push('enabled = ?');
        values.push(updates.enabled ? 1 : 0);
      }
      if (updates.locked !== undefined) {
        setClause.push('locked = ?');
        values.push(updates.locked ? 1 : 0);
      }
      if (updates.height !== undefined) {
        setClause.push('height = ?');
        values.push(updates.height);
      }

      if (setClause.length === 0) {
        return { success: false, error: 'No updates provided' };
      }

      values.push(trackId);

      await this.db.run(
        `UPDATE tracks SET ${setClause.join(', ')} WHERE id = ?`,
        values
      );

      return { success: true, data: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Delete track and all its clips
   * @param trackId - Track ID
   * @returns Promise with success status
   */
  async deleteTrack(trackId: string): Promise<DatabaseResult<boolean>> {
    try {
      const result = await this.db.transaction(async () => {
        // Get sequence ID for duration update
        const track = await this.db.get(
          'SELECT sequence_id FROM tracks WHERE id = ?',
          [trackId]
        );

        // Delete all clips on the track
        await this.db.run('DELETE FROM clips WHERE track_id = ?', [trackId]);

        // Delete the track
        await this.db.run('DELETE FROM tracks WHERE id = ?', [trackId]);

        // Update sequence duration
        if (track) {
          await this.sequenceModel.updateDurationFromClips(track.sequence_id);
        }

        return true;
      });

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Reorder tracks within a sequence
   * @param sequenceId - Sequence ID
   * @param trackIds - Array of track IDs in new order
   * @returns Promise with success status
   */
  async reorderTracks(
    sequenceId: string,
    trackIds: string[]
  ): Promise<DatabaseResult<boolean>> {
    try {
      const result = await this.db.transaction(async () => {
        for (let i = 0; i < trackIds.length; i++) {
          await this.db.run(
            'UPDATE tracks SET track_index = ? WHERE id = ? AND sequence_id = ?',
            [i, trackIds[i], sequenceId]
          );
        }
        return true;
      });

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

export default TimelineService;
