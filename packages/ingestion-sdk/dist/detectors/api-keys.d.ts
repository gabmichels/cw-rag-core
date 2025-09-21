import { PIIDetector, PIIDetection, DetectorOptions } from '../types.js';
/**
 * API Key detector for various key formats
 */
export declare class APIKeyDetector implements PIIDetector {
    readonly type: "api_key";
    /**
     * API key patterns for various services
     */
    private readonly apiKeyPatterns;
    /**
     * Detect API keys in the given text
     */
    detect(text: string, options?: DetectorOptions): PIIDetection[];
    /**
     * Generate appropriate mask for API keys
     */
    getMask(detection: PIIDetection): string;
    /**
     * Validate API key format and return confidence score
     */
    private validateAPIKey;
    /**
     * Calculate Shannon entropy of a string (measure of randomness)
     */
    private calculateEntropy;
}
/**
 * AWS Key detector specialized for AWS credentials
 */
export declare class AWSKeyDetector implements PIIDetector {
    readonly type: "aws_key";
    private readonly awsPatterns;
    detect(text: string, options?: DetectorOptions): PIIDetection[];
    getMask(detection: PIIDetection): string;
}
/**
 * JWT Token detector
 */
export declare class JWTDetector implements PIIDetector {
    readonly type: "jwt_token";
    private readonly jwtPattern;
    detect(text: string, options?: DetectorOptions): PIIDetection[];
    getMask(detection: PIIDetection): string;
    private validateJWT;
}
/**
 * Factory functions
 */
export declare function createAPIKeyDetector(): APIKeyDetector;
export declare function createAWSKeyDetector(): AWSKeyDetector;
export declare function createJWTDetector(): JWTDetector;
