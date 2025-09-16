import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface VideoProcessOptions {
  format?: string;
  codec?: string;
  resolution?: string;
  framerate?: number;
  startTime?: number;
  duration?: number;
}

export interface VideoInfo {
  duration: number | null;
  resolution: string | null;
  framerate: number | null;
  codec: string | null;
  bitrate: number | null;
}

interface FFmpegLoadConfig {
  coreURL: string;
  wasmURL: string;
}

interface FFmpegLogData {
  message: string;
}

interface FFmpegInstance {
  load: (config: FFmpegLoadConfig) => Promise<boolean>;
  exec: (args: string[]) => Promise<void>;
  writeFile: (filename: string, data: Uint8Array) => Promise<void>;
  readFile: (filename: string) => Promise<Uint8Array>;
  deleteFile: (filename: string) => Promise<void>;
  on: (event: string, callback: (data: FFmpegLogData) => void) => void;
  terminate: () => void;
}

class FFmpegService {
  private ffmpeg: FFmpegInstance | null = null;
  private isLoaded: boolean = false;
  private isAvailable: boolean = false;
  private FFmpeg: any = null;
  private fetchFile: ((url: string) => Promise<Uint8Array>) | null = null;
  private toBlobURL: ((url: string, type: string) => Promise<string>) | null =
    null;
  private ffmpegPath: string | null = null;
  private ffprobePath: string | null = null;

  constructor() {
    // Initialize with null values
  }

  async initialize(): Promise<void> {
    if (this.isLoaded) return;

    try {
      console.log('Attempting to initialize FFmpeg...');

      // First try to find system FFmpeg binaries
      this.ffmpegPath = await this.findExecutable('ffmpeg');
      this.ffprobePath = await this.findExecutable('ffprobe');

      if (this.ffmpegPath && this.ffprobePath) {
        console.log('Using system FFmpeg binaries');
        this.isLoaded = true;
        this.isAvailable = true;
        console.log('FFmpeg initialized successfully with system binaries');
        return;
      }

      // Fallback to WASM version for browser environments
      console.log(
        'System FFmpeg not found, attempting to load WASM version...'
      );

      // Import FFmpeg modules dynamically
      const { FFmpeg } = await import('@ffmpeg/ffmpeg');
      const { fetchFile, toBlobURL } = await import('@ffmpeg/util');

      this.FFmpeg = FFmpeg;
      this.fetchFile = fetchFile;
      this.toBlobURL = toBlobURL;

      // Create FFmpeg instance
      this.ffmpeg = new this.FFmpeg() as FFmpegInstance;

      // Load FFmpeg with WASM binaries
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.0/dist/umd';
      if (this.ffmpeg && this.toBlobURL) {
        await this.ffmpeg.load({
          coreURL: await this.toBlobURL(
            `${baseURL}/ffmpeg-core.js`,
            'text/javascript'
          ),
          wasmURL: await this.toBlobURL(
            `${baseURL}/ffmpeg-core.wasm`,
            'application/wasm'
          ),
        });
      }

      this.isLoaded = true;
      this.isAvailable = true;
      console.log('FFmpeg loaded successfully with WASM');
    } catch (error) {
      console.warn(
        'FFmpeg is not available in this environment:',
        error instanceof Error ? error.message : String(error)
      );
      console.log('Video processing features will be disabled');
      this.isLoaded = true; // Mark as loaded even if failed
      this.isAvailable = false;
      // Don't throw error - allow app to continue without FFmpeg
    }
  }

  /**
   * Find executable in system PATH
   */
  private async findExecutable(name: string): Promise<string | null> {
    try {
      const command =
        process.platform === 'win32' ? `where ${name}` : `which ${name}`;
      const { stdout } = await execAsync(command);
      const executablePath = stdout.trim().split('\n')[0];

      if (executablePath && fs.existsSync(executablePath)) {
        return executablePath;
      }
    } catch (error) {
      // Executable not found
    }
    return null;
  }

  /**
   * Check if FFmpeg is available for use
   */
  isFFmpegAvailable(): boolean {
    return this.isAvailable;
  }

