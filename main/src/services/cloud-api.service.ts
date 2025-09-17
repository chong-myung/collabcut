/**
 * Cloud API Service
 * Handles communication with cloud-based project management APIs
 */

import { ProjectWithRelations } from '../models/project';
import { ProjectStatus } from '../../../shared/types/database';

export interface CloudProject {
  id: string;
  name: string;
  description?: string;
  created_by: string;
  settings: Record<string, unknown>;
  status: ProjectStatus;
  cloud_sync_enabled: boolean;
  last_sync_at?: Date;
  created_at: Date;
  updated_at: Date;
  creator: {
    id: string;
    display_name: string;
    username: string;
  };
  member_count: number;
  media_count: number;
  sequence_count: number;
  is_cloud_project: boolean; // 클라우드 전용 프로젝트인지 구분
}

export interface CloudApiConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
}

export interface CloudProjectSearchOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
  status?: ProjectStatus;
  search?: string;
}

/**
 * Cloud API Service Class
 * Handles cloud project operations
 */
export class CloudApiService {
  private config: CloudApiConfig;
  private isOnline: boolean = false;

  constructor(config: CloudApiConfig) {
    this.config = {
      timeout: 10000,
      ...config,
    };
  }

  /**
   * Check if cloud service is available
   */
  async checkConnection(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.config.timeout
      );

      const response = await fetch(`${this.config.baseUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
        headers: this.getHeaders(),
      });

      clearTimeout(timeoutId);
      this.isOnline = response.ok;
      return this.isOnline;
    } catch (error) {
      console.warn('Cloud API connection failed:', error);
      this.isOnline = false;
      return false;
    }
  }

  /**
   * Get user's projects from cloud
   * @param userId - User ID
   * @param options - Search options
   * @returns Promise with cloud projects array
   */
  async getUserProjects(
    userId: string,
    options: CloudProjectSearchOptions = {}
  ): Promise<{ success: boolean; data?: CloudProject[]; error?: string }> {
    try {
      // Check connection first
      const isConnected = await this.checkConnection();
      if (!isConnected) {
        return {
          success: false,
          error: 'Cloud service is not available',
        };
      }

      const params = new URLSearchParams();
      params.append('user_id', userId);

      if (options.limit) params.append('limit', options.limit.toString());
      if (options.offset) params.append('offset', options.offset.toString());
      if (options.orderBy) params.append('order_by', options.orderBy);
      if (options.orderDirection)
        params.append('order_direction', options.orderDirection);
      if (options.status) params.append('status', options.status);
      if (options.search) params.append('search', options.search);

      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.config.timeout
      );

      const response = await fetch(
        `${this.config.baseUrl}/api/v1/projects?${params.toString()}`,
        {
          method: 'GET',
          signal: controller.signal,
          headers: this.getHeaders(),
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.success) {
        // Transform cloud projects to include is_cloud_project flag
        const cloudProjects: CloudProject[] = result.data.map(
          (project: Record<string, unknown>) => ({
            ...project,
            is_cloud_project: true,
            created_at: new Date(project.created_at as string),
            updated_at: new Date(project.updated_at as string),
            last_sync_at: project.last_sync_at
              ? new Date(project.last_sync_at as string)
              : undefined,
          })
        );

        return { success: true, data: cloudProjects };
      } else {
        return {
          success: false,
          error: result.error || 'Failed to fetch cloud projects',
        };
      }
    } catch (error) {
      console.error('Failed to fetch cloud projects:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Sync a local project to cloud
   * @param project - Local project data
   * @returns Promise with sync result
   */
  async syncProjectToCloud(
    project: ProjectWithRelations
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const isConnected = await this.checkConnection();
      if (!isConnected) {
        return {
          success: false,
          error: 'Cloud service is not available',
        };
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.config.timeout
      );

      const response = await fetch(
        `${this.config.baseUrl}/api/v1/projects/sync`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: this.getHeaders(),
          body: JSON.stringify({
            project: {
              ...project,
              is_cloud_project: false, // 로컬에서 동기화하는 프로젝트
            },
          }),
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Failed to sync project to cloud:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Download a cloud project to local
   * @param projectId - Cloud project ID
   * @param userId - User ID
   * @returns Promise with project data
   */
  async downloadProjectFromCloud(
    projectId: string,
    userId: string
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const isConnected = await this.checkConnection();
      if (!isConnected) {
        return {
          success: false,
          error: 'Cloud service is not available',
        };
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.config.timeout
      );

      const response = await fetch(
        `${this.config.baseUrl}/api/v1/projects/${projectId}/download`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: this.getHeaders(),
          body: JSON.stringify({ user_id: userId }),
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Failed to download project from cloud:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get authentication headers
   * @private
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    return headers;
  }

  /**
   * Check if service is online
   */
  isServiceOnline(): boolean {
    return this.isOnline;
  }
}

export default CloudApiService;
