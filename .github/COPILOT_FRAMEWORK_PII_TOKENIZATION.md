# COPILOT_INSTRUCTIONS.md — PII Tokenization & Data Protection Patterns

> **Purpose:** Production-grade PII handling patterns for EventStoreDB + Redis with POPIA compliance, crypto-erasure, and event-sourced right-to-erasure implementation.

---

## 1) Core Principles

- **Never store raw PII in EventStoreDB events** - use stable tokens/IDs only
- **Keep mutable PII in projections** with encryption at rest
- **Crypto-erasure for right-to-erasure** - delete encryption keys, not data
- **Deterministic tokenization** for consistent references across events
- **Field-level encryption** for sensitive data in Redis/projections

---

## 2) PII Classification & Handling

### High-Risk PII (Crypto-Erasure Required)

```typescript
interface HighRiskPII {
  // Financial identifiers
  bankAccountNumber: string;
  creditCardNumber: string;
  idNumber: string; // SA ID number
  passportNumber: string;

  // Biometric data
  fingerprint: string;
  faceRecognition: string;

  // Location data
  gpsCoordinates: string;
  homeAddress: string;
}
```

### Medium-Risk PII (Tokenization Required)

```typescript
interface MediumRiskPII {
  // Contact information
  emailAddress: string;
  phoneNumber: string;

  // Personal details
  fullName: string;
  dateOfBirth: string;

  // Business information
  companyRegistration: string;
  taxNumber: string;
}
```

---

## 3) Tokenization Service

```typescript
// src/shared/pii/tokenization.service.ts
import { Injectable } from '@nestjs/common';
import {
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'crypto';

export interface TokenizationResult {
  token: string;
  keyId: string;
  algorithm: 'AES-256-GCM' | 'HASH-SHA256';
}

@Injectable()
export class PIITokenizationService {
  private readonly algorithm = 'aes-256-gcm';

  /**
   * Deterministic tokenization for consistent references
   * Use for: email, phone, account numbers where you need same token
   */
  async tokenizeDeterministic(
    plaintext: string,
    context: string, // e.g., 'email', 'phone', 'account'
    tenantId: string,
  ): Promise<string> {
    const salt = await this.getSalt(context, tenantId);
    const hash = createHash('sha256')
      .update(plaintext + salt + context)
      .digest('hex');

    return `${context}_${hash.substring(0, 16)}`;
  }

  /**
   * Crypto-erasure encryption for high-risk PII
   * Use for: ID numbers, addresses, sensitive personal data
   */
  async encryptWithErasure(
    plaintext: string,
    subjectId: string, // customer ID for key association
    fieldType: string,
  ): Promise<TokenizationResult> {
    const keyId = await this.getOrCreateSubjectKey(subjectId);
    const key = await this.getEncryptionKey(keyId);

    const iv = randomBytes(16);
    const cipher = createCipheriv(this.algorithm, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    const token = Buffer.concat([
      iv,
      authTag,
      Buffer.from(encrypted, 'hex'),
    ]).toString('base64');

    return {
      token: `enc_${fieldType}_${token}`,
      keyId,
      algorithm: 'AES-256-GCM',
    };
  }

  /**
   * Decrypt tokenized data (for authorized access only)
   */
  async decrypt(token: string, keyId: string): Promise<string> {
    if (!token.startsWith('enc_')) {
      throw new Error('Invalid encrypted token format');
    }

    const [, fieldType, encryptedData] = token.split('_', 3);
    const buffer = Buffer.from(encryptedData, 'base64');

    const iv = buffer.subarray(0, 16);
    const authTag = buffer.subarray(16, 32);
    const encrypted = buffer.subarray(32);

    const key = await this.getEncryptionKey(keyId);
    const decipher = createDecipheriv(this.algorithm, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, null, 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Implement right-to-erasure by destroying subject's encryption keys
   */
  async eraseSubjectData(subjectId: string): Promise<void> {
    // 1. Mark all subject keys for deletion
    await this.markKeysForDeletion(subjectId);

    // 2. Schedule projection cleanup job
    await this.scheduleProjectionCleanup(subjectId);

    // 3. Log erasure event for audit
    await this.logErasureEvent(subjectId);
  }

  private async getSalt(context: string, tenantId: string): Promise<string> {
    // Retrieve tenant-specific salt from secure storage
    // Implementation depends on your key management system
    return `${tenantId}_${context}_salt`;
  }

  private async getOrCreateSubjectKey(subjectId: string): Promise<string> {
    // Create or retrieve subject-specific key ID
    // Store in secure key management system (AWS KMS, Azure Key Vault, etc.)
    return `subject_key_${subjectId}`;
  }

  private async getEncryptionKey(keyId: string): Promise<Buffer> {
    // Retrieve actual encryption key from KMS
    // This should never be stored in application memory long-term
    throw new Error('Implement KMS integration');
  }

  private async markKeysForDeletion(subjectId: string): Promise<void> {
    // Mark all encryption keys for this subject as deleted
    // Implementation depends on your key management system
  }

  private async scheduleProjectionCleanup(subjectId: string): Promise<void> {
    // Schedule background job to clean up projections
    // where this subject's encrypted data exists
  }

  private async logErasureEvent(subjectId: string): Promise<void> {
    // Log the erasure event for compliance audit trail
    // Include timestamp, operator, justification
  }
}
```

