declare namespace Express {
  interface Request {
    /** Set by the security validator on routes the contract protects. */
    userId?: number;
  }
}
