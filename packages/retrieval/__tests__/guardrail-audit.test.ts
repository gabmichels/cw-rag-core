import { GuardrailAuditLogger, createGuardrailAuditLogger, Logger } from '../src/services/guardrail-audit.js';
import {
  GuardrailDecision,
  AnswerabilityScore,
  AnswerabilityThreshold,
  IdkResponse,
  GuardrailAuditTrail,
  ANSWERABILITY_THRESHOLDS
} from '../src/types/guardrail.js';
import { UserContext } from '@cw-rag-core/shared';

// Mock logger for testing
const mockLogger: Logger = {
  info: jest.fn(),
  error: jest.fn()
};

// Mock data
const mockUserContext: UserContext = {
  id: 'user123',
  groupIds: ['group1'],
  tenantId: 'tenant1',
  language: 'en'
};

const mockScoreStats = {
  mean: 0.7,
  max: 0.9,
  min: 0.5,
  stdDev: 0.2,
  count: 5,
  percentiles: {
    p25: 0.6,
    p50: 0.7,
    p75: 0.8,
    p90: 0.85
  }
};

const mockAlgorithmScores = {
  statistical: 0.8,
  threshold: 0.6,
  mlFeatures: 0.7,
  rerankerConfidence: 0.75
};

const mockAnswerabilityScore: AnswerabilityScore = {
  confidence: 0.75,
  scoreStats: mockScoreStats,
  algorithmScores: mockAlgorithmScores,
  isAnswerable: true,
  reasoning: 'High confidence based on statistical analysis',
  computationTime: 150
};

const mockThreshold: AnswerabilityThreshold = ANSWERABILITY_THRESHOLDS.moderate;

const mockIdkResponse: IdkResponse = {
  message: 'I cannot answer this question',
  reasonCode: 'LOW_CONFIDENCE',
  suggestions: ['Try rephrasing your question'],
  confidenceLevel: 0.3
};

const mockAuditTrail: GuardrailAuditTrail = {
  timestamp: '2023-01-01T12:00:00.000Z',
  query: 'What is machine learning?',
  tenantId: 'tenant1',
  userContext: JSON.stringify(mockUserContext),
  retrievalResultsCount: 5,
  scoreStatsSummary: 'mean: 0.7, max: 0.9, stdDev: 0.2',
  decisionRationale: 'STATISTICAL_ANALYSIS',
  performanceMetrics: {
    scoringDuration: 100,
    totalDuration: 150
  }
};

