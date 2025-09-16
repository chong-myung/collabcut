#!/usr/bin/env ts-node

/**
 * CollabCut Project Management CLI (T039)
 * Command-line interface for project management operations
 * Supports creating, listing, updating, and deleting projects
 */

import { program } from 'commander';
import inquirer from 'inquirer';
import * as path from 'path';
import * as fs from 'fs';
import { ProjectService } from '../main/src/services/project.service';
import { DatabaseService } from '../main/src/services/database.service';
import {
  CreateProjectData,
  UpdateProjectData,
} from '../main/src/models/project';
import { ProjectStatus, ProjectRole } from '../shared/types/database';

// Initialize services
const databaseService = new DatabaseService();
const projectService = new ProjectService(databaseService);

// Color utilities for console output
const colors = {
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  blue: (text: string) => `\x1b[34m${text}\x1b[0m`,
  cyan: (text: string) => `\x1b[36m${text}\x1b[0m`,
  bold: (text: string) => `\x1b[1m${text}\x1b[0m`,
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
 * Format project data for display
 */
function formatProject(project: any): string {
  const status =
    project.status === 'active' ? colors.green('●') : colors.yellow('●');
  const created = new Date(project.created_at).toLocaleDateString();

  return `${status} ${colors.bold(project.name)} (${project.id})
  Description: ${project.description || 'No description'}
  Status: ${project.status}
  Created: ${created}
  Members: ${project.member_count || 0}`;
}

/**
 * Create a new project
 */
async function createProject(): Promise<void> {
  try {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Project name:',
        validate: (input: string) =>
          input.trim().length > 0 || 'Project name is required',
      },
      {
        type: 'input',
        name: 'description',
        message: 'Project description (optional):',
      },
      {
        type: 'list',
        name: 'status',
        message: 'Initial status:',
        choices: [
          { name: 'Active', value: 'active' },
          { name: 'Draft', value: 'draft' },
        ],
        default: 'active',
      },
      {
        type: 'input',
        name: 'resolution',
        message: 'Video resolution (e.g., 1920x1080):',
        default: '1920x1080',
        validate: (input: string) => {
          const pattern = /^\d+x\d+$/;
          return (
            pattern.test(input) ||
            'Please enter resolution in format WIDTHxHEIGHT (e.g., 1920x1080)'
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
    ]);

    const projectData: CreateProjectData = {
      name: answers.name.trim(),
      description: answers.description?.trim() || undefined,
      created_by: 'cli-user', // CLI 사용자
      settings: {
        resolution: answers.resolution,
        frameRate: answers.frameRate,
        audioSampleRate: 48000,
        audioChannels: 2,
      },
    };

    console.log(colors.cyan('\nCreating project...'));
    const result = await projectService.createProject(projectData); // Using system user for CLI

    if (result.success && result.data) {
      console.log(colors.green('\n✓ Project created successfully!'));
      console.log(formatProject(result.data));
    } else {
      console.error(colors.red('\n✗ Failed to create project:'), result.error);
    }
  } catch (error) {
    console.error(colors.red('\n✗ Error creating project:'), error);
  }
}

/**
 * List all projects
 */
async function listProjects(options: {
  status?: string;
  limit?: number;
}): Promise<void> {
  try {
    console.log(colors.cyan('Loading projects...'));

    const searchOptions = {
      status: options.status as ProjectStatus,
      limit: options.limit || 10,
      offset: 0,
    };

    const result = await projectService.searchProjects(searchOptions);

    if (result.success && result.data) {
      const { projects, total } = result.data;
      if (projects.length === 0) {
        console.log(colors.yellow('\nNo projects found.'));
        return;
      }

      console.log(colors.bold(`\nFound ${total} project(s):\n`));
      projects.forEach((project) => {
        console.log(formatProject(project));
        console.log(''); // Empty line for spacing
      });

      if (total > projects.length) {
        console.log(
          colors.cyan(
            `Showing ${projects.length} of ${total} projects. Use --limit to see more.`
          )
        );
      }
    } else {
      console.error(colors.red('\n✗ Failed to list projects:'), result.error);
    }
  } catch (error) {
    console.error(colors.red('\n✗ Error listing projects:'), error);
  }
}

/**
 * Get project details
 */
async function getProject(projectId: string): Promise<void> {
  try {
    console.log(colors.cyan(`Loading project ${projectId}...`));
    const result = await projectService.getProject(projectId, 'cli-user');

    if (result.success && result.data) {
      const project = result.data;
      console.log(colors.bold('\nProject Details:\n'));
      console.log(formatProject(project));
      if (project.settings) {
        console.log(colors.bold('\nSettings:'));
        console.log(
          `  Resolution: ${project.settings.resolution || 'Not set'}`
        );
        console.log(
          `  Frame Rate: ${project.settings.frameRate || 'Not set'} fps`
        );
        console.log(
          `  Audio Sample Rate: ${project.settings.audioSampleRate || 'Not set'} Hz`
        );
        console.log(
          `  Audio Channels: ${project.settings.audioChannels || 'Not set'}`
        );
      }

      // Get project members
      const membersResult = await projectService.getProjectMembers(
        projectId,
        'cli-user'
      );
      if (membersResult.success && membersResult.data) {
        console.log(colors.bold('\nMembers:'));
        membersResult.data.forEach((member) => {
          const roleColor =
            member.role === 'owner'
              ? colors.green
              : member.role === 'editor'
                ? colors.blue
                : colors.yellow;
          console.log(
            `  ${roleColor('●')} ${member.user.display_name} (@${member.user.username}) - ${member.role}`
          );
        });
      }
    } else {
      console.error(
        colors.red('\n✗ Project not found or access denied:'),
        result.error
      );
    }
  } catch (error) {
    console.error(colors.red('\n✗ Error getting project:'), error);
  }
}

/**
 * Update project
 */
async function updateProject(projectId: string): Promise<void> {
  try {
    // First get current project data
    const currentResult = await projectService.getProject(
      projectId,
      'cli-user'
    );
    if (!currentResult.success || !currentResult.data) {
      console.error(colors.red('\n✗ Project not found or access denied'));
      return;
    }

    const current = currentResult.data;

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Project name:',
        default: current.name,
        validate: (input: string) =>
          input.trim().length > 0 || 'Project name is required',
      },
      {
        type: 'input',
        name: 'description',
        message: 'Project description:',
        default: current.description || '',
      },
      {
        type: 'list',
        name: 'status',
        message: 'Status:',
        choices: [
          { name: 'Active', value: 'active' },
          { name: 'Draft', value: 'draft' },
          { name: 'Archived', value: 'archived' },
        ],
        default: current.status,
      },
    ]);

    const updateData: UpdateProjectData = {
      name: answers.name.trim(),
      description: answers.description?.trim() || undefined,
      status: answers.status as ProjectStatus,
    };

    console.log(colors.cyan('\nUpdating project...'));
    const result = await projectService.updateProject(
      projectId,
      updateData,
      'cli-user'
    );

    if (result.success && result.data) {
      console.log(colors.green('\n✓ Project updated successfully!'));
      console.log(formatProject(result.data));
    } else {
      console.error(colors.red('\n✗ Failed to update project:'), result.error);
    }
  } catch (error) {
    console.error(colors.red('\n✗ Error updating project:'), error);
  }
}

