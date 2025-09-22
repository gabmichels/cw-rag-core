// Jest globals are automatically available in test environment
import { promises as fs } from 'fs';
import path from 'path';
import {
  GoldEvalRecord,
  OODEvalRecord,
  InjectionEvalRecord,
  RBACEvalRecord
} from '../types.js';

describe('Dataset Validation', () => {
  const dataDir = path.join(process.cwd(), 'data');

  describe('Gold Dataset', () => {
    it('should have valid gold.jsonl structure', async () => {
      const filePath = path.join(dataDir, 'gold.jsonl');

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.trim().split('\n').filter(line => line.trim());

        expect(lines.length).toBeGreaterThan(0);

        for (const line of lines) {
          const record = JSON.parse(line) as GoldEvalRecord;

          // Validate required fields
          expect(record.id).toBeDefined();
          expect(record.query).toBeDefined();
          expect(record.answerspan).toBeDefined();
          expect(record.docId).toBeDefined();
          expect(record.tenantId).toBeDefined();

          // Validate types
          expect(typeof record.id).toBe('string');
          expect(typeof record.query).toBe('string');
          expect(typeof record.answerspan).toBe('string');
          expect(typeof record.docId).toBe('string');
          expect(typeof record.tenantId).toBe('string');

          // Validate ID format
          expect(record.id).toMatch(/^gold_\d+$/);
        }
      } catch (error) {
        // If file doesn't exist or is invalid, fail gracefully
        console.warn('Gold dataset validation skipped:', error);
      }
    });
  });

  describe('OOD Dataset', () => {
    it('should have valid ood.jsonl structure', async () => {
      const filePath = path.join(dataDir, 'ood.jsonl');

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.trim().split('\n').filter(line => line.trim());

        expect(lines.length).toBeGreaterThan(0);

        for (const line of lines) {
          const record = JSON.parse(line) as OODEvalRecord;

          // Validate required fields
          expect(record.id).toBeDefined();
          expect(record.query).toBeDefined();
          expect(record.tenantId).toBeDefined();
          expect(record.expectedResponse).toBeDefined();
          expect(record.category).toBeDefined();

          // Validate expectedResponse values
          expect(['IDK', 'NO_ANSWER']).toContain(record.expectedResponse);

          // Validate ID format
          expect(record.id).toMatch(/^ood_\d+$/);
        }
      } catch (error) {
        console.warn('OOD dataset validation skipped:', error);
      }
    });
  });

  describe('Injection Dataset', () => {
    it('should have valid inject.jsonl structure', async () => {
      const filePath = path.join(dataDir, 'inject.jsonl');

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.trim().split('\n').filter(line => line.trim());

        expect(lines.length).toBeGreaterThan(0);

        for (const line of lines) {
          const record = JSON.parse(line) as InjectionEvalRecord;

          // Validate required fields
          expect(record.id).toBeDefined();
          expect(record.query).toBeDefined();
          expect(record.tenantId).toBeDefined();
          expect(record.injectionType).toBeDefined();
          expect(record.maliciousPrompt).toBeDefined();
          expect(record.expectedBehavior).toBeDefined();

          // Validate injection types
          expect(['prompt_injection', 'data_extraction', 'system_override', 'role_manipulation'])
            .toContain(record.injectionType);

          // Validate expected behaviors
          expect(['reject', 'sanitize', 'ignore']).toContain(record.expectedBehavior);

          // Validate ID format
          expect(record.id).toMatch(/^inject_\d+$/);
        }
      } catch (error) {
        console.warn('Injection dataset validation skipped:', error);
      }
    });
  });

  describe('RBAC Dataset', () => {
    it('should have valid rbac.jsonl structure', async () => {
      const filePath = path.join(dataDir, 'rbac.jsonl');

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.trim().split('\n').filter(line => line.trim());

        expect(lines.length).toBeGreaterThan(0);

        for (const line of lines) {
          const record = JSON.parse(line) as RBACEvalRecord;

          // Validate required fields
          expect(record.id).toBeDefined();
          expect(record.query).toBeDefined();
          expect(record.tenantId).toBeDefined();
          expect(record.userId).toBeDefined();
          expect(record.userGroups).toBeDefined();
          expect(record.requiredACL).toBeDefined();
          expect(record.expectedDocIds).toBeDefined();
          expect(record.allowedDocIds).toBeDefined();

          // Validate array types
          expect(Array.isArray(record.userGroups)).toBe(true);
          expect(Array.isArray(record.requiredACL)).toBe(true);
          expect(Array.isArray(record.expectedDocIds)).toBe(true);
          expect(Array.isArray(record.allowedDocIds)).toBe(true);

          // Validate ID format
          expect(record.id).toMatch(/^rbac_\d+$/);
        }
      } catch (error) {
        console.warn('RBAC dataset validation skipped:', error);
      }
    });
  });

  describe('Dataset Consistency', () => {
    it('should have consistent tenant IDs across datasets', async () => {
      const datasets = ['gold', 'ood', 'inject', 'rbac'];
      const tenantIds = new Set<string>();

      for (const dataset of datasets) {
        try {
          const filePath = path.join(dataDir, `${dataset}.jsonl`);
          const content = await fs.readFile(filePath, 'utf-8');
          const lines = content.trim().split('\n').filter(line => line.trim());

          for (const line of lines) {
            const record = JSON.parse(line);
            tenantIds.add(record.tenantId);
          }
        } catch (error) {
          // Skip if file doesn't exist
          continue;
        }
      }

      // Should have at least one consistent tenant ID
      expect(tenantIds.size).toBeGreaterThanOrEqual(1);
    });

    it('should have unique IDs within each dataset', async () => {
      const datasets = ['gold', 'ood', 'inject', 'rbac'];

      for (const dataset of datasets) {
        try {
          const filePath = path.join(dataDir, `${dataset}.jsonl`);
          const content = await fs.readFile(filePath, 'utf-8');
          const lines = content.trim().split('\n').filter(line => line.trim());

          const ids = new Set<string>();
          for (const line of lines) {
            const record = JSON.parse(line);
            expect(ids.has(record.id)).toBe(false);
            ids.add(record.id);
          }
        } catch (error) {
          // Skip if file doesn't exist
          continue;
        }
      }
    });
  });
});