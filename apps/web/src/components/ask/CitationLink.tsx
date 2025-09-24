"use client";

import { cn } from '@/lib/utils';

interface CitationLinkProps {
  citationId: string;
  number?: number;
  className?: string;
  onClick?: (citationId: string) => void;
  children?: React.ReactNode;
}

export default function CitationLink({
  citationId,
  number,
  className,
  onClick,
  children
}: CitationLinkProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    onClick?.(citationId);
  };

  return (
    <sup
      className={cn(
        "inline-flex items-center justify-center w-5 h-5 text-xs font-medium bg-primary/10 text-primary rounded-full hover:bg-primary/20 transition-colors cursor-pointer border border-primary/20",
        className
      )}
      onClick={handleClick}
      title={`Citation ${number || citationId}`}
    >
      {children || number || citationId.slice(-1)}
    </sup>
  );
}