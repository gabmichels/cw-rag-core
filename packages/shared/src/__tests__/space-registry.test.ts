import { SpaceRegistryService } from '../services/space-registry.js';
import { SEED_SPACES, FALLBACK_SPACE_ID } from '../schemas/spaces.js';

describe('SpaceRegistryService', () => {
  let service: SpaceRegistryService;
  const testRegistryDir = './test-registries';

  beforeEach(() => {
    service = new SpaceRegistryService(testRegistryDir);
  });

  describe('loadRegistry', () => {
    it('should create default registry if not exists', async () => {
      const testTenantId = 'test-tenant-registry-load';
      const result = await service.loadRegistry(testTenantId);

      expect(result.tenantId).toBe(testTenantId);
      expect(result.spaces).toHaveLength(SEED_SPACES.length); // fallback already in seed
      expect(result.spaces.some(s => s.id === FALLBACK_SPACE_ID)).toBe(true);
    });
  });

  describe('addSpace', () => {
    it('should add new space', async () => {
      const testTenantId = 'test-tenant-registry-add';
      const space = {
        id: `unique-test-space-${Date.now()}`,
        name: 'Test Space',
        owner: 'test',
        status: 'active' as const,
        authorityScore: 0.5,
        autoCreated: false,
      };

      await service.addSpace(testTenantId, space);

      const registry = await service.loadRegistry(testTenantId);
      expect(registry.spaces.some(s => s.id === space.id)).toBe(true);
    });
  });
});