---

## 4) Event Patterns for PII-Safe Events

### Customer Created Event (PII-Safe)

```typescript
// src/contexts/customer/domain/events/customer-created.event.ts
export interface CustomerCreatedEvent {
  type: 'customer.created.v1';
  payload: {
    customerId: string; // Stable ID, not PII
    emailToken: string; // Deterministic token: email_a1b2c3d4
    phoneToken: string; // Deterministic token: phone_e5f6g7h8
    kycLevel: 'basic' | 'enhanced' | 'full';
    onboardingChannel: string;
  };
  metadata: {
    correlationId: string;
    tenantId: string;
    occurredAt: string;
    // NO actual email, phone, name, etc.
  };
}
```

### PII Access Event (Audit Trail)

```typescript
export interface PIIAccessedEvent {
  type: 'customer.pii.accessed.v1';
  payload: {
    customerId: string;
    accessedFields: string[]; // ['email', 'phone', 'address']
    purpose: 'customer_service' | 'aml_screening' | 'marketing' | 'compliance';
    operatorId: string;
    justification?: string;
  };
  metadata: {
    correlationId: string;
    tenantId: string;
    occurredAt: string;
  };
}
```

---

## 5) Projection Patterns with Field-Level Encryption

### Customer Projection Entity

```typescript
// src/contexts/customer/infrastructure/entities/customer-projection.entity.ts
import { Entity, Column, PrimaryColumn, Index } from 'typeorm';

@Entity({ name: 'customer_projection' })
@Index(['tenantId', 'emailToken'])
export class CustomerProjectionEntity {
  @PrimaryColumn() customerId: string;
  @Column() tenantId: string;

  // Tokenized identifiers for lookups
  @Column() emailToken: string;
  @Column() phoneToken: string;

  // Encrypted PII (crypto-erasure enabled)
  @Column({ type: 'text', nullable: true })
  encryptedEmail?: string; // enc_email_base64data

  @Column({ type: 'text', nullable: true })
  encryptedPhone?: string; // enc_phone_base64data

  @Column({ type: 'text', nullable: true })
  encryptedFullName?: string; // enc_name_base64data

  @Column({ type: 'text', nullable: true })
  encryptedAddress?: string; // enc_address_base64data

  // Encryption metadata
  @Column() keyId: string; // For crypto-erasure
  @Column() encryptionVersion: number; // For key rotation

  // Non-PII operational data
  @Column() kycLevel: string;
  @Column() status: string;
  @Column() createdAt: Date;
  @Column() updatedAt: Date;
}
```

### Projection Writer with PII Handling

