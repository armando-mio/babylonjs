/**
 * Server configuration for RoomPlan upload.
 *
 * Change SERVER_URL to point to wherever the RoomPlan server is running.
 * Examples:
 *   - Local dev:   http://192.168.1.100:3001
 *   - VPS:         http://maket.eye-tech.local:3001
 *   - Production:  https://your-domain.com
 */
export const SERVER_URL = 'http://192.168.0.171:3001';

/**
 * Upload timeout in milliseconds (5 minutes — USDZ files can be large).
 */
export const UPLOAD_TIMEOUT_MS = 5 * 60 * 1000;
