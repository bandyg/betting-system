// api/errors.ts — 错误分类（Sprint 1 B1）
//
// 三类错误：
// - BusinessError: 4xx 业务错误（密码错、余额不足、权限不足等）
// - ServerError: 5xx 服务端错误（崩溃、DB 故障、维护中）
// - NetworkError: 网络层错误（fetch failed、CORS、timeout）
//
// 用 instanceof 区分，前端 toast/ErrorBoundary 按类型给不同提示。

export class BusinessError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;
  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'BusinessError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ServerError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  constructor(message: string, status: number, retryable = true) {
    super(message);
    this.name = 'ServerError';
    this.status = status;
    this.retryable = retryable;
  }
}

export class NetworkError extends Error {
  readonly cause?: string;
  constructor(message: string, cause?: string) {
    super(message);
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

/** 根据 HTTP status 选最贴切的类 */
export function classifyHttpError(status: number, message: string, code?: string, details?: unknown): BusinessError | ServerError {
  if (status >= 400 && status < 500) {
    return new BusinessError(message, status, code, details);
  }
  if (status >= 500) {
    return new ServerError(message, status, true);
  }
  // 3xx 重定向未处理（fetch 默认 follow）
  return new ServerError(message, status, true);
}
