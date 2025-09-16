/**
 * TimelineSequence Model (T026)
 * Arranged video/audio tracks in chronological order with editing decisions.
 * Represents the main editing workspace containing tracks and clips.
 */

import { Database } from 'sqlite3';
import {
  BaseModel,
  ValidationError,
  DatabaseResult,
  PaginationOptions,
  ModelValidator,
} from '../../../shared/types/database';

/** Timeline sequence entity interface */
export interface TimelineSequence extends BaseModel {
  project_id: string;
  name: string;
  duration: number;
  framerate: number;
  resolution: string;
  created_by: string;
  settings: SequenceSettings;
}

/** Timeline sequence settings interface */
export interface SequenceSettings {
  audio_sample_rate?: number;
  video_codec?: string;
  audio_codec?: string;
  export_format?: string;
  [key: string]: any;
}

/** Timeline sequence creation data */
export interface CreateTimelineSequenceData {
  project_id: string;
  name: string;
  framerate: number;
  resolution: string;
  created_by: string;
  duration?: number;
  settings?: Partial<SequenceSettings>;
}

/** Timeline sequence update data */
export interface UpdateTimelineSequenceData {
  name?: string;
  duration?: number;
  framerate?: number;
  resolution?: string;
  settings?: Partial<SequenceSettings>;
}

/** Timeline sequence with track information */
export interface TimelineSequenceWithTracks extends TimelineSequence {
  tracks?: {
    id: string;
    track_type: string;
    track_index: number;
    name: string;
    enabled: boolean;
  }[];
  track_count?: number;
  video_track_count?: number;
  audio_track_count?: number;
}

/** Timeline sequence statistics */
export interface SequenceStats {
  total_clips: number;
  video_clips: number;
  audio_clips: number;
  total_duration: number;
  last_modified: Date;
}

/**
 * TimelineSequence Model Class
 * Handles CRUD operations and validation for timeline sequences
 */
export class TimelineSequenceModel implements ModelValidator<TimelineSequence> {
  private db: Database;

  // Standard video resolutions
  private readonly STANDARD_RESOLUTIONS = [
    '3840x2160', // 4K UHD
    '2560x1440', // 1440p
    '1920x1080', // 1080p
    '1280x720', // 720p
    '854x480', // 480p
    '640x360', // 360p
  ];

  // Standard framerates
  private readonly STANDARD_FRAMERATES = [
    23.976, 24, 25, 29.97, 30, 50, 59.94, 60, 120,
  ];

  constructor(database: Database) {
    this.db = database;
  }

  /**
   * Validate timeline sequence data
   * @param data - Timeline sequence data to validate
   * @returns Array of validation errors
   */
  validate(data: Partial<CreateTimelineSequenceData>): ValidationError[] {
    const errors: ValidationError[] = [];

    // Project ID validation
    if (!data.project_id) {
      errors.push(new ValidationError('project_id', 'Project ID is required'));
    }

    // Name validation
    if (!data.name) {
      errors.push(new ValidationError('name', 'Sequence name is required'));
    } else if (data.name.length < 1 || data.name.length > 100) {
      errors.push(
        new ValidationError(
          'name',
          'Sequence name must be between 1 and 100 characters'
        )
      );
    }

    // Framerate validation
    if (data.framerate === undefined || data.framerate === null) {
      errors.push(new ValidationError('framerate', 'Framerate is required'));
    } else if (data.framerate <= 0) {
      errors.push(
        new ValidationError('framerate', 'Framerate must be positive')
      );
    } else if (!this.isValidFramerate(data.framerate)) {
      errors.push(
        new ValidationError(
          'framerate',
          'Non-standard framerate - consider using standard values'
        )
      );
    }

    // Resolution validation
    if (!data.resolution) {
      errors.push(new ValidationError('resolution', 'Resolution is required'));
    } else if (!this.isValidResolution(data.resolution)) {
      errors.push(
        new ValidationError(
          'resolution',
          'Invalid resolution format (use WIDTHxHEIGHT)'
        )
      );
    }

    // Created by validation
    if (!data.created_by) {
      errors.push(
        new ValidationError('created_by', 'Creator user ID is required')
      );
    }

    // Duration validation
    if (data.duration !== undefined && data.duration < 0) {
      errors.push(
        new ValidationError('duration', 'Duration cannot be negative')
      );
    }

    // Settings validation
    if (data.settings) {
      if (
        data.settings.audio_sample_rate &&
        data.settings.audio_sample_rate <= 0
      ) {
        errors.push(
          new ValidationError(
            'settings.audio_sample_rate',
            'Audio sample rate must be positive'
          )
        );
      }
    }

    return errors;
  }

