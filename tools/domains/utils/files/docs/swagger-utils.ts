import { INestApplication } from '@nestjs/common';
import { AppConfigUtil } from 'src/shared/config';
import { ApiDocumentationHub } from './api-hub.doc';
import { ArchitectureDocumentation } from './architecture.doc';
import { SecurityDocumentation } from './security.doc';
import { StandardsDocumentation } from './standards.doc';
import { GettingStartedDocumentation } from './getting-started.doc';
import { SwaggerDocumentationUrls } from './swagger.model';
import { SystemOperationsDocumentation } from './system-operations.doc';

/**
 * Setup multiple Swagger documentation using modular documentation classes
 */
export function setupMultipleSwaggerDocs(
  app: INestApplication,
  port: string | number,
): SwaggerDocumentationUrls {
  if (AppConfigUtil.isProduction()) {
    return {
      hub: '',
      system: '',
      architecture: '',
      security: '',
      standards: '',
      gettingStarted: '',
    };
  }

  // Setup consolidated documentation modules (groups multiple domains)
  SystemOperationsDocumentation.setup(app, port);
  ApiDocumentationHub.setup(app, port);
  ArchitectureDocumentation.setup(app, port);
  SecurityDocumentation.setup(app, port);
  StandardsDocumentation.setup(app, port);
  GettingStartedDocumentation.setup(app, port);

  return {
    hub: ApiDocumentationHub.getEndpoint(port),
    system: SystemOperationsDocumentation.getEndpoint(port),
    architecture: ArchitectureDocumentation.getEndpoint(port),
    security: SecurityDocumentation.getEndpoint(port),
    standards: StandardsDocumentation.getEndpoint(port),
    gettingStarted: GettingStartedDocumentation.getEndpoint(port),
  };
}
