export interface I18nDictionary {
  errors: {
    validationFailed: { title: string; detail: string };
    unauthorized: { title: string; detail: string };
    forbidden: { title: string; detail: string };
    notFound: { title: string; detail: string };
    conflict: { title: string; detail: string };
    rateLimited: { title: string; detail: string };
    externalService: { title: string; detail: string };
    internal: { title: string; detail: string };
  };
  health: {
    ok: string;
    notReady: string;
  };
}

export const en: I18nDictionary = {
  errors: {
    validationFailed: {
      title: 'Validation failed',
      detail: 'One or more fields failed validation.',
    },
    unauthorized: {
      title: 'Unauthorized',
      detail: 'Authentication is required to access this resource.',
    },
    forbidden: {
      title: 'Forbidden',
      detail: 'You do not have permission to perform this action.',
    },
    notFound: {
      title: 'Not found',
      detail: 'The requested resource could not be found.',
    },
    conflict: {
      title: 'Conflict',
      detail: 'The request could not be completed due to a conflict.',
    },
    rateLimited: {
      title: 'Too many requests',
      detail: 'You have made too many requests. Please try again later.',
    },
    externalService: {
      title: 'External service error',
      detail: 'A dependency of this service is currently unavailable.',
    },
    internal: {
      title: 'Internal server error',
      detail: 'An unexpected error occurred. Please try again later.',
    },
  },
  health: {
    ok: 'Service is healthy',
    notReady: 'Service is not ready',
  },
};
