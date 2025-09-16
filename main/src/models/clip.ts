/**
 * Clip Model (T027)
 * Individual media segments placed on timeline tracks with properties and effects.
 * Handles timeline positioning, media references, and clip-specific attributes.
 */

import { Database } from 'sqlite3';
import {
  BaseModel,
  ValidationError,
  DatabaseResult,
  PaginationOptions,
  ModelValidator,
} from '../../../shared/types/database';

/** Clip entity interface */
export interface Clip extends BaseModel {
  track_id: string;
  media_asset_id: string;
  start_time: number;
  end_time: number;
  media_in: number;
  media_out: number;
  name: string;
  enabled: boolean;
  locked: boolean;
  opacity: number;
  speed: number;
  created_by: string;
}

/** Clip creation data */
export interface CreateClipData {
  track_id: string;
  media_asset_id: string;
  start_time: number;
  end_time: number;
  media_in: number;
  media_out: number;
  name: string;
  created_by: string;
  enabled?: boolean;
  locked?: boolean;
  opacity?: number;
  speed?: number;
}

/** Clip update data */
export interface UpdateClipData {
  start_time?: number;
  end_time?: number;
  media_in?: number;
  media_out?: number;
  name?: string;
  enabled?: boolean;
  locked?: boolean;
  opacity?: number;
  speed?: number;
}

/** Clip with media asset information */
export interface ClipWithMedia extends Clip {
  media_asset?: {
    id: string;
    filename: string;
    file_type: string;
    duration?: number;
    resolution?: string;
    thumbnail_url?: string;
  };
}

/** Clip with track information */
export interface ClipWithTrack extends Clip {
  track?: {
    id: string;
    track_type: string;
    track_index: number;
    name: string;
  };
}

/** Timeline position for clip operations */
export interface TimelinePosition {
  track_id: string;
  start_time: number;
  end_time: number;
}

/** Clip collision detection result */
export interface ClipCollision {
  hasCollision: boolean;
  collidingClips: Clip[];
  suggestedPosition?: TimelinePosition;
}

/**
 * Clip Model Class
 * Handles CRUD operations, validation, and timeline positioning for clips
 */
export class ClipModel implements ModelValidator<Clip> {
  private db: Database;

  constructor(database: Database) {
    this.db = database;
  }

  /**
   * Validate clip data
   * @param data - Clip data to validate
   * @returns Array of validation errors
   */
  validate(data: Partial<CreateClipData>): ValidationError[] {
    const errors: ValidationError[] = [];

    // Track ID validation
    if (!data.track_id) {
      errors.push(new ValidationError('track_id', 'Track ID is required'));
    }

    // Media asset ID validation
    if (!data.media_asset_id) {
      errors.push(
        new ValidationError('media_asset_id', 'Media asset ID is required')
      );
    }

    // Timeline position validation
    if (data.start_time === undefined || data.start_time === null) {
      errors.push(new ValidationError('start_time', 'Start time is required'));
    } else if (data.start_time < 0) {
      errors.push(
        new ValidationError('start_time', 'Start time cannot be negative')
      );
    }

    if (data.end_time === undefined || data.end_time === null) {
      errors.push(new ValidationError('end_time', 'End time is required'));
    } else if (data.end_time <= 0) {
      errors.push(new ValidationError('end_time', 'End time must be positive'));
    }

    if (data.start_time !== undefined && data.end_time !== undefined) {
      if (data.end_time <= data.start_time) {
        errors.push(
          new ValidationError(
            'end_time',
            'End time must be greater than start time'
          )
        );
      }
    }

    // Media timeline validation
    if (data.media_in === undefined || data.media_in === null) {
      errors.push(
        new ValidationError('media_in', 'Media in point is required')
      );
    } else if (data.media_in < 0) {
      errors.push(
        new ValidationError('media_in', 'Media in point cannot be negative')
      );
    }

    if (data.media_out === undefined || data.media_out === null) {
      errors.push(
        new ValidationError('media_out', 'Media out point is required')
      );
    } else if (data.media_out <= 0) {
      errors.push(
        new ValidationError('media_out', 'Media out point must be positive')
      );
    }

    if (data.media_in !== undefined && data.media_out !== undefined) {
      if (data.media_out <= data.media_in) {
        errors.push(
          new ValidationError(
            'media_out',
            'Media out point must be greater than media in point'
          )
        );
      }
    }

    // Name validation
    if (!data.name) {
      errors.push(new ValidationError('name', 'Clip name is required'));
    } else if (data.name.trim().length === 0) {
      errors.push(new ValidationError('name', 'Clip name cannot be empty'));
    }

    // Created by validation
    if (!data.created_by) {
      errors.push(
        new ValidationError('created_by', 'Creator user ID is required')
      );
    }

    // Opacity validation
    if (data.opacity !== undefined && (data.opacity < 0 || data.opacity > 1)) {
      errors.push(
        new ValidationError('opacity', 'Opacity must be between 0 and 1')
      );
    }

    // Speed validation
    if (data.speed !== undefined && data.speed <= 0) {
      errors.push(new ValidationError('speed', 'Speed must be positive'));
    }

    return errors;
  }

