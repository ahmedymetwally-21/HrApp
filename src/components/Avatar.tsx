import React, { useState } from 'react';

interface AvatarProps {
  src?: string;
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps['size']>, string> = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-xs',
  lg: 'w-12 h-12 text-sm',
  xl: 'w-16 h-16 text-base',
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return 'HR';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export const Avatar: React.FC<AvatarProps> = ({ src, name, size = 'md' }) => {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        aria-label={name}
        className={`${SIZE_CLASSES[size]} rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200 font-semibold flex items-center justify-center shrink-0 select-none`}
      >
        {getInitials(name)}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${SIZE_CLASSES[size]} rounded-full object-cover border border-slate-200 bg-slate-100 shrink-0`}
    />
  );
};
