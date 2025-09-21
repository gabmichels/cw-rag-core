import { PIIDetector, PIIDetection, DetectorOptions } from '../types.js';

/**
 * API Key detector for various key formats
 */
export class APIKeyDetector implements PIIDetector {
  public readonly type = 'api_key' as const;

  /**
   * API key patterns for various services
   */
  private readonly apiKeyPatterns = [
    // AWS Access Key ID: AKIA followed by 16 characters
    /\bAKIA[0-9A-Z]{16}\b/g,
    // GitHub tokens: ghp_, gho_, ghu_, ghs_, ghr_ followed by 36 characters
    /\bgh[poushr]_[A-Za-z0-9]{36}\b/g,
    // Stripe keys: sk_live_, pk_live_, sk_test_, pk_test_
    /\b[sp]k_(live|test)_[A-Za-z0-9]{24,}\b/g,
    // Google API keys: AIza followed by 35 characters
    /\bAIza[A-Za-z0-9_-]{35}\b/g,
    // AWS Secret Access Key: 40 characters base64-like (less strict)
    /\b[A-Za-z0-9+/]{40}(?![A-Za-z0-9+/])\b/g,
    // Generic API keys: 32-64 hex characters
    /\b[a-fA-F0-9]{32,64}\b/g,
    // Generic API keys: 32-64 base64 characters (more flexible)
    /\b[A-Za-z0-9+/=]{32,64}\b/g,
    // Generic bearer tokens
    /\bbearer\s+[A-Za-z0-9._-]{20,}\b/gi,
    // API key patterns with common prefixes
    /\b(api[_-]?key|apikey|access[_-]?token|secret[_-]?key)[=:\s]+[A-Za-z0-9+/=_-]{16,}\b/gi
  ];

  /**
   * Detect API keys in the given text
   */
  detect(text: string, options: DetectorOptions = {}): PIIDetection[] {
    const { minConfidence = 0.8, strictValidation = true } = options;
    const candidates: PIIDetection[] = [];

    // Collect all potential detections from all patterns
    for (const pattern of this.apiKeyPatterns) {
      let match;
      pattern.lastIndex = 0; // Reset regex state

      while ((match = pattern.exec(text)) !== null) {
        const keyCandidate = match[0];
        let confidence = 0.8; // Base confidence for regex match

        if (strictValidation) {
          confidence = this.validateAPIKey(keyCandidate);
        }

        if (confidence >= minConfidence) {
          candidates.push({
            type: this.type,
            start: match.index,
            end: match.index + keyCandidate.length,
            confidence
          });
        }
      }
    }

    // Sort candidates by confidence (desc) then length (desc) to prioritize more confident/longer matches
    candidates.sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence; // Higher confidence first
      const lenA = a.end - a.start;
      const lenB = b.end - b.start;
      return lenB - lenA; // Longer matches first
    });

    const finalDetections: PIIDetection[] = [];
    const coveredRanges: Array<{ start: number; end: number }> = [];

    // Filter out overlapping detections, preferring those already added due to sorting
    for (const candidate of candidates) {
      let isOverlapping = false;
      for (const covered of coveredRanges) {
        // Check for overlap: [start1, end1) and [start2, end2) overlap if start1 < end2 and start2 < end1
        if (candidate.start < covered.end && covered.start < candidate.end) {
          isOverlapping = true;
          break;
        }
      }

      if (!isOverlapping) {
        finalDetections.push(candidate);
        coveredRanges.push({ start: candidate.start, end: candidate.end });
      }
    }

    return finalDetections;
  }

  /**
   * Generate appropriate mask for API keys
   */
  getMask(detection: PIIDetection): string {
    return '[API_KEY_REDACTED]';
  }

  /**
   * Validate API key format and return confidence score
   */
  private validateAPIKey(key: string): number {
    let confidence = 0.6; // Base confidence

    // Check for AWS Access Key ID pattern
    if (/^AKIA[0-9A-Z]{16}$/.test(key)) {
      return 0.95;
    }

    // Check for GitHub token patterns
    if (/^gh[poushr]_[A-Za-z0-9]{36}$/.test(key)) {
      return 0.95;
    }

    // Check for Stripe key patterns
    if (/^[sp]k_(live|test)_[A-Za-z0-9]{24,}$/.test(key)) {
      return 0.95;
    }

    // Check for Google API key pattern
    if (/^AIza[A-Za-z0-9_-]{35}$/.test(key)) {
      return 0.95;
    }

    // Check for bearer token (the full matched text includes "bearer ")
    if (/bearer\s+/i.test(key)) {
      return 0.85;
    }

    // Check for hex patterns
    if (/^[a-fA-F0-9]{32,64}$/.test(key)) {
      confidence += 0.2;
    }

    // Check for base64 patterns (40 chars for AWS secret keys)
    if (/^[A-Za-z0-9+/]{40}$/.test(key)) {
      confidence += 0.25;
    }

    // General validation checks
    if (key.length >= 20 && key.length <= 128) {
      confidence += 0.05;
    }

    // Check entropy (randomness indicator)
    const entropy = this.calculateEntropy(key);
    if (entropy > 4.0) confidence += 0.1;
    if (entropy > 5.0) confidence += 0.05;

    // Decrease confidence for suspicious patterns but be less aggressive
    if (/^(.)\1+$/.test(key)) confidence -= 0.2; // All same character
    if (/^(abc|123|test|demo)/i.test(key)) confidence -= 0.1; // Common test patterns (removed 'example')

    return Math.max(0, Math.min(confidence, 1.0));
  }

  /**
   * Calculate Shannon entropy of a string (measure of randomness)
   */
  private calculateEntropy(str: string): number {
    const frequencies: Record<string, number> = {};

    // Count character frequencies
    for (const char of str) {
      frequencies[char] = (frequencies[char] || 0) + 1;
    }

    // Calculate entropy
    let entropy = 0;
    const length = str.length;

    for (const freq of Object.values(frequencies)) {
      const probability = freq / length;
      entropy -= probability * Math.log2(probability);
    }

    return entropy;
  }
}

