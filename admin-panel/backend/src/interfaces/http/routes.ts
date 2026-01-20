import express, { type Express } from "express";
import { type Server } from "http";
import path from "path";
import session from "express-session";
import documentsRouter from "./routes/documents";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Configure session middleware (Required for req.session access)
  app.use(session({
    secret: process.env.SESSION_SECRET || 'pdf-summary-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  }));

  // Serve uploaded files statically
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  app.get("/api/health", (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Register Documents Router
  app.use("/api/documents", documentsRouter);

  return httpServer;
}
