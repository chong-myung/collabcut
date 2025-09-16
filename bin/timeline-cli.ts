#!/usr/bin/env ts-node

/**
 * CollabCut Timeline Operations CLI (T041)
 * Command-line interface for timeline editing and sequence management
 * Supports creating sequences, managing tracks, and editing clips
 */

import { program } from 'commander';
import inquirer from 'inquirer';
import * as path from 'path';
import { TimelineService } from '../main/src/services/timeline.service';
import { DatabaseService } from '../main/src/services/database.service';
import {
  CreateTimelineSequenceData,
  UpdateTimelineSequenceData,
} from '../main/src/models/timeline-sequence';
import { CreateClipData, UpdateClipData } from '../main/src/models/clip';
import { TrackType } from '../shared/types/database';

// Initialize services
const databaseService = new DatabaseService();
const timelineService = new TimelineService(databaseService);

// Color utilities for console output
const colors = {
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  blue: (text: string) => `\x1b[34m${text}\x1b[0m`,
  cyan: (text: string) => `\x1b[36m${text}\x1b[0m`,
  magenta: (text: string) => `\x1b[35m${text}\x1b[0m`,
  bold: (text: string) => `\x1b[1m${text}\x1b[0m`,
  dim: (text: string) => `\x1b[2m${text}\x1b[0m`,
};

/**
 * Initialize database connection
 */
async function initializeDatabase(): Promise<void> {
  try {
    await databaseService.connect();
    console.log(colors.green('✓ Database connected successfully'));
  } catch (error) {
    console.error(colors.red('✗ Failed to connect to database:'), error);
    process.exit(1);
  }
}

/**
 * Format time in timecode format (HH:MM:SS:FF)
 */
function formatTimecode(seconds: number, frameRate: number = 30): string {
  const totalFrames = Math.floor(seconds * frameRate);
  const hours = Math.floor(totalFrames / (frameRate * 3600));
  const minutes = Math.floor(
    (totalFrames % (frameRate * 3600)) / (frameRate * 60)
  );
  const secs = Math.floor((totalFrames % (frameRate * 60)) / frameRate);
  const frames = totalFrames % frameRate;

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
}

/**
 * Format timeline sequence for display
 */
function formatSequence(sequence: any): string {
  const duration = sequence.duration
    ? formatTimecode(sequence.duration)
    : 'Unknown';
  const resolution = sequence.settings?.resolution || 'Unknown';
  const frameRate = sequence.settings?.frameRate || 30;

  return `🎬 ${colors.bold(sequence.name)} (${sequence.id})
  Description: ${sequence.description || 'No description'}
  Duration: ${duration}
  Resolution: ${resolution}
  Frame Rate: ${frameRate} fps
  Tracks: ${sequence.track_count || 0}
  Created: ${new Date(sequence.created_at).toLocaleDateString()}`;
}

/**
 * Format track for display
 */
function formatTrack(track: any): string {
  const typeIcon =
    track.track_type === 'video'
      ? '🎥'
      : track.track_type === 'audio'
        ? '🔊'
        : '📝';
  const status = track.enabled ? colors.green('●') : colors.dim('○');
  const lock = track.locked ? '🔒' : '';

  return `${typeIcon} ${status} Track ${track.track_index}: ${colors.bold(track.name)} ${lock}
  Type: ${track.track_type}
  Height: ${track.height}px
  Clips: ${track.clip_count || 0}`;
}

/**
 * Format clip for display
 */
function formatClip(clip: any): string {
  const startTime = formatTimecode(clip.start_time);
  const endTime = formatTimecode(clip.end_time);
  const duration = formatTimecode(clip.end_time - clip.start_time);

  return `🎞️  ${colors.bold(clip.name || 'Untitled Clip')} (${clip.id})
  Media: ${clip.media_asset?.filename || 'No media'}
  Timeline: ${startTime} → ${endTime} (${duration})
  Track: ${clip.track_index}
  Source: ${formatTimecode(clip.source_start || 0)} → ${formatTimecode(clip.source_end || 0)}`;
}

/**
 * Create a new timeline sequence
 */
