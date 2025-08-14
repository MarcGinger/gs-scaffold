/**
 * Copyright (c) 2025 Marc Ginger. All rights reserved.
 *
 * This file is part of a proprietary NestJS system developed by Marc Ginger.
 * Unauthorized copying, modification, distribution, or use of this file,
 * via any medium, is strictly prohibited and may result in legal action.
 *
 * Confidential and proprietary.
 */

import { Injectable, Logger } from '@nestjs/common';
import Ajv, { ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';

export interface SchemaValidationResult {
  isValid: boolean;
  errors: string[];
  details?: ErrorObject[];
}

/**
 * Interface representing a JSON Schema property definition
 */
export interface JsonSchemaProperty {
  type:
    | 'string'
    | 'number'
    | 'integer'
    | 'boolean'
    | 'object'
    | 'array'
    | 'null';
  description?: string;
  format?: string;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  enum?: any[];
  default?: any;
  properties?: Record<string, JsonSchemaProperty>;
  items?: JsonSchemaProperty;
  required?: string[];
  additionalProperties?: boolean | JsonSchemaProperty;
}

/**
 * Interface representing a complete JSON Schema
 */
export interface JsonSchema extends JsonSchemaProperty {
  $schema?: string;
  $id?: string;
  title?: string;
}

/**
 * Service for JSON Schema validation using AJV
 * Provides comprehensive validation for template payload schemas
 */
@Injectable()
export class AjvSchemaValidationService {
  private readonly logger = new Logger(AjvSchemaValidationService.name);
  private readonly ajv: Ajv;

  constructor() {
    // Initialize AJV with comprehensive options
    this.ajv = new Ajv({
      allErrors: true, // Collect all errors, not just the first one
      removeAdditional: false, // Don't remove additional properties
      useDefaults: true, // Apply default values
      coerceTypes: false, // Don't coerce types automatically
      strict: true, // Strict mode for better error reporting
      verbose: true, // Include schema and data in errors
    });

    // Add common formats (email, date, uri, etc.)
    addFormats(this.ajv);

    // Add custom keywords if needed
    this.addCustomKeywords();
  }

  /**
   * Validates a JSON schema itself to ensure it's well-formed
   * @param schema - The JSON schema to validate
   * @returns SchemaValidationResult
   */
  validateSchema(schema: JsonSchema): SchemaValidationResult {
    try {
      // Check if the schema can be compiled
      this.ajv.compile(schema);

      return {
        isValid: true,
        errors: [],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Unknown schema validation error';

      this.logger.warn(
        {
          method: 'validateSchema',
          error: errorMessage,
          schema: JSON.stringify(schema, null, 2),
        },
        `Invalid JSON schema: ${errorMessage}`,
      );

      return {
        isValid: false,
        errors: [errorMessage],
      };
    }
  }

  /**
   * Validates data against a JSON schema
   * @param schema - The JSON schema to validate against
   * @param data - The data to validate
   * @returns SchemaValidationResult
   */
  validateData(
    schema: JsonSchema | Record<string, any>,
    data: any,
  ): SchemaValidationResult {
    try {
      // First validate the schema itself
      const schemaValidation = this.validateSchema(schema as JsonSchema);
      if (!schemaValidation.isValid) {
        return {
          isValid: false,
          errors: [`Invalid schema: ${schemaValidation.errors.join(', ')}`],
        };
      }

      // Compile and validate the data
      const validate = this.ajv.compile(schema);
      const isValid = validate(data);

      if (!isValid && validate.errors) {
        const errors = validate.errors.map((error) =>
          this.formatErrorMessage(error),
        );

        this.logger.debug(
          {
            method: 'validateData',
            isValid,
            errorCount: errors.length,
            errors: validate.errors,
          },
          `Data validation failed with ${errors.length} errors`,
        );

        return {
          isValid: false,
          errors,
          details: validate.errors,
        };
      }

      return {
        isValid: true,
        errors: [],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown validation error';

      this.logger.error(
        {
          method: 'validateData',
          error: errorMessage,
          schema: JSON.stringify(schema, null, 2),
          data: JSON.stringify(data, null, 2),
        },
        `Data validation error: ${errorMessage}`,
      );

      return {
        isValid: false,
        errors: [errorMessage],
      };
    }
  }

  /**
   * Validates a template payload schema specifically
   * Includes template-specific validation rules
   * @param payloadSchema - The payload schema to validate
   * @returns SchemaValidationResult
   */
  validateTemplatePayloadSchema(
    payloadSchema: JsonSchema | Record<string, any>,
  ): SchemaValidationResult {
    // First perform basic schema validation
    const basicValidation = this.validateSchema(payloadSchema as JsonSchema);
    if (!basicValidation.isValid) {
      return basicValidation;
    }

    // Additional template-specific validations
    const errors: string[] = [];

    // Ensure the schema has a type definition
    if (!payloadSchema.type) {
      errors.push('Payload schema must define a root type');
    }

    // Ensure the schema is an object type for template variables
    if (payloadSchema.type !== 'object') {
      errors.push(
        'Payload schema root type must be "object" for template variables',
      );
    }

    // Validate properties exist for object schemas
    if (payloadSchema.type === 'object' && !payloadSchema.properties) {
      errors.push('Object schemas must define properties');
    }

    // Check for common template variable patterns
    if (
      payloadSchema.properties &&
      this.isJsonSchemaProperties(payloadSchema.properties)
    ) {
      this.validateTemplateProperties(payloadSchema.properties, errors);
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Type guard to check if an object is a valid JsonSchemaProperty record
   */
  private isJsonSchemaProperties(
    obj: unknown,
  ): obj is Record<string, JsonSchemaProperty> {
    if (!obj || typeof obj !== 'object' || obj === null) return false;

    // Type assertion after null check for safety
    const objRecord = obj as Record<string, unknown>;

    // Check if all values have the basic structure of JsonSchemaProperty
    return Object.values(objRecord).every(
      (prop: unknown): prop is JsonSchemaProperty => {
        if (!prop || typeof prop !== 'object' || prop === null) return false;

        const propObj = prop as Record<string, unknown>;

        return (
          'type' in propObj &&
          typeof propObj.type === 'string' &&
          [
            'string',
            'number',
            'integer',
            'boolean',
            'object',
            'array',
            'null',
          ].includes(propObj.type)
        );
      },
    );
  }

  /**
   * Validates template properties for common patterns and best practices
   */
  private validateTemplateProperties(
    properties: Record<string, JsonSchemaProperty>,
    errors: string[],
    path = '',
  ): void {
    for (const [key, property] of Object.entries(properties)) {
      const currentPath = path ? `${path}.${key}` : key;

      // Check for required type definition
      if (!property.type) {
        errors.push(`Property "${currentPath}" must define a type`);
        continue;
      }

      // Validate nested objects
      if (property.type === 'object' && property.properties) {
        this.validateTemplateProperties(
          property.properties,
          errors,
          currentPath,
        );
      }

      // Validate array items
      if (property.type === 'array' && property.items) {
        if (property.items.type === 'object' && property.items.properties) {
          this.validateTemplateProperties(
            property.items.properties,
            errors,
            `${currentPath}[]`,
          );
        }
      }

      // Recommend descriptions for template variables
      if (!property.description) {
        this.logger.debug(
          `Consider adding description for template property "${currentPath}"`,
        );
      }
    }
  }

  /**
   * Formats AJV error messages for better readability
   */
  private formatErrorMessage(error: ErrorObject): string {
    const path = error.instancePath || 'root';
    const message = error.message || 'Unknown error';

    switch (error.keyword) {
      case 'required':
        return `Missing required property "${error.params?.missingProperty}" at ${path}`;
      case 'type':
        return `Invalid type at ${path}: expected ${error.params?.type}, got ${typeof error.data}`;
      case 'format':
        return `Invalid format at ${path}: ${message}`;
      case 'enum': {
        const allowedValues = error.params?.allowedValues;
        const joinedValues = Array.isArray(allowedValues)
          ? allowedValues.join(', ')
          : 'unknown values';
        return `Invalid value at ${path}: must be one of [${joinedValues}]`;
      }
      case 'minimum':
        return `Value at ${path} must be >= ${error.params?.limit}`;
      case 'maximum':
        return `Value at ${path} must be <= ${error.params?.limit}`;
      case 'minLength':
        return `Value at ${path} must be at least ${error.params?.limit} characters`;
      case 'maxLength':
        return `Value at ${path} must be at most ${error.params?.limit} characters`;
      default:
        return `Validation error at ${path}: ${message}`;
    }
  }

  /**
   * Add custom AJV keywords for template-specific validation
   */
  private addCustomKeywords(): void {
    // Add custom keyword for template variable validation
    this.ajv.addKeyword({
      keyword: 'templateVariable',
      type: 'string',
      schemaType: 'boolean',
      compile: (schemaValue: boolean) => {
        return (data: string): boolean => {
          if (!schemaValue) return true;

          // Template variables should match common patterns like {{variable}} or ${variable}
          const templateVariablePattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
          return templateVariablePattern.test(data);
        };
      },
    });
  }
}
