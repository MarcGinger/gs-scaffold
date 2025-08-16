export const staticResponse = {
  headers: {
    'X-RateLimit-Limit': {
      description:
        'The maximum number of requests you’re permitted to make per minute',
      schema: { type: 'integer', example: 60 },
    },
    'X-RateLimit-Remaining': {
      description:
        'The number of requests remaining in the current rate limit window',
      schema: { type: 'integer', example: 42 },
    },
  },
};