async function createSequence(projectId: string): Promise<void> {
  try {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Sequence name:',
        validate: (input: string) =>
          input.trim().length > 0 || 'Sequence name is required',
      },
      {
        type: 'input',
        name: 'description',
        message: 'Description (optional):',
      },
      {
        type: 'input',
        name: 'resolution',
        message: 'Resolution (e.g., 1920x1080):',
        default: '1920x1080',
        validate: (input: string) => {
          const pattern = /^\d+x\d+$/;
          return (
            pattern.test(input) ||
            'Please enter resolution in format WIDTHxHEIGHT'
          );
        },
      },
      {
        type: 'number',
        name: 'frameRate',
        message: 'Frame rate (fps):',
        default: 30,
        validate: (input: number) =>
          (input > 0 && input <= 120) || 'Frame rate must be between 1 and 120',
      },
      {
        type: 'number',
        name: 'audioSampleRate',
        message: 'Audio sample rate (Hz):',
        default: 48000,
      },
    ]);

    const sequenceData: CreateTimelineSequenceData = {
      project_id: projectId,
      name: answers.name.trim(),
      description: answers.description?.trim() || undefined,
      settings: {
        resolution: answers.resolution,
        frameRate: answers.frameRate,
        audioSampleRate: answers.audioSampleRate,
        audioChannels: 2,
      },
    };

    console.log(colors.cyan('\nCreating timeline sequence...'));
    const result = await timelineService.createSequence(sequenceData, 'system');

    if (result.success && result.data) {
      console.log(colors.green('\n✓ Sequence created successfully!'));
      console.log(formatSequence(result.data));

      // Create default tracks
      console.log(colors.cyan('\nCreating default tracks...'));

      const defaultTracks = [
        { track_type: 'video' as TrackType, name: 'Video 1', track_index: 0 },
        { track_type: 'video' as TrackType, name: 'Video 2', track_index: 1 },
        { track_type: 'audio' as TrackType, name: 'Audio 1', track_index: 0 },
        { track_type: 'audio' as TrackType, name: 'Audio 2', track_index: 1 },
      ];

      for (const trackData of defaultTracks) {
        await timelineService.createTrack({
          sequence_id: result.data.id,
          ...trackData,
        });
      }

      console.log(colors.green('✓ Default tracks created!'));
    } else {
      console.error(colors.red('\n✗ Failed to create sequence:'), result.error);
    }
  } catch (error) {
    console.error(colors.red('\n✗ Error creating sequence:'), error);
  }
}

/**
 * List timeline sequences
 */
async function listSequences(
  projectId: string,
  options: { limit?: number }
): Promise<void> {
  try {
    console.log(colors.cyan('Loading timeline sequences...'));

    const result = await timelineService.getSequencesByProject(projectId, {
      limit: options.limit || 10,
      offset: 0,
    });

    if (result.success && result.data) {
      const sequences = result.data;

      if (sequences.length === 0) {
        console.log(colors.yellow('\nNo timeline sequences found.'));
        return;
      }

      console.log(colors.bold(`\nFound ${sequences.length} sequence(s):\n`));
      sequences.forEach((sequence) => {
        console.log(formatSequence(sequence));
        console.log(''); // Empty line for spacing
      });
    } else {
      console.error(colors.red('\n✗ Failed to list sequences:'), result.error);
    }
  } catch (error) {
    console.error(colors.red('\n✗ Error listing sequences:'), error);
  }
}

/**
 * Get sequence details with tracks and clips
 */