  /**
   * Validate timeline sequence update data
   * @param data - Timeline sequence update data to validate
   * @returns Array of validation errors
   */
  validateUpdate(data: Partial<UpdateTimelineSequenceData>): ValidationError[] {
    const errors: ValidationError[] = [];

    // Name validation (if provided)
    if (data.name !== undefined) {
      if (data.name.length < 1 || data.name.length > 100) {
        errors.push(
          new ValidationError(
            'name',
            'Sequence name must be between 1 and 100 characters'
          )
        );
      }
    }

    // Framerate validation (if provided)
    if (data.framerate !== undefined) {
      if (data.framerate <= 0) {
        errors.push(
          new ValidationError('framerate', 'Framerate must be positive')
        );
      } else if (!this.isValidFramerate(data.framerate)) {
        errors.push(
          new ValidationError(
            'framerate',
            'Non-standard framerate - consider using standard values'
          )
        );
      }
    }

    // Resolution validation (if provided)
    if (
      data.resolution !== undefined &&
      !this.isValidResolution(data.resolution)
    ) {
      errors.push(
        new ValidationError(
          'resolution',
          'Invalid resolution format (use WIDTHxHEIGHT)'
        )
      );
    }

    // Duration validation (if provided)
    if (data.duration !== undefined && data.duration < 0) {
      errors.push(
        new ValidationError('duration', 'Duration cannot be negative')
      );
    }

    // Settings validation (if provided)
    if (data.settings) {
      if (
        data.settings.audio_sample_rate &&
        data.settings.audio_sample_rate <= 0
      ) {
        errors.push(
          new ValidationError(
            'settings.audio_sample_rate',
            'Audio sample rate must be positive'
          )
        );
      }
    }

    return errors;
  }

