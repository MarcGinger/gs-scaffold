import { Inject, Injectable } from '@nestjs/common';
import Ajv, { ErrorObject, ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import type { Logger } from 'pino';

import { APP_LOGGER } from '../../shared/logging/logging.providers';
import { Log } from '../../shared/logging/structured-logger';

/** AJV Error parameters interface for better type safety */
interface AjvErrorParams {
  missingProperty?: string;
  type?: string;
  allowedValues?: any[];
}

/** Type guard to check if object has a valid type property */
function hasValidType(obj: unknown): obj is { type: string } {
  if (obj === null || typeof obj !== 'object' || !('type' in obj)) {
    return false;
  }
  const typeValue = (obj as Record<string, unknown>).type;
  return (
    typeof typeValue === 'string' &&
    [
      'string',
      'number',
      'integer',
      'boolean',
      'object',
      'array',
      'null',
    ].includes(typeValue)
  );
}

/** Type guard to safely access AJV error params */
function getAjvErrorParams(params: unknown): AjvErrorParams {
  if (!params || typeof params !== 'object') {
    return {};
  }
  const p = params as Record<string, unknown>;
  return {
    missingProperty:
      typeof p.missingProperty === 'string' ? p.missingProperty : undefined,
    type: typeof p.type === 'string' ? p.type : undefined,
    allowedValues: Array.isArray(p.allowedValues) ? p.allowedValues : undefined,
  };
}

/** Results returned by schema/data validation */
export interface SchemaValidationResult {
  isValid: boolean;
  errors: string[];
  details?: ErrorObject[];
}

/** JSON Schema property definition (narrow but practical) */
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
  required?: string[]; // valid only for object types
  additionalProperties?: boolean | JsonSchemaProperty;
}

/** Top-level JSON Schema */
export interface JsonSchema extends JsonSchemaProperty {
  $schema?: string;
  $id?: string; // recommended for caching
  title?: string;
}

@Injectable()
export class AjvSchemaValidationService {
  private readonly ajv: Ajv;
  private readonly cache = new Map<string, ValidateFunction>(); // key -> compiled validator

  constructor(@Inject(APP_LOGGER) private readonly logger: Logger) {
    this.ajv = new Ajv({
      allErrors: true,
      removeAdditional: false,
      useDefaults: true,
      coerceTypes: false,
      strict: true,
      allowUnionTypes: true,
    });
    addFormats(this.ajv);
    this.addCustomKeywords();
  }

  /** Validate the schema itself (compiles once) */
  validateSchema(schema: JsonSchema): SchemaValidationResult {
    try {
      this.getOrCompile(schema); // throws if invalid
      return { isValid: true, errors: [] };
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Unknown schema validation error';
      Log.minimal.warn(this.logger, 'ajv.schema.invalid', {
        method: 'validateSchema',
        component: 'AjvSchemaValidationService',
        error: msg,
        schemaId: schema.$id,
      });
      return { isValid: false, errors: [msg] };
    }
  }

  /** Validate data against a given schema */
  validateData(
    schema: JsonSchema | Record<string, any>,
    data: unknown,
  ): SchemaValidationResult {
    try {
      const validate = this.getOrCompile(schema as JsonSchema);
      const ok = validate(data);

      if (!ok) {
        const details = validate.errors ?? [];
        const errors = details.map((e) => this.formatErrorMessage(e));
        Log.minimal.debug(this.logger, 'ajv.data.invalid', {
          method: 'validateData',
          component: 'AjvSchemaValidationService',
          errorCount: errors.length,
          schemaId: (schema as JsonSchema).$id,
        });
        return { isValid: false, errors, details };
      }

      return { isValid: true, errors: [] };
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Unknown validation error';
      Log.minimal.error(this.logger, err as Error, 'ajv.data.error', {
        method: 'validateData',
        component: 'AjvSchemaValidationService',
        schemaId: (schema as JsonSchema).$id,
      });
      return { isValid: false, errors: [msg] };
    }
  }

  /**
   * Template-specific schema validation:
   * - root must be "object"
   * - properties must exist
   * - "required" only on objects & must reference defined props
   */
  validateTemplatePayloadSchema(
    schema: JsonSchema | Record<string, any>,
  ): SchemaValidationResult {
    const basic = this.validateSchema(schema as JsonSchema);
    if (!basic.isValid) return basic;

    const s = schema as JsonSchema;
    const errs: string[] = [];

    if (!s.type) errs.push('Payload schema must define a root type');
    if (s.type !== 'object')
      errs.push(
        'Payload schema root type must be "object" for template variables',
      );
    if (s.type === 'object' && !s.properties)
      errs.push('Object schemas must define properties');

    // required: only valid on object schemas, all keys must exist
    if (s.required && s.type !== 'object') {
      errs.push('The "required" keyword is only valid on object schemas');
    }
    if (s.type === 'object' && s.properties && s.required) {
      const keys = new Set(Object.keys(s.properties));
      for (const r of s.required) {
        if (!keys.has(r))
          errs.push(`"required" references unknown property "${r}"`);
      }
    }

    // Recursively check nested properties
    if (s.properties && this.isJsonSchemaProperties(s.properties)) {
      this.validateTemplateProperties(s.properties, errs);
    }

    return { isValid: errs.length === 0, errors: errs };
  }

