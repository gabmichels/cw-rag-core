"use client";

import React from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '@/lib/utils';

// Custom markdown components for dark theme
export const MarkdownComponents = {
  // Headers
  h1: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1
      className="text-3xl font-bold text-foreground mb-4 mt-10 pb-2 border-b border-border/50 first:mt-0"
      {...props}
    >
      {children}
    </h1>
  ),

  h2: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2
      className="text-2xl font-semibold text-foreground mb-3 mt-8 pb-2 border-b border-border/30 first:mt-0"
      {...props}
    >
      {children}
    </h2>
  ),

  h3: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3
      className="text-xl font-semibold text-foreground mb-2 mt-7 first:mt-0"
      {...props}
    >
      {children}
    </h3>
  ),

  h4: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h4
      className="text-lg font-medium text-foreground mb-2 mt-6 first:mt-0"
      {...props}
    >
      {children}
    </h4>
  ),

  h5: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h5
      className="text-base font-medium text-foreground mb-2 mt-5 first:mt-0"
      {...props}
    >
      {children}
    </h5>
  ),

  h6: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h6
      className="text-sm font-medium text-muted-foreground mb-2 mt-4 first:mt-0"
      {...props}
    >
      {children}
    </h6>
  ),

  // Paragraphs
  p: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p
      className="text-muted-foreground leading-relaxed mb-6 last:mb-0"
      {...props}
    >
      {children}
    </p>
  ),

  // Links
  a: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      href={href}
      className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  ),

  // Strong and emphasis
  strong: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
    <strong className="font-bold text-foreground" {...props}>
      {children}
    </strong>
  ),

  em: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
    <em className="italic text-muted-foreground" {...props}>
      {children}
    </em>
  ),

  // Inline code
  code: ({ children, className, ...props }: React.HTMLAttributes<HTMLElement>) => {
    // Check if it's a code block (has language class) or inline code
    const match = /language-(\w+)/.exec(className || '');
    const isInline = !match && !className?.includes('language-');

    if (isInline) {
      return (
        <code
          className="px-1.5 py-0.5 text-sm bg-muted/30 text-primary rounded border border-border/30 font-mono"
          {...props}
        >
          {children}
        </code>
      );
    }

    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },

  // Code blocks
  pre: ({ children, ...props }: React.HTMLAttributes<HTMLPreElement>) => {
    const child = React.Children.only(children) as React.ReactElement;
    const match = /language-(\w+)/.exec(child.props.className || '');
    const language = match ? match[1] : 'text';
    const code = child.props.children;

    return (
      <div className="my-4 rounded-lg overflow-hidden border border-border/30 bg-card/20">
        <div className="px-4 py-2 bg-muted/20 border-b border-border/30 text-xs text-muted-foreground font-medium">
          {language}
        </div>
        <SyntaxHighlighter
          style={oneDark as any}
          language={language}
          customStyle={{
            margin: 0,
            background: 'transparent',
            fontSize: '0.875rem',
            lineHeight: '1.5',
          }}
          {...props}
        >
          {String(code).replace(/\n$/, '')}
        </SyntaxHighlighter>
      </div>
    );
  },

  // Lists
  ul: ({ children, ...props }: React.HTMLAttributes<HTMLUListElement>) => (
    <ul
      className="list-disc list-inside space-y-2 mb-6 text-muted-foreground pl-4"
      {...props}
    >
      {children}
    </ul>
  ),

  ol: ({ children, ...props }: React.HTMLAttributes<HTMLOListElement>) => (
    <ol
      className="list-decimal list-inside space-y-2 mb-6 text-muted-foreground pl-4"
      {...props}
    >
      {children}
    </ol>
  ),

  li: ({ children, ...props }: React.HTMLAttributes<HTMLLIElement>) => (
    <li
      className="text-muted-foreground leading-relaxed"
      {...props}
    >
      {children}
    </li>
  ),

  // Blockquotes
  blockquote: ({ children, ...props }: React.HTMLAttributes<HTMLQuoteElement>) => (
    <blockquote
      className="border-l-4 border-primary/50 pl-4 py-3 my-6 bg-card/20 rounded-r-lg italic text-muted-foreground"
      {...props}
    >
      {children}
    </blockquote>
  ),

  // Horizontal rule
  hr: ({ ...props }: React.HTMLAttributes<HTMLHRElement>) => (
    <hr
      className="my-8 border-0 h-px bg-gradient-to-r from-transparent via-border to-transparent"
      {...props}
    />
  ),

  // Tables
  table: ({ children, ...props }: React.HTMLAttributes<HTMLTableElement>) => (
    <div className="my-4 overflow-x-auto rounded-lg border border-border/30 bg-card/10">
      <table
        className="min-w-full divide-y divide-border/30"
        {...props}
      >
        {children}
      </table>
    </div>
  ),

  thead: ({ children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
    <thead
      className="bg-muted/20"
      {...props}
    >
      {children}
    </thead>
  ),

  tbody: ({ children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
    <tbody
      className="divide-y divide-border/20"
      {...props}
    >
      {children}
    </tbody>
  ),

  tr: ({ children, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
    <tr
      className="hover:bg-muted/10 transition-colors"
      {...props}
    >
      {children}
    </tr>
  ),

  th: ({ children, ...props }: React.HTMLAttributes<HTMLTableCellElement>) => (
    <th
      className="px-4 py-3 text-left text-sm font-semibold text-foreground"
      {...props}
    >
      {children}
    </th>
  ),

  td: ({ children, ...props }: React.HTMLAttributes<HTMLTableCellElement>) => (
    <td
      className="px-4 py-3 text-sm text-muted-foreground"
      {...props}
    >
      {children}
    </td>
  ),

  // Images
  img: ({ src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <img
      src={src}
      alt={alt}
      className="max-w-full h-auto rounded-lg border border-border/30 my-6"
      {...props}
    />
  ),
};

export default MarkdownComponents;