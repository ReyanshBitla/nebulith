const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = Number.isInteger(err.statusCode) && err.statusCode >= 400 && err.statusCode <= 599
    ? err.statusCode
    : Number.isInteger(err.status) && err.status >= 400 && err.status <= 599
      ? err.status
      : 500;

  const isProduction = (req.app?.locals.nodeEnv || process.env.NODE_ENV) === 'production';
  const productionMessages = {
    400: 'Invalid request.',
    401: 'Authentication is required.',
    403: 'Access denied.',
    404: 'Route not found.',
    409: 'The request conflicts with an existing resource.',
    413: 'Request body is too large.',
    429: 'Too many requests.',
  };
  const message = isProduction
    ? productionMessages[statusCode] || (statusCode >= 500
      ? 'An unexpected error occurred.'
      : 'The request could not be completed.')
    : statusCode >= 500
      ? 'An internal server error occurred.'
      : err.message || 'The request could not be completed.';

  if (statusCode >= 500) {
    console.error(`Request failed with status ${statusCode}.`);
  }

  return res.status(statusCode).json({
    success: false,
    error: {
      message,
      code: statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : err.code || 'REQUEST_ERROR',
    },
  });
};

module.exports = errorHandler;
