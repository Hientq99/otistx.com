/**
 * CIRCUIT BREAKER PATTERN
 * ========================
 * 
 * Prevent cascading failures when external services are down
 * Fail fast and provide graceful degradation
 */

export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Failures detected, reject requests
  HALF_OPEN = 'HALF_OPEN' // Testing if service recovered
}

interface CircuitBreakerOptions {
  failureThreshold: number;  // Number of failures before opening
  successThreshold: number;  // Number of successes to close from half-open
  timeout: number;           // Time in ms to wait before trying again (half-open)
  resetTimeout: number;      // Time in ms to reset failure count
}

interface CircuitStats {
  failures: number;
  successes: number;
  totalRequests: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number | null = null;
  private nextAttemptTime: number = 0;
  private stats: CircuitStats = {
    failures: 0,
    successes: 0,
    totalRequests: 0,
    lastFailureTime: null,
    lastSuccessTime: null
  };

  constructor(
    private name: string,
    private options: CircuitBreakerOptions = {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 60000, // 1 minute
      resetTimeout: 300000 // 5 minutes
    }
  ) {}

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.stats.totalRequests++;

    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        const error: any = new Error(`Circuit breaker is OPEN for ${this.name}`);
        error.code = 'CIRCUIT_OPEN';
        throw error;
      }
      // Transition to half-open to test
      this.state = CircuitState.HALF_OPEN;
      console.log(`[CIRCUIT BREAKER] ${this.name} transitioning to HALF_OPEN`);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.stats.successes++;
    this.stats.lastSuccessTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.options.successThreshold) {
        console.log(`[CIRCUIT BREAKER] ${this.name} closing circuit after ${this.successCount} successes`);
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        this.successCount = 0;
        this.lastFailureTime = null; // Clear failure timestamp
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success in closed state
      this.failureCount = 0;
      
      // Age out old failures if resetTimeout has passed
      if (this.lastFailureTime && Date.now() - this.lastFailureTime > this.options.resetTimeout) {
        this.lastFailureTime = null;
      }
    }
  }

  private onFailure(): void {
    this.stats.failures++;
    this.stats.lastFailureTime = Date.now();
    const now = Date.now();
    
    // Age out old failures if resetTimeout has passed
    if (this.lastFailureTime && now - this.lastFailureTime > this.options.resetTimeout) {
      console.log(`[CIRCUIT BREAKER] ${this.name} aging out old failures (${Math.round((now - this.lastFailureTime) / 1000)}s since last failure)`);
      this.failureCount = 0;
    }
    
    this.lastFailureTime = now;
    this.failureCount++;
    this.successCount = 0; // Reset success count on failure

    if (this.state === CircuitState.HALF_OPEN) {
      console.log(`[CIRCUIT BREAKER] ${this.name} opening circuit after failure in HALF_OPEN state`);
      this.openCircuit();
    } else if (this.failureCount >= this.options.failureThreshold) {
      console.log(`[CIRCUIT BREAKER] ${this.name} opening circuit after ${this.failureCount} failures`);
      this.openCircuit();
    }
  }

  private openCircuit(): void {
    this.state = CircuitState.OPEN;
    this.nextAttemptTime = Date.now() + this.options.timeout;
    console.log(`[CIRCUIT BREAKER] ${this.name} will retry at ${new Date(this.nextAttemptTime).toLocaleString()}`);
  }

  /**
   * Get current circuit breaker state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get circuit breaker statistics
   */
  getStats() {
    const errorRate = this.stats.totalRequests > 0
      ? (this.stats.failures / this.stats.totalRequests) * 100
      : 0;

    return {
      name: this.name,
      state: this.state,
      ...this.stats,
      failureCount: this.failureCount,
      successCount: this.successCount,
      errorRate: errorRate.toFixed(2) + '%',
      nextAttemptTime: this.state === CircuitState.OPEN ? new Date(this.nextAttemptTime).toISOString() : null
    };
  }

  /**
   * Manually reset circuit breaker
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttemptTime = 0;
    console.log(`[CIRCUIT BREAKER] ${this.name} manually reset to CLOSED`);
  }

  /**
   * Force open the circuit (for maintenance)
   */
  forceOpen(): void {
    this.state = CircuitState.OPEN;
    this.nextAttemptTime = Date.now() + this.options.timeout;
    console.log(`[CIRCUIT BREAKER] ${this.name} manually opened`);
  }
}

// Circuit breakers for external services
export const circuitBreakers = {
  viotp: new CircuitBreaker('viotp', {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 30000, // 30 seconds
    resetTimeout: 300000 // 5 minutes
  }),
  chaycodes3: new CircuitBreaker('chaycodes3', {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 30000,
    resetTimeout: 300000
  }),
  '365otp': new CircuitBreaker('365otp', {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 30000,
    resetTimeout: 300000
  }),
  funotp: new CircuitBreaker('funotp', {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 30000,
    resetTimeout: 300000
  }),
  ironsim: new CircuitBreaker('ironsim', {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 30000,
    resetTimeout: 300000
  }),
  bossotp: new CircuitBreaker('bossotp', {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 30000,
    resetTimeout: 300000
  }),
  shopee: new CircuitBreaker('shopee', {
    failureThreshold: 5,
    successThreshold: 3,
    timeout: 60000, // 1 minute
    resetTimeout: 300000
  })
};
