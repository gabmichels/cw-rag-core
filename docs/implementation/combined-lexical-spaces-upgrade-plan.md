# Combined Lexical Retrieval and Spaces Upgrade Implementation Plan

## Overview
This plan outlines the implementation of two complementary initiatives to enhance our RAG system's retrieval capabilities:
1. **Spaces Implementation**: Config-backed, guarded auto-creation of spaces (namespaces) within tenants for document organization, routing, and Clean RAG invariants.
2. **Lexical Retrieval Upgrade**: Pack-based, multi-language, multi-tenant lexical search with nuance detection (CORE/SUPPORT extraction, phrases, proximity).

These are tackled together for synergy: Spaces provide high-level routing, while lexical packs enable precise, language-aware matching within spaces. The plan emphasizes scalability (e.g., per-tenant Qdrant isolation, efficient payloads) and best practices (e.g., type safety, idempotent jobs, config-driven logic).

**Timeline Estimate**: 4-6 weeks (Spaces: 2-3 weeks, Lexical: 2-3 weeks, Integration: 1 week).
**Key Principles**: Clean RAG (deterministic filters, no leaks), multi-tenant isolation, config as truth, minimal latency (<100ms for resolvers).

## Objectives
- Enable space-aware document ingestion and routing for better organization and relevance.
- Upgrade lexical retrieval to support multi-language nuances without code forks.
- Maintain stable APIs, RBAC, and Clean RAG invariants.
- Achieve measurable quality gains (+5-12% nDCG@10 for lexical, >0.9 space-precision@k).
- Ensure scalability: Handle 1000+ tenants, 10k+ docs/tenant, with Qdrant payloads for fast filtering.

## Phases and Tasks

### Phase 1: Spaces Implementation (Foundation Layer)
Focus on data structure and ingestion. Build registries, resolvers, and UI for space management.

- [x] **Design Space Registry Schema**: Define YAML structure per tenant (spaces with id, name, description, owner, status, authorityScore, autoCreated). Include seed catalog (business/personal spaces).
- [x] **Implement Space Registry Loader/Persister**: Create tenant-scoped loader (read/write YAML), with versioning and overlay repo support. Handle defaults on first run.
- [x] **Build Space Resolver**: Core logic for catalog matching (semantic similarity + keywords), guarded auto-creation (thresholds for cluster size/theme confidence), fallback to "General" with needs_review flag.
- [x] **Expose /spaces/resolve API**: Fastify endpoint for ingestion (n8n), accepts text sample + hints, returns spaceId + metadata. Cache hits <50ms.

#### Test Phase 1.1: Space Registry and Resolver Testing
- [x] **Unit Tests**: Test registry loader/persister with mock YAML; verify schema validation and versioning.
- [x] **Resolver Integration Tests**: Use the provided chunked "Skill Progression Framework" document—ingest sample chunks, test catalog matching (e.g., map to "Knowledge" or "Crafting" spaces), auto-create thresholds, and fallback to "General".
- [x] **API Tests**: Hit /spaces/resolve with text samples from the chunked doc (e.g., "Knowledge Domain abilities"); assert <50ms latency, correct spaceId, and needs_review flags. Test /documents API includes space field.
- [x] **Eval Check**: Query for "skill progression" post-ingestion; verify space assignment improves relevance (e.g., chunks grouped by domain).

- [x] **Integrate with Ingestion (n8n)**: Update workflows to call resolver before indexing, attach space/persona/needs_review to Qdrant payloads.
- [x] **Update Library UI**: Add editable Space column, batch change support with confirmation dialog. Persist via reassign API.
- [x] **Implement Background Reindex Job**: Idempotent job for space reassignment—update Qdrant payloads, refresh caches, audit changes. Non-blocking UI with toasts.

#### Test Phase 1.2: UI and Reindex Testing
- [x] **UI Unit Tests**: Test Library table with editable Space column; verify batch change confirmation and toast notifications.
- [x] **Reindex Integration Tests**: Simulate space reassignment on chunked doc chunks (e.g., reassign "Knowledge" chunks to "Education" space); verify Qdrant payload updates, cache refreshes, and audit logs.
- [x] **End-to-End UI Test**: Ingest chunked doc, edit spaces in Library UI, trigger reindex, query for "crafting abilities"—assert updated spaces reflect in results without data loss.
- [x] **Performance Eval**: Run reindex on 100 chunks; ensure P95 latency <5s, no blocking UI.

- [x] **Add Guardrails**: Enforce auto-create thresholds, similarity clamp (merge vs. create), soft caps/warnings, 24h cooldowns.
- [x] **Migration/Backfill**: One-time script to resolve spaces for existing docs, mark low-confidence as needs_review.
- [x] **CLI/Admin Actions**: Promote hidden spaces, archive unused ones.

### Phase 2: Lexical Retrieval Upgrade (Query Layer)
Build pack-based system for nuanced lexical search, integrating with Spaces.

- [ ] **Design Pack Interfaces and Registries**: Define LanguagePack/DomainPack/TenantPack schemas (JSON/YAML + tiny TS functions). Registries for per-tenant resolution.
- [ ] **Implement Language Router and Packs**: Detect language, load packs (e.g., EN/DE tokenization, stopwords, synonyms, decompounding). Add normalization helpers.

#### Test Phase 2.1: Pack Interfaces and Language Processing Testing
- [ ] **Unit Tests**: Test pack schemas, language detection (e.g., EN vs DE on chunked doc samples), tokenization/normalization (verify German umlaut handling).
- [ ] **Feature Extraction Tests**: Run extractor on chunked doc chunks (e.g., "Knowledge Domain" section); assert CORE extraction (e.g., "Recall Lore", "Identify Creature") vs SUPPORT, phrases like "Sherlock Deduction".
- [ ] **Integration Eval**: Ingest chunked doc with EN/DE mixed; query "skill progression framework"—check if lexical features improve hit ranking (e.g., top chunks for "crafting" include relevant abilities).
- [ ] **Performance Check**: Feature extraction on 100 chunks <100ms; verify no regressions in tokenization.