async function getSequence(sequenceId: string): Promise<void> {
  try {
    console.log(colors.cyan(`Loading sequence ${sequenceId}...`));

    const result = await timelineService.getSequenceWithTracks(sequenceId);

    if (result.success && result.data) {
      const sequence = result.data;
      console.log(colors.bold('\nSequence Details:\n'));
      console.log(formatSequence(sequence));

      if (sequence.tracks && sequence.tracks.length > 0) {
        console.log(colors.bold('\nTracks:'));

        // Group tracks by type
        const videoTracks = sequence.tracks.filter(
          (t: any) => t.track_type === 'video'
        );
        const audioTracks = sequence.tracks.filter(
          (t: any) => t.track_type === 'audio'
        );

        if (videoTracks.length > 0) {
          console.log(colors.bold('\n  Video Tracks:'));
          videoTracks.forEach((track: any) => {
            console.log(`    ${formatTrack(track)}`);
          });
        }

        if (audioTracks.length > 0) {
          console.log(colors.bold('\n  Audio Tracks:'));
          audioTracks.forEach((track: any) => {
            console.log(`    ${formatTrack(track)}`);
          });
        }
      }

      // Get clips for this sequence
      const clipsResult = await timelineService.getClipsBySequence(sequenceId);
      if (
        clipsResult.success &&
        clipsResult.data &&
        clipsResult.data.length > 0
      ) {
        console.log(colors.bold('\nClips:'));
        clipsResult.data.forEach((clip: any) => {
          console.log(`  ${formatClip(clip)}`);
        });
      }
    } else {
      console.error(colors.red('\n✗ Sequence not found:'), result.error);
    }
  } catch (error) {
    console.error(colors.red('\n✗ Error getting sequence:'), error);
  }
}

/**
 * Add clip to timeline
 */
async function addClip(
  sequenceId: string,
  options: { mediaId?: string; track?: number; startTime?: number }
): Promise<void> {
  try {
    let mediaAssetId = options.mediaId;
    let trackIndex = options.track;
    let startTime = options.startTime || 0;

    // If media ID not provided, prompt for it
    if (!mediaAssetId) {
      const mediaAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'mediaId',
          message: 'Media asset ID:',
          validate: (input: string) =>
            input.trim().length > 0 || 'Media asset ID is required',
        },
      ]);
      mediaAssetId = mediaAnswer.mediaId;
    }

    // If track not specified, show available tracks
    if (trackIndex === undefined) {
      const sequenceResult =
        await timelineService.getSequenceWithTracks(sequenceId);
      if (sequenceResult.success && sequenceResult.data?.tracks) {
        const tracks = sequenceResult.data.tracks;

        const trackAnswer = await inquirer.prompt([
          {
            type: 'list',
            name: 'trackIndex',
            message: 'Select track:',
            choices: tracks.map((track: any) => ({
              name: `${track.track_type.toUpperCase()} - Track ${track.track_index}: ${track.name}`,
              value: track.track_index,
            })),
          },
        ]);
        trackIndex = trackAnswer.trackIndex;
      }
    }

    const clipAnswers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Clip name (optional):',
      },
      {
        type: 'number',
        name: 'startTime',
        message: 'Timeline start time (seconds):',
        default: startTime,
      },
      {
        type: 'number',
        name: 'duration',
        message: 'Clip duration (seconds):',
        default: 5,
      },
      {
        type: 'number',
        name: 'sourceStart',
        message: 'Source start time (seconds):',
        default: 0,
      },
    ]);

    const clipData: CreateClipData = {
      sequence_id: sequenceId,
      media_asset_id: mediaAssetId,
      track_index: trackIndex!,
      name: clipAnswers.name?.trim() || undefined,
      start_time: clipAnswers.startTime,
      end_time: clipAnswers.startTime + clipAnswers.duration,
      source_start: clipAnswers.sourceStart,
      source_end: clipAnswers.sourceStart + clipAnswers.duration,
    };

    console.log(colors.cyan('\nAdding clip to timeline...'));
    const result = await timelineService.addClip(clipData, 'system');

    if (result.success && result.data) {
      console.log(colors.green('\n✓ Clip added successfully!'));
      console.log(formatClip(result.data));
    } else {
      console.error(colors.red('\n✗ Failed to add clip:'), result.error);
    }
  } catch (error) {
    console.error(colors.red('\n✗ Error adding clip:'), error);
  }
}

/**
 * Move clip on timeline
 */