  // --------------------- internals ---------------------

  /** Compile (or fetch cached) validator */
  private getOrCompile(schema: JsonSchema): ValidateFunction {
    const key = schema.$id ?? this.inlineKey(schema);
    const cached = this.cache.get(key);
    if (cached) return cached;

    // If $id present, register & reuse by id
    if (schema.$id) {
      this.ajv.removeSchema(schema.$id); // allow hot-reload/update
      this.ajv.addSchema(schema, schema.$id);
      const v = this.ajv.getSchema(schema.$id);
      if (!v) throw new Error(`Failed to load schema with $id=${schema.$id}`);
      this.cache.set(key, v);
      return v;
    }

    const v = this.ajv.compile(schema);
    this.cache.set(key, v);
    return v;
  }

  /** Simple stable key; swap to a sha256 hash if schema bodies are large */
  private inlineKey(schema: JsonSchema): string {
    return JSON.stringify(schema);
  }

  private isJsonSchemaProperties(
    obj: unknown,
  ): obj is Record<string, JsonSchemaProperty> {
    if (!obj || typeof obj !== 'object') return false;
    return Object.values(obj as Record<string, unknown>).every(
      (prop: unknown): prop is JsonSchemaProperty => {
        return hasValidType(prop);
      },
    );
  }

  /** Recursively validate nested properties + provide recommendations */
  private validateTemplateProperties(
    properties: Record<string, JsonSchemaProperty>,
    errors: string[],
    path = '',
  ): void {
    for (const [key, prop] of Object.entries(properties)) {
      const p = path ? `${path}.${key}` : key;

      if (!prop.type) {
        errors.push(`Property "${p}" must define a type`);
        continue;
      }

      if (prop.type === 'object' && prop.properties) {
        if (prop.required) {
          const keys = new Set(Object.keys(prop.properties));
          for (const r of prop.required) {
            if (!keys.has(r))
              errors.push(`"${p}.required" references unknown property "${r}"`);
          }
        }
        this.validateTemplateProperties(prop.properties, errors, p);
      }

      if (prop.type === 'array' && prop.items) {
        const it = prop.items;
        if (it.type === 'object' && it.properties) {
          this.validateTemplateProperties(it.properties, errors, `${p}[]`);
        }
      }

      if (!prop.description) {
        Log.minimal.debug(this.logger, 'ajv.template.desc.recommendation', {
          method: 'validateTemplateProperties',
          component: 'AjvSchemaValidationService',
          property: p,
        });
      }
    }
  }

  /** Human-friendly error messages */
  private formatErrorMessage(e: ErrorObject): string {
    const path = e.instancePath
      ? e.instancePath.replace(/^\//, '').replace(/\//g, '.') || 'root'
      : 'root';
    const msg = e.message || 'Validation error';
    const params = getAjvErrorParams(e.params);

    switch (e.keyword) {
      case 'required':
        return `Missing required property "${params.missingProperty ?? 'unknown'}" at ${path}`;
      case 'type':
        return `Invalid type at ${path}: expected ${params.type ?? 'unknown'}`;
      case 'format':
        return `Invalid format at ${path}: ${msg}`;
      case 'enum': {
        const allowed = params.allowedValues;
        const joined = Array.isArray(allowed)
          ? allowed.join(', ')
          : 'unknown values';
        return `Invalid value at ${path}: must be one of [${joined}]`;
      }
      case 'minimum':
      case 'maximum':
      case 'minLength':
      case 'maxLength':
        return `${msg} at ${path}`;
      default:
        return `Validation error at ${path}: ${msg}`;
    }
  }

  /** Custom keywords (template variables etc.) */
  private addCustomKeywords(): void {
    // Accept: foo, foo_bar9, {{ foo }}, {{foo.bar}}, ${foo}, ${foo.bar}
    const bareIdent = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    const moustache =
      /^\{\{\s*[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*\s*\}\}$/;
    const templateStr =
      /^\$\{\s*[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*\s*\}$/;

    this.ajv.addKeyword({
      keyword: 'templateVariable',
      type: 'string',
      schemaType: 'boolean',
      validate: (flag: boolean, data: unknown) => {
        if (!flag) return true;
        if (typeof data !== 'string') return false;
        return (
          bareIdent.test(data) || moustache.test(data) || templateStr.test(data)
        );
      },
      errors: false,
    });
  }
}