describe('GuardrailAuditLogger', () => {
  let auditLogger: GuardrailAuditLogger;

  beforeEach(() => {
    jest.clearAllMocks();
    auditLogger = new GuardrailAuditLogger(mockLogger);
  });

  describe('constructor', () => {
    it('should create audit logger instance', () => {
      expect(auditLogger).toBeInstanceOf(GuardrailAuditLogger);
    });
  });

  describe('logGuardrailDecision', () => {
    it('should log answerable decision correctly', () => {
      const decision: GuardrailDecision = {
        isAnswerable: true,
        score: mockAnswerabilityScore,
        threshold: mockThreshold,
        auditTrail: mockAuditTrail
      };

      auditLogger.logGuardrailDecision(
        '/api/search',
        'What is machine learning?',
        mockUserContext,
        decision,
        '192.168.1.1',
        'Mozilla/5.0'
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Guardrail decision: answerable for query in tenant tenant1',
        expect.objectContaining({
          audit: true,
          guardrail: true,
          ts: expect.any(String),
          route: '/api/search',
          tenant: 'tenant1',
          userId: 'user123',
          query: 'What is machine learning?',
          decision: 'answerable',
          confidence: 0.75,
          thresholdType: 'moderate',
          retrievalResultsCount: 5,
          scoreStats: {
            mean: 0.7,
            max: 0.9,
            min: 0.5,
            stdDev: 0.2,
            count: 5
          },
          performanceMetrics: mockAuditTrail.performanceMetrics,
          ip: '192.168.1.1',
          userAgent: 'Mozilla/5.0'
        })
      );
    });

    it('should log not answerable decision with IDK response', () => {
      const decision: GuardrailDecision = {
        isAnswerable: false,
        score: { ...mockAnswerabilityScore, isAnswerable: false },
        threshold: mockThreshold,
        idkResponse: mockIdkResponse,
        auditTrail: mockAuditTrail
      };

      auditLogger.logGuardrailDecision(
        '/api/search',
        'What is quantum physics?',
        mockUserContext,
        decision
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Guardrail decision: not_answerable for query in tenant tenant1',
        expect.objectContaining({
          decision: 'not_answerable',
          reasonCode: 'LOW_CONFIDENCE'
        })
      );
    });

    it('should handle bypassed decision', () => {
      const decision: GuardrailDecision = {
        isAnswerable: true,
        score: mockAnswerabilityScore,
        threshold: mockThreshold,
        auditTrail: {
          ...mockAuditTrail,
          decisionRationale: 'BYPASS_ENABLED'
        }
      };

      auditLogger.logGuardrailDecision(
        '/api/search',
        'Bypassed query',
        mockUserContext,
        decision
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('bypassed'),
        expect.objectContaining({
          decision: 'bypassed'
        })
      );
    });

    it('should handle disabled guardrail', () => {
      const decision: GuardrailDecision = {
        isAnswerable: true,
        score: mockAnswerabilityScore,
        threshold: mockThreshold,
        auditTrail: {
          ...mockAuditTrail,
          decisionRationale: 'GUARDRAIL_DISABLED'
        }
      };

      auditLogger.logGuardrailDecision(
        '/api/search',
        'Disabled guardrail query',
        mockUserContext,
        decision
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('disabled'),
        expect.objectContaining({
          decision: 'disabled'
        })
      );
    });

    it('should handle user context without tenantId', () => {
      const userContextWithoutTenant = { ...mockUserContext, tenantId: undefined } as any;

      const decision: GuardrailDecision = {
        isAnswerable: true,
        score: mockAnswerabilityScore,
        threshold: mockThreshold,
        auditTrail: mockAuditTrail
      };

      auditLogger.logGuardrailDecision(
        '/api/search',
        'Query without tenant',
        userContextWithoutTenant,
        decision
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('tenant default'),
        expect.objectContaining({
          tenant: 'default'
        })
      );
    });

    it('should include additional context when provided', () => {
      const decision: GuardrailDecision = {
        isAnswerable: true,
        score: mockAnswerabilityScore,
        threshold: mockThreshold,
        auditTrail: mockAuditTrail
      };

      const additionalContext = {
        sessionId: 'session123',
        experimentId: 'exp456'
      };

      auditLogger.logGuardrailDecision(
        '/api/search',
        'Query with context',
        mockUserContext,
        decision,
        undefined,
        undefined,
        additionalContext
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          context: additionalContext
        })
      );
    });
  });

  describe('logPerformanceMetrics', () => {
    it('should log performance metrics correctly', () => {
      const metrics = {
        avgScoringDuration: 120.5,
        avgTotalDuration: 180.3,
        decisionsPerMinute: 45.2,
        idkRate: 0.15,
        falsePositiveRate: 0.05,
        falseNegativeRate: 0.08
      };

      auditLogger.logPerformanceMetrics('tenant1', metrics);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Guardrail performance metrics for tenant tenant1',
        expect.objectContaining({
          audit: true,
          guardrail: true,
          performance: true,
          tenantId: 'tenant1',
          ...metrics
        })
      );
    });

    it('should handle metrics without optional fields', () => {
      const metrics = {
        avgScoringDuration: 100,
        avgTotalDuration: 150,
        decisionsPerMinute: 50,
        idkRate: 0.1
      };

      auditLogger.logPerformanceMetrics('tenant2', metrics);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('tenant2'),
        expect.objectContaining({
          avgScoringDuration: 100,
          avgTotalDuration: 150,
          decisionsPerMinute: 50,
          idkRate: 0.1
        })
      );
    });
  });

  describe('logThresholdUpdate', () => {
    it('should log threshold configuration changes', () => {
      const oldThreshold = ANSWERABILITY_THRESHOLDS.permissive;
      const newThreshold = ANSWERABILITY_THRESHOLDS.strict;

      auditLogger.logThresholdUpdate('tenant1', oldThreshold, newThreshold, 'admin@example.com');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Guardrail threshold updated for tenant tenant1',
        expect.objectContaining({
          audit: true,
          guardrail: true,
          config: true,
          tenantId: 'tenant1',
          oldThreshold,
          newThreshold,
          updatedBy: 'admin@example.com',
          ts: expect.any(String)
        })
      );
    });
  });

  describe('logError', () => {
    it('should log guardrail errors with all fields', () => {
      auditLogger.logError(
        '/api/search',
        'Error query',
        'tenant1',
        'Scoring algorithm failed',
        '192.168.1.1',
        'Mozilla/5.0'
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Guardrail error in tenant tenant1',
        expect.objectContaining({
          audit: true,
          guardrail: true,
          error: true,
          route: '/api/search',
          query: 'Error query',
          tenantId: 'tenant1',
          errorMessage: 'Scoring algorithm failed',
          ip: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          ts: expect.any(String)
        })
      );
    });

    it('should handle missing optional fields', () => {
      auditLogger.logError(
        '/api/search',
        'Error query',
        'tenant1',
        'Network timeout'
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          ip: undefined,
          userAgent: undefined
        })
      );
    });
  });

  describe('mapDecisionType', () => {
    // Test private method through public interface
    it('should map disabled rationale to disabled decision', () => {
      const decision: GuardrailDecision = {
        isAnswerable: true,
        score: mockAnswerabilityScore,
        threshold: mockThreshold,
        auditTrail: {
          ...mockAuditTrail,
          decisionRationale: 'GUARDRAIL_DISABLED'
        }
      };

      auditLogger.logGuardrailDecision('/api/test', 'test', mockUserContext, decision);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ decision: 'disabled' })
      );
    });

    it('should map bypass rationale to bypassed decision', () => {
      const decision: GuardrailDecision = {
        isAnswerable: true,
        score: mockAnswerabilityScore,
        threshold: mockThreshold,
        auditTrail: {
          ...mockAuditTrail,
          decisionRationale: 'BYPASS_ENABLED'
        }
      };

      auditLogger.logGuardrailDecision('/api/test', 'test', mockUserContext, decision);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ decision: 'bypassed' })
      );
    });

    it('should map answerable to answerable decision', () => {
      const decision: GuardrailDecision = {
        isAnswerable: true,
        score: mockAnswerabilityScore,
        threshold: mockThreshold,
        auditTrail: mockAuditTrail
      };

      auditLogger.logGuardrailDecision('/api/test', 'test', mockUserContext, decision);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ decision: 'answerable' })
      );
    });

    it('should map not answerable to not_answerable decision', () => {
      const decision: GuardrailDecision = {
        isAnswerable: false,
        score: { ...mockAnswerabilityScore, isAnswerable: false },
        threshold: mockThreshold,
        auditTrail: mockAuditTrail
      };

      auditLogger.logGuardrailDecision('/api/test', 'test', mockUserContext, decision);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ decision: 'not_answerable' })
      );
    });
  });
});

describe('createGuardrailAuditLogger', () => {
  it('should create audit logger instance', () => {
    const logger = createGuardrailAuditLogger(mockLogger);

    expect(logger).toBeInstanceOf(GuardrailAuditLogger);
  });

  it('should use provided logger', () => {
    const logger = createGuardrailAuditLogger(mockLogger);
    const decision: GuardrailDecision = {
      isAnswerable: true,
      score: mockAnswerabilityScore,
      threshold: mockThreshold,
      auditTrail: mockAuditTrail
    };

    logger.logGuardrailDecision('/api/test', 'test query', mockUserContext, decision);

    expect(mockLogger.info).toHaveBeenCalled();
  });
});