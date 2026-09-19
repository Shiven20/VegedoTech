import jwt from "jsonwebtoken";

/**
 * Attaches `req.body.userId` when a valid session cookie is present, but never
 * rejects the request. Lets the recommendation endpoint personalise for signed-in
 * shoppers while still serving trending items to anonymous visitors.
 */
const optionalAuthUser = (req, _res, next) => {
  const { token } = req.cookies ?? {};
  if (!req.body) req.body = {};

  if (!token) return next();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded?.id) req.body.userId = decoded.id;
  } catch {
    // Expired or tampered token: fall through as an anonymous visitor.
  }

  return next();
};

export default optionalAuthUser;
