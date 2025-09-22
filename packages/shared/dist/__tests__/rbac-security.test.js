import { hasDocumentAccess, getEffectiveGroupIds, getUserPrivilegeLevel, buildQdrantRBACFilter, validateUserAuthorization, filterDocumentsByAccess, calculateLanguageRelevance } from '../index.js';
describe('Enhanced RBAC Security Tests', () => {
    describe('Unauthorized Access Prevention', () => {
        test('should return false for different tenant access', () => {
            const userContext = {
                id: 'user1',
                groupIds: ['group1'],
                tenantId: 'tenant1'
            };
            const docMetadata = {
                tenantId: 'tenant2', // Different tenant
                docId: 'doc1',
                acl: ['user1', 'group1']
            };
            expect(hasDocumentAccess(userContext, docMetadata)).toBe(false);
        });
        test('should return false for unauthorized user with no ACL match', () => {
            const userContext = {
                id: 'unauthorized_user',
                groupIds: ['unauthorized_group'],
                tenantId: 'tenant1'
            };
            const docMetadata = {
                tenantId: 'tenant1',
                docId: 'doc1',
                acl: ['authorized_user', 'authorized_group']
            };
            expect(hasDocumentAccess(userContext, docMetadata)).toBe(false);
        });
        test('should return empty array for unauthorized user filtering', () => {
            const userContext = {
                id: 'unauthorized_user',
                groupIds: ['unauthorized_group'],
                tenantId: 'tenant1'
            };
            const documents = [
                {
                    id: 'doc1',
                    content: 'test content',
                    metadata: {
                        tenantId: 'tenant1',
                        docId: 'doc1',
                        acl: ['authorized_user', 'authorized_group']
                    },
                    score: 1.0
                }
            ];
            const filtered = filterDocumentsByAccess(userContext, documents);
            expect(filtered).toHaveLength(0);
        });
        test('should fail validation for invalid user context', () => {
            const invalidContext1 = {
                id: '',
                groupIds: [],
                tenantId: ''
            };
            const invalidContext2 = {
                id: '',
                groupIds: [],
                tenantId: 'tenant1'
            };
            expect(validateUserAuthorization(invalidContext1)).toBe(false);
            expect(validateUserAuthorization(invalidContext2)).toBe(false);
        });
    });
    describe('Group Hierarchy Support', () => {
        test('should include inherited groups in effective group IDs', () => {
            const userContext = {
                id: 'user1',
                groupIds: ['admin'],
                tenantId: 'tenant1',
                groupHierarchy: {
                    admin: { level: 3, inherits: ['editor', 'viewer'] },
                    editor: { level: 2, inherits: ['viewer'] },
                    viewer: { level: 1 }
                }
            };
            const effectiveGroups = getEffectiveGroupIds(userContext);
            expect(effectiveGroups).toContain('admin');
            expect(effectiveGroups).toContain('editor');
            expect(effectiveGroups).toContain('viewer');
            expect(effectiveGroups).toHaveLength(3);
        });
        test('should grant access through inherited groups', () => {
            const userContext = {
                id: 'user1',
                groupIds: ['admin'],
                tenantId: 'tenant1',
                groupHierarchy: {
                    admin: { level: 3, inherits: ['editor', 'viewer'] },
                    editor: { level: 2, inherits: ['viewer'] },
                    viewer: { level: 1 }
                }
            };
            const docMetadata = {
                tenantId: 'tenant1',
                docId: 'doc1',
                acl: ['viewer'] // Admin should have access through inheritance
            };
            expect(hasDocumentAccess(userContext, docMetadata)).toBe(true);
        });
        test('should calculate correct privilege level', () => {
            const userContext = {
                id: 'user1',
                groupIds: ['admin', 'editor'],
                tenantId: 'tenant1',
                groupHierarchy: {
                    admin: { level: 3 },
                    editor: { level: 2 },
                    viewer: { level: 1 }
                }
            };
            expect(getUserPrivilegeLevel(userContext)).toBe(3);
        });
    });
    describe('Language Preference Support', () => {
        test('should boost matching language documents', () => {
            const userLanguage = 'en';
            const docLanguage = 'en';
            const relevanceScore = calculateLanguageRelevance(userLanguage, docLanguage);
            expect(relevanceScore).toBe(2.0);
        });
        test('should reduce score for non-matching language documents', () => {
            const userLanguage = 'en';
            const docLanguage = 'es';
            const relevanceScore = calculateLanguageRelevance(userLanguage, docLanguage);
            expect(relevanceScore).toBe(0.5);
        });
        test('should return neutral score when language info is missing', () => {
            expect(calculateLanguageRelevance(undefined, 'en')).toBe(1.0);
            expect(calculateLanguageRelevance('en', undefined)).toBe(1.0);
            expect(calculateLanguageRelevance(undefined, undefined)).toBe(1.0);
        });
        test('should apply language relevance in document filtering', () => {
            const userContext = {
                id: 'user1',
                groupIds: ['group1'],
                tenantId: 'tenant1',
                language: 'en'
            };
            const documents = [
                {
                    id: 'doc1',
                    content: 'English content',
                    metadata: {
                        tenantId: 'tenant1',
                        docId: 'doc1',
                        acl: ['user1'],
                        lang: 'en'
                    },
                    score: 1.0
                },
                {
                    id: 'doc2',
                    content: 'Spanish content',
                    metadata: {
                        tenantId: 'tenant1',
                        docId: 'doc2',
                        acl: ['user1'],
                        lang: 'es'
                    },
                    score: 1.0
                }
            ];
            const filtered = filterDocumentsByAccess(userContext, documents);
            expect(filtered).toHaveLength(2);
            expect(filtered[0].score).toBe(2.0); // English doc boosted
            expect(filtered[1].score).toBe(0.5); // Spanish doc reduced
        });
    });
    describe('Qdrant Filter Building', () => {
        test('should build basic RBAC filter correctly', () => {
            const userContext = {
                id: 'user1',
                groupIds: ['group1', 'group2'],
                tenantId: 'tenant1'
            };
            const filter = buildQdrantRBACFilter(userContext);
            expect(filter.must).toHaveLength(2);
            expect(filter.must[0]).toEqual({
                key: 'tenant',
                match: { value: 'tenant1' }
            });
            expect(filter.must[1]).toEqual({
                key: 'acl',
                match: { any: ['user1', 'group1', 'group2'] }
            });
        });
        test('should build filter with language preference', () => {
            const userContext = {
                id: 'user1',
                groupIds: ['group1'],
                tenantId: 'tenant1',
                language: 'en'
            };
            const filter = buildQdrantRBACFilter(userContext);
            expect(filter.must).toHaveLength(2);
            expect(filter.should).toHaveLength(1);
            expect(filter.should[0]).toEqual({
                key: 'lang',
                match: { value: 'en' }
            });
        });
        test('should build filter with inherited groups', () => {
            const userContext = {
                id: 'user1',
                groupIds: ['admin'],
                tenantId: 'tenant1',
                groupHierarchy: {
                    admin: { level: 3, inherits: ['editor', 'viewer'] },
                    editor: { level: 2, inherits: ['viewer'] },
                    viewer: { level: 1 }
                }
            };
            const filter = buildQdrantRBACFilter(userContext);
            expect(filter.must[1].match.any).toContain('user1');
            expect(filter.must[1].match.any).toContain('admin');
            expect(filter.must[1].match.any).toContain('editor');
            expect(filter.must[1].match.any).toContain('viewer');
        });
    });
    describe('Authorization Validation', () => {
        test('should validate proper user context', () => {
            const validContext = {
                id: 'user1',
                groupIds: ['group1'],
                tenantId: 'tenant1'
            };
            expect(validateUserAuthorization(validContext)).toBe(true);
        });
        test('should reject missing tenant ID', () => {
            const invalidContext = {
                id: 'user1',
                groupIds: ['group1'],
                tenantId: ''
            };
            expect(validateUserAuthorization(invalidContext)).toBe(false);
        });
        test('should reject missing user ID and groups', () => {
            const invalidContext = {
                id: '',
                groupIds: [],
                tenantId: 'tenant1'
            };
            expect(validateUserAuthorization(invalidContext)).toBe(false);
        });
        test('should accept user ID without groups', () => {
            const validContext = {
                id: 'user1',
                groupIds: [],
                tenantId: 'tenant1'
            };
            expect(validateUserAuthorization(validContext)).toBe(true);
        });
        test('should accept groups without user ID', () => {
            const validContext = {
                id: '',
                groupIds: ['group1'],
                tenantId: 'tenant1'
            };
            expect(validateUserAuthorization(validContext)).toBe(true);
        });
    });
    describe('Zero Results for Unauthorized Users', () => {
        test('should return zero results for completely unauthorized user', () => {
            const unauthorizedContext = {
                id: 'hacker',
                groupIds: ['malicious_group'],
                tenantId: 'wrong_tenant'
            };
            const authorizedDocuments = [
                {
                    id: 'doc1',
                    content: 'sensitive content',
                    metadata: {
                        tenantId: 'correct_tenant',
                        docId: 'doc1',
                        acl: ['authorized_user', 'authorized_group']
                    },
                    score: 1.0
                }
            ];
            const filtered = filterDocumentsByAccess(unauthorizedContext, authorizedDocuments);
            expect(filtered).toHaveLength(0);
        });
        test('should return zero results for wrong tenant even with correct ACL', () => {
            const wrongTenantContext = {
                id: 'authorized_user',
                groupIds: ['authorized_group'],
                tenantId: 'wrong_tenant'
            };
            const documents = [
                {
                    id: 'doc1',
                    content: 'content',
                    metadata: {
                        tenantId: 'correct_tenant',
                        docId: 'doc1',
                        acl: ['authorized_user', 'authorized_group']
                    },
                    score: 1.0
                }
            ];
            const filtered = filterDocumentsByAccess(wrongTenantContext, documents);
            expect(filtered).toHaveLength(0);
        });
        test('should return zero results for correct tenant but wrong ACL', () => {
            const wrongAclContext = {
                id: 'unauthorized_user',
                groupIds: ['unauthorized_group'],
                tenantId: 'correct_tenant'
            };
            const documents = [
                {
                    id: 'doc1',
                    content: 'content',
                    metadata: {
                        tenantId: 'correct_tenant',
                        docId: 'doc1',
                        acl: ['authorized_user', 'authorized_group']
                    },
                    score: 1.0
                }
            ];
            const filtered = filterDocumentsByAccess(wrongAclContext, documents);
            expect(filtered).toHaveLength(0);
        });
    });
    describe('Complex Scenarios', () => {
        test('should handle mixed authorization scenarios correctly', () => {
            const userContext = {
                id: 'user1',
                groupIds: ['editor'],
                tenantId: 'tenant1',
                language: 'en',
                groupHierarchy: {
                    admin: { level: 3, inherits: ['editor', 'viewer'] },
                    editor: { level: 2, inherits: ['viewer'] },
                    viewer: { level: 1 }
                }
            };
            const documents = [
                {
                    id: 'doc1',
                    content: 'authorized english content',
                    metadata: {
                        tenantId: 'tenant1',
                        docId: 'doc1',
                        acl: ['user1'], // Direct user access
                        lang: 'en'
                    },
                    score: 1.0
                },
                {
                    id: 'doc2',
                    content: 'authorized through group',
                    metadata: {
                        tenantId: 'tenant1',
                        docId: 'doc2',
                        acl: ['editor'], // Group access
                        lang: 'es'
                    },
                    score: 1.0
                },
                {
                    id: 'doc3',
                    content: 'authorized through inheritance',
                    metadata: {
                        tenantId: 'tenant1',
                        docId: 'doc3',
                        acl: ['viewer'], // Inherited group access
                        lang: 'en'
                    },
                    score: 1.0
                },
                {
                    id: 'doc4',
                    content: 'unauthorized content',
                    metadata: {
                        tenantId: 'tenant1',
                        docId: 'doc4',
                        acl: ['admin'], // No access to admin-only content
                        lang: 'en'
                    },
                    score: 1.0
                },
                {
                    id: 'doc5',
                    content: 'wrong tenant',
                    metadata: {
                        tenantId: 'tenant2', // Wrong tenant
                        docId: 'doc5',
                        acl: ['user1'],
                        lang: 'en'
                    },
                    score: 1.0
                }
            ];
            const filtered = filterDocumentsByAccess(userContext, documents);
            // Should have access to doc1, doc2, doc3 but not doc4 or doc5
            expect(filtered).toHaveLength(3);
            // Check language relevance scoring
            const englishDocs = filtered.filter(doc => doc.metadata.lang === 'en');
            const spanishDocs = filtered.filter(doc => doc.metadata.lang === 'es');
            englishDocs.forEach(doc => {
                expect(doc.score).toBe(2.0); // Boosted for matching language
            });
            spanishDocs.forEach(doc => {
                expect(doc.score).toBe(0.5); // Reduced for non-matching language
            });
        });
    });
    describe('Performance and Edge Cases', () => {
        test('should handle empty ACL arrays', () => {
            const userContext = {
                id: 'user1',
                groupIds: ['group1'],
                tenantId: 'tenant1'
            };
            const docMetadata = {
                tenantId: 'tenant1',
                docId: 'doc1',
                acl: [] // Empty ACL
            };
            expect(hasDocumentAccess(userContext, docMetadata)).toBe(false);
        });
        test('should handle large group hierarchies efficiently', () => {
            const largeHierarchy = {};
            for (let i = 0; i < 100; i++) {
                largeHierarchy[`group${i}`] = {
                    level: i,
                    inherits: i > 0 ? [`group${i - 1}`] : undefined
                };
            }
            const userContext = {
                id: 'user1',
                groupIds: ['group99'],
                tenantId: 'tenant1',
                groupHierarchy: largeHierarchy
            };
            const startTime = performance.now();
            const effectiveGroups = getEffectiveGroupIds(userContext);
            const endTime = performance.now();
            expect(effectiveGroups).toHaveLength(100); // Should inherit all lower groups
            expect(endTime - startTime).toBeLessThan(100); // Should be fast
        });
        test('should build Qdrant filter with all security constraints', () => {
            const userContext = {
                id: 'user1',
                groupIds: ['admin'],
                tenantId: 'tenant1',
                language: 'en',
                groupHierarchy: {
                    admin: { level: 3, inherits: ['editor', 'viewer'] },
                    editor: { level: 2, inherits: ['viewer'] },
                    viewer: { level: 1 }
                }
            };
            const filter = buildQdrantRBACFilter(userContext);
            // Should have tenant filter
            expect(filter.must[0]).toEqual({
                key: 'tenant',
                match: { value: 'tenant1' }
            });
            // Should have ACL filter with all effective groups
            expect(filter.must[1].match.any).toContain('user1');
            expect(filter.must[1].match.any).toContain('admin');
            expect(filter.must[1].match.any).toContain('editor');
            expect(filter.must[1].match.any).toContain('viewer');
            // Should have language preference as should condition
            expect(filter.should).toHaveLength(1);
            expect(filter.should[0]).toEqual({
                key: 'lang',
                match: { value: 'en' }
            });
        });
    });
});
