import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { NormalizedDoc, NormalizedMeta, Block } from '@cw-rag-core/shared';
import crypto from 'crypto';
import { AuditLogger } from '../../utils/audit.js';

// File upload schema
const UploadRequestSchema = z.object({
  files: z.array(z.object({
    filename: z.string(),
    content: z.string(),
    mimetype: z.string()
  })).optional(),
  urls: z.array(z.string().url()).optional(),
  tenant: z.string().min(1),
  source: z.string().min(1),
  acl: z.array(z.string()),
  publish: z.boolean().default(false),
  title: z.string().optional(),
  tags: z.array(z.string()).optional(),
  authors: z.array(z.string()).optional()
}).refine(data => data.files || data.urls, {
  message: "Either files or urls must be provided"
});

const UploadResponseSchema = z.object({
  processed: z.array(z.object({
    filename: z.string().optional(),
    url: z.string().optional(),
    docId: z.string(),
    status: z.enum(['converted', 'previewed', 'published', 'error']),
    message: z.string().optional(),
    preview: z.object({
      wouldPublish: z.boolean(),
      findings: z.array(z.object({
        type: z.string(),
        count: z.number()
      })),
      bytes: z.number(),
      blocksCount: z.number()
    }).optional()
  })),
  summary: z.object({
    total: z.number(),
    converted: z.number(),
    published: z.number(),
    errors: z.number()
  })
});

