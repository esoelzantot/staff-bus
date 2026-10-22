import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';

/** The serverless functions in /api (Vercel) that `npm run dev` serves too. */
const API_ROUTES = new Set(['login', 'employees']);

interface ApiResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
}

type ApiHandler = (
  req: { method?: string; headers: Record<string, string | string[] | undefined>; body?: unknown },
  res: ApiResponse,
) => Promise<void>;

/**
 * Local stand-in for Vercel: serves /api/login and /api/employees from the same files Vercel deploys, so the
 * whole app (sign-in included) runs with `npm run dev`. The functions are loaded through Vite's SSR loader, so an
 * edit in /api is picked up on the next request. Dev server only – it is not part of the build.
 */
function localApi(): Plugin {
  return {
    name: 'staff-bus-local-api',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const route = /^\/api\/([\w-]+)\/?$/.exec(req.url?.split('?')[0] ?? '')?.[1];
        if (!route || !API_ROUTES.has(route)) return next();

        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const raw = Buffer.concat(chunks).toString('utf8');

        const response: ApiResponse = {
          status(code) {
            res.statusCode = code;
            return response;
          },
          json(body) {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(body));
          },
          setHeader(name, value) {
            res.setHeader(name, value);
          },
        };

        try {
          const mod = await server.ssrLoadModule(`/api/${route}.ts`);
          await (mod.default as ApiHandler)(
            {
              method: req.method,
              // Vercel sets x-real-ip itself; locally the socket address plays that role (per-IP login limit).
              headers: { ...req.headers, 'x-real-ip': req.socket.remoteAddress ?? 'local' },
              body: raw || undefined,
            },
            response,
          );
        } catch (err) {
          server.config.logger.error(String(err instanceof Error ? (err.stack ?? err.message) : err));
          if (!res.headersSent) response.status(500).json({ error: 'server', message: 'حدث خطأ في الخادم المحلي.' });
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // The /api functions read server-side settings (GOOGLE_APPLICATION_CREDENTIALS, VITE_EMPLOYEE_EMAIL_DOMAIN, …)
  // from process.env, exactly like on Vercel. Vite only exposes .env to the browser bundle, so copy it over for the
  // dev server – never overriding a variable that is already set in the shell.
  if (mode === 'development') {
    for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), ''))) {
      process.env[key] ??= value;
    }
  }

  return {
    plugins: [react(), localApi()],
    build: {
      chunkSizeWarningLimit: 900,
    },
  };
});