```typescript
// src/contexts/customer/infrastructure/projections/customer-projection.writer.ts
import { Injectable } from '@nestjs/common';
import { PIITokenizationService } from '../../../shared/pii/tokenization.service';

@Injectable()
export class CustomerProjectionWriter {
  constructor(
    private readonly tokenizer: PIITokenizationService,
    private readonly repository: Repository<CustomerProjectionEntity>,
  ) {}

  async handleCustomerCreated(event: CustomerCreatedEvent): Promise<void> {
    // Event already contains tokens, but we need to populate encrypted fields
    // This happens during onboarding when we have the raw PII

    const projection = new CustomerProjectionEntity();
    projection.customerId = event.payload.customerId;
    projection.tenantId = event.metadata.tenantId;
    projection.emailToken = event.payload.emailToken;
    projection.phoneToken = event.payload.phoneToken;
    projection.kycLevel = event.payload.kycLevel;
    projection.status = 'active';
    projection.createdAt = new Date(event.metadata.occurredAt);
    projection.updatedAt = projection.createdAt;

    await this.repository.save(projection);
  }

  async updateCustomerPII(
    customerId: string,
    piiData: {
      email?: string;
      phone?: string;
      fullName?: string;
      address?: string;
    },
  ): Promise<void> {
    const projection = await this.repository.findOneOrFail({
      where: { customerId },
    });

    // Encrypt each PII field with crypto-erasure
    if (piiData.email) {
      const encrypted = await this.tokenizer.encryptWithErasure(
        piiData.email,
        customerId,
        'email',
      );
      projection.encryptedEmail = encrypted.token;
      projection.keyId = encrypted.keyId;
    }

    if (piiData.phone) {
      const encrypted = await this.tokenizer.encryptWithErasure(
        piiData.phone,
        customerId,
        'phone',
      );
      projection.encryptedPhone = encrypted.token;
    }

    if (piiData.fullName) {
      const encrypted = await this.tokenizer.encryptWithErasure(
        piiData.fullName,
        customerId,
        'name',
      );
      projection.encryptedFullName = encrypted.token;
    }

    if (piiData.address) {
      const encrypted = await this.tokenizer.encryptWithErasure(
        piiData.address,
        customerId,
        'address',
      );
      projection.encryptedAddress = encrypted.token;
    }

    projection.updatedAt = new Date();
    await this.repository.save(projection);
  }
}
```

---

## 6) Right-to-Erasure Implementation

### Erasure Use Case

```typescript
// src/contexts/customer/application/use-cases/erase-customer-data.use-case.ts
import { Injectable } from '@nestjs/common';
import { PIITokenizationService } from '../../../shared/pii/tokenization.service';
import { OutboxPort } from '../../../shared/ports/outbox.port';

@Injectable()
export class EraseCustomerDataUseCase {
  constructor(
    private readonly tokenizer: PIITokenizationService,
    private readonly outbox: OutboxPort,
  ) {}

  async execute(input: {
    customerId: string;
    requestorId: string;
    justification: string;
    tenantId: string;
  }): Promise<Result<void, DomainError>> {
    // 1. Validate erasure request
    const validation = await this.validateErasureRequest(input);
    if (!validation.ok) return validation;

    // 2. Perform crypto-erasure (destroy encryption keys)
    await this.tokenizer.eraseSubjectData(input.customerId);

    // 3. Emit erasure events for audit
    await this.outbox.enqueue(
      'customer.pii.erased.v1',
      {
        customerId: input.customerId,
        requestorId: input.requestorId,
        justification: input.justification,
        erasureMethod: 'crypto-erasure',
        affectedSystems: ['esdb', 'projections', 'redis_cache'],
      },
      {
        correlationId: `erasure_${input.customerId}`,
        tenantId: input.tenantId,
        occurredAt: new Date(),
      },
    );

    // 4. Schedule cleanup of projection data
    await this.scheduleProjectionCleanup(input.customerId);

    return ok(undefined);
  }

  private async validateErasureRequest(
    input: any,
  ): Promise<Result<void, DomainError>> {
    // Implement business rules for erasure:
    // - Customer account must be closed
    // - No pending transactions
    // - Retention period expired (if applicable)
    // - Legal hold check
    return ok(undefined);
  }

  private async scheduleProjectionCleanup(customerId: string): Promise<void> {
    // Schedule background job to clean up projections
    // after crypto-erasure keys are destroyed
  }
}
```

---

## 7) Redis PII Caching Patterns

### Encrypted Cache Service