  /**
   * Validate clip update data
   * @param data - Clip update data to validate
   * @returns Array of validation errors
   */
  validateUpdate(data: Partial<UpdateClipData>): ValidationError[] {
    const errors: ValidationError[] = [];

    // Timeline position validation (if provided)
    if (data.start_time !== undefined && data.start_time < 0) {
      errors.push(
        new ValidationError('start_time', 'Start time cannot be negative')
      );
    }

    if (data.end_time !== undefined && data.end_time <= 0) {
      errors.push(new ValidationError('end_time', 'End time must be positive'));
    }

    if (data.start_time !== undefined && data.end_time !== undefined) {
      if (data.end_time <= data.start_time) {
        errors.push(
          new ValidationError(
            'end_time',
            'End time must be greater than start time'
          )
        );
      }
    }

    // Media timeline validation (if provided)
    if (data.media_in !== undefined && data.media_in < 0) {
      errors.push(
        new ValidationError('media_in', 'Media in point cannot be negative')
      );
    }

    if (data.media_out !== undefined && data.media_out <= 0) {
      errors.push(
        new ValidationError('media_out', 'Media out point must be positive')
      );
    }

    if (data.media_in !== undefined && data.media_out !== undefined) {
      if (data.media_out <= data.media_in) {
        errors.push(
          new ValidationError(
            'media_out',
            'Media out point must be greater than media in point'
          )
        );
      }
    }

    // Name validation (if provided)
    if (data.name !== undefined && data.name.trim().length === 0) {
      errors.push(new ValidationError('name', 'Clip name cannot be empty'));
    }

    // Opacity validation (if provided)
    if (data.opacity !== undefined && (data.opacity < 0 || data.opacity > 1)) {
      errors.push(
        new ValidationError('opacity', 'Opacity must be between 0 and 1')
      );
    }

    // Speed validation (if provided)
    if (data.speed !== undefined && data.speed <= 0) {
      errors.push(new ValidationError('speed', 'Speed must be positive'));
    }

    return errors;
  }