- [ ] **Build Feature Extractor**: Generic CORE/SUPPORT/phrases/numbers extraction, using packs for stopwords/collocations. Pre-compute PMI for phrases.
- [ ] **Create Query Builder**: Engine-agnostic DSL for fielded dis_max, phrases/proximity, coverage policies. Adapter for Qdrant (use payloads for lexical filters).

#### Test Phase 2.2: Query Building and Façade Testing
- [ ] **Unit Tests**: Test DSL generation for queries (e.g., dis_max with CORE boosts); verify Qdrant adapter uses payloads for filters.
- [ ] **Façade Integration Tests**: Call `lexicalSearch.search()` with chunked doc queries (e.g., "medicine domain abilities"); assert diagnostics (coreMatched, coverageRatio), routing via packs.
- [ ] **Eval with Chunked Doc**: Ingest chunked doc, query "grandmaster level unlocks"—verify lexical nuances (e.g., phrases like "Sherlock Deduction") rank top-3; compare nDCG@10 vs legacy.
- [ ] **A/B Toggle Test**: Switch to legacy builder; ensure no API breakage, measurable improvement with packs.

- [ ] **Implement Lexical Search Façade**: `lexicalSearch.search()` with routing via tenant/lang/domain packs, diagnostics, and A/B toggle for legacy.
- [ ] **Add Diagnostics and Logging**: Per-result diagnostics (coreMatched, coverageRatio), structured logs per stage. Debug mode for traces.
- [ ] **Integrate SystemPrompt Resolution**: Per-tenant prompt fallback (tenant → language → global), config-driven.
- [ ] **Update Retrieval Pipeline**: Tie into Spaces—route queries to 1-2 spaces, apply lexical filters via Qdrant payloads.
- [ ] **Tests and Evals**: Unit tests for feature extraction per language (e.g., EN/DE on chunked doc samples); integration for pack wiring (verify tenant/lang/domain resolution); elaborate eval on chunked "Skill Progression Framework" doc—query for "knowledge domain", "crafting abilities", measure nDCG@10 (+5-12% gain), space-precision@k (>0.9); mixed DE/EN toy set for multi-language.
- [ ] **Documentation**: UPGRADE.md for adding languages/tenants, migration guide.

### Phase 3: Integration, Testing, and Optimization
Combine layers, test end-to-end, and optimize for scale.

- [ ] **Integrate Spaces and Lexical**: Update resolvers to include lexical hints in space payloads. Ensure routing uses both (e.g., space filter + lexical scoring).

#### Test Phase 3.1: Integration and Payload Testing
- [ ] **Payload Unit Tests**: Verify Qdrant payloads store spaceId + lexical features (e.g., coreTokens from chunked doc); test indexing for filters.
- [ ] **Combined Routing Tests**: Ingest chunked doc with spaces (e.g., assign "Knowledge" to "Education" space); query "mythic abilities" with lexical packs—assert space filter + lexical scoring improves precision.
- [ ] **Eval on Chunked Doc**: Measure space-precision@k (>0.9) and lexical nDCG@10; compare to pre-integration baseline.
- [ ] **Load Test**: 100 tenants with chunked docs; verify <100ms queries, no payload bloat.

- [ ] **Qdrant Payload Utilization**: Store spaceId + lexical features (e.g., coreTokens, phrases) in payloads for efficient filtering/scoring. Index for fast queries.
- [ ] **End-to-End Testing**: Ingest docs with spaces/lexical, query with routing, verify RBAC/no leaks. Load test for 100 tenants.
- [ ] **Metrics and Observability**: Add telemetry (% auto-assigned, reindex latency, space count). Eval hooks for precision@k, IDK rate.
- [ ] **Performance Optimization**: Cache registries, optimize resolvers (<50ms), background jobs for bulk ops. Ensure no blocking UI.
- [ ] **Security and RBAC**: Validate filters (tenant/space/ACL/time), audit logs for changes.
- [ ] **Final Evals and Gates**: Run combined evals (nDCG + space-precision), ensure no regressions. Block deploys if thresholds fail.
- [ ] **Documentation and Training**: Update RUNBOOKs, add examples for adding spaces/languages.

## Scalability and Best Practices
- **Scalability**: Per-tenant Qdrant ensures isolation; payloads keep metadata lightweight (avoid full text). Horizontal scaling via sharding if needed. Background jobs prevent UI blocks.
- **Best Practices**: Strict TS with schemas at boundaries; idempotent operations; config-driven (no hardcodes); structured logging; versioned configs. Follow monorepo conventions (pnpm, shared packages).
- **Code Quality**: Files <300 LOC, orthogonal modules. Unit/integration tests with Jest. Schema validation for APIs.
- **Monitoring**: P95 latency metrics, error rates. Weekly needs_review summaries.

## Acceptance Criteria
- [ ] Spaces: Docs reliably resolved via API; auto-created spaces start hidden; reassignments trigger safe reindex.
- [ ] Lexical: +5-12% nDCG@10 on mixed-language eval; packs enable language/tenant additions without code.
- [ ] Combined: Queries route to spaces with lexical nuance; RBAC leaks = 0; stable APIs.
- [ ] Non-Functional: <100ms resolver latency; scalable to 1000 tenants; backwards compatible.

## Next Steps
Track progress with checkboxes. Start with Phase 1. Confirm completion of this plan before proceeding to implementation.