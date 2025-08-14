/**
 * Copyright (c) 2025 Marc Ginger. All rights reserved.
 *
 * This file is part of a proprietary NestJS system developed by Marc Ginger.
 * Unauthorized copying, modification, distribution, or use of this file,
 * via any medium, is strictly prohibited and may result in legal action.
 *
 * Confidential and proprietary.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AjvSchemaValidationService } from '../ajv-schema-validation.service';

describe('AjvSchemaValidationService', () => {
  let service: AjvSchemaValidationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AjvSchemaValidationService],
    }).compile();

    service = module.get<AjvSchemaValidationService>(
      AjvSchemaValidationService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateTemplatePayloadSchema', () => {
    it('should validate a valid template payload schema', () => {
      const validSchema = {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'User name',
          },
          email: {
            type: 'string',
            format: 'email',
            description: 'User email address',
          },
          age: {
            type: 'number',
            minimum: 0,
            description: 'User age',
          },
        },
        required: ['name', 'email'],
      };

      const result = service.validateTemplatePayloadSchema(validSchema);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject schema with missing type', () => {
      const invalidSchema = {
        properties: {
          name: {
            type: 'string',
          },
        },
      };

      const result = service.validateTemplatePayloadSchema(invalidSchema);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Payload schema must define a root type');
    });

    it('should reject schema with non-object root type', () => {
      const invalidSchema = {
        type: 'string',
      };

      const result = service.validateTemplatePayloadSchema(invalidSchema);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        'Payload schema root type must be "object" for template variables',
      );
    });

    it('should reject object schema without properties', () => {
      const invalidSchema = {
        type: 'object',
      };

      const result = service.validateTemplatePayloadSchema(invalidSchema);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Object schemas must define properties');
    });

    it('should validate nested object properties', () => {
      const validSchema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              profile: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                    description: 'User name',
                  },
                },
              },
            },
          },
        },
      };

      const result = service.validateTemplatePayloadSchema(validSchema);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('validateData', () => {
    it('should validate data against a schema', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name'],
      };

      const validData = {
        name: 'John Doe',
        age: 30,
      };

      const result = service.validateData(schema, validData);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid data', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name'],
      };

      const invalidData = {
        age: 'not a number',
      };

      const result = service.validateData(schema, invalidData);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
