import { SpaceResolver } from '../services/space-resolver.js';

describe('SpaceResolver', () => {
  let resolver: SpaceResolver;

  beforeEach(() => {
    resolver = new SpaceResolver();
  });

  describe('resolveSpace', () => {
    it('should resolve to knowledge space for chunked doc sample', async () => {
      const input = {
        tenantId: 'test-tenant-knowledge',
        text: 'Knowledge Domain abilities: Recall Lore, Identify Creature, Sense Lies, information fact',
        source: 'n8n',
      };

      const result = await resolver.resolveSpace(input);

      expect(result.spaceId).toBe('knowledge');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.needsReview).toBe(false);
    });

    it('should resolve to crafting space for crafting content', async () => {
      const input = {
        tenantId: 'test-tenant-crafting',
        text: 'Crafting Domain: Forge Relic, Repair, Simple Trap, skill ability technique',
        source: 'n8n',
      };

      const result = await resolver.resolveSpace(input);

      expect(result.spaceId).toBe('crafting');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.needsReview).toBe(false);
    });

    it('should fallback to general for unmatched content', async () => {
      const input = {
        tenantId: 'test-tenant-unique',
        text: 'Some unique content about quantum physics and advanced mathematics',
        source: 'n8n',
      };

      const result = await resolver.resolveSpace(input);

      expect(result.spaceId).toBe('general');
      expect(result.needsReview).toBe(true);
      expect(result.autoCreated).toBe(false);
    });

    it('should fallback to general for low-confidence', async () => {
      const input = {
        tenantId: 'test-tenant-general',
        text: 'Random text without keywords',
        source: 'manual', // Not trusted
      };

      const result = await resolver.resolveSpace(input);

      expect(result.spaceId).toBe('general');
      expect(result.needsReview).toBe(true);
    });
  });
});