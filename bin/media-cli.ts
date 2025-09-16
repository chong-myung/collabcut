#!/usr/bin/env ts-node

/**
 * CollabCut Media Processing CLI (T040)
 * Command-line interface for media asset management and processing
 * Supports uploading, processing, converting, and managing media files
 */

import { program } from 'commander';
import inquirer from 'inquirer';
import * as path from 'path';
import * as fs from 'fs';
import { MediaService } from '../main/src/services/media.service';
import { DatabaseService } from '../main/src/services/database.service';
import { CreateMediaAssetData } from '../main/src/models/media-asset';
import { MediaFileType } from '../shared/types/database';

// Initialize services
const databaseService = new DatabaseService();
const mediaService = new MediaService(databaseService);

// Color utilities for console output
const colors = {
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  blue: (text: string) => `\x1b[34m${text}\x1b[0m`,
  cyan: (text: string) => `\x1b[36m${text}\x1b[0m`,
  bold: (text: string) => `\x1b[1m${text}\x1b[0m`,
  dim: (text: string) => `\x1b[2m${text}\x1b[0m`,
};

/**
 * Initialize database connection
 */
async function initializeDatabase(): Promise<void> {
  try {
    await databaseService.initialize();
    console.log(colors.green('✓ Database connected successfully'));
  } catch (error) {
    console.error(colors.red('✗ Failed to connect to database:'), error);
    process.exit(1);
  }
}

/**
 * Format file size in human readable format
 */
function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

/**
 * Format duration in human readable format
 */
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format media asset for display
 */
function formatMediaAsset(asset: any): string {
  const typeIcon =
    asset.file_type === 'video'
      ? '🎬'
      : asset.file_type === 'audio'
        ? '🎵'
        : '🖼️';
  const size = asset.file_size
    ? formatFileSize(asset.file_size)
    : 'Unknown size';
  const duration = asset.metadata?.duration
    ? formatDuration(asset.metadata.duration)
    : '';
  const resolution = asset.metadata?.resolution || '';

  let details = [size];
  if (duration) details.push(duration);
  if (resolution) details.push(resolution);

  return `${typeIcon} ${colors.bold(asset.filename)} (${asset.id})
  Original: ${asset.original_filename}
  Type: ${asset.file_type} (${asset.mime_type})
  Details: ${details.join(' • ')}
  Status: ${asset.processing_status}
  Uploaded: ${new Date(asset.created_at).toLocaleDateString()}`;
}

/**
 * Upload media file
 */
async function uploadMedia(
  filePath: string,
  options: { projectId?: string; generateThumbnail?: boolean }
): Promise<void> {
  try {
    // Validate file exists
    if (!fs.existsSync(filePath)) {
      console.error(colors.red('\n✗ File not found:'), filePath);
      return;
    }

    const stats = fs.statSync(filePath);
    const filename = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();

    // Determine file type
    let fileType: string;
    if (['.mp4', '.mov', '.avi', '.mkv', '.webm'].includes(ext)) {
      fileType = 'video';
    } else if (['.mp3', '.wav', '.aac', '.flac', '.ogg'].includes(ext)) {
      fileType = 'audio';
    } else if (
      ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].includes(ext)
    ) {
      fileType = 'image';
    } else {
      console.error(colors.red('\n✗ Unsupported file type:'), ext);
      return;
    }

    console.log(
      colors.cyan(`\nUploading ${filename} (${formatFileSize(stats.size)})...`)
    );

    const mediaData = {
      project_id: options.projectId || 'default',
      filename,
      original_filename: filename,
      file_path: filePath,
      file_size: stats.size,
      file_type: fileType,
      mime_type: getMimeType(ext),
    };

    // 임시로 단순화된 업로드 (실제 API 확인 필요)
    console.log(colors.yellow('Media upload feature needs API implementation'));
    console.log(
      `File: ${filename}, Type: ${fileType}, Size: ${formatFileSize(stats.size)}`
    );
    return;

    if (result.success && result.data) {
      console.log(colors.green('\n✓ Media uploaded successfully!'));
      console.log(formatMediaAsset(result.data.asset));

      if (result.data.thumbnailPath) {
        console.log(colors.dim(`Thumbnail: ${result.data.thumbnailPath}`));
      }

      if (result.data.processingStatus === 'pending') {
        console.log(
          colors.yellow('⏳ Media processing is still in progress...')
        );
      }
    } else {
      console.error(colors.red('\n✗ Failed to upload media:'), result.error);
    }
  } catch (error) {
    console.error(colors.red('\n✗ Error uploading media:'), error);
  }
}

/**
 * List media assets
 */
