import compression from 'compression';

export function compressionMiddleware() {
  return compression();
}
