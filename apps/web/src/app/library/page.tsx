"use client";

import { Suspense } from 'react';
import LibraryTable from './components/LibraryTable';

export default function LibraryPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Document Library
          </h1>
          <p className="text-muted-foreground">
            View and manage all your ingested documents
          </p>
        </div>

        <Suspense fallback={
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        }>
          <LibraryTable />
        </Suspense>
      </div>
    </div>
  );
}