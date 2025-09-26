"use client";

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { fetchDocumentById, DocumentFetchResponse, DocumentChunk } from '@/utils/api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { MarkdownComponents } from '@/components/ask/MarkdownComponents';
import { cn } from '@/lib/utils';
import { X, ExternalLink } from 'lucide-react'; // For close and external link icons
import { Button } from '@/components/ui/button'; // Assuming a Button component

interface DocumentViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  qdrantDocId: string | null;
  highlightId: string | null;
}

export default function DocumentViewerModal({
  isOpen,
  onClose,
  qdrantDocId,
  highlightId,
}: DocumentViewerModalProps) {
  const router = useRouter();
  const [documentData, setDocumentData] = useState<DocumentFetchResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const highlightElementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !qdrantDocId) {
      setDocumentData(null); // Clear data when modal is closed or docId is missing
      setIsLoading(false);
      setError(null);
      return;
    }

    const loadDocument = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await fetchDocumentById(qdrantDocId);
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
  }, [isOpen, qdrantDocId]);

  // Get the chunk content for highlighting
  const highlightContent = useMemo(() => {
    if (!documentData || !highlightId) return null;

    const matchingChunk = documentData.chunks.find(
      (chunk: DocumentChunk) => highlightId === String(chunk.id)
    );

    return matchingChunk?.content.trim() || null;
  }, [documentData, highlightId]);

  // Effect to find and highlight content using precise text matching
  useEffect(() => {
    if (!documentData || !highlightContent || !highlightElementRef.current) {
      console.log('DocumentViewerModal: Skipping highlight - missing data:', {
        hasDocumentData: !!documentData,
        hasHighlightContent: !!highlightContent,
        hasContainer: !!highlightElementRef.current,
        highlightId
      });
      return;
    }

    console.log('DocumentViewerModal: Attempting to highlight chunk:', {
      highlightId,
      contentLength: highlightContent.length,
      chunkContent: highlightContent.substring(0, 100) + '...'
    });

    const container = highlightElementRef.current;

    // Remove existing highlights first
    document.querySelectorAll('.citation-highlight').forEach(el => {
      el.classList.remove('citation-highlight');
    });

    // Get all text nodes in the container
    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      null
    );

    const textNodes: Text[] = [];
    let node;
    while (node = walker.nextNode()) {
      textNodes.push(node as Text);
    }

    // Find text nodes that contain significant portions of our target content
    const targetText = highlightContent.toLowerCase().trim();
    const targetWords = targetText.split(/\s+/).filter(word => word.length > 3);
    const matchingElements: Element[] = [];

    console.log('DocumentViewerModal: Searching for target words:', targetWords.slice(0, 5));

    for (const textNode of textNodes) {
      const nodeText = textNode.textContent?.toLowerCase().trim() || '';

      if (nodeText.length < 15) continue; // Skip very short text nodes

      // Check for exact match or significant word overlap
      const exactMatch = nodeText.includes(targetText) || targetText.includes(nodeText);
      const wordMatches = targetWords.filter(word => nodeText.includes(word)).length;
      const wordMatchRatio = wordMatches / targetWords.length;

      // Be more permissive - match if >30% word overlap or exact substring match
      if (exactMatch || wordMatchRatio > 0.3) {
        const parentElement = textNode.parentElement;
        if (parentElement &&
            !matchingElements.includes(parentElement) &&
            !parentElement.closest('.citation-highlight')) { // Avoid nested highlights
          matchingElements.push(parentElement);
          console.log('DocumentViewerModal: Found match in element:', {
            elementTag: parentElement.tagName,
            exactMatch,
            wordMatchRatio: wordMatchRatio.toFixed(2),
            matchedWords: wordMatches,
            nodeTextPreview: nodeText.substring(0, 100)
          });
        }
      }
    }

    // Limit to max 2 elements to avoid over-highlighting
    const limitedElements = matchingElements.slice(0, 2);

    console.log('DocumentViewerModal: Highlighting result:', {
      totalMatches: matchingElements.length,
      limitedMatches: limitedElements.length,
      highlightApplied: limitedElements.length > 0
    });

    if (limitedElements.length > 0) {
      // Create CSS for highlighting
      const styleId = 'citation-highlight-style';
      let existingStyle = document.getElementById(styleId) as HTMLStyleElement;

      if (!existingStyle) {
        existingStyle = document.createElement('style');
        existingStyle.id = styleId;
        document.head.appendChild(existingStyle);
      }

      existingStyle.textContent = `
        .citation-highlight {
          background-color: rgba(255, 255, 0, 0.3) !important;
          box-shadow: 0 0 0 1px rgba(255, 255, 0, 0.5);
          border-radius: 3px;
          transition: all 0.3s ease;
          position: relative;
          display: inline-block;
          padding: 2px 4px;
          margin: 1px;
        }
      `;

      // Add highlight class to matching elements
      limitedElements.forEach(element => {
        element.classList.add('citation-highlight');
      });

      // Scroll to the first highlighted element
      limitedElements[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      console.warn('DocumentViewerModal: No highlights found for chunk:', {
        chunkId: highlightId,
        targetText: targetText.substring(0, 50),
        availableChunks: documentData.chunks.map(c => ({ id: c.id, contentPreview: c.content.substring(0, 50) }))
      });
    }

    // Cleanup function
    return () => {
      document.querySelectorAll('.citation-highlight').forEach(el => {
        el.classList.remove('citation-highlight');
      });
      const style = document.getElementById('citation-highlight-style');
      if (style) {
        style.remove();
      }
    };
  }, [documentData, highlightContent, highlightId]);

  const handleOpenInNewTab = () => {
    if (qdrantDocId) {
      const url = `/view-document/${encodeURIComponent(qdrantDocId)}${highlightId ? `?highlightId=${encodeURIComponent(highlightId)}` : ''}`;
      window.open(url, '_blank');
    }
  };

  // Function to format malformed tables
  const formatTable = (content: string) => {
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

  // Custom renderer - highlighting is handled via CSS
  const customMarkdownComponents = {
    ...MarkdownComponents,
    // Ensure footnoteReference is handled for inline citations
    footnoteReference: (props: any) => (
      <MarkdownComponents.footnoteReference
        {...props}
        citations={[]} // Citations not directly needed in modal as context, but keeping for consistency if needed later
        onCitationClick={() => {}} // No-op as modal doesn't need to open another modal
      />
    ),
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-card text-card-foreground rounded-lg shadow-xl flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-xl font-semibold">
            {(documentData?.metadata?.title as string | undefined) || documentData?.docId || 'Document Viewer'}
          </h2>
          <div className="flex items-center gap-2">
            {qdrantDocId && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleOpenInNewTab}
                title="Open in new tab"
              >
                <ExternalLink className="h-5 w-5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              title="Close viewer"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Modal Content */}
        <div
          ref={highlightElementRef}
          className="flex-1 overflow-y-auto p-4 markdown-content"
        >
          {isLoading && (
            <div className="flex items-center justify-center h-full text-lg text-gray-500">
              Loading document...
            </div>
          )}
          {error && (
            <div className="flex items-center justify-center h-full text-red-500 text-lg">
              Error: {error}
            </div>
          )}
          {!isLoading && !error && !documentData && (
            <div className="flex items-center justify-center h-full text-muted-foreground text-lg">
              Document not found.
            </div>
          )}
          {!isLoading && !error && documentData && (
            <div className="prose dark:prose-invert max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
                components={customMarkdownComponents as any}
              >
                {finalContent}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}