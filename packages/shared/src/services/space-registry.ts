import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { SpaceRegistrySchema, SpaceRegistry, SEED_SPACES, FALLBACK_SPACE_ID, Space } from '../schemas/spaces.js';

/**
 * Service for loading and persisting tenant-scoped space registries.
 * Registries are stored as YAML files in a configurable directory (e.g., overlay repo).
 */
export class SpaceRegistryService {
  private registryDir: string;

  constructor(registryDir: string = './tenants') {
    this.registryDir = registryDir;
  }

  /**
   * Load the space registry for a tenant.
   * If no registry exists, create one with seed spaces.
   */
  async loadRegistry(tenantId: string): Promise<SpaceRegistry> {
    const filePath = this.getRegistryPath(tenantId);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = yaml.load(content) as any;
      const registry = SpaceRegistrySchema.parse(data);

      if (registry.tenantId !== tenantId) {
        throw new Error(`Registry tenant mismatch: expected ${tenantId}, got ${registry.tenantId}`);
      }

      console.log(`Loaded space registry for tenant ${tenantId}`, { spaceCount: registry.spaces.length });
      return registry;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // Create default registry
        console.log(`No registry found for tenant ${tenantId}, creating default`);
        const defaultRegistry = await this.createDefaultRegistry(tenantId);
        await this.saveRegistry(defaultRegistry);
        return defaultRegistry;
      }
      throw error;
    }
  }

  /**
   * Save the space registry for a tenant.
   */
  async saveRegistry(registry: SpaceRegistry): Promise<void> {
    const filePath = this.getRegistryPath(registry.tenantId);
    const data = {
      ...registry,
      lastUpdated: new Date().toISOString(),
    };

    const yamlContent = yaml.dump(data);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, yamlContent, 'utf-8');

    console.log(`Saved space registry for tenant ${registry.tenantId}`, { spaceCount: registry.spaces.length });
  }

  /**
   * Add a new space to the registry.
   */
  async addSpace(tenantId: string, space: Omit<Space, 'id'> & { id: string }): Promise<void> {
    const registry = await this.loadRegistry(tenantId);

    if (registry.spaces.some(s => s.id === space.id)) {
      throw new Error(`Space with id ${space.id} already exists for tenant ${tenantId}`);
    }

    registry.spaces.push(space as Space);
    await this.saveRegistry(registry);
  }

  /**
   * Update an existing space in the registry.
   */
  async updateSpace(tenantId: string, spaceId: string, updates: Partial<Space>): Promise<void> {
    const registry = await this.loadRegistry(tenantId);
    const index = registry.spaces.findIndex(s => s.id === spaceId);

    if (index === -1) {
      throw new Error(`Space ${spaceId} not found for tenant ${tenantId}`);
    }

    registry.spaces[index] = { ...registry.spaces[index], ...updates };
    await this.saveRegistry(registry);
  }

  /**
   * Get a space by ID.
   */
  async getSpace(tenantId: string, spaceId: string): Promise<Space | null> {
    const registry = await this.loadRegistry(tenantId);
    return registry.spaces.find(s => s.id === spaceId) || null;
  }

  /**
   * List all spaces for a tenant.
   */
  async listSpaces(tenantId: string): Promise<Space[]> {
    const registry = await this.loadRegistry(tenantId);
    return registry.spaces;
  }

  private getRegistryPath(tenantId: string): string {
    return path.join(this.registryDir, tenantId, 'spaces.yaml');
  }

  private async createDefaultRegistry(tenantId: string): Promise<SpaceRegistry> {
    const spaces: Space[] = SEED_SPACES.map(space => ({
      ...space,
      owner: 'system', // Default owner for seed spaces
    }));

    // Ensure fallback exists
    if (!spaces.some(s => s.id === FALLBACK_SPACE_ID)) {
      spaces.push({
        id: FALLBACK_SPACE_ID,
        name: 'General',
        description: 'Default space for uncategorized documents',
        owner: 'system',
        status: 'active',
        authorityScore: 0.5,
        autoCreated: false,
      });
    }

    return {
      tenantId,
      spaces,
      version: '1.0',
    };
  }
}