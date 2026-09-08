import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * `lib/standard/loader.ts` reads standard/*.yaml with `fs.readFileSync` at
   * request time, not via `import`, so webpack never sees it as a dependency.
   * Next's build-time file tracer is usually good at following a
   * `path.join(process.cwd(), "standard", "x.yaml")` call anyway, but "usually"
   * is exactly the kind of thing that works on every local build and then 500s
   * once in production, silently, because the file just isn't in the deployed
   * function's bundle. Every route reads it indirectly through the navbar in
   * app/layout.tsx, so this is scoped to everything rather than one route.
   */
  outputFileTracingIncludes: {
    "/**": ["./standard/**/*"],
  },
};

export default nextConfig;
