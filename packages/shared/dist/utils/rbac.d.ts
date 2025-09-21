import { DocumentMetadata } from '../types/document.js';
import { UserContext } from '../types/user.js';
/**
 * Checks if a user has access to a document based on ACL and tenantId.
 * @param userContext The user's context, including ID, group IDs, and tenant ID.
 * @param docMetadata The document's metadata, including ACL and tenant ID.
 * @returns True if the user has access, false otherwise.
 */
export declare function hasDocumentAccess(userContext: UserContext, docMetadata: DocumentMetadata): boolean;
export declare function filterDocumentsByAccess<T extends {
    metadata: DocumentMetadata;
}>(userContext: UserContext, documents: T[]): T[];
//# sourceMappingURL=rbac.d.ts.map