  /**
   * Create a new timeline sequence
   * @param data - Timeline sequence creation data
   * @returns Promise with created timeline sequence or error
   */
  async create(
    data: CreateTimelineSequenceData
  ): Promise<DatabaseResult<TimelineSequence>> {
    const validationErrors = this.validate(data);
    if (validationErrors.length > 0) {
      return {
        success: false,
        error: validationErrors.map((e) => e.message).join(', '),
      };
    }

    try {
      const id = this.generateId();
      const now = new Date();
      const settings = JSON.stringify(data.settings || {});
      const duration = data.duration || 0;

      return new Promise((resolve) => {
        const stmt = this.db.prepare(`
          INSERT INTO timeline_sequences (
            id, project_id, name, duration, framerate, resolution,
            created_by, settings, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          [
            id,
            data.project_id,
            data.name,
            duration,
            data.framerate,
            data.resolution,
            data.created_by,
            settings,
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
                  project_id: data.project_id,
                  name: data.name,
                  duration: duration,
                  framerate: data.framerate,
                  resolution: data.resolution,
                  created_by: data.created_by,
                  settings: data.settings || {},
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
   * Find timeline sequence by ID
   * @param id - Timeline sequence ID
   * @returns Promise with timeline sequence or error
   */
  async findById(id: string): Promise<DatabaseResult<TimelineSequence>> {
    try {
      return new Promise((resolve) => {
        this.db.get(
          'SELECT * FROM timeline_sequences WHERE id = ?',
          [id],
          (err, row: any) => {
            if (err) {
              resolve({ success: false, error: err.message });
            } else if (!row) {
              resolve({ success: false, error: 'Timeline sequence not found' });
            } else {
              resolve({
                success: true,
                data: this.mapRowToTimelineSequence(row),
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
   * Find timeline sequences by project ID
   * @param projectId - Project ID
   * @param options - Pagination options
   * @returns Promise with timeline sequences array or error
   */
  async findByProjectId(
    projectId: string,
    options: PaginationOptions = {}
  ): Promise<DatabaseResult<TimelineSequence[]>> {
    try {
      const limit = options.limit || 50;
      const offset = options.offset || 0;
      const orderBy = options.orderBy || 'created_at';
      const orderDirection = options.orderDirection || 'DESC';

      return new Promise((resolve) => {
        this.db.all(
          `
          SELECT * FROM timeline_sequences
          WHERE project_id = ?
          ORDER BY ${orderBy} ${orderDirection}
          LIMIT ? OFFSET ?
        `,
          [projectId, limit, offset],
          (err, rows: any[]) => {
            if (err) {
              resolve({ success: false, error: err.message });
            } else {
              const sequences = rows.map((row) =>
                this.mapRowToTimelineSequence(row)
              );
              resolve({ success: true, data: sequences });
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
   * Find timeline sequence with tracks
   * @param id - Timeline sequence ID
   * @returns Promise with timeline sequence and tracks or error
   */
  async findWithTracks(
    id: string
  ): Promise<DatabaseResult<TimelineSequenceWithTracks>> {
    try {
      const sequenceResult = await this.findById(id);
      if (!sequenceResult.success || !sequenceResult.data) {
        return sequenceResult;
      }

      return new Promise((resolve) => {
        this.db.all(
          `
          SELECT id, track_type, track_index, name, enabled
          FROM tracks
          WHERE sequence_id = ?
          ORDER BY track_type, track_index
        `,
          [id],
          (err, tracks: any[]) => {
            if (err) {
              resolve({ success: false, error: err.message });
            } else {
              const sequenceWithTracks: TimelineSequenceWithTracks = {
                ...sequenceResult.data!,
                tracks: tracks,
                track_count: tracks.length,
                video_track_count: tracks.filter(
                  (t) => t.track_type === 'video'
                ).length,
                audio_track_count: tracks.filter(
                  (t) => t.track_type === 'audio'
                ).length,
              };
              resolve({ success: true, data: sequenceWithTracks });
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
   * Update timeline sequence
   * @param id - Timeline sequence ID
   * @param data - Update data
   * @returns Promise with updated timeline sequence or error
   */
  async update(
    id: string,
    data: UpdateTimelineSequenceData
  ): Promise<DatabaseResult<TimelineSequence>> {
    const validationErrors = this.validateUpdate(data);
    if (validationErrors.length > 0) {
      return {
        success: false,
        error: validationErrors.map((e) => e.message).join(', '),
      };
    }

    try {
      const updates: string[] = [];
      const values: any[] = [];

      if (data.name !== undefined) {
        updates.push('name = ?');
        values.push(data.name);
      }
      if (data.duration !== undefined) {
        updates.push('duration = ?');
        values.push(data.duration);
      }
      if (data.framerate !== undefined) {
        updates.push('framerate = ?');
        values.push(data.framerate);
      }
      if (data.resolution !== undefined) {
        updates.push('resolution = ?');
        values.push(data.resolution);
      }
      if (data.settings !== undefined) {
        updates.push('settings = ?');
        values.push(JSON.stringify(data.settings));
      }

      if (updates.length === 0) {
        return { success: false, error: 'No fields to update' };
      }

      values.push(id);

      return new Promise((resolve) => {
        this.db.run(
          `UPDATE timeline_sequences SET ${updates.join(', ')} WHERE id = ?`,
          values,
          function (err) {
            if (err) {
              resolve({ success: false, error: err.message });
            } else if (this.changes === 0) {
              resolve({ success: false, error: 'Timeline sequence not found' });
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
   * Delete timeline sequence
   * @param id - Timeline sequence ID
   * @returns Promise with success status
   */
  async delete(id: string): Promise<DatabaseResult<boolean>> {
    try {
      return new Promise((resolve) => {
        this.db.run(
          'DELETE FROM timeline_sequences WHERE id = ?',
          [id],
          function (err) {
            if (err) {
              resolve({ success: false, error: err.message });
            } else if (this.changes === 0) {
              resolve({ success: false, error: 'Timeline sequence not found' });
            } else {
              resolve({ success: true, data: true });
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
   * Update sequence duration based on clips
   * @param id - Timeline sequence ID
   * @returns Promise with updated duration or error
   */
  async updateDurationFromClips(id: string): Promise<DatabaseResult<number>> {
    try {
      return new Promise((resolve) => {
        this.db.get(
          `
          SELECT MAX(c.end_time) as max_end_time
          FROM clips c
          JOIN tracks t ON c.track_id = t.id
          WHERE t.sequence_id = ?
        `,
          [id],
          (err, row: any) => {
            if (err) {
              resolve({ success: false, error: err.message });
            } else {
              const duration = row.max_end_time || 0;

              // Update the sequence duration
              this.db.run(
                'UPDATE timeline_sequences SET duration = ? WHERE id = ?',
                [duration, id],
                function (updateErr) {
                  if (updateErr) {
                    resolve({ success: false, error: updateErr.message });
                  } else {
                    resolve({ success: true, data: duration });
                  }
                }
              );
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
   * Get sequence statistics
   * @param id - Timeline sequence ID
   * @returns Promise with sequence statistics or error
   */
  async getStats(id: string): Promise<DatabaseResult<SequenceStats>> {
    try {
      return new Promise((resolve) => {
        this.db.get(
          `
          SELECT
            COUNT(c.id) as total_clips,
            COUNT(CASE WHEN t.track_type = 'video' THEN c.id END) as video_clips,
            COUNT(CASE WHEN t.track_type = 'audio' THEN c.id END) as audio_clips,
            MAX(c.end_time) as total_duration,
            MAX(ts.created_at) as last_modified
          FROM timeline_sequences ts
          LEFT JOIN tracks t ON ts.id = t.sequence_id
          LEFT JOIN clips c ON t.id = c.track_id
          WHERE ts.id = ?
          GROUP BY ts.id
        `,
          [id],
          (err, row: any) => {
            if (err) {
              resolve({ success: false, error: err.message });
            } else if (!row) {
              resolve({ success: false, error: 'Timeline sequence not found' });
            } else {
              resolve({
                success: true,
                data: {
                  total_clips: row.total_clips || 0,
                  video_clips: row.video_clips || 0,
                  audio_clips: row.audio_clips || 0,
                  total_duration: row.total_duration || 0,
                  last_modified: new Date(row.last_modified),
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
   * Check if resolution format is valid
   * @param resolution - Resolution string (e.g., "1920x1080")
   * @returns Boolean indicating if valid
   */
  private isValidResolution(resolution: string): boolean {
    const resolutionPattern = /^\d+x\d+$/;
    return resolutionPattern.test(resolution);
  }

  /**
   * Check if framerate is a standard value
   * @param framerate - Framerate to check
   * @returns Boolean indicating if standard
   */
  private isValidFramerate(framerate: number): boolean {
    // Allow exact matches or close approximations (within 0.1)
    return this.STANDARD_FRAMERATES.some(
      (standard) => Math.abs(framerate - standard) < 0.1
    );
  }

  /**
   * Map database row to TimelineSequence object
   * @param row - Database row
   * @returns TimelineSequence object
   */
  private mapRowToTimelineSequence(row: any): TimelineSequence {
    return {
      id: row.id,
      project_id: row.project_id,
      name: row.name,
      duration: row.duration,
      framerate: row.framerate,
      resolution: row.resolution,
      created_by: row.created_by,
      settings: JSON.parse(row.settings || '{}'),
      created_at: new Date(row.created_at),
    };
  }

  /**
   * Generate unique ID for new timeline sequences
   * @returns Unique string ID
   */
  private generateId(): string {
    return `seq-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
