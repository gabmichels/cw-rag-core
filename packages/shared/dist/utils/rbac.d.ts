import { DocumentMetadata } from '../types/document.js';
import { UserContext } from '../types/user.js';
/**
 * Gets all group IDs that a user has access to, including inherited groups from hierarchy
 * Performance optimized with caching
 * @param userContext The user's context
 * @returns Array of all accessible group IDs including inherited ones
 */
export declare function getEffectiveGroupIds(userContext: UserContext): string[];
/**
 * Gets the highest privilege level for a user based on their groups
 * @param userContext The user's context
 * @returns The highest privilege level (higher number = more privilege)
 */
export declare function getUserPrivilegeLevel(userContext: UserContext): number;
/**
 * Checks if a user has access to a document based on ACL and tenantId.
 * Enhanced with group hierarchy support.
 * @param userContext The user's context, including ID, group IDs, and tenant ID.
 * @param docMetadata The document's metadata, including ACL and tenant ID.
 * @returns True if the user has access, false otherwise.
 */
export declare function hasDocumentAccess(userContext: UserContext, docMetadata: DocumentMetadata): boolean;
/**
 * Calculates language relevance score between user preference and document language
 * @param userLanguage User's preferred language
 * @param docLanguage Document's language
 * @returns Relevance score (higher = more relevant)
 */
export declare function calculateLanguageRelevance(userLanguage?: string, docLanguage?: string): number;
/**
 * Builds comprehensive RBAC filters for Qdrant queries
 * @param userContext The user's context
 * @returns Qdrant filter object with must and should conditions
 */
export declare function buildQdrantRBACFilter(userContext: UserContext): any;
/**
 * Validates that a user is authorized to access any documents
 * Performance optimized with caching
 * Returns true if user has valid tenant and at least one ACL entry
 * @param userContext The user's context
 * @returns True if user has basic authorization requirements
 */
export declare function validateUserAuthorization(userContext: UserContext): boolean;
/**
 * Clears all performance caches (useful for testing or memory management)
 */
export declare function clearRBACCaches(): void;
/**
 * Gets cache statistics for monitoring
 */
export declare function getRBACCacheStats(): {
    effectiveGroupsCacheSize: number;
    authValidationCacheSize: number;
};
/**
 * Filters documents by access and applies language relevance scoring
 * @param userContext The user's context
 * @param documents Array of documents with metadata
 * @returns Filtered and scored documents
 */
export declare function filterDocumentsByAccess<T extends {
    metadata: DocumentMetadata;
    score?: number;
}>(userContext: UserContext, documents: T[]): T[];
/**
 * Gets user access control list including all effective groups
 * @param userContext The user's context
 * @returns Array of all ACL entries (user ID + effective group IDs)
 */
export declare function getUserACLEntries(userContext: UserContext): string[];