async function moveClip(
  clipId: string,
  options: { startTime?: number; track?: number }
): Promise<void> {
  try {
    // Get current clip data
    const clipResult = await timelineService.getClipById(clipId);
    if (!clipResult.success || !clipResult.data) {
      console.error(colors.red('\n✗ Clip not found'));
      return;
    }

    const clip = clipResult.data;
    const duration = clip.end_time - clip.start_time;

    let newStartTime = options.startTime;
    let newTrackIndex = options.track;

    if (newStartTime === undefined) {
      const timeAnswer = await inquirer.prompt([
        {
          type: 'number',
          name: 'startTime',
          message: 'New start time (seconds):',
          default: clip.start_time,
        },
      ]);
      newStartTime = timeAnswer.startTime;
    }

    if (newTrackIndex === undefined) {
      const trackAnswer = await inquirer.prompt([
        {
          type: 'number',
          name: 'trackIndex',
          message: 'New track index:',
          default: clip.track_index,
        },
      ]);
      newTrackIndex = trackAnswer.trackIndex;
    }

    const updateData: UpdateClipData = {
      track_index: newTrackIndex,
      start_time: newStartTime,
      end_time: newStartTime + duration,
    };

    console.log(colors.cyan('\nMoving clip...'));
    const result = await timelineService.updateClip(
      clipId,
      updateData,
      'system'
    );

    if (result.success && result.data) {
      console.log(colors.green('\n✓ Clip moved successfully!'));
      console.log(formatClip(result.data));
    } else {
      console.error(colors.red('\n✗ Failed to move clip:'), result.error);
    }
  } catch (error) {
    console.error(colors.red('\n✗ Error moving clip:'), error);
  }
}

/**
 * Split clip at specific time
 */
async function splitClip(
  clipId: string,
  options: { splitTime?: number }
): Promise<void> {
  try {
    // Get current clip data
    const clipResult = await timelineService.getClipById(clipId);
    if (!clipResult.success || !clipResult.data) {
      console.error(colors.red('\n✗ Clip not found'));
      return;
    }

    const clip = clipResult.data;
    let splitTime = options.splitTime;

    if (splitTime === undefined) {
      const splitAnswer = await inquirer.prompt([
        {
          type: 'number',
          name: 'splitTime',
          message: `Split time (${clip.start_time} - ${clip.end_time} seconds):`,
          validate: (input: number) => {
            if (input <= clip.start_time || input >= clip.end_time) {
              return `Split time must be between ${clip.start_time} and ${clip.end_time}`;
            }
            return true;
          },
        },
      ]);
      splitTime = splitAnswer.splitTime;
    }

    console.log(colors.cyan('\nSplitting clip...'));
    const result = await timelineService.splitClip(clipId, splitTime, 'system');

    if (result.success && result.data) {
      console.log(colors.green('\n✓ Clip split successfully!'));
      console.log('Original clip:');
      console.log(formatClip(result.data.firstClip));
      console.log('\nNew clip:');
      console.log(formatClip(result.data.secondClip));
    } else {
      console.error(colors.red('\n✗ Failed to split clip:'), result.error);
    }
  } catch (error) {
    console.error(colors.red('\n✗ Error splitting clip:'), error);
  }
}

/**
 * Delete clip from timeline
 */
