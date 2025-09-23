# Qdrant Filter Bug Fix Plan

## Problem Summary
The `/ask` endpoint is failing with a "Bad Request" error from Qdrant due to malformed filter structures. The error occurs in the keyword search portion of the hybrid search pipeline.

## Root Cause Analysis

### 1. Filter Nesting Issue in ask.ts (lines 427-444)
The code incorrectly nests filter objects when combining RBAC filters with docId filters:

```javascript
// INCORRECT - Creates invalid nested structure
if (enhancedFilter) {
  enhancedFilter = {
    must: [
      enhancedFilter,  // <- This is already a filter object with 'must' array
      docIdFilter
    ]
  };
}
```

This creates an invalid structure like:
```json
{
  "must": [
    {
      "must": [...],  // Invalid nesting
      "should": [...]
    },
    { "key": "docId", "match": { "value": "..." } }
  ]
}
```

### 2. Keyword Search Filter Building
The `QdrantKeywordSearchService.buildFilterConditions()` method may also have issues with complex filter structures.

## Environment Setup Status
- ✅ Qdrant running at localhost:6333 (version 1.15.4)
- ✅ Environment variables configured in `.env`
- ✅ Dependencies installed via pnpm workspace
- ✅ Test payload available in `test-ask-endpoint.js`

## Solution Plan

### Fix 1: Correct Filter Combination Logic
**File**: `apps/api/src/routes/ask.ts` (lines 427-444)

**Problem**: When `docId` is provided, the code wraps the existing RBAC filter (which already has `must` and `should` arrays) in another `must` array.

**Solution**: Merge filter conditions at the same level instead of nesting.

```javascript
// CORRECT approach
if (docId) {
  const docIdFilter = {
    key: "docId",
    match: { value: docId }
  };

  if (enhancedFilter) {
    // Add docId filter to existing must conditions
    if (enhancedFilter.must) {
      enhancedFilter.must.push(docIdFilter);
    } else {
      enhancedFilter.must = [docIdFilter];
    }
  } else {
    // Create new filter with just docId
    enhancedFilter = { must: [docIdFilter] };
  }
}
```

### Fix 2: Validate Filter Structure
Add validation to ensure filters conform to Qdrant's expected structure before sending requests.

### Fix 3: Update Environment Configuration
Change Qdrant URL from `http://qdrant:6333` to `http://localhost:6333` for local development.

## Testing Strategy

1. **Unit Test**: Test filter building logic with various combinations
2. **Integration Test**: Run the existing test with query "What can you tell me about Core Combat Rules?"
3. **Edge Cases**: Test with and without docId, with complex RBAC filters

## Expected Qdrant Filter Structure

Valid Qdrant filter should look like:
```json
{
  "must": [
    { "key": "tenant", "match": { "value": "zenithfall" } },
    { "key": "acl", "match": { "any": ["anonymous", "public"] } },
    { "key": "docId", "match": { "value": "test-doc-id" } }
  ],
  "should": [
    { "key": "lang", "match": { "value": "en" } }
  ]
}
```

## Implementation Order

1. Fix filter combination logic in ask.ts
2. Update environment for local development
3. Test basic functionality
4. Add filter validation
5. Run comprehensive tests
6. Document the changes

## Files to Modify

1. `apps/api/src/routes/ask.ts` - Fix filter combination logic
2. `packages/retrieval/src/services/keyword-search.ts` - Validate filter building
3. `.env` - Update Qdrant URL for local testing (if needed)

## Test Command
```bash
node test-ask-endpoint.js
```

## Success Criteria
- `/ask` endpoint returns successful response
- Query "What can you tell me about Core Combat Rules?" works
- No Qdrant "Bad Request" errors
- All existing tests pass