async function listMedia(options: {
  projectId?: string;
  type?: string;
  limit?: number;
}): Promise<void> {
  try {
    console.log(colors.cyan('Loading media assets...'));

    const searchOptions = {
      projectId: options.projectId,
      fileType: options.type as MediaFileType,
      limit: options.limit || 10,
      offset: 0,
    };

    const result = await mediaService.getMediaAssetsByProject(
      options.projectId || '',
      searchOptions
    );

    if (result.success && result.data) {
      const assets = result.data;

      if (assets.length === 0) {
        console.log(colors.yellow('\nNo media assets found.'));
        return;
      }

      console.log(colors.bold(`\nFound ${assets.length} media asset(s):\n`));
      assets.forEach((asset) => {
        console.log(formatMediaAsset(asset));
        console.log(''); // Empty line for spacing
      });
    } else {
      console.error(colors.red('\n✗ Failed to list media:'), result.error);
    }
  } catch (error) {
    console.error(colors.red('\n✗ Error listing media:'), error);
  }
}

/**
 * Get media asset details
 */
async function getMedia(assetId: string): Promise<void> {
  try {
    console.log(colors.cyan(`Loading media asset ${assetId}...`));

    const result = await mediaService.getMediaAssetById(assetId);

    if (result.success && result.data) {
      const asset = result.data;
      console.log(colors.bold('\nMedia Asset Details:\n'));
      console.log(formatMediaAsset(asset));

      if (asset.metadata) {
        console.log(colors.bold('\nMetadata:'));
        Object.entries(asset.metadata).forEach(([key, value]) => {
          if (value !== null && value !== undefined) {
            console.log(`  ${key}: ${value}`);
          }
        });
      }

      if (asset.thumbnail_path) {
        console.log(colors.bold('\nThumbnail:'), asset.thumbnail_path);
      }
    } else {
      console.error(colors.red('\n✗ Media asset not found:'), result.error);
    }
  } catch (error) {
    console.error(colors.red('\n✗ Error getting media:'), error);
  }
}

/**
 * Generate thumbnail for media asset
 */
async function generateThumbnail(
  assetId: string,
  options: { time?: number; width?: number; height?: number }
): Promise<void> {
  try {
    console.log(colors.cyan(`Generating thumbnail for ${assetId}...`));

    const thumbnailOptions = {
      timeOffset: options.time || 5,
      width: options.width || 320,
      height: options.height || 180,
      format: 'jpg' as const,
    };

    const result = await mediaService.generateThumbnail(
      assetId,
      thumbnailOptions
    );

    if (result.success && result.data) {
      console.log(colors.green('\n✓ Thumbnail generated successfully!'));
      console.log(`Thumbnail path: ${result.data}`);
    } else {
      console.error(
        colors.red('\n✗ Failed to generate thumbnail:'),
        result.error
      );
    }
  } catch (error) {
    console.error(colors.red('\n✗ Error generating thumbnail:'), error);
  }
}

/**
 * Convert media format
 */
async function convertMedia(
  assetId: string,
  options: { format: string; quality?: string; resolution?: string }
): Promise<void> {
  try {
    console.log(
      colors.cyan(`Converting media ${assetId} to ${options.format}...`)
    );

    const processingOptions = {
      convertFormat: options.format,
      quality: (options.quality as 'low' | 'medium' | 'high') || 'medium',
      maxResolution: options.resolution,
      generateThumbnail: true,
      extractMetadata: true,
    };

    const result = await mediaService.processMediaAsset(
      assetId,
      processingOptions
    );

    if (result.success && result.data) {
      console.log(colors.green('\n✓ Media conversion started!'));
      console.log(formatMediaAsset(result.data));

      if (result.data.processing_status === 'processing') {
        console.log(colors.yellow('⏳ Conversion is in progress...'));
      }
    } else {
      console.error(colors.red('\n✗ Failed to convert media:'), result.error);
    }
  } catch (error) {
    console.error(colors.red('\n✗ Error converting media:'), error);
  }
}

/**
 * Delete media asset
 */