async function deleteClip(
  clipId: string,
  options: { force?: boolean }
): Promise<void> {
  try {
    // Get clip details first
    const clipResult = await timelineService.getClipById(clipId);
    if (!clipResult.success || !clipResult.data) {
      console.error(colors.red('\n✗ Clip not found'));
      return;
    }

    const clip = clipResult.data;

    if (!options.force) {
      const confirmation = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Are you sure you want to delete clip "${clip.name || 'Untitled'}"?`,
          default: false,
        },
      ]);

      if (!confirmation.confirm) {
        console.log(colors.yellow('Operation cancelled.'));
        return;
      }
    }

    console.log(colors.cyan('\nDeleting clip...'));
    const result = await timelineService.deleteClip(clipId, 'system');

    if (result.success) {
      console.log(colors.green('\n✓ Clip deleted successfully.'));
    } else {
      console.error(colors.red('\n✗ Failed to delete clip:'), result.error);
    }
  } catch (error) {
    console.error(colors.red('\n✗ Error deleting clip:'), error);
  }
}

/**
 * Interactive timeline editing workflow
 */
async function editWorkflow(sequenceId: string): Promise<void> {
  try {
    console.log(colors.bold('\nTimeline Editing Workflow'));

    while (true) {
      const answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            { name: 'View sequence details', value: 'view' },
            { name: 'Add clip to timeline', value: 'add' },
            { name: 'Move existing clip', value: 'move' },
            { name: 'Split clip', value: 'split' },
            { name: 'Delete clip', value: 'delete' },
            { name: 'Exit workflow', value: 'exit' },
          ],
        },
      ]);

      switch (answers.action) {
        case 'view':
          await getSequence(sequenceId);
          break;
        case 'add':
          await addClip(sequenceId, {});
          break;
        case 'move':
          const moveAnswer = await inquirer.prompt([
            {
              type: 'input',
              name: 'clipId',
              message: 'Clip ID to move:',
              validate: (input: string) =>
                input.trim().length > 0 || 'Clip ID is required',
            },
          ]);
          await moveClip(moveAnswer.clipId, {});
          break;
        case 'split':
          const splitAnswer = await inquirer.prompt([
            {
              type: 'input',
              name: 'clipId',
              message: 'Clip ID to split:',
              validate: (input: string) =>
                input.trim().length > 0 || 'Clip ID is required',
            },
          ]);
          await splitClip(splitAnswer.clipId, {});
          break;
        case 'delete':
          const deleteAnswer = await inquirer.prompt([
            {
              type: 'input',
              name: 'clipId',
              message: 'Clip ID to delete:',
              validate: (input: string) =>
                input.trim().length > 0 || 'Clip ID is required',
            },
          ]);
          await deleteClip(deleteAnswer.clipId, {});
          break;
        case 'exit':
          console.log(colors.green('\nExiting timeline editing workflow.'));
          return;
      }

      console.log(''); // Empty line for spacing
    }
  } catch (error) {
    console.error(colors.red('\n✗ Error in editing workflow:'), error);
  }
}

/**
 * Main CLI program setup
 */
async function main(): Promise<void> {
  await initializeDatabase();

  program
    .name('timeline-cli')
    .description('CollabCut Timeline Operations CLI')
    .version('1.0.0');

  // Create sequence command
  program
    .command('create-sequence <projectId>')
    .alias('new')
    .description('Create a new timeline sequence')
    .action(createSequence);

  // List sequences command
  program
    .command('list-sequences <projectId>')
    .alias('ls')
    .description('List timeline sequences for a project')
    .option('-l, --limit <number>', 'Limit number of results', parseInt, 10)
    .action(listSequences);

  // Get sequence command
  program
    .command('get-sequence <sequenceId>')
    .alias('show')
    .description('Get detailed information about a sequence')
    .action(getSequence);

  // Add clip command
  program
    .command('add-clip <sequenceId>')
    .description('Add a clip to the timeline')
    .option('-m, --media-id <mediaId>', 'Media asset ID')
    .option('-t, --track <track>', 'Track index', parseInt)
    .option('-s, --start-time <time>', 'Start time in seconds', parseFloat)
    .action(addClip);

  // Move clip command
  program
    .command('move-clip <clipId>')
    .description('Move a clip on the timeline')
    .option('-s, --start-time <time>', 'New start time in seconds', parseFloat)
    .option('-t, --track <track>', 'New track index', parseInt)
    .action(moveClip);

  // Split clip command
  program
    .command('split-clip <clipId>')
    .description('Split a clip at specific time')
    .option('-t, --split-time <time>', 'Split time in seconds', parseFloat)
    .action(splitClip);

  // Delete clip command
  program
    .command('delete-clip <clipId>')
    .alias('rm-clip')
    .description('Delete a clip from timeline')
    .option('-f, --force', 'Force deletion without confirmation')
    .action(deleteClip);

  // Interactive editing workflow
  program
    .command('edit <sequenceId>')
    .description('Interactive timeline editing workflow')
    .action(editWorkflow);

  // Parse command line arguments
  program.parse();
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error(colors.red('\n✗ Uncaught exception:'), error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error(colors.red('\n✗ Unhandled rejection:'), reason);
  process.exit(1);
});

// Run the CLI
if (require.main === module) {
  main().catch((error) => {
    console.error(colors.red('\n✗ CLI error:'), error);
    process.exit(1);
  });
}

export { main as runTimelineCLI };
