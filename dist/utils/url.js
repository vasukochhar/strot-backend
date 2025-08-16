"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.absoluteUrl = absoluteUrl;
function absoluteUrl(relativePath) {
    const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
    const rel = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
    return `${base}${rel}`;
}
