import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 15, ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...props,
  };
}

export function IconGear(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M2.4 4.4h11.2M2.4 8h11.2M2.4 11.6h11.2" />
      <path d="M6 3.2v2.4M10.4 6.8v2.4M5 10.4v2.4" />
    </svg>
  );
}

export function IconRefresh(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M13.2 8a5.2 5.2 0 1 1-1.6-3.7" />
      <path d="M13.4 2.6v2.8h-2.8" />
    </svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M2.8 4.4h10.4M6.2 4.4V3a.8.8 0 0 1 .8-.8h2a.8.8 0 0 1 .8.8v1.4M4.2 4.4l.6 8.2a1 1 0 0 0 1 .9h4.4a1 1 0 0 0 1-.9l.6-8.2" />
      <path d="M6.8 7v4M9.2 7v4" />
    </svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 8.6 6.4 12 13 4.6" />
    </svg>
  );
}

export function IconX(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

export function IconChevron(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 6.5 8 9.5l3-3" />
    </svg>
  );
}

export function IconRight(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6.5 4 10 8l-3.5 4" />
    </svg>
  );
}

export function IconCopy(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="5.5" y="5.5" width="8" height="8" />
      <path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" />
    </svg>
  );
}

export function IconWarn(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 2.4 14.4 13H1.6L8 2.4Z" />
      <path d="M8 6.6v3.2M8 11.6v.01" />
    </svg>
  );
}

export function IconKey(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="5.6" cy="10.4" r="2.6" />
      <path d="M7.5 8.5 13 3M11 5l1.6 1.6M9.4 6.6 11 8.2" />
    </svg>
  );
}

export function IconDownload(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 2.6v7.2M5 7l3 2.8L11 7M3 13h10" />
    </svg>
  );
}

export function IconUpload(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 10.2V3M5 5.8 8 3l3 2.8M3 13h10" />
    </svg>
  );
}

export function IconStamp(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5.6 9.4c0-1.4.7-2.1.9-3.2.1-.8-.4-1.2-.4-2a2 2 0 0 1 3.8 0c0 .8-.5 1.2-.4 2 .2 1.1.9 1.8.9 3.2" />
      <path d="M3.6 9.4h8.8v2.2H3.6zM5 13.4h6" />
    </svg>
  );
}
