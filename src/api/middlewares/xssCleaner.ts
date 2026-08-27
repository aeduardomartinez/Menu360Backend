import { Request, Response, NextFunction } from 'express';

// Expresión regular básica para detectar y eliminar etiquetas HTML potencialmente peligrosas
const xssRegex = /<[^>]*>?/gm;

const sanitizeString = (str: string): string => {
  if (!str) return str;
  return str.replace(xssRegex, '').trim();
};

const sanitizeObject = (obj: any): any => {
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }
  if (obj !== null && typeof obj === 'object') {
    Object.keys(obj).forEach(key => {
      obj[key] = sanitizeObject(obj[key]);
    });
  }
  return obj;
};

export const xssCleaner = (req: Request, res: Response, next: NextFunction) => {
  if (req.body) req.body = sanitizeObject(req.body);
  if (req.query) req.query = sanitizeObject(req.query);
  if (req.params) req.params = sanitizeObject(req.params);
  
  next();
};
