import type { ReactNode, SVGProps } from 'react';

type IconName =
  | 'arrow'
  | 'back'
  | 'brush'
  | 'chevron'
  | 'close'
  | 'command'
  | 'grid'
  | 'eraser'
  | 'layers'
  | 'map'
  | 'menu'
  | 'minus'
  | 'pan'
  | 'plus'
  | 'path'
  | 'region'
  | 'search'
  | 'select'
  | 'settings'
  | 'stamp'
  | 'text'
  | 'user';

const paths: Record<IconName, ReactNode> = {
  arrow: (
    <>
      <path d="M5 12h14" />
      <path d="m14 7 5 5-5 5" />
    </>
  ),
  back: (
    <>
      <path d="M19 12H5" />
      <path d="m10 17-5-5 5-5" />
    </>
  ),
  brush: (
    <>
      <path d="m14 4 6 6-8.5 8.5a4.2 4.2 0 0 1-6-6L14 4Z" />
      <path d="M4 21c2.5 0 4.5-.5 5.5-2" />
    </>
  ),
  chevron: <path d="m9 18 6-6-6-6" />,
  close: (
    <>
      <path d="M6 6l12 12" />
      <path d="m18 6-12 12" />
    </>
  ),
  command: (
    <>
      <rect x="4" y="4" width="6" height="6" rx="2" />
      <rect x="14" y="4" width="6" height="6" rx="2" />
      <rect x="4" y="14" width="6" height="6" rx="2" />
      <rect x="14" y="14" width="6" height="6" rx="2" />
    </>
  ),
  grid: (
    <>
      <path d="M4 4h6v6H4z" />
      <path d="M14 4h6v6h-6z" />
      <path d="M4 14h6v6H4z" />
      <path d="M14 14h6v6h-6z" />
    </>
  ),
  eraser: (
    <>
      <path d="m15 4 5 5-9 9H6l-3-3L15 4Z" />
      <path d="m11 18 4-4" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 16 9 5 9-5" />
    </>
  ),
  map: (
    <>
      <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" />
      <path d="M9 3v15" />
      <path d="M15 6v15" />
    </>
  ),
  menu: (
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </>
  ),
  minus: <path d="M5 12h14" />,
  pan: (
    <>
      <path d="M8 11V7a2 2 0 0 1 4 0v3" />
      <path d="M12 10V5a2 2 0 0 1 4 0v6" />
      <path d="M16 10V8a2 2 0 0 1 4 0v6c0 5-3 8-8 8h-1c-3 0-5-2-7-5l-2-3a2 2 0 0 1 3-3l3 2" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  path: (
    <>
      <path d="M4 18c4-9 7 2 11-7 1.2-2.7 2.8-4.3 5-5" />
      <circle cx="4" cy="18" r="1.5" />
      <circle cx="20" cy="6" r="1.5" />
    </>
  ),
  region: (
    <>
      <path d="m5 5 14 3-3 11-12-4 1-10Z" />
      <circle cx="5" cy="5" r="1.3" />
      <circle cx="19" cy="8" r="1.3" />
      <circle cx="16" cy="19" r="1.3" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  select: <path d="m5 3 14 9-7 2-3 7L5 3Z" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </>
  ),
  text: (
    <>
      <path d="M5 5h14" />
      <path d="M12 5v14" />
      <path d="M8 19h8" />
    </>
  ),
  stamp: (
    <>
      <path d="M8 13h8" />
      <path d="M9 13V9a3 3 0 0 1 6 0v4" />
      <path d="M6 13h12l2 4H4l2-4Z" />
      <path d="M6 21h12" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
};

export function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
