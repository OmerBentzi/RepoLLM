/**
 * Security utilities for preventing prompt injection and XSS attacks
 */

/**
 * Sanitize user input to prevent prompt injection attacks
 * Removes or escapes dangerous patterns that could manipulate AI prompts
 */
export function sanitizeUserInput(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  let sanitized = input;

  // Remove or escape prompt injection patterns
  // These patterns attempt to override system instructions
  const injectionPatterns = [
    // Direct instruction overrides
    /ignore\s+(previous|all|above|system)\s+(instructions?|prompts?|rules?)/gi,
    /forget\s+(previous|all|above|system)\s+(instructions?|prompts?|rules?)/gi,
    /disregard\s+(previous|all|above|system)\s+(instructions?|prompts?|rules?)/gi,
    /override\s+(previous|all|above|system)\s+(instructions?|prompts?|rules?)/gi,
    
    // Role manipulation
    /you\s+are\s+(now|a|an)\s+/gi,
    /act\s+as\s+(if\s+you\s+are\s+)?/gi,
    /pretend\s+to\s+be/gi,
    
    // System prompt injection
    /system\s*:\s*/gi,
    /<\|system\|>/gi,
    /<\|assistant\|>/gi,
    /<\|user\|>/gi,
    
    // Instruction delimiters
    /\[INST\]/gi,
    /\[\/INST\]/gi,
    /<\|im_start\|>/gi,
    /<\|im_end\|>/gi,
    
    // Dangerous commands in context
    /execute\s+(code|command|script)/gi,
    /run\s+(code|command|script)/gi,
    /eval\s*\(/gi,
    /Function\s*\(/gi,
  ];

  // Remove injection patterns
  for (const pattern of injectionPatterns) {
    sanitized = sanitized.replace(pattern, '');
  }

  // Limit length to prevent token exhaustion attacks
  const MAX_INPUT_LENGTH = 10000; // ~2500 tokens
  if (sanitized.length > MAX_INPUT_LENGTH) {
    sanitized = sanitized.substring(0, MAX_INPUT_LENGTH);
    sanitized += '\n[Input truncated for security]';
  }

  // Remove excessive newlines (could be used to hide malicious content)
  sanitized = sanitized.replace(/\n{10,}/g, '\n\n');

  // Remove null bytes and control characters (except newlines and tabs)
  sanitized = sanitized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');

  return sanitized.trim();
}

/**
 * Validate input safety and return warnings
 */
export function validateInputSafety(input: string): { safe: boolean; warnings: string[] } {
  const warnings: string[] = [];
  
  if (!input || typeof input !== 'string') {
    return { safe: true, warnings: [] };
  }

  // Check for suspicious patterns
  const suspiciousPatterns = [
    { pattern: /ignore\s+(previous|all|above|system)/gi, warning: 'Potential instruction override attempt' },
    { pattern: /<\|system\|>/gi, warning: 'Potential system prompt injection' },
    { pattern: /\[INST\]/gi, warning: 'Potential instruction delimiter injection' },
    { pattern: /execute\s+(code|command|script)/gi, warning: 'Potential code execution attempt' },
  ];

  for (const { pattern, warning } of suspiciousPatterns) {
    if (pattern.test(input)) {
      warnings.push(warning);
    }
  }

  return {
    safe: warnings.length === 0,
    warnings
  };
}

/**
 * Sanitize text for safe HTML rendering
 * Escapes HTML special characters to prevent XSS
 */
export function escapeHtml(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Sanitize file paths to prevent path traversal attacks
 */
export function sanitizeFilePath(filePath: string): string {
  if (!filePath || typeof filePath !== 'string') {
    return '';
  }

  // Remove path traversal sequences
  let sanitized = filePath
    .replace(/\.\./g, '') // Remove ..
    .replace(/\/\//g, '/') // Remove double slashes
    .replace(/^\/+/, '') // Remove leading slashes
    .trim();

  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');

  // Limit length
  const MAX_PATH_LENGTH = 500;
  if (sanitized.length > MAX_PATH_LENGTH) {
    sanitized = sanitized.substring(0, MAX_PATH_LENGTH);
  }

  return sanitized;
}

/**
 * Sanitize repository identifier (owner/repo name)
 */
export function sanitizeRepoIdentifier(identifier: string): string {
  if (!identifier || typeof identifier !== 'string') {
    return '';
  }

  // Only allow alphanumeric, hyphens, underscores, and dots
  let sanitized = identifier.replace(/[^a-zA-Z0-9._-]/g, '');

  // Limit length
  const MAX_IDENTIFIER_LENGTH = 100;
  if (sanitized.length > MAX_IDENTIFIER_LENGTH) {
    sanitized = sanitized.substring(0, MAX_IDENTIFIER_LENGTH);
  }

  return sanitized;
}

/**
 * Sanitize markdown content to prevent XSS
 */
export function sanitizeMarkdown(markdown: string): string {
  if (!markdown || typeof markdown !== 'string') {
    return '';
  }

  let sanitized = markdown;

  // Remove script tags
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Remove iframe tags
  sanitized = sanitized.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');

  // Remove event handlers (onclick, onerror, etc.)
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*[^\s>]*/gi, '');

  // Remove javascript: and data: protocols
  sanitized = sanitized.replace(/javascript:/gi, '');
  sanitized = sanitized.replace(/data:text\/html/gi, '');

  // Remove dangerous HTML entities
  sanitized = sanitized.replace(/&#x[0-9a-fA-F]+;/g, '');

  return sanitized;
}

/**
 * Sanitize SVG content to prevent XSS
 */
export function sanitizeSvg(svg: string): string {
  if (!svg || typeof svg !== 'string') {
    return '';
  }

  let sanitized = svg;

  // Remove script tags
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Remove event handlers
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*[^\s>]*/gi, '');

  // Remove javascript: and data: protocols
  sanitized = sanitized.replace(/javascript:/gi, '');
  sanitized = sanitized.replace(/data:text\/html/gi, '');

  return sanitized;
}

/**
 * Sanitize Mermaid diagram code to prevent XSS
 */
export function sanitizeMermaidForXSS(code: string): string {
  if (!code || typeof code !== 'string') {
    return '';
  }

  let sanitized = code;

  // Remove HTML tags
  sanitized = sanitized.replace(/<[^>]+>/g, '');

  // Remove script tags (if any)
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Remove dangerous characters that could be used for injection
  sanitized = sanitized.replace(/[<>"']/g, '');

  return sanitized;
}

