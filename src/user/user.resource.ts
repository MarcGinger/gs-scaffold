import { Resource } from '../shared/security/opa/resource.decorator';
import { Request } from 'express';

/**
 * User resource decorator for authorization
 * @param action - The user action being performed (e.g., 'read', 'update', 'delete')
 */
export const UserResource = (action: string) =>
  Resource({
    type: 'user',
    action: `user.${action}`,
    extractId: (req: Request) => req.params?.id,
    extractAttributes: (req: Request) => {
      const body = req.body as Record<string, unknown> | undefined;
      const query = req.query as Record<string, unknown> | undefined;

      return {
        department: (body?.department || query?.department) as
          | string
          | undefined,
        role: (body?.role || query?.role) as string | undefined,
        status: (body?.status || query?.status) as string | undefined,
        manager: (body?.manager || query?.manager) as string | undefined,
      };
    },
  });

/**
 * User profile resource decorator (for profile-specific actions)
 * @param action - The profile action being performed
 */
export const UserProfileResource = (action: string) =>
  Resource({
    type: 'user-profile',
    action: `user.profile.${action}`,
    extractId: (req: Request) => req.params?.userId || req.params?.id,
    extractAttributes: (req: Request) => {
      const body = req.body as Record<string, unknown> | undefined;
      const query = req.query as Record<string, unknown> | undefined;

      return {
        profileType: (body?.profileType || query?.profileType) as
          | string
          | undefined,
        visibility: (body?.visibility || query?.visibility) as
          | string
          | undefined,
      };
    },
  });
