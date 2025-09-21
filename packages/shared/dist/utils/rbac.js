/**
 * Checks if a user has access to a document based on ACL and tenantId.
 * @param userContext The user's context, including ID, group IDs, and tenant ID.
 * @param docMetadata The document's metadata, including ACL and tenant ID.
 * @returns True if the user has access, false otherwise.
 */
export function hasDocumentAccess(userContext, docMetadata) {
    // Tenant Isolation: User can only access documents within their tenant
    if (userContext.tenantId !== docMetadata.tenantId) {
        return false;
    }
    // RBAC Check: User must match at least one entry in the document's ACL
    // The ACL can contain user IDs or group IDs.
    const userHasAccess = docMetadata.acl.some((aclEntry) => {
        // Check if aclEntry is the user's ID
        if (aclEntry === userContext.id) {
            return true;
        }
        // Check if aclEntry is one of the user's group IDs
        if (userContext.groupIds.includes(aclEntry)) {
            return true;
        }
        return false;
    });
    return userHasAccess;
}
export function filterDocumentsByAccess(userContext, documents) {
    return documents.filter(doc => hasDocumentAccess(userContext, doc.metadata));
}
