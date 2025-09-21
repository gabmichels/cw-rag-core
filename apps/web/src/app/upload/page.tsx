"use client";

import { useState, useRef, useCallback } from 'react';
import { UploadFile, PreviewResponse, PublishResponse, UploadFormData, PIIPolicy } from '../../types';
import { handleApiResponse, APIError, validateFileType, generateDocId, formatFileSize } from '../../utils/api';

const ALLOWED_FILE_TYPES = ['pdf', 'docx', 'md', 'html', 'txt'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

interface UploadStep {
  step: 'upload' | 'preview' | 'policy' | 'publish';
  title: string;
}

const steps: UploadStep[] = [
  { step: 'upload', title: 'Upload Files' },
  { step: 'preview', title: 'Preview & Validation' },
  { step: 'policy', title: 'Policy Review' },
  { step: 'publish', title: 'Publish' }
];

export default function UploadPage() {
  const [currentStep, setCurrentStep] = useState<'upload' | 'preview' | 'policy' | 'publish'>('upload');
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [formData, setFormData] = useState<UploadFormData>({
    tenant: 'demo',
    source: 'upload',
    acl: ['public'],
    title: '',
    tags: [],
    authors: [],
    urls: []
  });
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null);
  const [publishData, setPublishData] = useState<PublishResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mock policy data
  const currentPolicy: PIIPolicy = {
    mode: 'mask',
    allowedTypes: ['email', 'phone'],
    tenantId: 'demo'
  };

  const validateFile = (file: File): string | null => {
    if (!validateFileType(file.name, ALLOWED_FILE_TYPES)) {
      const extension = file.name.split('.').pop()?.toLowerCase();
      return `File type .${extension} not allowed. Allowed types: ${ALLOWED_FILE_TYPES.join(', ')}`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File size exceeds maximum allowed size of ${formatFileSize(MAX_FILE_SIZE)}`;
    }
    return null;
  };

  const addFiles = (filesToAdd: FileList | File[]) => {
    const newFiles: UploadFile[] = [];
    Array.from(filesToAdd).forEach((file) => {
      const validationError = validateFile(file);
      newFiles.push({
        file,
        id: Math.random().toString(36).substring(7),
        status: validationError ? 'error' : 'pending',
        error: validationError || undefined
      });
    });
    setFiles(prev => [...prev, ...newFiles]);
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
    }
  };

  const addUrl = () => {
    if (urlInput.trim()) {
      setFormData(prev => ({
        ...prev,
        urls: [...prev.urls!, urlInput.trim()]
      }));
      setUrlInput('');
    }
  };

  const removeUrl = (index: number) => {
    setFormData(prev => ({
      ...prev,
      urls: prev.urls!.filter((_, i) => i !== index)
    }));
  };

  const handlePreview = async () => {
    setLoading(true);
    setError(null);
    try {
      // Create normalized docs from files and URLs
      const docs = await Promise.all(files.filter(f => f.status !== 'error').map(async (uploadFile) => {
        const content = await uploadFile.file.text();
        return {
          meta: {
            tenant: formData.tenant,
            docId: `${formData.tenant}-${uploadFile.file.name}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
            source: formData.source,
            path: uploadFile.file.name,
            title: formData.title || uploadFile.file.name,
            lang: 'en',
            sha256: '', // Will be calculated on backend
            acl: formData.acl,
            authors: formData.authors,
            tags: formData.tags,
            timestamp: new Date().toISOString(),
          },
          blocks: [{ type: 'text' as const, text: content }]
        };
      }));

      const response = await fetch('/api/ingest/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(docs)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Preview failed');
      }

      const data: PreviewResponse = await response.json();
      setPreviewData(data);
      setCurrentStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = async () => {
    setLoading(true);
    setError(null);
    try {
      // Create normalized docs from files and URLs
      const docs = await Promise.all(files.filter(f => f.status !== 'error').map(async (uploadFile) => {
        const content = await uploadFile.file.text();
        return {
          meta: {
            tenant: formData.tenant,
            docId: `${formData.tenant}-${uploadFile.file.name}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
            source: formData.source,
            path: uploadFile.file.name,
            title: formData.title || uploadFile.file.name,
            lang: 'en',
            sha256: '', // Will be calculated on backend
            acl: formData.acl,
            authors: formData.authors,
            tags: formData.tags,
            timestamp: new Date().toISOString(),
          },
          blocks: [{ type: 'text' as const, text: content }]
        };
      }));

      const response = await fetch('/api/ingest/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(docs)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Publish failed');
      }

      const data: PublishResponse = await response.json();
      setPublishData(data);
      setCurrentStep('publish');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setLoading(false);
    }
  };

  const validFiles = files.filter(f => f.status !== 'error');
  const hasContent = validFiles.length > 0 || (formData.urls && formData.urls.length > 0);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-8">Manual Upload</h1>

      {/* Step indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => (
            <div key={step.step} className="flex items-center">
              <div className={`
                w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                ${currentStep === step.step ? 'bg-blue-600 text-white' :
                  steps.findIndex(s => s.step === currentStep) > index ? 'bg-green-600 text-white' : 'bg-gray-300 text-gray-600'}
              `}>
                {steps.findIndex(s => s.step === currentStep) > index ? '✓' : index + 1}
              </div>
              <span className={`ml-2 text-sm ${currentStep === step.step ? 'font-medium' : ''}`}>
                {step.title}
              </span>
              {index < steps.length - 1 && (
                <div className={`w-16 h-0.5 mx-4 ${steps.findIndex(s => s.step === currentStep) > index ? 'bg-green-600' : 'bg-gray-300'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Step 1: Upload */}
      {currentStep === 'upload' && (
        <div className="space-y-6">
          {/* File Upload */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Upload Files</h2>
            <div
              className={`
                border-2 border-dashed rounded-lg p-8 text-center transition-colors
                ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
              `}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <div className="space-y-4">
                <div className="text-4xl">📁</div>
                <div>
                  <p className="text-lg font-medium">Drop files here or click to browse</p>
                  <p className="text-sm text-gray-600">
                    Supported: {ALLOWED_FILE_TYPES.join(', ')} (max {MAX_FILE_SIZE / 1024 / 1024}MB each)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
                >
                  Browse Files
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={ALLOWED_FILE_TYPES.map(ext => `.${ext}`).join(',')}
                  onChange={handleFileInput}
                  className="hidden"
                />
              </div>
            </div>

            {/* File List */}
            {files.length > 0 && (
              <div className="mt-4">
                <h3 className="font-medium mb-2">Selected Files</h3>
                <div className="space-y-2">
                  {files.map((file) => (
                    <div key={file.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                      <div className="flex items-center space-x-3">
                        <div className={`
                          w-2 h-2 rounded-full
                          ${file.status === 'error' ? 'bg-red-500' : 'bg-green-500'}
                        `} />
                        <span className="font-medium">{file.file.name}</span>
                        <span className="text-sm text-gray-600">
                          ({(file.file.size / 1024).toFixed(1)} KB)
                        </span>
                        {file.error && (
                          <span className="text-sm text-red-600">{file.error}</span>
                        )}
                      </div>
                      <button
                        onClick={() => removeFile(file.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* URL Input */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Or Add URLs</h2>
            <div className="flex space-x-2">
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Enter URL to fetch content"
                className="flex-1 p-2 border border-gray-300 rounded-md"
              />
              <button
                onClick={addUrl}
                disabled={!urlInput.trim()}
                className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                Add URL
              </button>
            </div>

            {formData.urls && formData.urls.length > 0 && (
              <div className="mt-4">
                <h3 className="font-medium mb-2">URLs to Process</h3>
                <div className="space-y-2">
                  {formData.urls.map((url, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                      <span className="font-medium">{url}</span>
                      <button
                        onClick={() => removeUrl(index)}
                        className="text-red-600 hover:text-red-800"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Metadata Form */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Metadata</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Tenant</label>
                <input
                  type="text"
                  value={formData.tenant}
                  onChange={(e) => setFormData(prev => ({ ...prev, tenant: e.target.value }))}
                  className="w-full p-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Source</label>
                <input
                  type="text"
                  value={formData.source}
                  onChange={(e) => setFormData(prev => ({ ...prev, source: e.target.value }))}
                  className="w-full p-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Title (optional)</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Document title"
                  className="w-full p-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">ACL</label>
                <input
                  type="text"
                  value={formData.acl.join(', ')}
                  onChange={(e) => setFormData(prev => ({ ...prev, acl: e.target.value.split(',').map(s => s.trim()) }))}
                  placeholder="public, users"
                  className="w-full p-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>
          </div>

          {/* Next Button */}
          <div className="flex justify-end">
            <button
              onClick={handlePreview}
              disabled={!hasContent || loading}
              className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Processing...' : 'Preview'}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Preview */}
      {currentStep === 'preview' && previewData && (
        <div className="space-y-6">
          <h2 className="text-xl font-semibold">Preview Results</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 p-4 rounded-md">
              <div className="text-2xl font-bold text-blue-600">{previewData.processedDocs}</div>
              <div className="text-sm text-blue-800">Documents</div>
            </div>
            <div className="bg-green-50 p-4 rounded-md">
              <div className="text-2xl font-bold text-green-600">{previewData.blocksCount}</div>
              <div className="text-sm text-green-800">Text Blocks</div>
            </div>
            <div className="bg-purple-50 p-4 rounded-md">
              <div className="text-2xl font-bold text-purple-600">{(previewData.bytes / 1024).toFixed(1)}KB</div>
              <div className="text-sm text-purple-800">Total Size</div>
            </div>
          </div>

          {previewData.findings.length > 0 && (
            <div>
              <h3 className="font-medium mb-2">PII Findings (Counts Only)</h3>
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {previewData.findings.map((finding) => (
                    <div key={finding.type} className="text-center">
                      <div className="text-lg font-bold text-yellow-600">{finding.count}</div>
                      <div className="text-sm text-yellow-800 capitalize">{finding.type}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {previewData.errors && previewData.errors.length > 0 && (
            <div>
              <h3 className="font-medium mb-2 text-red-600">Errors</h3>
              <div className="bg-red-50 border border-red-200 rounded-md p-4">
                <ul className="list-disc list-inside space-y-1">
                  {previewData.errors.map((error, index) => (
                    <li key={index} className="text-red-800">{error}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div className="flex justify-between">
            <button
              onClick={() => setCurrentStep('upload')}
              className="bg-gray-600 text-white px-6 py-2 rounded-md hover:bg-gray-700"
            >
              Back
            </button>
            <button
              onClick={() => setCurrentStep('policy')}
              className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700"
            >
              Next: Review Policy
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Policy Review */}
      {currentStep === 'policy' && (
        <div className="space-y-6">
          <h2 className="text-xl font-semibold">Policy Review</h2>

          <div className="bg-gray-50 p-6 rounded-md">
            <h3 className="font-medium mb-4">Current PII Policy Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <span className="font-medium">Policy Mode:</span>
                <span className={`ml-2 px-2 py-1 rounded text-sm ${
                  currentPolicy.mode === 'off' ? 'bg-gray-200 text-gray-800' :
                  currentPolicy.mode === 'mask' ? 'bg-yellow-200 text-yellow-800' :
                  currentPolicy.mode === 'block' ? 'bg-red-200 text-red-800' :
                  'bg-green-200 text-green-800'
                }`}>
                  {currentPolicy.mode.toUpperCase()}
                </span>
              </div>
              <div>
                <span className="font-medium">Tenant:</span>
                <span className="ml-2">{currentPolicy.tenantId}</span>
              </div>
            </div>

            {currentPolicy.allowedTypes && currentPolicy.allowedTypes.length > 0 && (
              <div className="mt-4">
                <span className="font-medium">Allowed PII Types:</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {currentPolicy.allowedTypes.map((type) => (
                    <span key={type} className="bg-green-100 text-green-800 px-2 py-1 rounded text-sm">
                      {type}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {previewData && !previewData.wouldPublish && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <div className="flex items-center">
                <div className="text-red-600 mr-3">⚠️</div>
                <div>
                  <h4 className="font-medium text-red-800">Content Would Be Blocked</h4>
                  <p className="text-red-700">
                    Based on current policy settings, this content contains PII that would prevent publication.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-between">
            <button
              onClick={() => setCurrentStep('preview')}
              className="bg-gray-600 text-white px-6 py-2 rounded-md hover:bg-gray-700"
            >
              Back
            </button>
            <button
              onClick={handlePublish}
              disabled={loading || (previewData ? !previewData.wouldPublish : false)}
              className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? 'Publishing...' : 'Publish'}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Publish Results */}
      {currentStep === 'publish' && publishData && (
        <div className="space-y-6">
          <h2 className="text-xl font-semibold">Publish Results</h2>

          <div className="bg-green-50 border border-green-200 rounded-md p-4">
            <div className="flex items-center">
              <div className="text-green-600 mr-3">✅</div>
              <div>
                <h4 className="font-medium text-green-800">Publication Complete</h4>
                <p className="text-green-700">
                  {publishData.summary.published} of {publishData.summary.total} documents published successfully.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-blue-50 p-4 rounded-md text-center">
              <div className="text-2xl font-bold text-blue-600">{publishData.summary.total}</div>
              <div className="text-sm text-blue-800">Total</div>
            </div>
            <div className="bg-green-50 p-4 rounded-md text-center">
              <div className="text-2xl font-bold text-green-600">{publishData.summary.published}</div>
              <div className="text-sm text-green-800">Published</div>
            </div>
            <div className="bg-yellow-50 p-4 rounded-md text-center">
              <div className="text-2xl font-bold text-yellow-600">{publishData.summary.updated}</div>
              <div className="text-sm text-yellow-800">Updated</div>
            </div>
            <div className="bg-red-50 p-4 rounded-md text-center">
              <div className="text-2xl font-bold text-red-600">{publishData.summary.blocked}</div>
              <div className="text-sm text-red-800">Blocked</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-md text-center">
              <div className="text-2xl font-bold text-gray-600">{publishData.summary.errors}</div>
              <div className="text-sm text-gray-800">Errors</div>
            </div>
          </div>

          <div>
            <h3 className="font-medium mb-4">Individual Results</h3>
            <div className="space-y-2">
              {publishData.results.map((result, index) => (
                <div key={index} className={`
                  p-3 rounded-md border
                  ${result.status === 'published' ? 'bg-green-50 border-green-200' :
                    result.status === 'blocked' ? 'bg-red-50 border-red-200' :
                    result.status === 'error' ? 'bg-red-50 border-red-200' :
                    'bg-gray-50 border-gray-200'}
                `}>
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="font-medium">{result.docId}</span>
                      <span className={`ml-2 px-2 py-1 rounded text-sm ${
                        result.status === 'published' ? 'bg-green-200 text-green-800' :
                        result.status === 'blocked' ? 'bg-red-200 text-red-800' :
                        result.status === 'error' ? 'bg-red-200 text-red-800' :
                        'bg-gray-200 text-gray-800'
                      }`}>
                        {result.status.toUpperCase()}
                      </span>
                    </div>
                    {result.pointsUpserted && (
                      <span className="text-sm text-gray-600">{result.pointsUpserted} points</span>
                    )}
                  </div>
                  {result.message && (
                    <p className="text-sm text-gray-600 mt-1">{result.message}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-between">
            <button
              onClick={() => {
                setCurrentStep('upload');
                setFiles([]);
                setPreviewData(null);
                setPublishData(null);
                setFormData({
                  tenant: 'demo',
                  source: 'upload',
                  acl: ['public'],
                  title: '',
                  tags: [],
                  authors: [],
                  urls: []
                });
              }}
              className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700"
            >
              Upload More
            </button>
            <a
              href="/ingests"
              className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 inline-block"
            >
              View Recent Ingests
            </a>
          </div>
        </div>
      )}
    </div>
  );
}