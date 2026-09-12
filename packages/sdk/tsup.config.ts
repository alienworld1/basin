import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "es2022",
  platform: "neutral",
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: false,
  minify: true,
  treeshake: true,
  external: ["viem"],
  noExternal: [/^@basin\//, "@adraffy/ens-normalize"],
});
