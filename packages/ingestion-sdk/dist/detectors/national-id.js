/**
 * National ID detector for various countries
 * This is a generic implementation that can be extended for specific countries
 */
export class NationalIdDetector {
    type = 'national_id';
    /**
     * Generic patterns for national IDs from various countries
     */
    nationalIdPatterns = [
        // US SSN: XXX-XX-XXXX or XXXXXXXXX
        /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
        // UK National Insurance: XX XX XX XX X
        /\b[A-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-Z]\b/g,
        // Canadian SIN: XXX-XXX-XXX or XXXXXXXXX
        /\b\d{3}[-\s]?\d{3}[-\s]?\d{3}\b/g,
        // German ID: XXXXXXXXXX (10-11 digits)
        /\b\d{10,11}\b/g,
        // French INSEE: X XX XX XX XXX XXX XX
        /\b[12]\s?\d{2}\s?\d{2}\s?\d{2}\s?\d{3}\s?\d{3}\s?\d{2}\b/g,
        // Generic patterns for various formats
        /\b\d{2,3}[-\s]?\d{2,4}[-\s]?\d{2,4}[-\s]?\d{1,4}\b/g,
        /\b[A-Z]{1,3}\d{6,12}[A-Z]?\b/g
    ];
    /**
     * Detect national ID numbers in the given text
     */
    detect(text, options = {}) {
        const { minConfidence = 0.7, strictValidation = true } = options;
        const detections = [];
        const foundRanges = new Set(); // Avoid duplicates
        for (const pattern of this.nationalIdPatterns) {
            let match;
            pattern.lastIndex = 0; // Reset regex state
            while ((match = pattern.exec(text)) !== null) {
                const idCandidate = match[0];
                const rangeKey = `${match.index}-${match.index + idCandidate.length}`;
                // Skip if we've already found this range
                if (foundRanges.has(rangeKey))
                    continue;
                let confidence = 0.6; // Base confidence for regex match
                if (strictValidation) {
                    confidence = this.validateNationalId(idCandidate);
                }
                if (confidence >= minConfidence) {
                    detections.push({
                        type: this.type,
                        start: match.index,
                        end: match.index + idCandidate.length,
                        confidence
                    });
                    foundRanges.add(rangeKey);
                }
            }
        }
        return detections;
    }
    /**
     * Generate appropriate mask for national ID numbers
     */
    getMask(detection) {
        return '[NATIONAL_ID_REDACTED]';
    }
    /**
     * Validate national ID format and return confidence score
     */
    validateNationalId(id) {
        let confidence = 0.7; // Higher base confidence
        // Remove spaces and hyphens for analysis
        const cleanId = id.replace(/[-\s]/g, '');
        // Check for US SSN patterns
        if (this.validateSSN(id)) {
            confidence = 0.9;
        }
        // Check for UK National Insurance pattern
        else if (this.validateUKNI(id)) {
            confidence = 0.95;
        }
        // Check for Canadian SIN pattern
        else if (this.validateCanadianSIN(id)) {
            confidence = 0.9;
        }
        // Generic ID validation
        else if (cleanId.length >= 8 && cleanId.length <= 15 && /^\d+$/.test(cleanId)) {
            confidence = 0.75;
        }
        // Decrease confidence for suspicious patterns
        if (/^(\d)\1+$/.test(cleanId))
            confidence *= 0.5; // All same digits
        if (cleanId === '000000000' || cleanId === '111111111')
            confidence *= 0.3; // Obviously fake numbers
        return Math.max(0, Math.min(confidence, 1.0));
    }
    /**
     * Validate US Social Security Number format
     */
    validateSSN(ssn) {
        const ssnPattern = /^\d{3}[-\s]?\d{2}[-\s]?\d{4}$/;
        if (!ssnPattern.test(ssn))
            return false;
        const cleanSSN = ssn.replace(/[-\s]/g, '');
        // Invalid SSN patterns
        if (cleanSSN === '000000000')
            return false;
        if (cleanSSN.startsWith('000'))
            return false;
        if (cleanSSN.slice(3, 5) === '00')
            return false;
        if (cleanSSN.slice(5) === '0000')
            return false;
        if (cleanSSN.startsWith('666'))
            return false;
        if (cleanSSN.startsWith('9'))
            return false;
        return true;
    }
    /**
     * Validate UK National Insurance number format
     */
    validateUKNI(ni) {
        const niPattern = /^[A-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-Z]$/;
        if (!niPattern.test(ni))
            return false;
        const cleanNI = ni.replace(/\s/g, '');
        const firstTwoLetters = cleanNI.slice(0, 2);
        // Invalid prefixes
        const invalidPrefixes = ['BG', 'GB', 'NK', 'KN', 'TN', 'NT', 'ZZ'];
        if (invalidPrefixes.includes(firstTwoLetters))
            return false;
        // Check for invalid middle sections (should not be all zeros)
        const middlePart = cleanNI.slice(2, 8);
        if (middlePart === '000000')
            return false;
        return true;
    }
    /**
     * Validate Canadian Social Insurance Number format
     */
    validateCanadianSIN(sin) {
        const sinPattern = /^\d{3}[-\s]?\d{3}[-\s]?\d{3}$/;
        if (!sinPattern.test(sin))
            return false;
        const cleanSIN = sin.replace(/[-\s]/g, '');
        // Basic Luhn algorithm check for Canadian SIN
        let sum = 0;
        let isEven = false;
        for (let i = cleanSIN.length - 1; i >= 0; i--) {
            let digit = parseInt(cleanSIN[i], 10);
            if (isEven) {
                digit *= 2;
                if (digit > 9) {
                    digit = Math.floor(digit / 10) + (digit % 10);
                }
            }
            sum += digit;
            isEven = !isEven;
        }
        return sum % 10 === 0;
    }
}
/**
 * Factory function to create national ID detector
 */
export function createNationalIdDetector() {
    return new NationalIdDetector();
}
