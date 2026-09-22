/**
 * Errores "operacionales": situaciones esperadas del negocio (un id que no
 * existe, datos inválidos, falta de permiso, etc.) que SÍ es seguro mostrarle
 * al cliente tal cual, con su código HTTP correspondiente.
 *
 * Cualquier error que NO sea una instancia de AppError (un bug real, una
 * excepción de Prisma, un TypeError, etc.) se trata como no-operacional: se
 * registra completo en el servidor pero al cliente solo se le devuelve un
 * mensaje genérico, para no filtrar detalles internos (stack traces, nombres
 * de tablas, rutas de archivos, etc.).
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code?: string;

  constructor(message: string, statusCode = 500, code?: string) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = true;
    this.code = code;

    // Mantiene la cadena de prototipos correcta al extender una clase nativa
    // como Error en TypeScript/ES2015+ (si no, "instanceof AppError" falla
    // en algunos casos al compilar a versiones viejas de JS).
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Los datos enviados no son válidos.') {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'No has iniciado sesión o tu sesión no es válida.') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'No tienes permiso para realizar esta acción.') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'El recurso solicitado no existe.') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'La solicitud entra en conflicto con el estado actual del recurso.') {
    super(message, 409, 'CONFLICT');
  }
}