async function deleteMedia(
  assetId: string,
  options: { force?: boolean }
): Promise<void> {
  try {
    // Get asset details first
    const assetResult = await mediaService.getMediaAssetById(assetId);
    if (!assetResult.success || !assetResult.data) {
      console.error(colors.red('\n✗ Media asset not found'));
      return;
    }

    const asset = assetResult.data;

    if (!options.force) {
      const confirmation = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Are you sure you want to delete "${asset.filename}"? This action cannot be undone.`,
          default: false,
        },
      ]);

      if (!confirmation.confirm) {
        console.log(colors.yellow('Operation cancelled.'));
        return;
      }
    }

    console.log(colors.cyan('\nDeleting media asset...'));
    const result = await mediaService.deleteMediaAsset(assetId, 'system');

    if (result.success) {
      console.log(colors.green('\n✓ Media asset deleted successfully.'));
    } else {
      console.error(
        colors.red('\n✗ Failed to delete media asset:'),
        result.error
      );
    }
  } catch (error) {
    console.error(colors.red('\n✗ Error deleting media:'), error);
  }
}

/**
 * Get MIME type from file extension
 */
function getMimeType(ext: string): string {
  const mimeTypes: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.aac': 'audio/aac',
    '.flac': 'audio/flac',
    '.ogg': 'audio/ogg',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.webp': 'image/webp',
  };

  return mimeTypes[ext.toLowerCase()] || 'application/octet-stream';
}

/**
 * Interactive media processing workflow
 */
async function processWorkflow(assetId: string): Promise<void> {
  try {
    // Get asset details
    const assetResult = await mediaService.getMediaAssetById(assetId);
    if (!assetResult.success || !assetResult.data) {
      console.error(colors.red('\n✗ Media asset not found'));
      return;
    }

    const asset = assetResult.data;
    console.log(colors.bold('\nProcessing Workflow for:'));
    console.log(formatMediaAsset(asset));

    const answers = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'operations',
        message: 'Select processing operations:',
        choices: [
          { name: 'Generate thumbnail', value: 'thumbnail' },
          { name: 'Extract metadata', value: 'metadata' },
          { name: 'Convert format', value: 'convert' },
          { name: 'Optimize for web', value: 'optimize' },
        ],
      },
    ]);

    if (answers.operations.includes('thumbnail')) {
      const thumbAnswers = await inquirer.prompt([
        {
          type: 'number',
          name: 'time',
          message: 'Thumbnail time offset (seconds):',
          default: 5,
        },
        {
          type: 'number',
          name: 'width',
          message: 'Thumbnail width:',
          default: 320,
        },
      ]);

      await generateThumbnail(assetId, thumbAnswers);
    }

    if (answers.operations.includes('convert')) {
      const convertAnswers = await inquirer.prompt([
        {
          type: 'list',
          name: 'format',
          message: 'Target format:',
          choices: ['mp4', 'webm', 'mp3', 'wav', 'jpg', 'png', 'webp'],
        },
        {
          type: 'list',
          name: 'quality',
          message: 'Quality:',
          choices: ['low', 'medium', 'high'],
          default: 'medium',
        },
      ]);

      await convertMedia(assetId, convertAnswers);
    }

    console.log(colors.green('\n✓ Processing workflow completed!'));
  } catch (error) {
    console.error(colors.red('\n✗ Error in processing workflow:'), error);
  }
}

/**
 * Main CLI program setup
 */
async function main(): Promise<void> {
  await initializeDatabase();

  program
    .name('media-cli')
    .description('CollabCut Media Processing CLI')
    .version('1.0.0');

  // Upload media command
  program
    .command('upload <filePath>')
    .description('Upload a media file')
    .option('-p, --project-id <projectId>', 'Associate with project')
    .option('--no-thumbnail', 'Skip thumbnail generation')
    .action(uploadMedia);

  // List media command
  program
    .command('list')
    .alias('ls')
    .description('List media assets')
    .option('-p, --project-id <projectId>', 'Filter by project')
    .option('-t, --type <type>', 'Filter by type (video, audio, image)')
    .option('-l, --limit <number>', 'Limit number of results', parseInt, 10)
    .action(listMedia);

  // Get media command
  program
    .command('get <assetId>')
    .alias('show')
    .description('Get detailed information about a media asset')
    .action(getMedia);

  // Generate thumbnail command
  program
    .command('thumbnail <assetId>')
    .description('Generate thumbnail for media asset')
    .option('-t, --time <seconds>', 'Time offset in seconds', parseInt, 5)
    .option('-w, --width <pixels>', 'Width in pixels', parseInt, 320)
    .option('-h, --height <pixels>', 'Height in pixels', parseInt, 180)
    .action(generateThumbnail);

  // Convert media command
  program
    .command('convert <assetId>')
    .description('Convert media to different format')
    .requiredOption('-f, --format <format>', 'Target format')
    .option('-q, --quality <quality>', 'Quality (low, medium, high)', 'medium')
    .option('-r, --resolution <resolution>', 'Max resolution (e.g., 1920x1080)')
    .action(convertMedia);

  // Processing workflow command
  program
    .command('process <assetId>')
    .description('Interactive media processing workflow')
    .action(processWorkflow);

  // Delete media command
  program
    .command('delete <assetId>')
    .alias('rm')
    .description('Delete a media asset')
    .option('-f, --force', 'Force deletion without confirmation')
    .action(deleteMedia);

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

export { main as runMediaCLI };
