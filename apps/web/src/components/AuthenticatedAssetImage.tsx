import { useEffect, useState } from 'react';

import { fetchAssetBlob } from '../services/api-client.js';

export function AuthenticatedAssetImage({
  accessToken,
  assetId,
  alt = '',
  thumbnail = true,
}: {
  readonly accessToken: string;
  readonly assetId: string;
  readonly alt?: string;
  readonly thumbnail?: boolean;
}) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    void fetchAssetBlob(accessToken, assetId, thumbnail)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => setUrl(undefined));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [accessToken, assetId, thumbnail]);
  return url ? (
    <img src={url} alt={alt} />
  ) : (
    <span className="asset-image-placeholder" aria-hidden="true" />
  );
}
