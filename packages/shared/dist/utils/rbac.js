// Performance optimization: Cache for effective group IDs
const effectiveGroupsCache = new Map();
// Performance optimization: Cache for user authorization validation
const authValidationCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL
/**
 * Creates a cache key for effective group IDs
 * @param userContext The user's context
 * @returns Cache key string
 */
function createEffectiveGroupsCacheKey(userContext) {
    return JSON.stringify({
        userId: userContext.id,
        groupIds: userContext.groupIds.sort(),
        hierarchy: userContext.groupHierarchy
    });
}
/**
 * Creates a cache key for user authorization validation
 * @param userContext The user's context
 * @returns Cache key string
 */
function createAuthValidationCacheKey(userContext) {
    return JSON.stringify({
        userId: userContext.id,
        groupIds: userContext.groupIds.sort(),
        tenantId: userContext.tenantId
    });
}
/**
 * Cleans up expired cache entries
 * @param cache The cache to clean
 */
function cleanupCache(cache) {
    const now = Date.now();
    for (const [key, value] of cache.entries()) {
        if (now - value.timestamp > value.ttl) {
            cache.delete(key);
        }
    }
}
/**
 * Gets all group IDs that a user has access to, including inherited groups from hierarchy
 * Performance optimized with caching
 * @param userContext The user's context
 * @returns Array of all accessible group IDs including inherited ones
 */
export function getEffectiveGroupIds(userContext) {
    // Check cache first
    const cacheKey = createEffectiveGroupsCacheKey(userContext);
    const cached = effectiveGroupsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
        return cached.groupIds;
    }
    const effectiveGroups = new Set(userContext.groupIds);
    if (userContext.groupHierarchy) {
        // Recursively add inherited groups based on hierarchy
        const addInheritedGroups = (groupId, visited = new Set()) => {
            // Prevent infinite loops
            if (visited.has(groupId))
                return;
            visited.add(groupId);
            const groupInfo = userContext.groupHierarchy[groupId];
            if (groupInfo?.inherits) {
                groupInfo.inherits.forEach(inheritedGroup => {
                    effectiveGroups.add(inheritedGroup);
                    // Recursively add inherited groups
                    addInheritedGroups(inheritedGroup, visited);
                });
            }
        };
        userContext.groupIds.forEach(groupId => {
            addInheritedGroups(groupId);
        });
    }
    const result = Array.from(effectiveGroups);
    // Cache the result
    effectiveGroupsCache.set(cacheKey, {
        groupIds: result,
        timestamp: Date.now(),
        ttl: CACHE_TTL
    });
    // Cleanup old cache entries periodically
    if (effectiveGroupsCache.size > 1000) {
        cleanupCache(effectiveGroupsCache);
    }
    return result;
}
/**
 * Gets the highest privilege level for a user based on their groups
 * @param userContext The user's context
 * @returns The highest privilege level (higher number = more privilege)
 */
export function getUserPrivilegeLevel(userContext) {
    if (!userContext.groupHierarchy) {
        return 1; // Default privilege level
    }
    let maxLevel = 0;
    userContext.groupIds.forEach(groupId => {
        const groupInfo = userContext.groupHierarchy[groupId];
        if (groupInfo && groupInfo.level > maxLevel) {
            maxLevel = groupInfo.level;
        }
    });
    return maxLevel || 1;
}
/**
 * Checks if a user has access to a document based on ACL and tenantId.
 * Enhanced with group hierarchy support.
 * @param userContext The user's context, including ID, group IDs, and tenant ID.
 * @param docMetadata The document's metadata, including ACL and tenant ID.
 * @returns True if the user has access, false otherwise.
 */
export function hasDocumentAccess(userContext, docMetadata) {
    // Tenant Isolation: User can only access documents within their tenant
    if (userContext.tenantId !== docMetadata.tenantId) {
        return false;
    }
    // Get effective group IDs including inherited ones
    const effectiveGroupIds = getEffectiveGroupIds(userContext);
    // RBAC Check: User must match at least one entry in the document's ACL
    // The ACL can contain user IDs or group IDs.
    const userHasAccess = docMetadata.acl.some((aclEntry) => {
        // Check if aclEntry is the user's ID
        if (aclEntry === userContext.id) {
            return true;
        }
        // Check if aclEntry is one of the user's effective group IDs (including inherited)
        if (effectiveGroupIds.includes(aclEntry)) {
            return true;
        }
        return false;
    });
    return userHasAccess;
}
/**
 * Calculates language relevance score between user preference and document language
 * @param userLanguage User's preferred language
 * @param docLanguage Document's language
 * @returns Relevance score (higher = more relevant)
 */
