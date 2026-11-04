declare namespace Express {
  interface Request {
    /** Lo asigna el validador de seguridad en las rutas protegidas por el contrato. */
    usuarioId?: number;
  }
}
