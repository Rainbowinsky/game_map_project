import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { processImage } from './image-processor.js';

describe('processImage', () => {
  it('detects raster bytes, hashes content, and creates a WebP thumbnail', async () => {
    const source = await sharp({
      create: { width: 32, height: 20, channels: 4, background: '#8abf73' },
    })
      .png()
      .toBuffer();
    const result = await processImage(source, {
      mimeType: 'image/png',
      fileName: 'forest.png',
    });

    expect(result).toMatchObject({
      extension: 'png',
      mimeType: 'image/png',
      width: 32,
      height: 20,
    });
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    await expect(sharp(result.thumbnail).metadata()).resolves.toMatchObject({
      format: 'webp',
      width: 32,
      height: 20,
    });
  });

  it('rejects MIME and extension claims that do not match magic bytes', async () => {
    const source = await sharp({
      create: { width: 2, height: 2, channels: 3, background: '#000' },
    })
      .png()
      .toBuffer();
    await expect(
      processImage(source, { mimeType: 'image/jpeg', fileName: 'fake.jpg' }),
    ).rejects.toMatchObject({ code: 'INVALID_ASSET_FILE' });
  });

  it.each([
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.example/a.png"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject>bad</foreignObject></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><path onclick="alert(1)" d="M0 0"/></svg>',
  ])('rejects active or externally loaded SVG markup', async (source) => {
    await expect(
      processImage(new TextEncoder().encode(source), {
        mimeType: 'image/svg+xml',
        fileName: 'unsafe.svg',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_ASSET_FILE' });
  });

  it('accepts a constrained standalone SVG and rasterizes its thumbnail', async () => {
    const source = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#457" d="M2 2h20v20H2z"/></svg>',
    );
    const result = await processImage(source, {
      mimeType: 'image/svg+xml',
      fileName: 'safe.svg',
    });
    expect(result).toMatchObject({
      extension: 'svg',
      mimeType: 'image/svg+xml',
      width: 24,
      height: 24,
    });
    await expect(sharp(result.thumbnail).metadata()).resolves.toMatchObject({ format: 'webp' });
  });
});
