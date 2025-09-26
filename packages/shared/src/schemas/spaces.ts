import { z } from 'zod';

/**
 * Schema for a single space in the registry.
 * Spaces are tenant-scoped namespaces for document organization and routing.
 */
export const SpaceSchema = z.object({
  id: z.string().min(1).max(50), // Unique within tenant, e.g., 'hr', 'legal'
  name: z.string().min(1).max(100), // Human-readable name, e.g., 'Human Resources'
  description: z.string().max(500).optional(), // Optional description
  owner: z.string().min(1), // User or system identifier
  status: z.enum(['active', 'hidden']), // Hidden for auto-created, pending review
  authorityScore: z.number().min(0).max(1), // Confidence score for auto-creation
  autoCreated: z.boolean(), // True if created by resolver, not manually
});

export type Space = z.infer<typeof SpaceSchema>;

/**
 * Schema for the tenant's space registry YAML file.
 * Contains all spaces for a tenant, plus metadata.
 */
export const SpaceRegistrySchema = z.object({
  tenantId: z.string().min(1), // For validation
  spaces: z.array(SpaceSchema).min(1), // At least one space (e.g., 'general')
  version: z.string().default('1.0'), // For versioning
  lastUpdated: z.string().datetime().optional(), // ISO timestamp
});

export type SpaceRegistry = z.infer<typeof SpaceRegistrySchema>;

/**
 * Seed catalog of predefined spaces for new tenants.
 * Business spaces: HR, Legal, Finance, Sales, Marketing, Product, Eng Backend, Eng Frontend, DevOps, Security, Support/FAQs, IT Helpdesk, Data/Analytics
 * Personal spaces: Health, Finance, Travel, Learning, Projects, Home, Media Notes
 */
export const SEED_SPACES: Omit<Space, 'owner'>[] = [
  // Business
  { id: 'hr', name: 'Human Resources', description: 'HR policies, employee management', status: 'active', authorityScore: 1.0, autoCreated: false },
  { id: 'legal', name: 'Legal', description: 'Contracts, compliance, legal documents', status: 'active', authorityScore: 1.0, autoCreated: false },
  { id: 'finance', name: 'Finance', description: 'Budgets, reports, financial data', status: 'active', authorityScore: 1.0, autoCreated: false },
  { id: 'sales', name: 'Sales', description: 'Sales materials, leads, CRM data', status: 'active', authorityScore: 1.0, autoCreated: false },
  { id: 'marketing', name: 'Marketing', description: 'Campaigns, branding, market research', status: 'active', authorityScore: 1.0, autoCreated: false },
  { id: 'product', name: 'Product', description: 'Product specs, roadmaps, requirements', status: 'active', authorityScore: 1.0, autoCreated: false },
  { id: 'eng-backend', name: 'Engineering Backend', description: 'Backend code, APIs, databases', status: 'active', authorityScore: 1.0, autoCreated: false },
  { id: 'eng-frontend', name: 'Engineering Frontend', description: 'Frontend code, UI/UX, client apps', status: 'active', authorityScore: 1.0, autoCreated: false },
  { id: 'devops', name: 'DevOps', description: 'Infrastructure, CI/CD, deployments', status: 'active', authorityScore: 1.0, autoCreated: false },
  { id: 'security', name: 'Security', description: 'Security policies, audits, compliance', status: 'active', authorityScore: 1.0, autoCreated: false },
  { id: 'support', name: 'Support/FAQs', description: 'Help docs, FAQs, customer support', status: 'active', authorityScore: 1.0, autoCreated: false },
  { id: 'it-helpdesk', name: 'IT Helpdesk', description: 'IT support, troubleshooting, hardware', status: 'active', authorityScore: 1.0, autoCreated: false },
  { id: 'data-analytics', name: 'Data/Analytics', description: 'Reports, analytics, BI dashboards', status: 'active', authorityScore: 1.0, autoCreated: false },
  // Personal
  { id: 'personal-health', name: 'Health', description: 'Medical records, fitness, wellness', status: 'active', authorityScore: 1.0, autoCreated: false },
  { id: 'personal-finance', name: 'Personal Finance', description: 'Banking, investments, expenses', status: 'active', authorityScore: 1.0, autoCreated: false },
  { id: 'personal-travel', name: 'Travel', description: 'Itineraries, bookings, travel notes', status: 'active', authorityScore: 1.0, autoCreated: false },
  { id: 'personal-learning', name: 'Learning', description: 'Courses, notes, educational materials', status: 'active', authorityScore: 1.0, autoCreated: false },
  { id: 'personal-projects', name: 'Projects', description: 'Personal projects, ideas, planning', status: 'active', authorityScore: 1.0, autoCreated: false },
  { id: 'personal-home', name: 'Home', description: 'Home management, maintenance, family', status: 'active', authorityScore: 1.0, autoCreated: false },
  { id: 'personal-media', name: 'Media Notes', description: 'Books, movies, reviews, entertainment', status: 'active', authorityScore: 1.0, autoCreated: false },
  // Fallback
  { id: 'general', name: 'General', description: 'Default space for uncategorized documents', status: 'active', authorityScore: 0.5, autoCreated: false },
];

export const FALLBACK_SPACE_ID = 'general';