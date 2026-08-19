import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import * as fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { PinoLogger } from 'nestjs-pino';
import { UPLOADS_ROOT } from '../../../core/uploads.constants';
import { PaginatedResult } from '../../../core/pagination/paginated-result.interface';
import { MediaListQueryDto } from '../dto/media-list-query.dto';
import { MediaResponseDto } from '../dto/media-response.dto';
import { UploadMediaDto } from '../dto/upload-media.dto';
import { maxFileSizeBytes } from '../util/media-size-budget.util';
import { isValidWebpSignature } from '../util/webp-signature.util';
import { MediaRepository } from '../infrastructure/media.repository';

const UPLOAD_DIR = path.join(UPLOADS_ROOT, 'media');
const MAX_NAME_LENGTH = 255; // media.name — varchar(255)

function decodeOriginalName(file: Express.Multer.File): string {
  // multer/busboy отдают originalname в latin1 независимо от реальной кодировки — переинтерпретация
  // как utf8 восстанавливает не-ASCII имена файлов (кириллица и т.п.).
  return Buffer.from(file.originalname, 'latin1').toString('utf8');
}

@Injectable()
export class MediaService implements OnModuleInit {
  constructor(
    private readonly mediaRepository: MediaRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(MediaService.name);
  }

  onModuleInit(): void {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }

  async findAndCount(
    query: MediaListQueryDto,
  ): Promise<PaginatedResult<MediaResponseDto>> {
    const result = await this.mediaRepository.findAndCount(query);
    return {
      ...result,
      items: result.items.map((media) => MediaResponseDto.fromEntity(media)),
    };
  }

  async upload(
    files: Express.Multer.File[],
    dto: UploadMediaDto,
  ): Promise<MediaResponseDto[]> {
    if (dto.alt && dto.alt.length > files.length) {
      throw new BadRequestException(
        'Количество alt не должно превышать количество файлов',
      );
    }

    const maxSize = maxFileSizeBytes(files.length);

    for (const file of files) {
      const originalName = decodeOriginalName(file);

      // Имя без расширения идёт в media.name (varchar(255)) — без этой проверки слишком длинное
      // имя файла падает необработанным Postgres-исключением (500) вместо чистого 400
      // (LOW code review).
      if (path.parse(originalName).name.length > MAX_NAME_LENGTH) {
        throw new BadRequestException(
          `Имя файла "${originalName}" слишком длинное (максимум ${MAX_NAME_LENGTH} символов без расширения)`,
        );
      }

      if (file.size > maxSize) {
        throw new BadRequestException(
          `Файл "${originalName}" превышает лимит ${maxSize} байт для загрузки ${files.length} файлов одновременно`,
        );
      }

      if (!isValidWebpSignature(file.buffer)) {
        throw new BadRequestException(
          `Файл "${originalName}" не является настоящим WEBP-файлом`,
        );
      }
    }

    // Пути генерируются заранее (чистая операция, без I/O) — при ошибке записи или сохранения в БД
    // известен полный список кандидатов для отката, даже если параллельные записи завершились частично.
    const filePaths = files.map(() =>
      path.join(UPLOAD_DIR, `${randomUUID()}.webp`),
    );

    // allSettled, не all: ждём, пока КАЖДАЯ запись реально завершится (успехом или ошибкой), прежде
    // чем чистить диск. С Promise.all откат стартовал бы сразу на первом отказе, пока остальные
    // writeFile ещё летят в фоне — unlink успевал промахнуться мимо файла, который дозаписывался
    // через мгновение после отката, и он оставался на диске осиротевшим навсегда.
    const writeResults = await Promise.allSettled(
      files.map((file, index) =>
        fs.promises.writeFile(filePaths[index], file.buffer),
      ),
    );
    const writeFailure = writeResults.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );

    if (writeFailure) {
      await Promise.all(
        filePaths.map((filePath) =>
          fs.promises.unlink(filePath).catch(() => {}),
        ),
      );
      throw writeFailure.reason;
    }

    try {
      const records = files.map((file, index) => ({
        name: path.parse(decodeOriginalName(file)).name,
        fileName: path.basename(filePaths[index]),
        alt: dto.alt?.[index]?.trim() || null,
      }));

      const saved = await this.mediaRepository.create(records);
      return saved.map((media) => MediaResponseDto.fromEntity(media));
    } catch (error) {
      await Promise.all(
        filePaths.map((filePath) =>
          fs.promises.unlink(filePath).catch(() => {
            // best-effort откат — файл мог не записаться вообще (ENOENT) или уже отсутствовать
          }),
        ),
      );
      throw error;
    }
  }

  async remove(id: number): Promise<void> {
    const media = await this.mediaRepository.findById(id);
    if (!media) {
      throw new NotFoundException(`Файл с ID ${id} не найден`);
    }

    await this.mediaRepository.remove(id);

    try {
      await fs.promises.unlink(path.join(UPLOAD_DIR, media.fileName));
    } catch (err) {
      this.logger.warn(
        { err, id, fileName: media.fileName },
        'Failed to delete media file from disk',
      );
    }
  }
}
