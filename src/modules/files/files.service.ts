import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class FilesService {
  private readonly uploadPath: string;
  private readonly uploadUrl: string;
  private readonly logger = new Logger(FilesService.name);

  constructor(private readonly configService: ConfigService) {
    this.uploadPath =
      this.configService.get<string>('UPLOAD_PATH') || './uploads';
    this.uploadUrl =
      this.configService.get<string>('UPLOAD_URL') ||
      'http://localhost:3000/uploads';

    this.ensureDirectoryExists(this.uploadPath);
  }

  async createFile(
    file: Express.Multer.File,
    folder: string = 'common',
  ): Promise<{ url: string; path: string; type: string }> {
    return { url: '', path: '', type: '' };
  }

  async saveBase64(
    base64Data: string,
    folder: string = 'evidence',
  ): Promise<string> {
    try {
      if (!base64Data || !base64Data.includes('base64,')) {
        if (base64Data?.startsWith('http')) return base64Data;

        this.logger.warn(
          `Invalid Base64 format received (start): ${base64Data?.substring(0, 50)}...`,
        );
        return base64Data;
      }

      const uploadDir = path.join(this.uploadPath, folder);
      this.ensureDirectoryExists(uploadDir);

      const parts = base64Data.split(',');
      const header = parts[0]; // "data:audio/mp3;base64"
      const data = parts[1]; // Сами байты

      const mimeMatch = header.match(/data:(.*);base64/);

      if (!mimeMatch || !data) {
        throw new Error('Cannot parse mime type or data is empty');
      }

      const mimeType = mimeMatch[1];

      const buffer = Buffer.from(data, 'base64');

      const extension = this.getExtensionFromMimeType(mimeType);

      const randomName = Array(32)
        .fill(null)
        .map(() => Math.round(Math.random() * 16).toString(16))
        .join('');

      const fileName = `${randomName}.${extension}`;
      const filePath = path.join(uploadDir, fileName);

      await fs.promises.writeFile(filePath, buffer);

      this.logger.log(`File saved: ${fileName} (${mimeType})`);

      return `${this.uploadUrl}/${folder}/${fileName}`;
    } catch (error) {
      this.logger.error(`Base64 save error: ${error.message}`);
      this.logger.debug(
        `Problematic string start: ${base64Data?.substring(0, 100)}`,
      );

      return base64Data;
    }
  }

  async saveBuffer(
    buffer: Buffer,
    fileName: string,
    folder: string = 'reports',
  ): Promise<string> {
    try {
      const uploadDir = path.join(this.uploadPath, folder);
      this.ensureDirectoryExists(uploadDir);

      const filePath = path.join(uploadDir, fileName);

      await fs.promises.writeFile(filePath, buffer);

      this.logger.log(`File saved: ${fileName}`);

      return `${this.uploadUrl}/${folder}/${fileName}`;
    } catch (error) {
      this.logger.error(`Buffer save error: ${error.message}`);
      throw new InternalServerErrorException('Could not save file');
    }
  }

  private ensureDirectoryExists(dirPath: string) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  private getExtensionFromMimeType(mimeType: string): string {
    const map: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/svg+xml': 'svg',
      // Аудио
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
      'audio/webm': 'webm',
      'audio/ogg': 'ogg',
      'audio/wav': 'wav',
      'audio/x-wav': 'wav',
      // Видео
      'video/mp4': 'mp4',
      'video/webm': 'webm',
      'video/ogg': 'ogv',
      // Документы
      'application/pdf': 'pdf',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        'docx',
      'text/plain': 'txt',
    };
    return map[mimeType] || 'bin';
  }
}