```typescript
// src/shared/cache/encrypted-cache.service.ts
import { Injectable } from '@nestjs/common';
import { PIITokenizationService } from '../pii/tokenization.service';

@Injectable()
export class EncryptedCacheService {
  constructor(
    private readonly redis: Redis,
    private readonly tokenizer: PIITokenizationService,
  ) {}

  /**
   * Cache encrypted PII with TTL
   */
  async setEncrypted(
    key: string,
    value: string,
    subjectId: string,
    ttlSeconds: number = 3600,
  ): Promise<void> {
    const encrypted = await this.tokenizer.encryptWithErasure(
      value,
      subjectId,
      'cache',
    );

    await this.redis.setex(
      `encrypted:${key}`,
      ttlSeconds,
      JSON.stringify({
        token: encrypted.token,
        keyId: encrypted.keyId,
        encryptedAt: new Date().toISOString(),
      }),
    );
  }

  /**
   * Retrieve and decrypt cached PII
   */
  async getDecrypted(key: string): Promise<string | null> {
    const cached = await this.redis.get(`encrypted:${key}`);
    if (!cached) return null;

    const { token, keyId } = JSON.parse(cached);

    try {
      return await this.tokenizer.decrypt(token, keyId);
    } catch (error) {
      // Key might be erased - remove stale cache entry
      await this.redis.del(`encrypted:${key}`);
      return null;
    }
  }

  /**
   * Clear all cached data for a subject (erasure support)
   */
  async clearSubjectCache(subjectId: string): Promise<void> {
    const pattern = `encrypted:*:${subjectId}:*`;
    const keys = await this.redis.keys(pattern);

    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
```

---

## 8) Testing Patterns

### PII Tokenization Tests

```typescript
// src/shared/pii/__tests__/tokenization.service.spec.ts
describe('PIITokenizationService', () => {
  let service: PIITokenizationService;

  beforeEach(async () => {
    // Setup test with mock KMS
  });

  describe('deterministic tokenization', () => {
    it('should generate consistent tokens for same input', async () => {
      const email = 'user@example.com';
      const token1 = await service.tokenizeDeterministic(
        email,
        'email',
        'tenant1',
      );
      const token2 = await service.tokenizeDeterministic(
        email,
        'email',
        'tenant1',
      );

      expect(token1).toBe(token2);
      expect(token1).toMatch(/^email_[a-f0-9]{16}$/);
    });

    it('should generate different tokens for different tenants', async () => {
      const email = 'user@example.com';
      const token1 = await service.tokenizeDeterministic(
        email,
        'email',
        'tenant1',
      );
      const token2 = await service.tokenizeDeterministic(
        email,
        'email',
        'tenant2',
      );

      expect(token1).not.toBe(token2);
    });
  });

  describe('crypto-erasure', () => {
    it('should encrypt and decrypt successfully', async () => {
      const plaintext = 'sensitive-data';
      const subjectId = 'customer-123';

      const encrypted = await service.encryptWithErasure(
        plaintext,
        subjectId,
        'test',
      );
      const decrypted = await service.decrypt(encrypted.token, encrypted.keyId);

      expect(decrypted).toBe(plaintext);
    });

    it('should fail decryption after erasure', async () => {
      const plaintext = 'sensitive-data';
      const subjectId = 'customer-123';

      const encrypted = await service.encryptWithErasure(
        plaintext,
        subjectId,
        'test',
      );

      // Perform erasure
      await service.eraseSubjectData(subjectId);

      // Decryption should fail
      await expect(
        service.decrypt(encrypted.token, encrypted.keyId),
      ).rejects.toThrow();
    });
  });
});
```

---

## 9) Operational Considerations

### Key Rotation Strategy

```typescript
interface KeyRotationPolicy {
  rotationInterval: '90d' | '180d' | '365d';
  gracePeriod: '30d'; // Keep old keys for this period
  automaticRotation: boolean;
  emergencyRotation: boolean; // For breach scenarios
}
```

### Monitoring & Alerting

```yaml
# Monitor these metrics for PII operations
pii_tokenization_requests_total: counter
pii_decryption_requests_total: counter
pii_erasure_requests_total: counter
pii_key_rotation_events_total: counter
pii_unauthorized_access_attempts_total: counter
```

### Compliance Reporting

```typescript
interface PIIComplianceReport {
  period: string;
  totalSubjects: number;
  newEncryptions: number;
  erasureRequests: number;
  accessRequests: number;
  keyRotations: number;
  securityIncidents: number;
}
```

This implementation provides a production-ready foundation for PII handling in your event-sourced architecture while maintaining POPIA compliance and enabling crypto-erasure for right-to-erasure requests.
