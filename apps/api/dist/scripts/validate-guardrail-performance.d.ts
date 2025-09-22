interface PerformanceTestResult {
    avgDuration: number;
    maxDuration: number;
    minDuration: number;
    totalEvaluations: number;
    successRate: number;
    idkRate: number;
}
declare class GuardrailPerformanceValidator {
    validatePerformance(): Promise<PerformanceTestResult>;
    validateOODDetection(): Promise<void>;
    validateTenantConfigurations(): Promise<void>;
    printResults(result: PerformanceTestResult): void;
}
export { GuardrailPerformanceValidator };
