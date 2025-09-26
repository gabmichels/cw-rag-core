/**
 * Coverage, proximity, and field boost features for domainless ranking
 */

import { HybridSearchResult } from '../types/hybrid.js';

export interface MatchFeatures {
  coverage: number;          // 0..1
  proximity: number;         // 0..1, higher=closer
  fieldBoost: number;        // 0..1
}

export interface Candidate {
  id: string;
  content?: string;
  payload?: Record<string, any>;
  tokenPositions?: Array<{token: string, start: number, end: number}>;
}

export interface CandidateFields {
  title?: string;
  header?: string;
  sectionPath?: string;
}

const PROXIMITY_WINDOW = parseInt(process.env.PROXIMITY_WINDOW || '40');

/**
 * Compute match features for a candidate document
 */
export function computeMatchFeatures(
  candidate: Candidate,
  groups: string[][],
  fields: CandidateFields
): MatchFeatures {
  const candidateTerms = extractCandidateTerms(candidate);
  const positions = candidate.tokenPositions || extractTokenPositions(candidate.content || '');

  const coverage = computeCoverage(groups, candidateTerms);
  const proximity = computeProximity(groups, positions);
  const fieldBoost = computeFieldBoost(groups, fields, candidateTerms);

  return { coverage, proximity, fieldBoost };
}

/**
 * Extract terms from candidate document
 */
function extractCandidateTerms(candidate: Candidate): string[] {
  const terms = new Set<string>();

  // From content
  if (candidate.content) {
    const contentTerms = tokenizeAndNormalize(candidate.content);
    contentTerms.forEach(term => terms.add(term));
  }

  // From payload metadata
  if (candidate.payload) {
    const metadataFields = ['title', 'header', 'sectionPath', 'summary'];
    for (const field of metadataFields) {
      const value = candidate.payload[field];
      if (typeof value === 'string') {
        const fieldTerms = tokenizeAndNormalize(value);
        fieldTerms.forEach(term => terms.add(term));
      }
    }
  }

  return Array.from(terms);
}

/**
 * Compute coverage: fraction of groups with at least one member present
 */
function computeCoverage(groups: string[][], candidateTerms: string[]): number {
  if (groups.length === 0) return 1.0;

  const candidateTermSet = new Set(candidateTerms.map(t => t.toLowerCase()));
  let coveredGroups = 0;

  for (const group of groups) {
    const hasMatch = group.some(member =>
      candidateTermSet.has(member.toLowerCase())
    );
    if (hasMatch) coveredGroups++;
  }

  return coveredGroups / groups.length;
}

/**
 * Compute proximity: min span covering one member from each group
 */
function computeProximity(groups: string[][], positions: Array<{token: string, start: number, end: number}>): number {
  if (groups.length <= 1) return 1.0; // No proximity needed for single group

  // Find positions for each group
  const groupPositions: number[][] = [];

  for (const group of groups) {
    const groupPos: number[] = [];
    const groupMembers = new Set(group.map(m => m.toLowerCase()));

    for (const pos of positions) {
      if (groupMembers.has(pos.token.toLowerCase())) {
        groupPos.push(pos.start);
      }
    }

    groupPositions.push(groupPos);
  }

  // If any group has no matches, proximity is 0
  if (groupPositions.some(pos => pos.length === 0)) {
    return 0.0;
  }

  // Find minimum span that covers at least one from each group
  let minSpan = Infinity;

  // For each possible starting group
  for (let i = 0; i < groupPositions.length; i++) {
    for (const startPos of groupPositions[i]) {
      let maxEnd = startPos;
      let coveredGroups = 1;

      // Find closest positions for other groups
      for (let j = 0; j < groupPositions.length; j++) {
        if (i === j) continue;

        let closestPos = Infinity;
        for (const pos of groupPositions[j]) {
          if (pos >= startPos && pos < closestPos) {
            closestPos = pos;
          }
        }

        if (closestPos === Infinity) {
          coveredGroups = -1; // Cannot cover this group
          break;
        }

        maxEnd = Math.max(maxEnd, closestPos);
        coveredGroups++;
      }

      if (coveredGroups === groupPositions.length) {
        const span = maxEnd - startPos;
        minSpan = Math.min(minSpan, span);
      }
    }
  }

  if (minSpan === Infinity) return 0.0;

  // Convert span to proximity score (higher = closer)
  // Use exponential decay: 1 / (1 + span/window)
  const normalizedSpan = minSpan / PROXIMITY_WINDOW;
  return 1 / (1 + normalizedSpan);
}

/**
 * Compute field boost based on matches in important fields
 */
function computeFieldBoost(groups: string[][], fields: CandidateFields, candidateTerms: string[]): number {
  let boost = 0.0;
  const candidateTermSet = new Set(candidateTerms.map(t => t.toLowerCase()));

  // Check each field for group member matches
  const fieldChecks = [
    { field: fields.title, weight: 0.4 },
    { field: fields.header, weight: 0.3 },
    { field: fields.sectionPath, weight: 0.2 }
  ];

  for (const { field, weight } of fieldChecks) {
    if (field) {
      const fieldTerms = tokenizeAndNormalize(field);
      const fieldTermSet = new Set(fieldTerms.map(t => t.toLowerCase()));

      // Count how many groups have members in this field
      let fieldCoverage = 0;
      for (const group of groups) {
        const hasFieldMatch = group.some(member =>
          fieldTermSet.has(member.toLowerCase())
        );
        if (hasFieldMatch) fieldCoverage++;
      }

      if (fieldCoverage > 0) {
        boost += weight * (fieldCoverage / groups.length);
      }
    }
  }

  return Math.min(boost, 1.0);
}

/**
 * Extract token positions from text (fallback when positions not available)
 */
function extractTokenPositions(text: string): Array<{token: string, start: number, end: number}> {
  const positions: Array<{token: string, start: number, end: number}> = [];
  const tokens = tokenizeAndNormalize(text);

  let currentPos = 0;
  for (const token of tokens) {
    const start = text.toLowerCase().indexOf(token, currentPos);
    if (start !== -1) {
      const end = start + token.length;
      positions.push({ token, start, end });
      currentPos = end;
    }
  }

  return positions;
}

/**
 * Tokenize and normalize text
 */
function tokenizeAndNormalize(text: string): string[] {
  return text.toLowerCase()
    .split(/\s+/)
    .map(token => token.replace(/[^\w]/g, ''))
    .filter(token => token.length > 2 && !isStopword(token));
}

/**
 * Simple stopword check
 */
function isStopword(word: string): boolean {
  const stopwords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
    'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this',
    'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'my',
    'your', 'his', 'her', 'our', 'their'
  ]);
  return stopwords.has(word);
}