export function calculateLanguageRelevance(userLanguage, docLanguage) {
    if (!userLanguage || !docLanguage) {
        return 1.0; // Neutral score if either is missing
    }
    if (userLanguage === docLanguage) {
        return 2.0; // Exact match gets highest relevance
    }
    // Could add more sophisticated language matching logic here
    // (e.g., language families, dialects, etc.)
    return 0.5; // Different language gets lower relevance
}
/**
 * Builds comprehensive RBAC filters for Qdrant queries
 * @param userContext The user's context
 * @returns Qdrant filter object with must and should conditions
 */
export function buildQdrantRBACFilter(userContext) {
    const effectiveGroupIds = getEffectiveGroupIds(userContext);
    const allAclEntries = [userContext.id, ...effectiveGroupIds];
    const filter = {
        must: [
            {
                key: 'tenant',
                match: {
                    value: userContext.tenantId
                }
            },
            {
                key: 'acl',
                match: {
                    any: allAclEntries
                }
            }
        ]
    };
    // Add language preference as "should" condition (boosts relevance but doesn't exclude)
    if (userContext.language) {
        filter.should = [
            {
                key: 'lang',
                match: {
                    value: userContext.language
                }
            }
        ];
    }
    return filter;
}
/**
 * Validates that a user is authorized to access any documents
 * Performance optimized with caching
 * Returns true if user has valid tenant and at least one ACL entry
 * @param userContext The user's context
 * @returns True if user has basic authorization requirements
 */
export function validateUserAuthorization(userContext) {
    // Check cache first
    const cacheKey = createAuthValidationCacheKey(userContext);
    const cached = authValidationCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
        return cached.isValid;
    }
    // Must have tenant ID
    if (!userContext.tenantId) {
        const result = false;
        authValidationCache.set(cacheKey, {
            isValid: result,
            timestamp: Date.now(),
            ttl: CACHE_TTL
        });
        return result;
    }
    // Must have either user ID or at least one group
    if (!userContext.id && (!userContext.groupIds || userContext.groupIds.length === 0)) {
        const result = false;
        authValidationCache.set(cacheKey, {
            isValid: result,
            timestamp: Date.now(),
            ttl: CACHE_TTL
        });
        return result;
    }
    const result = true;
    authValidationCache.set(cacheKey, {
        isValid: result,
        timestamp: Date.now(),
        ttl: CACHE_TTL
    });
    // Cleanup old cache entries periodically
    if (authValidationCache.size > 1000) {
        cleanupCache(authValidationCache);
    }
    return result;
}
/**
 * Clears all performance caches (useful for testing or memory management)
 */
export function clearRBACCaches() {
    effectiveGroupsCache.clear();
    authValidationCache.clear();
}
/**
 * Gets cache statistics for monitoring
 */
export function getRBACCacheStats() {
    return {
        effectiveGroupsCacheSize: effectiveGroupsCache.size,
        authValidationCacheSize: authValidationCache.size
    };
}
/**
 * Filters documents by access and applies language relevance scoring
 * @param userContext The user's context
 * @param documents Array of documents with metadata
 * @returns Filtered and scored documents
 */
export function filterDocumentsByAccess(userContext, documents) {
    return documents
        .filter(doc => hasDocumentAccess(userContext, doc.metadata))
        .map(doc => {
        // Apply language relevance scoring
        if (userContext.language && doc.metadata.lang) {
            const languageScore = calculateLanguageRelevance(userContext.language, doc.metadata.lang);
            return {
                ...doc,
                score: doc.score ? doc.score * languageScore : languageScore
            };
        }
        return doc;
    });
}
/**
 * Gets user access control list including all effective groups
 * @param userContext The user's context
 * @returns Array of all ACL entries (user ID + effective group IDs)
 */
export function getUserACLEntries(userContext) {
    const effectiveGroupIds = getEffectiveGroupIds(userContext);
    return [userContext.id, ...effectiveGroupIds];
}
