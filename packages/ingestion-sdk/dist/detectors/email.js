/**
 * Email detector using comprehensive regex patterns
 */
export class EmailDetector {
    type = 'email';
    /**
     * Comprehensive email regex that covers most valid email formats
     * Based on RFC 5322 specification with practical limitations
     */
    emailRegex = /\b[A-Za-z0-9][A-Za-z0-9._%+-]*@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
    /**
     * Detect email addresses in the given text
     */
    detect(text, options = {}) {
        const { minConfidence = 0.9, strictValidation = true } = options;
        const detections = [];
        let match;
        this.emailRegex.lastIndex = 0; // Reset regex state
        while ((match = this.emailRegex.exec(text)) !== null) {
            const emailCandidate = match[0];
            let confidence = 0.9; // Base confidence for regex match
            if (strictValidation) {
                confidence = this.validateEmail(emailCandidate);
            }
            if (confidence >= minConfidence) {
                detections.push({
                    type: this.type,
                    start: match.index,
                    end: match.index + emailCandidate.length,
                    confidence
                });
            }
        }
        return detections;
    }
    /**
     * Generate appropriate mask for email addresses
     */
    getMask(detection) {
        return '[EMAIL_REDACTED]';
    }
    /**
     * Validate email format and return confidence score
     */
    validateEmail(email) {
        let confidence = 0.7; // Base confidence
        // Basic structure validation
        const parts = email.split('@');
        if (parts.length !== 2)
            return 0;
        const [localPart, domainPart] = parts;
        // Local part validation
        if (localPart.length === 0 || localPart.length > 64)
            return 0;
        if (localPart.startsWith('.') || localPart.endsWith('.'))
            return 0;
        if (localPart.includes('..'))
            return 0;
        // Domain part validation
        if (domainPart.length === 0 || domainPart.length > 253)
            return 0;
        if (domainPart.startsWith('.') || domainPart.endsWith('.'))
            return 0;
        if (domainPart.includes('..'))
            return 0;
        // Check for valid TLD
        const domainLabels = domainPart.split('.');
        if (domainLabels.length < 2)
            return 0; // Must have at least domain.tld
        const tld = domainLabels[domainLabels.length - 1];
        if (tld.length < 2)
            return 0;
        // Check each domain label
        for (const label of domainLabels) {
            if (label.length === 0)
                return 0;
            if (label.startsWith('-') || label.endsWith('-'))
                return 0;
        }
        // Increase confidence for common patterns
        if (/^[a-zA-Z0-9._-]+$/.test(localPart))
            confidence += 0.1;
        if (domainLabels.length >= 2)
            confidence += 0.1;
        if (/^[a-zA-Z]+$/.test(tld))
            confidence += 0.1;
        return Math.min(confidence, 1.0);
    }
}
/**
 * Factory function to create email detector
 */
export function createEmailDetector() {
    return new EmailDetector();
}
