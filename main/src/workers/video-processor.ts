/**
 * Video Processing Worker
 * Background video processing using worker threads for better performance
 */

import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import ffmpegService, { VideoProcessOptions } from '../services/ffmpeg.service';

export interface VideoProcessingJob {
  id: string;
  inputPath: string;
  outputPath: string;
  options: VideoProcessOptions;
  type: 'process' | 'thumbnail' | 'info' | 'trim' | 'resize' | 'convert';
  priority?: 'low' | 'normal' | 'high';
}

export interface VideoProcessingResult {
  success: boolean;
  data?: any;
  error?: string;
  progress?: number;
}

export interface VideoProcessingProgress {
  jobId: string;
  progress: number;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  message?: string;
}

// Worker thread implementation
if (!isMainThread) {
  // This code runs in the worker thread
  async function processVideoJob() {
    const job: VideoProcessingJob = workerData;

    try {
      await ffmpegService.initialize();

      let result: any;

      switch (job.type) {
        case 'process':
          result = await ffmpegService.processVideo(job.inputPath, job.outputPath, job.options);
          break;
        case 'thumbnail':
          result = await ffmpegService.extractThumbnail(job.inputPath, job.outputPath, job.options.startTime);
          break;
        case 'info':
          result = await ffmpegService.getVideoInfo(job.inputPath);
          break;
        case 'trim':
          if (job.options.startTime && job.options.duration) {
            result = await ffmpegService.trimVideo(job.inputPath, job.outputPath, job.options.startTime, job.options.duration);
          }
          break;
        case 'resize':
          if (job.options.resolution) {
            const [width, height] = job.options.resolution.split('x').map(Number);
            result = await ffmpegService.resizeVideo(job.inputPath, job.outputPath, width, height);
          }
          break;
        case 'convert':
          result = await ffmpegService.convertFormat(job.inputPath, job.outputPath, job.options.format || 'mp4');
          break;
        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }

      parentPort?.postMessage({
        success: true,
        data: result
      });
    } catch (error) {
      parentPort?.postMessage({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  processVideoJob();
}

/**
 * Video Processing Manager
 * Manages background video processing jobs using worker threads
 */
export class VideoProcessingManager {
  private workers: Map<string, Worker> = new Map();
  private jobQueue: VideoProcessingJob[] = [];
  private activeJobs: Map<string, VideoProcessingJob> = new Map();
  private maxConcurrentJobs: number = 2;
  private progressCallbacks: Map<string, (progress: VideoProcessingProgress) => void> = new Map();

  /**
   * Add a video processing job to the queue
   */
  async addJob(job: VideoProcessingJob): Promise<void> {
    // Add to queue based on priority
    if (job.priority === 'high') {
      this.jobQueue.unshift(job);
    } else {
      this.jobQueue.push(job);
    }

    // Emit progress event
    this.emitProgress({
      jobId: job.id,
      progress: 0,
      status: 'queued'
    });

    // Process queue
    await this.processQueue();
  }

  /**
   * Set progress callback for a job
   */
  setProgressCallback(jobId: string, callback: (progress: VideoProcessingProgress) => void): void {
    this.progressCallbacks.set(jobId, callback);
  }

  /**
   * Remove progress callback
   */
  removeProgressCallback(jobId: string): void {
    this.progressCallbacks.delete(jobId);
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    // Remove from queue if not started
    const queueIndex = this.jobQueue.findIndex(job => job.id === jobId);
    if (queueIndex >= 0) {
      this.jobQueue.splice(queueIndex, 1);
      this.emitProgress({
        jobId,
        progress: 0,
        status: 'failed',
        message: 'Job cancelled'
      });
      return true;
    }

    // Terminate worker if actively processing
    const worker = this.workers.get(jobId);
    if (worker) {
      await worker.terminate();
      this.workers.delete(jobId);
      this.activeJobs.delete(jobId);
      this.emitProgress({
        jobId,
        progress: 0,
        status: 'failed',
        message: 'Job cancelled'
      });
      return true;
    }

    return false;
  }

  /**
   * Get queue status
   */
  getQueueStatus(): {
    queued: number;
    active: number;
    totalJobs: number;
  } {
    return {
      queued: this.jobQueue.length,
      active: this.activeJobs.size,
      totalJobs: this.jobQueue.length + this.activeJobs.size
    };
  }

  /**
   * Process the job queue
   */
  private async processQueue(): Promise<void> {
    while (this.jobQueue.length > 0 && this.activeJobs.size < this.maxConcurrentJobs) {
      const job = this.jobQueue.shift();
      if (!job) continue;

      await this.startJob(job);
    }
  }

  /**
   * Start processing a job in a worker thread
   */
  private async startJob(job: VideoProcessingJob): Promise<void> {
    try {
      this.activeJobs.set(job.id, job);

      this.emitProgress({
        jobId: job.id,
        progress: 0,
        status: 'processing'
      });

      const worker = new Worker(__filename, {
        workerData: job
      });

      this.workers.set(job.id, worker);

      worker.on('message', (result: VideoProcessingResult) => {
        this.handleJobComplete(job.id, result);
      });

      worker.on('error', (error) => {
        this.handleJobComplete(job.id, {
          success: false,
          error: error.message
        });
      });

      worker.on('exit', (code) => {
        if (code !== 0) {
          this.handleJobComplete(job.id, {
            success: false,
            error: `Worker stopped with exit code ${code}`
          });
        }
      });

    } catch (error) {
      this.handleJobComplete(job.id, {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start job'
      });
    }
  }

  /**
   * Handle job completion
   */
  private async handleJobComplete(jobId: string, result: VideoProcessingResult): Promise<void> {
    const worker = this.workers.get(jobId);
    if (worker) {
      await worker.terminate();
      this.workers.delete(jobId);
    }

    this.activeJobs.delete(jobId);

    this.emitProgress({
      jobId,
      progress: 100,
      status: result.success ? 'completed' : 'failed',
      message: result.error
    });

    // Process next job in queue
    await this.processQueue();
  }

  /**
   * Emit progress event
   */
  private emitProgress(progress: VideoProcessingProgress): void {
    const callback = this.progressCallbacks.get(progress.jobId);
    if (callback) {
      callback(progress);
    }
  }

  /**
   * Cleanup all workers
   */
  async cleanup(): Promise<void> {
    const promises: Promise<number>[] = [];

    for (const [jobId, worker] of this.workers) {
      promises.push(worker.terminate());
    }

    await Promise.all(promises);

    this.workers.clear();
    this.activeJobs.clear();
    this.jobQueue.length = 0;
    this.progressCallbacks.clear();
  }
}

// Singleton instance
export const videoProcessingManager = new VideoProcessingManager();
export default videoProcessingManager;