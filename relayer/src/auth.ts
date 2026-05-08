import jwksClient from 'jwks-rsa';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { config } from './config.js';

const client = jwksClient({
  jwksUri: `https://cognito-idp.${config.aws.region}.amazonaws.com/${config.aws.cognitoUserPoolId}/.well-known/jwks.json`,
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 600_000,
});

function getSigningKey(header: jwt.JwtHeader): Promise<string> {
  return new Promise((resolve, reject) => {
    client.getSigningKey(header.kid!, (err, key) => {
      if (err) return reject(err);
      resolve(key!.getPublicKey());
    });
  });
}

export interface AuthenticatedRequest extends Request {
  userId?: string;
  appId?: string;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded === 'string') throw new Error('Invalid token structure');

    const signingKey = await getSigningKey(decoded.header);

    // C-2: Validate issuer, algorithm, and token_use
    const payload = jwt.verify(token, signingKey, {
      algorithms: ['RS256'],
      issuer: `https://cognito-idp.${config.aws.region}.amazonaws.com/${config.aws.cognitoUserPoolId}`,
    }) as jwt.JwtPayload;

    if (payload.token_use !== 'access') {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    req.userId = payload.sub;
    req.appId = (req.headers['x-app-id'] as string) ?? req.body?.app_id;

    next();
  } catch {
    // C-6 / H-6: Never leak JWT error details to the client
    res.status(401).json({ error: 'Unauthorized' });
  }
}
