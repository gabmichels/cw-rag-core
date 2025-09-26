"use client";

import React, { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { fetchDocumentById, DocumentFetchResponse, DocumentChunk } from '@/utils/api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { MarkdownComponents } from '@/components/ask/MarkdownComponents';
import { cn } from '@/lib/utils';

export default function ViewDocumentPage() {
  const params = useParams();
  const docId = params.docId as string;
  const searchParams = useSearchParams();
  const highlightId = searchParams.get('highlightId');
  const [documentData, setDocumentData] = useState<DocumentFetchResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const highlightRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!docId) {
      setError('Document ID is missing.');
      setIsLoading(false);
      return;
    }

    const loadDocument = async () => {
      try {
        setIsLoading(true);
        setError(null); // Clear previous errors
        // Decode the docId in case it's URL encoded
        const decodedDocId = decodeURIComponent(docId);
        const data = await fetchDocumentById(decodedDocId);
        setDocumentData(data);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(errorMessage);
        console.error('Failed to fetch document:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadDocument();
  }, [docId]);

  useEffect(() => {
    if (documentData && highlightId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [documentData, highlightId]);

  // Function to format malformed tables
  // Function to format malformed tables
  const formatTable = (content: string) => {
    if (content.includes('|\n')) return content;
    // Normalize line endings
    let out = content.replace(/\r\n?/g, '\n');

    // Regex for a GFM separator chunk like: | --- | --- | --- |
    const SEP = /\|\s*(?:-+\s*\|)+/g;

    // 1) Ensure a newline BEFORE a separator row if the previous char isn't a newline
    out = out.replace(/([^\n])(\|\s*(?:-+\s*\|)+)/g, '$1\n$2');

    // 2) Ensure a newline AFTER a separator row if the next char isn't a newline
    out = out.replace(/(\|\s*(?:-+\s*\|)+)([^\n])/g, '$1\n$2');

    // 3) Insert a newline between accidental "||" joins (e.g., "| ... || NextRow ...")
    //    Only do this when the second pipe is followed by non-pipe, non-newline (to avoid "| | |" cells).
    out = out.replace(/\|\s*\|\s*(?=[^\n|])/g, '|\n|');

    // 4) Collapse excessive blank lines (avoid triple+ newlines)
    out = out.replace(/\n{3,}/g, '\n\n');

    return out;
  };

  // Stitch tables from chunks and process content
  const processedContent = documentData ? (() => {
    const chunks = documentData.chunks;
    const stitched: string[] = [];
    let current = '';
    for (const chunk of chunks) {
      if (current && current.includes('|') && chunk.content.includes('|')) {
        current += '\n' + chunk.content;
      } else {
        if (current) stitched.push(current);
        current = chunk.content;
      }
    }
    if (current) stitched.push(current);
    const stitchedContent = stitched.join('\n\n');
    return stitchedContent
      .replace(/\.\s+---/g, '.\n\n---\n\n')
      .replace(/((?:^|\n)#{1,6}.*?)(\|)/g, '$1\n\n$2');
  })() : '';

  // Apply table formatting to the processed content
  const finalContent = formatTable(processedContent);

  const customMarkdownComponents = {
    ...MarkdownComponents,
    // Ensure footnoteReference is handled for inline citations
    footnoteReference: (props: any) => (
      <MarkdownComponents.footnoteReference
        {...props}
        citations={[]} // Citations not directly needed in standalone viewer
        onCitationClick={() => {}} // No-op for standalone page
      />
    ),
    p: ({ node, children, ...props }: React.HTMLAttributes<HTMLParagraphElement> & { node?: any }) => {
      const paragraphText = React.Children.toArray(children).reduce((acc: string, child: any) => {
          if (typeof child === 'string') return acc + child;
          if (child && typeof child === 'object' && 'props' in child && typeof child.props.children === 'string') return acc + child.props.children;
          return acc;
      }, '');

      const matchingChunk = documentData?.chunks.find(
        (chunk: DocumentChunk) => highlightId === String(chunk.id) && paragraphText.includes(chunk.content)
      );

      if (matchingChunk) {
        return (
          <p
            ref={highlightRef}
            className={cn(
              props.className,
              'bg-yellow-200 dark:bg-yellow-800 text-black dark:text-gray-200 px-2 py-1 transition-all duration-300 rounded-md my-2'
            )}
            { ...props }
          >
            {children}
          </p>
        );
      }
      return <p {...props}>{children}</p>;
    },
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 text-lg text-gray-500 min-h-screen">
        Loading document...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-8 text-red-500 text-lg min-h-screen">
        Error: {error}
      </div>
    );
  }

  if (!documentData) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground text-lg min-h-screen">
        Document not found.
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <h1 className="text-3xl font-bold mb-4 text-foreground">
        {(documentData.metadata?.title as string | undefined) || documentData.docId}
      </h1>
      {documentData.metadata?.authors && documentData.metadata.authors.length > 0 && (
        <p className="text-muted-foreground text-sm mb-2">
          By: {documentData.metadata.authors.join(', ')}
        </p>
      )}
      {documentData.metadata?.url && (
        <p className="text-muted-foreground text-sm mb-2">
          Source URL: <a href={documentData.metadata.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
            {documentData.metadata.url}
          </a>
        </p>
      )}
      {documentData.metadata?.filepath && (
        <p className="text-muted-foreground text-sm mb-4">
          File Path: <span className="font-mono">{documentData.metadata.filepath}</span>
        </p>
      )}

      <div className="prose dark:prose-invert max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw]}
          components={customMarkdownComponents as any}
        >
          {finalContent}
        </ReactMarkdown>
      </div>
    </div>
  );
}