  /**
   * Create a new clip
   * @param data - Clip creation data
   * @returns Promise with created clip or error
   */
  async create(data: CreateClipData): Promise<DatabaseResult<Clip>> {
    const validationErrors = this.validate(data);
    if (validationErrors.length > 0) {
      return {
        success: false,
        error: validationErrors.map((e) => e.message).join(', '),
      };
    }

    try {
      // Check for timeline collisions
      const collisionResult = await this.checkCollisions(
        data.track_id,
        data.start_time,
        data.end_time
      );
      if (!collisionResult.success) {
        return {
          success: false,
          error: collisionResult.error,
        };
      }

      if (collisionResult.data?.hasCollision) {
        return {
          success: false,
          error: `Clip would collide with existing clips: ${collisionResult.data.collidingClips.map((c) => c.name).join(', ')}`,
        };
      }

      const id = this.generateId();
      const now = new Date();

      return new Promise((resolve) => {
        const stmt = this.db.prepare(`
          INSERT INTO clips (
            id, track_id, media_asset_id, start_time, end_time, media_in, media_out,
            name, enabled, locked, opacity, speed, created_by, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          [
            id,
            data.track_id,
            data.media_asset_id,
            data.start_time,
            data.end_time,
            data.media_in,
            data.media_out,
            data.name,
            data.enabled !== false ? 1 : 0,
            data.locked === true ? 1 : 0,
            data.opacity !== undefined ? data.opacity : 1.0,
            data.speed !== undefined ? data.speed : 1.0,
            data.created_by,
            now.toISOString(),
          ],
          function (err) {
            if (err) {
              resolve({ success: false, error: err.message });
            } else {
              resolve({
                success: true,
                data: {
                  id,
                  track_id: data.track_id,
                  media_asset_id: data.media_asset_id,
                  start_time: data.start_time,
                  end_time: data.end_time,
                  media_in: data.media_in,
                  media_out: data.media_out,
                  name: data.name,
                  enabled: data.enabled !== false,
                  locked: data.locked === true,
                  opacity: data.opacity !== undefined ? data.opacity : 1.0,
                  speed: data.speed !== undefined ? data.speed : 1.0,
                  created_by: data.created_by,
                  created_at: now,
                },
              });
            }
          }
        );
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Find clip by ID
   * @param id - Clip ID
   * @returns Promise with clip or error
   */
  async findById(id: string): Promise<DatabaseResult<Clip>> {
    try {
      return new Promise((resolve) => {
        this.db.get(
          'SELECT * FROM clips WHERE id = ?',
          [id],
          (err, row: any) => {
            if (err) {
              resolve({ success: false, error: err.message });
            } else if (!row) {
              resolve({ success: false, error: 'Clip not found' });
            } else {
              resolve({
                success: true,
                data: this.mapRowToClip(row),
              });
            }
          }
        );
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Find clips by track ID
   * @param trackId - Track ID
   * @param options - Pagination options
   * @returns Promise with clips array or error
   */
  async findByTrackId(
    trackId: string,
    options: PaginationOptions = {}
  ): Promise<DatabaseResult<Clip[]>> {
    try {
      const limit = options.limit || 100;
      const offset = options.offset || 0;
      const orderBy = options.orderBy || 'start_time';
      const orderDirection = options.orderDirection || 'ASC';

      return new Promise((resolve) => {
        this.db.all(
          `
          SELECT * FROM clips
          WHERE track_id = ?
          ORDER BY ${orderBy} ${orderDirection}
          LIMIT ? OFFSET ?
        `,
          [trackId, limit, offset],
          (err, rows: any[]) => {
            if (err) {
              resolve({ success: false, error: err.message });
            } else {
              const clips = rows.map((row) => this.mapRowToClip(row));
              resolve({ success: true, data: clips });
            }
          }
        );
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Find clips by timeline sequence ID
   * @param sequenceId - Timeline sequence ID
   * @returns Promise with clips array or error
   */
  async findBySequenceId(
    sequenceId: string
  ): Promise<DatabaseResult<ClipWithTrack[]>> {
    try {
      return new Promise((resolve) => {
        this.db.all(
          `
          SELECT c.*, t.track_type, t.track_index, t.name as track_name
          FROM clips c
          JOIN tracks t ON c.track_id = t.id
          WHERE t.sequence_id = ?
          ORDER BY t.track_index, c.start_time
        `,
          [sequenceId],
          (err, rows: any[]) => {
            if (err) {
              resolve({ success: false, error: err.message });
            } else {
              const clips = rows.map((row) => ({
                ...this.mapRowToClip(row),
                track: {
                  id: row.track_id,
                  track_type: row.track_type,
                  track_index: row.track_index,
                  name: row.track_name,
                },
              }));
              resolve({ success: true, data: clips });
            }
          }
        );
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Find clips by media asset ID
   * @param mediaAssetId - Media asset ID
   * @returns Promise with clips array or error
   */
  async findByMediaAssetId(
    mediaAssetId: string
  ): Promise<DatabaseResult<ClipWithTrack[]>> {
    try {
      return new Promise((resolve) => {
        this.db.all(
          `
          SELECT c.*, t.track_type, t.track_index, t.name as track_name
          FROM clips c
          JOIN tracks t ON c.track_id = t.id
          WHERE c.media_asset_id = ?
          ORDER BY t.track_index, c.start_time
        `,
          [mediaAssetId],
          (err, rows: any[]) => {
            if (err) {
              resolve({ success: false, error: err.message });
            } else {
              const clips = rows.map((row) => ({
                ...this.mapRowToClip(row),
                track: {
                  id: row.track_id,
                  track_type: row.track_type,
                  track_index: row.track_index,
                  name: row.track_name,
                },
              }));
              resolve({ success: true, data: clips });
            }
          }
        );
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Find clips in time range
   * @param trackId - Track ID
   * @param startTime - Range start time
   * @param endTime - Range end time
   * @returns Promise with clips array or error
   */
  async findInTimeRange(
    trackId: string,
    startTime: number,
    endTime: number
  ): Promise<DatabaseResult<Clip[]>> {
    try {
      return new Promise((resolve) => {
        this.db.all(
          `
          SELECT * FROM clips
          WHERE track_id = ?
          AND (
            (start_time >= ? AND start_time < ?) OR
            (end_time > ? AND end_time <= ?) OR
            (start_time < ? AND end_time > ?)
          )
          ORDER BY start_time
        `,
          [trackId, startTime, endTime, startTime, endTime, startTime, endTime],
          (err, rows: any[]) => {
            if (err) {
              resolve({ success: false, error: err.message });
            } else {
              const clips = rows.map((row) => this.mapRowToClip(row));
              resolve({ success: true, data: clips });
            }
          }
        );
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Update clip
   * @param id - Clip ID
   * @param data - Update data
   * @returns Promise with updated clip or error
   */
  async update(
    id: string,
    data: UpdateClipData
  ): Promise<DatabaseResult<Clip>> {
    const validationErrors = this.validateUpdate(data);
    if (validationErrors.length > 0) {
      return {
        success: false,
        error: validationErrors.map((e) => e.message).join(', '),
      };
    }

    try {
      // If position is being updated, check for collisions
      if (data.start_time !== undefined || data.end_time !== undefined) {
        const currentClip = await this.findById(id);
        if (!currentClip.success || !currentClip.data) {
          return { success: false, error: 'Clip not found' };
        }

        const newStartTime =
          data.start_time !== undefined
            ? data.start_time
            : currentClip.data.start_time;
        const newEndTime =
          data.end_time !== undefined
            ? data.end_time
            : currentClip.data.end_time;

        const collisionResult = await this.checkCollisions(
          currentClip.data.track_id,
          newStartTime,
          newEndTime,
          id
        );
        if (!collisionResult.success) {
          return {
            success: false,
            error: collisionResult.error,
          };
        }

        if (collisionResult.data?.hasCollision) {
          return {
            success: false,
            error: `Clip would collide with existing clips: ${collisionResult.data.collidingClips.map((c) => c.name).join(', ')}`,
          };
        }
      }

      const updates: string[] = [];
      const values: any[] = [];

      if (data.start_time !== undefined) {
        updates.push('start_time = ?');
        values.push(data.start_time);
      }
      if (data.end_time !== undefined) {
        updates.push('end_time = ?');
        values.push(data.end_time);
      }
      if (data.media_in !== undefined) {
        updates.push('media_in = ?');
        values.push(data.media_in);
      }
      if (data.media_out !== undefined) {
        updates.push('media_out = ?');
        values.push(data.media_out);
      }
      if (data.name !== undefined) {
        updates.push('name = ?');
        values.push(data.name);
      }
      if (data.enabled !== undefined) {
        updates.push('enabled = ?');
        values.push(data.enabled ? 1 : 0);
      }
      if (data.locked !== undefined) {
        updates.push('locked = ?');
        values.push(data.locked ? 1 : 0);
      }
      if (data.opacity !== undefined) {
        updates.push('opacity = ?');
        values.push(data.opacity);
      }
      if (data.speed !== undefined) {
        updates.push('speed = ?');
        values.push(data.speed);
      }

      if (updates.length === 0) {
        return { success: false, error: 'No fields to update' };
      }

      values.push(id);

      return new Promise((resolve) => {
        this.db.run(
          `UPDATE clips SET ${updates.join(', ')} WHERE id = ?`,
          values,
          function (err) {
            if (err) {
              resolve({ success: false, error: err.message });
            } else if (this.changes === 0) {
              resolve({ success: false, error: 'Clip not found' });
            } else {
              resolve({ success: true, data: undefined });
            }
          }
        );
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Delete clip
   * @param id - Clip ID
   * @returns Promise with success status
   */
  async delete(id: string): Promise<DatabaseResult<boolean>> {
    try {
      return new Promise((resolve) => {
        this.db.run('DELETE FROM clips WHERE id = ?', [id], function (err) {
          if (err) {
            resolve({ success: false, error: err.message });
          } else if (this.changes === 0) {
            resolve({ success: false, error: 'Clip not found' });
          } else {
            resolve({ success: true, data: true });
          }
        });
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check for timeline collisions
   * @param trackId - Track ID
   * @param startTime - Start time to check
   * @param endTime - End time to check
   * @param excludeClipId - Clip ID to exclude from collision check
   * @returns Promise with collision result or error
   */
  async checkCollisions(
    trackId: string,
    startTime: number,
    endTime: number,
    excludeClipId?: string
  ): Promise<DatabaseResult<ClipCollision>> {
    try {
      let query = `
        SELECT * FROM clips
        WHERE track_id = ?
        AND (
          (start_time < ? AND end_time > ?) OR
          (start_time < ? AND end_time > ?) OR
          (start_time >= ? AND end_time <= ?)
        )
      `;
      const params = [
        trackId,
        endTime,
        startTime,
        endTime,
        endTime,
        startTime,
        endTime,
      ];

      if (excludeClipId) {
        query += ' AND id != ?';
        params.push(excludeClipId);
      }

      return new Promise((resolve) => {
        this.db.all(query, params, (err, rows: any[]) => {
          if (err) {
            resolve({ success: false, error: err.message });
          } else {
            const collidingClips = rows.map((row) => this.mapRowToClip(row));
            resolve({
              success: true,
              data: {
                hasCollision: collidingClips.length > 0,
                collidingClips: collidingClips,
              },
            });
          }
        });
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Move clip to new position
   * @param id - Clip ID
   * @param newStartTime - New start time
   * @returns Promise with updated clip or error
   */
  async moveClip(
    id: string,
    newStartTime: number
  ): Promise<DatabaseResult<Clip>> {
    try {
      const currentClip = await this.findById(id);
      if (!currentClip.success || !currentClip.data) {
        return { success: false, error: 'Clip not found' };
      }

      const duration = currentClip.data.end_time - currentClip.data.start_time;
      const newEndTime = newStartTime + duration;

      return this.update(id, {
        start_time: newStartTime,
        end_time: newEndTime,
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Split clip at specified time
   * @param id - Clip ID
   * @param splitTime - Time to split at (relative to clip start)
   * @param createdBy - User ID creating the split
   * @returns Promise with both clips or error
   */
  async splitClip(
    id: string,
    splitTime: number,
    createdBy: string
  ): Promise<DatabaseResult<[Clip, Clip]>> {
    try {
      const originalClip = await this.findById(id);
      if (!originalClip.success || !originalClip.data) {
        return { success: false, error: 'Clip not found' };
      }

      const clip = originalClip.data;
      const absoluteSplitTime = clip.start_time + splitTime;

      if (
        absoluteSplitTime <= clip.start_time ||
        absoluteSplitTime >= clip.end_time
      ) {
        return {
          success: false,
          error: 'Split time must be within clip bounds',
        };
      }

      // Calculate media split point
      const clipDuration = clip.end_time - clip.start_time;
      const mediaDuration = clip.media_out - clip.media_in;
      const mediaRatio = splitTime / clipDuration;
      const mediaSplitPoint = clip.media_in + mediaDuration * mediaRatio;

      // Update first clip
      const firstClipUpdate = await this.update(id, {
        end_time: absoluteSplitTime,
        media_out: mediaSplitPoint,
      });

      if (!firstClipUpdate.success) {
        return {
          success: false,
          error: firstClipUpdate.error,
        };
      }

      // Create second clip
      const secondClipData: CreateClipData = {
        track_id: clip.track_id,
        media_asset_id: clip.media_asset_id,
        start_time: absoluteSplitTime,
        end_time: clip.end_time,
        media_in: mediaSplitPoint,
        media_out: clip.media_out,
        name: `${clip.name} (Split)`,
        created_by: createdBy,
        enabled: clip.enabled,
        locked: clip.locked,
        opacity: clip.opacity,
        speed: clip.speed,
      };

      const secondClipResult = await this.create(secondClipData);
      if (!secondClipResult.success) {
        return {
          success: false,
          error: secondClipResult.error,
        };
      }

      // Get updated first clip
      const updatedFirstClip = await this.findById(id);
      if (!updatedFirstClip.success || !updatedFirstClip.data) {
        return {
          success: false,
          error: 'Failed to retrieve updated first clip',
        };
      }

      return {
        success: true,
        data: [updatedFirstClip.data, secondClipResult.data!],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Map database row to Clip object
   * @param row - Database row
   * @returns Clip object
   */
  private mapRowToClip(row: any): Clip {
    return {
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
    };
  }

  /**
   * Generate unique ID for new clips
   * @returns Unique string ID
   */
  private generateId(): string {
    return `clip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