  async processVideo(
    inputPath: string,
    outputPath: string,
    options: VideoProcessOptions = {}
  ): Promise<string> {
    if (!this.isLoaded) {
      await this.initialize();
    }

    if (!this.isAvailable) {
      throw new Error(
        'FFmpeg is not available in this environment. Video processing features are disabled.'
      );
    }

    try {
      // Use system FFmpeg if available
      if (this.ffmpegPath) {
        return await this.processVideoWithSystem(
          inputPath,
          outputPath,
          options
        );
      }

      // Fallback to WASM version
      if (!this.ffmpeg) {
        throw new Error('FFmpeg not initialized');
      }

      if (!this.fetchFile) {
        throw new Error('FFmpeg fetchFile not initialized');
      }
      const inputData = await this.fetchFile(inputPath);
      const inputFilename = path.basename(inputPath);
      const outputFilename = path.basename(outputPath);

      // Write input file to FFmpeg virtual file system
      await this.ffmpeg.writeFile(inputFilename, inputData);

      // Build FFmpeg command based on options
      const args: string[] = ['-i', inputFilename];

      if (options.format) {
        args.push('-f', options.format);
      }

      if (options.codec) {
        args.push('-c:v', options.codec);
      }

      if (options.resolution) {
        args.push('-s', options.resolution);
      }

      if (options.framerate) {
        args.push('-r', options.framerate.toString());
      }

      if (options.startTime) {
        args.splice(1, 0, '-ss', options.startTime.toString());
      }

      if (options.duration) {
        args.push('-t', options.duration.toString());
      }

      args.push(outputFilename);

      // Execute FFmpeg command
      await this.ffmpeg.exec(args);

      // Read output file
      const outputData = await this.ffmpeg.readFile(outputFilename);

      // Write to actual file system
      fs.writeFileSync(outputPath, Buffer.from(outputData as Uint8Array));

      // Clean up virtual file system
      await this.ffmpeg.deleteFile(inputFilename);
      await this.ffmpeg.deleteFile(outputFilename);

      return outputPath;
    } catch (error) {
      console.error('Video processing failed:', error);
      throw error;
    }
  }

  /**
   * Process video using system FFmpeg binary
   */
  private async processVideoWithSystem(
    inputPath: string,
    outputPath: string,
    options: VideoProcessOptions = {}
  ): Promise<string> {
    if (!this.ffmpegPath) {
      throw new Error('System FFmpeg not available');
    }

    const args: string[] = ['-i', `"${inputPath}"`];

    if (options.startTime) {
      args.splice(1, 0, '-ss', options.startTime.toString());
    }

    if (options.duration) {
      args.push('-t', options.duration.toString());
    }

    if (options.codec) {
      args.push('-c:v', options.codec);
    }

    if (options.resolution) {
      args.push('-s', options.resolution);
    }

    if (options.framerate) {
      args.push('-r', options.framerate.toString());
    }

    if (options.format) {
      args.push('-f', options.format);
    }

    // Add overwrite flag and output path
    args.push('-y', `"${outputPath}"`);

    const command = `${this.ffmpegPath} ${args.join(' ')}`;
    console.log('Executing FFmpeg command:', command);

    const { stdout, stderr } = await execAsync(command);

    if (stderr && !stderr.includes('frame=')) {
      console.warn('FFmpeg stderr:', stderr);
    }

    if (stdout) {
      console.log('FFmpeg stdout:', stdout);
    }

    if (!fs.existsSync(outputPath)) {
      throw new Error('FFmpeg processing failed - output file not created');
    }

    return outputPath;
  }

  async extractThumbnail(
    videoPath: string,
    outputPath: string,
    timeOffset: number = 1
  ): Promise<string> {
    const options: VideoProcessOptions = {
      format: 'image2',
      codec: 'png',
      startTime: timeOffset,
      duration: 1,
    };

    return this.processVideo(videoPath, outputPath, options);
  }

  async getVideoInfo(videoPath: string): Promise<VideoInfo> {
    if (!this.isLoaded) {
      await this.initialize();
    }

    if (!this.isAvailable) {
      throw new Error(
        'FFmpeg is not available in this environment. Video analysis features are disabled.'
      );
    }

    try {
      // Use system ffprobe if available
      if (this.ffprobePath) {
        return await this.getVideoInfoWithSystem(videoPath);
      }

      // Fallback to WASM version
      if (!this.ffmpeg) {
        throw new Error('FFmpeg not initialized');
      }

      if (!this.fetchFile) {
        throw new Error('FFmpeg fetchFile not initialized');
      }
      const inputData = await this.fetchFile(videoPath);
      const inputFilename = path.basename(videoPath);

      await this.ffmpeg.writeFile(inputFilename, inputData);

      // Use ffprobe-like functionality to get video info
      const args: string[] = ['-i', inputFilename, '-f', 'null', '-'];

      let output = '';
      this.ffmpeg.on('log', ({ message }: FFmpegLogData) => {
        output += message + '\n';
      });

      try {
        await this.ffmpeg.exec(args);
      } catch (error) {
        // FFmpeg returns non-zero exit code for info commands
      }

      await this.ffmpeg.deleteFile(inputFilename);

      // Parse video information from output
      const info = this.parseVideoInfo(output);
      return info;
    } catch (error) {
      console.error('Failed to get video info:', error);
      throw error;
    }
  }

