/**
 * Golden test set for RAG evaluation
 */

import { GoldenTestCase } from '../types/eval.js';

export const GOLDEN_TEST_SET: GoldenTestCase[] = [
  {
    id: 'isharoth-day-length',
    query: 'How long is a Day in Isharoth?',
    expectedAnswer: 'A day in Isharoth lasts approximately 26 standard hours.',
    expectedChunks: ['isharoth-world-guide', 'isharoth-timeline', 'planetary-data'],
    category: 'factual',
    difficulty: 'medium',
    tags: ['entity-lookup', 'world-building', 'known-failure']
  },
  {
    id: 'saltwatch-monsoon-command',
    query: 'Who commands the Saltwatch during the monsoon season?',
    expectedAnswer: 'Captain Thorne commands the Saltwatch during monsoon season.',
    expectedChunks: ['saltwatch-personnel', 'monsoon-protocols', 'command-structure'],
    category: 'entity_lookup',
    difficulty: 'easy',
    tags: ['personnel', 'seasonal-operations']
  },
  {
    id: 'server-license',
    query: 'What license covers the server deployment script?',
    expectedAnswer: 'The server deployment script is covered under MIT License.',
    expectedChunks: ['server-deployment', 'license-agreements', 'legal-docs'],
    category: 'factual',
    difficulty: 'easy',
    tags: ['legal', 'deployment', 'licensing']
  },
  {
    id: 'pact-magic-limitations',
    query: 'Summarize the limitations of the pact magic system.',
    expectedAnswer: 'Pact magic is limited by ritual complexity, energy requirements, and temporal constraints.',
    expectedChunks: ['pact-magic-system', 'magical-limitations', 'arcane-theory'],
    category: 'procedural',
    difficulty: 'hard',
    tags: ['magic-system', 'limitations', 'complex']
  },
  {
    id: 'embedder-migration-steps',
    query: 'What are the migration steps from embedder v1 to v2?',
    expectedAnswer: 'Migration involves data reprocessing, model updates, and validation testing.',
    expectedChunks: ['embedder-migration', 'version-upgrade-guide', 'data-migration'],
    category: 'procedural',
    difficulty: 'medium',
    tags: ['migration', 'technical', 'versioning']
  },
  {
    id: 'off-hand-combat-penalty',
    query: 'Where is the off-hand combat penalty defined?',
    expectedAnswer: 'Off-hand combat penalties are defined in the combat mechanics documentation.',
    expectedChunks: ['combat-mechanics', 'weapon-systems', 'character-stats'],
    category: 'factual',
    difficulty: 'easy',
    tags: ['combat', 'mechanics', 'documentation']
  },
  {
    id: 'consistency-level-default',
    query: 'What\'s the default consistency level for writes?',
    expectedAnswer: 'The default consistency level for writes is "majority".',
    expectedChunks: ['consistency-config', 'write-operations', 'system-defaults'],
    category: 'factual',
    difficulty: 'easy',
    tags: ['configuration', 'consistency', 'system-settings']
  },
  {
    id: 'api-key-rotation',
    query: 'How do we rotate API keys in staging?',
    expectedAnswer: 'API key rotation in staging involves key generation, deployment update, and old key deactivation.',
    expectedChunks: ['api-key-management', 'staging-environment', 'security-procedures'],
    category: 'procedural',
    difficulty: 'medium',
    tags: ['security', 'api-management', 'staging']
  }
];

export const CRITICAL_FAILURE_CASES = [
  'isharoth-day-length' // Known failure case that must pass
];

export function getTestCaseById(id: string): GoldenTestCase | undefined {
  return GOLDEN_TEST_SET.find(test => test.id === id);
}

export function getTestCasesByCategory(category: string): GoldenTestCase[] {
  return GOLDEN_TEST_SET.filter(test => test.category === category);
}

export function getTestCasesByDifficulty(difficulty: 'easy' | 'medium' | 'hard'): GoldenTestCase[] {
  return GOLDEN_TEST_SET.filter(test => test.difficulty === difficulty);
}

export function getTestCasesByTag(tag: string): GoldenTestCase[] {
  return GOLDEN_TEST_SET.filter(test => test.tags.includes(tag));
}