const ALLOWED_FILE_TYPES = ['pdf', 'docx', 'md', 'html', 'txt'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

interface UploadRouteOptions {
  auditLogger: AuditLogger;
  previewHandler: (docs: NormalizedDoc[], request: FastifyRequest) => Promise<any>;
  publishHandler: (docs: NormalizedDoc[], request: FastifyRequest) => Promise<any>;
}

export async function uploadRoute(fastify: FastifyInstance, options: UploadRouteOptions) {
  // Register multipart support with require for now
  await fastify.register(require('@fastify/multipart'), {
    limits: {
      fileSize: MAX_FILE_SIZE,
      files: 10
    }
  });

  fastify.post('/upload', {
    schema: {
      consumes: ['multipart/form-data'],
      response: {
        200: UploadResponseSchema,
      },
    },
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      // Authentication is handled by parent route middleware
      try {
        // Parse multipart data
        const data = await (request as any).file();
        if (!data) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'No file provided'
          });
        }

        // Get form fields
        const files: any[] = [];

        // Process the uploaded file
        const buffer = await data.toBuffer();
        const fileContent = buffer.toString('utf-8');

        files.push({
          filename: data.filename,
          content: fileContent,
          mimetype: data.mimetype,
          size: buffer.length
        });

        // Parse additional form fields from the request
        const tenant = (request.body as any)?.tenant || 'default';
        const source = (request.body as any)?.source || 'upload';
        const acl = (request.body as any)?.acl ? JSON.parse((request.body as any).acl) : ['public'];
        const publish = (request.body as any)?.publish === 'true';
        const title = (request.body as any)?.title;
        const tags = (request.body as any)?.tags ? JSON.parse((request.body as any).tags) : [];
        const authors = (request.body as any)?.authors ? JSON.parse((request.body as any).authors) : [];

        const processed: any[] = [];
        const summary = {
          total: files.length,
          converted: 0,
          published: 0,
          errors: 0
        };

        for (const file of files) {
          try {
            // Validate file type
            const extension = getFileExtension(file.filename);
            if (!ALLOWED_FILE_TYPES.includes(extension)) {
              processed.push({
                filename: file.filename,
                docId: '',
                status: 'error',
                message: `File type .${extension} not allowed. Allowed types: ${ALLOWED_FILE_TYPES.join(', ')}`
              });
              summary.errors++;
              continue;
            }

            // Validate file size
            if (file.size > MAX_FILE_SIZE) {
              processed.push({
                filename: file.filename,
                docId: '',
                status: 'error',
                message: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / 1024 / 1024}MB`
              });
              summary.errors++;
              continue;
            }

            // Convert file to NormalizedDoc
            const normalizedDoc = await convertFileToNormalizedDoc(
              file,
              tenant,
              source,
              acl,
              title,
              tags,
              authors
            );

            summary.converted++;

            if (publish) {
              // Publish the document
              const publishResult = await options.publishHandler([normalizedDoc], request);
              const docResult = publishResult.results[0];

              processed.push({
                filename: file.filename,
                docId: normalizedDoc.meta.docId,
                status: docResult.status === 'published' ? 'published' : 'error',
                message: docResult.message
              });

              if (docResult.status === 'published') {
                summary.published++;
              } else {
                summary.errors++;
              }
            } else {
              // Preview the document
              const previewResult = await options.previewHandler([normalizedDoc], request);

              processed.push({
                filename: file.filename,
                docId: normalizedDoc.meta.docId,
                status: 'previewed',
                preview: {
                  wouldPublish: previewResult.wouldPublish,
                  findings: previewResult.findings,
                  bytes: previewResult.bytes,
                  blocksCount: previewResult.blocksCount
                }
              });
            }

          } catch (fileError) {
            const errorMsg = `Error processing file ${file.filename}: ${(fileError as Error).message}`;
            processed.push({
              filename: file.filename,
              docId: '',
              status: 'error',
              message: errorMsg
            });
            summary.errors++;
            fastify.log.error(errorMsg, fileError);
          }
        }

        return reply.send({ processed, summary });

      } catch (error) {
        fastify.log.error('Error in upload endpoint', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to process upload request'
        });
      }
    },
  });
}

function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || '';
}

async function convertFileToNormalizedDoc(
  file: any,
  tenant: string,
  source: string,
  acl: string[],
  title?: string,
  tags?: string[],
  authors?: string[]
): Promise<NormalizedDoc> {
  const extension = getFileExtension(file.filename);
  const docId = generateDocId(file.filename, tenant);
  const timestamp = new Date().toISOString();

  let blocks: Block[] = [];

  switch (extension) {
    case 'md':
      // Simple markdown parsing - convert to text blocks
      blocks = convertMarkdownToBlocks(file.content);
      break;

    case 'html':
      // Simple HTML parsing - strip tags for now
      blocks = convertHtmlToBlocks(file.content);
      break;

    case 'txt':
      blocks = [{ type: 'text', text: file.content }];
      break;

    case 'pdf':
    case 'docx':
      // For PDF/DOCX, we'd need specialized libraries
      // For now, treat as plain text (in production, use pdf-parse, mammoth, etc.)
      blocks = [{
        type: 'text',
        text: `[${extension.toUpperCase()} content - specialized parsing required]\n${file.content.substring(0, 1000)}...`
      }];
      break;

    default:
      throw new Error(`Unsupported file type: ${extension}`);
  }

  // Calculate content hash
  const contentForHash = blocks.map(b => (b.text || '') + (b.html || '')).join('\n');
  const sha256 = crypto.createHash('sha256').update(contentForHash).digest('hex');

  const meta: NormalizedMeta = {
    tenant,
    docId,
    source,
    path: file.filename,
    title: title || file.filename,
    lang: 'en', // Default language
    sha256,
    acl,
    authors,
    tags,
    timestamp,
  };

  return { meta, blocks };
}

function convertHtmlToBlocks(html: string): Block[] {
  // Simple HTML to blocks conversion - strip HTML tags for now
  const text = html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

  // Split by double newlines to create separate blocks
  const paragraphs = text.split('\n\n').filter((p: string) => p.trim());

  return paragraphs.map((paragraph: string) => ({
    type: 'text' as const,
    text: paragraph.trim(),
    html: undefined
  }));
}

function convertMarkdownToBlocks(markdown: string): Block[] {
  // Simple markdown to blocks conversion
  // Split by double newlines and clean up markdown syntax
  const paragraphs = markdown.split('\n\n').filter((p: string) => p.trim());

  return paragraphs.map((paragraph: string) => {
    // Basic markdown cleanup - remove simple formatting
    const cleanText = paragraph
      .replace(/^#+\s+/gm, '') // Remove headers
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
      .replace(/\*(.*?)\*/g, '$1') // Remove italic
      .replace(/`(.*?)`/g, '$1') // Remove code
      .trim();

    return {
      type: 'text' as const,
      text: cleanText,
      html: undefined
    };
  });
}

function generateDocId(filename: string, tenant: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const base = filename.replace(/\.[^/.]+$/, ''); // Remove extension
  return `${tenant}-${base}-${timestamp}-${random}`;
}