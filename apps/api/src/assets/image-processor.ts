import { createHash } from 'node:crypto';
import sanitizeHtml from 'sanitize-html';
import sharp, { type Metadata } from 'sharp';

import { AppError } from '../common/errors/app-error.js';

export const MAX_ASSET_BYTES = 10 * 1_024 * 1_024;
export const MAX_ASSET_DIMENSION = 8_192;
export const MAX_ASSET_PIXELS = 40_000_000;
const rasterFormats = new Map([
  ['png', { extension: 'png', mimeType: 'image/png' }],
  ['jpeg', { extension: 'jpg', mimeType: 'image/jpeg' }],
  ['webp', { extension: 'webp', mimeType: 'image/webp' }],
]);

export interface ProcessedImage {
  readonly original: Uint8Array;
  readonly thumbnail: Uint8Array;
  readonly extension: string;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly sha256: string;
}

export interface ImageClaims {
  readonly mimeType: string;
  readonly fileName: string;
}

function invalid(message: string): never {
  throw new AppError('INVALID_ASSET_FILE', message, 400);
}

function sanitizeSvg(input: Uint8Array): Uint8Array {
  let source: string;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(input);
  } catch {
    invalid('SVG must contain valid UTF-8 text.');
  }
  if (!/<svg(?:\s|>)/i.test(source)) invalid('The file is not an SVG image.');
  if (
    /<\s*(?:script|foreignObject|iframe|object|embed|audio|video|image)\b/i.test(source) ||
    /\son[a-z]+\s*=/i.test(source) ||
    /(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|data:|javascript:|\/\/)/i.test(source) ||
    /(?:@import|url\s*\(|<!DOCTYPE|<!ENTITY)/i.test(source)
  ) {
    invalid('SVG contains scripts, external resources, or unsafe markup.');
  }
  const sanitized = sanitizeHtml(source, {
    allowedTags: [
      'svg',
      'g',
      'path',
      'rect',
      'circle',
      'ellipse',
      'line',
      'polyline',
      'polygon',
      'defs',
      'linearGradient',
      'radialGradient',
      'stop',
      'clipPath',
      'mask',
      'title',
      'desc',
    ],
    allowedAttributes: {
      svg: ['xmlns', 'viewBox', 'width', 'height', 'fill', 'stroke'],
      '*': [
        'id',
        'd',
        'x',
        'y',
        'x1',
        'x2',
        'y1',
        'y2',
        'cx',
        'cy',
        'r',
        'rx',
        'ry',
        'points',
        'fill',
        'fill-opacity',
        'fill-rule',
        'stroke',
        'stroke-width',
        'stroke-opacity',
        'stroke-linecap',
        'stroke-linejoin',
        'opacity',
        'transform',
        'offset',
        'stop-color',
        'stop-opacity',
        'gradientUnits',
        'gradientTransform',
        'clip-path',
        'mask',
        'viewBox',
        'width',
        'height',
      ],
    },
    allowedSchemes: [],
    allowProtocolRelative: false,
    parser: { lowerCaseAttributeNames: false, lowerCaseTags: false },
  });
  if (!sanitized.trim().startsWith('<svg')) invalid('SVG sanitization produced no usable image.');
  return new TextEncoder().encode(sanitized);
}

export async function processImage(
  input: Uint8Array,
  claims?: ImageClaims,
): Promise<ProcessedImage> {
  if (input.byteLength === 0 || input.byteLength > MAX_ASSET_BYTES)
    invalid(`Image size must be between 1 byte and ${MAX_ASSET_BYTES} bytes.`);

  const looksLikeSvg = /^\s*<svg(?:\s|>)/i.test(new TextDecoder().decode(input.subarray(0, 512)));
  const original = looksLikeSvg ? sanitizeSvg(input) : input;
  let metadata: Metadata;
  try {
    metadata = await sharp(original, {
      limitInputPixels: MAX_ASSET_PIXELS,
      failOn: 'warning',
    }).metadata();
  } catch {
    invalid('Image bytes are malformed or exceed the decoding limits.');
  }
  const format =
    metadata.format === 'svg'
      ? { extension: 'svg', mimeType: 'image/svg+xml' }
      : rasterFormats.get(metadata.format ?? '');
  if (!format) invalid('Only PNG, JPEG, WebP, and sanitized SVG images are supported.');
  if (claims) {
    const claimedExtension = claims.fileName.split('.').at(-1)?.toLocaleLowerCase() ?? '';
    const acceptedExtensions = format.extension === 'jpg' ? ['jpg', 'jpeg'] : [format.extension];
    if (
      claims.mimeType.toLocaleLowerCase() !== format.mimeType ||
      !acceptedExtensions.includes(claimedExtension)
    ) {
      invalid('The declared MIME type or extension does not match the image bytes.');
    }
  }
  if (!metadata.width || !metadata.height) invalid('Image dimensions could not be determined.');
  if (
    metadata.width > MAX_ASSET_DIMENSION ||
    metadata.height > MAX_ASSET_DIMENSION ||
    metadata.width * metadata.height > MAX_ASSET_PIXELS
  )
    invalid('Image dimensions exceed the allowed limits.');

  let thumbnail: Buffer;
  try {
    thumbnail = await sharp(original, { limitInputPixels: MAX_ASSET_PIXELS })
      .resize(256, 256, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    invalid('A safe thumbnail could not be generated from the image.');
  }
  return {
    original,
    thumbnail,
    ...format,
    width: metadata.width,
    height: metadata.height,
    sha256: createHash('sha256').update(original).digest('hex'),
  };
}