/**
 * AWS Key detector specialized for AWS credentials
 */
export class AWSKeyDetector implements PIIDetector {
  public readonly type = 'aws_key' as const;

  private readonly awsPatterns = [
    // AWS Access Key ID
    /\bAKIA[0-9A-Z]{16}\b/g,
    // AWS Secret Access Key (40 base64 characters) - more specific context
    /\b[A-Za-z0-9+/]{40}(?![A-Za-z0-9+/])\b/g,
    // AWS Session Token (longer format)
    /\b[A-Za-z0-9+/=]{100,600}\b/g
  ];

  detect(text: string, options: DetectorOptions = {}): PIIDetection[] {
    const { minConfidence = 0.8 } = options;
    const detections: PIIDetection[] = [];
    const foundRanges = new Set<string>();

    for (const pattern of this.awsPatterns) {
      let match;
      pattern.lastIndex = 0;

      while ((match = pattern.exec(text)) !== null) {
        const keyCandidate = match[0];
        const rangeKey = `${match.index}-${match.index + keyCandidate.length}`;

        if (foundRanges.has(rangeKey)) continue;

        let confidence = 0.8;

        // Higher confidence for AWS Access Key ID
        if (/^AKIA[0-9A-Z]{16}$/.test(keyCandidate)) {
          confidence = 0.95;
        }
        // AWS Secret Access Key validation
        else if (keyCandidate.length === 40 && /^[A-Za-z0-9+/]{40}$/.test(keyCandidate)) {
          confidence = 0.85;
        }
        // AWS Session Token validation
        else if (keyCandidate.length >= 100 && /^[A-Za-z0-9+/=]+$/.test(keyCandidate)) {
          confidence = 0.9;
        }

        if (confidence >= minConfidence) {
          detections.push({
            type: this.type,
            start: match.index,
            end: match.index + keyCandidate.length,
            confidence
          });
          foundRanges.add(rangeKey);
        }
      }
    }

    return detections;
  }

  getMask(detection: PIIDetection): string {
    return '[AWS_KEY_REDACTED]';
  }
}

/**
 * JWT Token detector
 */
export class JWTDetector implements PIIDetector {
  public readonly type = 'jwt_token' as const;

  private readonly jwtPattern = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*\b/g;

  detect(text: string, options: DetectorOptions = {}): PIIDetection[] {
    const { minConfidence = 0.9 } = options;
    const detections: PIIDetection[] = [];

    let match;
    this.jwtPattern.lastIndex = 0;

    while ((match = this.jwtPattern.exec(text)) !== null) {
      const tokenCandidate = match[0];
      const confidence = this.validateJWT(tokenCandidate);

      if (confidence >= minConfidence) {
        detections.push({
          type: this.type,
          start: match.index,
          end: match.index + tokenCandidate.length,
          confidence
        });
      }
    }

    return detections;
  }

  getMask(detection: PIIDetection): string {
    return '[JWT_TOKEN_REDACTED]';
  }

  private validateJWT(token: string): number {
    const parts = token.split('.');
    if (parts.length !== 3) return 0;

    let confidence = 0.8;

    // Validate that parts are base64url encoded
    for (const part of parts) {
      if (!/^[A-Za-z0-9_-]+$/.test(part)) {
        confidence -= 0.2;
      }
    }

    // Check if header starts with eyJ (base64 encoded "{")
    if (token.startsWith('eyJ')) {
      confidence += 0.2;
    }

    return Math.max(0, Math.min(confidence, 1.0));
  }
}

/**
 * Factory functions
 */
export function createAPIKeyDetector(): APIKeyDetector {
  return new APIKeyDetector();
}

export function createAWSKeyDetector(): AWSKeyDetector {
  return new AWSKeyDetector();
}

export function createJWTDetector(): JWTDetector {
  return new JWTDetector();
}