  /**
   * Get video info using system ffprobe binary
   */
  private async getVideoInfoWithSystem(videoPath: string): Promise<VideoInfo> {
    if (!this.ffprobePath) {
      throw new Error('System ffprobe not available');
    }

    const command = `${this.ffprobePath} -v quiet -print_format json -show_format -show_streams "${videoPath}"`;

    try {
      const { stdout } = await execAsync(command);
      const probeData = JSON.parse(stdout);

      return this.parseVideoInfoFromProbe(probeData);
    } catch (error) {
      console.error('Failed to get video info with system ffprobe:', error);
      throw error;
    }
  }

  /**
   * Parse video info from ffprobe JSON output
   */
  private parseVideoInfoFromProbe(probeData: {
    streams?: Array<{
      codec_type?: string;
      duration?: string;
      width?: number;
      height?: number;
      r_frame_rate?: string;
      codec_name?: string;
      bit_rate?: string;
    }>;
    format?: {
      duration?: string;
      bit_rate?: string;
    };
  }): VideoInfo {
    const info: VideoInfo = {
      duration: null,
      resolution: null,
      framerate: null,
      codec: null,
      bitrate: null,
    };

    // Get video stream
    const videoStream = probeData.streams?.find(
      (stream) => stream.codec_type === 'video'
    );

    if (videoStream) {
      // Duration
      if (videoStream.duration) {
        info.duration = parseFloat(videoStream.duration);
      } else if (probeData.format?.duration) {
        info.duration = parseFloat(probeData.format.duration);
      }

      // Resolution
      if (videoStream.width && videoStream.height) {
        info.resolution = `${videoStream.width}x${videoStream.height}`;
      }

      // Frame rate
      if (videoStream.r_frame_rate) {
        const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
        if (den && den !== 0) {
          info.framerate = num / den;
        }
      }

      // Codec
      if (videoStream.codec_name) {
        info.codec = videoStream.codec_name;
      }

      // Bitrate
      if (videoStream.bit_rate) {
        info.bitrate = Math.round(parseInt(videoStream.bit_rate, 10) / 1000); // Convert to kbps
      } else if (probeData.format?.bit_rate) {
        info.bitrate = Math.round(
          parseInt(probeData.format.bit_rate, 10) / 1000
        );
      }
    }

    return info;
  }

  private parseVideoInfo(output: string): VideoInfo {
    const info: VideoInfo = {
      duration: null,
      resolution: null,
      framerate: null,
      codec: null,
      bitrate: null,
    };

    // Parse duration
    const durationMatch = output.match(
      /Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/
    );
    if (durationMatch) {
      const hours = parseInt(durationMatch[1], 10);
      const minutes = parseInt(durationMatch[2], 10);
      const seconds = parseFloat(durationMatch[3]);
      info.duration = hours * 3600 + minutes * 60 + seconds;
    }

    // Parse resolution
    const resolutionMatch = output.match(/Video:.*?(\d{3,4})x(\d{3,4})/);
    if (resolutionMatch) {
      info.resolution = `${resolutionMatch[1]}x${resolutionMatch[2]}`;
    }

    // Parse framerate
    const framerateMatch = output.match(/(\d+(?:\.\d+)?)\s*fps/);
    if (framerateMatch) {
      info.framerate = parseFloat(framerateMatch[1]);
    }

    // Parse codec
    const codecMatch = output.match(/Video:\s*([^,\s]+)/);
    if (codecMatch) {
      info.codec = codecMatch[1];
    }

    // Parse bitrate
    const bitrateMatch = output.match(/bitrate:\s*(\d+)\s*kb\/s/);
    if (bitrateMatch) {
      info.bitrate = parseInt(bitrateMatch[1], 10);
    }

    return info;
  }

  async trimVideo(
    inputPath: string,
    outputPath: string,
    startTime: number,
    duration: number
  ): Promise<string> {
    const options: VideoProcessOptions = {
      startTime,
      duration,
      codec: 'libx264',
    };

    return this.processVideo(inputPath, outputPath, options);
  }

  async resizeVideo(
    inputPath: string,
    outputPath: string,
    width: number,
    height: number
  ): Promise<string> {
    const options: VideoProcessOptions = {
      resolution: `${width}x${height}`,
      codec: 'libx264',
    };

    return this.processVideo(inputPath, outputPath, options);
  }

  async convertFormat(
    inputPath: string,
    outputPath: string,
    format: string
  ): Promise<string> {
    const options: VideoProcessOptions = {
      format,
    };

    return this.processVideo(inputPath, outputPath, options);
  }

  terminate(): void {
    if (this.ffmpeg) {
      this.ffmpeg.terminate();
      this.ffmpeg = null;
      this.isLoaded = false;
    }
  }
}
// Singleton instance
export const ffmpegService = new FFmpegService();
export default ffmpegService;