/**
 * Delete project
 */
async function deleteProject(
  projectId: string,
  options: { force?: boolean }
): Promise<void> {
  try {
    // Get project details first
    const projectResult = await projectService.getProject(
      projectId,
      'cli-user'
    );
    if (!projectResult.success || !projectResult.data) {
      console.error(colors.red('\n✗ Project not found or access denied'));
      return;
    }

    const project = projectResult.data;

    if (!options.force) {
      const confirmation = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Are you sure you want to delete project "${project.name}"? This action cannot be undone.`,
          default: false,
        },
      ]);

      if (!confirmation.confirm) {
        console.log(colors.yellow('Operation cancelled.'));
        return;
      }
    }

    console.log(colors.cyan('\nDeleting project...'));
    const result = await projectService.deleteProject(projectId, 'cli-user');

    if (result.success) {
      console.log(colors.green('\n✓ Project deleted successfully.'));
    } else {
      console.error(colors.red('\n✗ Failed to delete project:'), result.error);
    }
  } catch (error) {
    console.error(colors.red('\n✗ Error deleting project:'), error);
  }
}

/**
 * Main CLI program setup
 */
async function main(): Promise<void> {
  await initializeDatabase();

  program
    .name('collabcut-cli')
    .description('CollabCut Project Management CLI')
    .version('1.0.0');

  // Create project command
  program
    .command('create')
    .alias('new')
    .description('Create a new project')
    .action(createProject);

  // List projects command
  program
    .command('list')
    .alias('ls')
    .description('List all projects')
    .option(
      '-s, --status <status>',
      'Filter by status (active, draft, archived)'
    )
    .option('-l, --limit <number>', 'Limit number of results', parseInt, 10)
    .action(listProjects);

  // Get project command
  program
    .command('get <projectId>')
    .alias('show')
    .description('Get detailed information about a project')
    .action(getProject);

  // Update project command
  program
    .command('update <projectId>')
    .alias('edit')
    .description('Update project information')
    .action(updateProject);

  // Delete project command
  program
    .command('delete <projectId>')
    .alias('rm')
    .description('Delete a project')
    .option('-f, --force', 'Force deletion without confirmation')
    .action(deleteProject);

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

export { main as runProjectCLI };
